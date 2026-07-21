/**
 * Spaced repetition — an SM-2 scheduler.
 *
 * Every card carries an ease factor, an interval, and a due date. Grading a
 * card moves those forward: remembering it pushes the next review further out,
 * forgetting it pulls the card back to the start. That scheduling is the whole
 * point of the app — reviewing what you're about to forget, and nothing else.
 *
 * Mastery is *derived* from these intervals rather than nudged by hand, so the
 * number on screen always reflects real recall performance.
 */

import type { Flashcard, StudySet } from '../data/studySets';

/** How the learner rated their recall. Maps to SM-2 quality scores below. */
export type Grade = 'again' | 'hard' | 'good' | 'easy';

export interface CardSchedule {
  /** SM-2 ease factor — how fast intervals grow. Floored at MIN_EASE. */
  ease: number;
  /** Current spacing in days. 0 means the card is still being learned. */
  intervalDays: number;
  /** Consecutive successful reviews. Reset to 0 by a lapse. */
  repetitions: number;
  /** Times a learned card was forgotten — useful for spotting problem cards. */
  lapses: number;
  /** When the card next comes up, epoch ms. */
  dueMs: number;
  /** 0 if never reviewed. */
  lastReviewedMs: number;
}

/** Keyed by `setId:cardId` — card ids are only unique within their own set. */
export type SrsState = Record<string, CardSchedule>;

export const DAY_MS = 86_400_000;
export const MIN_EASE = 1.3;
export const DEFAULT_EASE = 2.5;

/** A card spaced this far out counts as fully mastered. */
export const MATURE_INTERVAL_DAYS = 21;

/** A lapsed card returns after this long — later in the session, not instantly. */
const RELEARN_MS = 10 * 60 * 1000;

/** SM-2 quality scores for our four buttons. */
const QUALITY: Record<Grade, number> = { again: 1, hard: 3, good: 4, easy: 5 };

export function scheduleKey(setId: string, cardId: string): string {
  return `${setId}:${cardId}`;
}

export function newSchedule(nowMs: number): CardSchedule {
  return {
    ease: DEFAULT_EASE,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    dueMs: nowMs, // brand-new cards are due immediately
    lastReviewedMs: 0,
  };
}

/**
 * Apply a grade, returning the card's next schedule. Pass `undefined` for a
 * card that has never been reviewed.
 */
export function gradeCard(prev: CardSchedule | undefined, grade: Grade, nowMs: number): CardSchedule {
  const current = prev ?? newSchedule(nowMs);
  const q = QUALITY[grade];

  // Standard SM-2 ease adjustment, floored so a hard card can't spiral to zero.
  const ease = Math.max(MIN_EASE, current.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  if (grade === 'again') {
    return {
      ease,
      intervalDays: 0,
      repetitions: 0,
      // Only count a lapse if the card had actually been learned.
      lapses: current.lapses + (current.repetitions > 0 ? 1 : 0),
      dueMs: nowMs + RELEARN_MS,
      lastReviewedMs: nowMs,
    };
  }

  const repetitions = current.repetitions + 1;
  let intervalDays: number;
  if (repetitions === 1) {
    intervalDays = grade === 'easy' ? 3 : 1;
  } else if (repetitions === 2) {
    intervalDays = grade === 'hard' ? 3 : 6;
  } else {
    // "Hard" grows slowly regardless of ease; the others ride the ease factor.
    intervalDays = Math.round(current.intervalDays * (grade === 'hard' ? 1.2 : ease));
  }

  return {
    ease,
    intervalDays: Math.max(1, intervalDays),
    repetitions,
    lapses: current.lapses,
    dueMs: nowMs + Math.max(1, intervalDays) * DAY_MS,
    lastReviewedMs: nowMs,
  };
}

/** Unreviewed cards are always due. */
export function isDue(schedule: CardSchedule | undefined, nowMs: number): boolean {
  return !schedule || schedule.dueMs <= nowMs;
}

/** The cards in a set that are ready for review, new cards first. */
export function dueCards(set: StudySet, srs: SrsState, nowMs: number): Flashcard[] {
  return set.cards
    .filter((card) => isDue(srs[scheduleKey(set.id, card.id)], nowMs))
    .sort((a, b) => {
      const sa = srs[scheduleKey(set.id, a.id)];
      const sb = srs[scheduleKey(set.id, b.id)];
      // Never-seen cards lead, then whatever has been waiting longest.
      if (!sa && sb) return -1;
      if (sa && !sb) return 1;
      if (!sa && !sb) return 0;
      return sa.dueMs - sb.dueMs;
    });
}

export function dueCount(set: StudySet, srs: SrsState, nowMs: number): number {
  return set.cards.reduce(
    (n, card) => n + (isDue(srs[scheduleKey(set.id, card.id)], nowMs) ? 1 : 0),
    0,
  );
}

/**
 * Mastery as a 0-100 percentage: how far each card has been spaced out,
 * averaged across the set. A card at MATURE_INTERVAL_DAYS or beyond counts
 * fully; unseen cards count zero. Honest by construction — you cannot raise it
 * without actually recalling cards over time.
 */
export function setMastery(set: StudySet, srs: SrsState): number {
  if (set.cards.length === 0) return 0;
  const total = set.cards.reduce((sum, card) => {
    const s = srs[scheduleKey(set.id, card.id)];
    if (!s) return sum;
    return sum + Math.min(1, s.intervalDays / MATURE_INTERVAL_DAYS);
  }, 0);
  return Math.round((total / set.cards.length) * 100);
}

/** When the whole set next has something to review, or null if nothing scheduled. */
export function nextDueMs(set: StudySet, srs: SrsState): number | null {
  const times = set.cards
    .map((card) => srs[scheduleKey(set.id, card.id)]?.dueMs)
    .filter((t): t is number => typeof t === 'number');
  if (times.length < set.cards.length) return null; // an unseen card is due now
  return times.length ? Math.min(...times) : null;
}

/** "now", "in 4 hours", "in 3 days" — for telling the learner when to come back. */
export function formatDueIn(dueMs: number, nowMs: number): string {
  const diff = dueMs - nowMs;
  if (diff <= 0) return 'now';
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

/** Human label for how far a card has progressed. */
export function cardStage(schedule: CardSchedule | undefined): 'new' | 'learning' | 'young' | 'mature' {
  if (!schedule || schedule.lastReviewedMs === 0) return 'new';
  if (schedule.intervalDays === 0) return 'learning';
  return schedule.intervalDays >= MATURE_INTERVAL_DAYS ? 'mature' : 'young';
}
