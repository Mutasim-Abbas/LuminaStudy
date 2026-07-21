import { describe, it, expect } from 'vitest';
import {
  DAY_MS,
  DEFAULT_EASE,
  MIN_EASE,
  MATURE_INTERVAL_DAYS,
  cardStage,
  dueCards,
  dueCount,
  formatDueIn,
  gradeCard,
  isDue,
  newSchedule,
  nextDueMs,
  scheduleKey,
  setMastery,
  type SrsState,
} from './srs';
import type { StudySet } from '../data/studySets';

const NOW = 1_800_000_000_000;

function makeSet(cardCount: number, id = 's1'): StudySet {
  return {
    id,
    subject: 'Test',
    title: 'Test Set',
    description: '',
    mastery: 0,
    lastUpdatedMs: NOW,
    cards: Array.from({ length: cardCount }, (_, i) => ({
      id: `c${i + 1}`,
      front: `front ${i + 1}`,
      back: `back ${i + 1}`,
    })),
    quiz: [],
  };
}

describe('scheduleKey', () => {
  it('namespaces by set, because card ids repeat across sets', () => {
    expect(scheduleKey('bio', 'c1')).toBe('bio:c1');
    expect(scheduleKey('psych', 'c1')).not.toBe(scheduleKey('bio', 'c1'));
  });
});

describe('gradeCard — successful reviews', () => {
  it('schedules a brand-new card 1 day out on "good"', () => {
    const s = gradeCard(undefined, 'good', NOW);
    expect(s.repetitions).toBe(1);
    expect(s.intervalDays).toBe(1);
    expect(s.dueMs).toBe(NOW + DAY_MS);
  });

  it('gives "easy" a longer first step than "good"', () => {
    expect(gradeCard(undefined, 'easy', NOW).intervalDays).toBe(3);
    expect(gradeCard(undefined, 'good', NOW).intervalDays).toBe(1);
  });

  it('steps 1 -> 6 days on the second success', () => {
    const first = gradeCard(undefined, 'good', NOW);
    const second = gradeCard(first, 'good', NOW);
    expect(second.repetitions).toBe(2);
    expect(second.intervalDays).toBe(6);
  });

  it('multiplies by the ease factor from the third success on', () => {
    let s = gradeCard(undefined, 'good', NOW);
    s = gradeCard(s, 'good', NOW);
    const third = gradeCard(s, 'good', NOW);
    expect(third.intervalDays).toBe(Math.round(6 * s.ease));
    expect(third.intervalDays).toBeGreaterThan(6);
  });

  it('grows intervals monotonically over a long correct streak', () => {
    let s = gradeCard(undefined, 'good', NOW);
    let last = s.intervalDays;
    for (let i = 0; i < 6; i++) {
      s = gradeCard(s, 'good', NOW);
      expect(s.intervalDays).toBeGreaterThanOrEqual(last);
      last = s.intervalDays;
    }
    expect(last).toBeGreaterThan(MATURE_INTERVAL_DAYS);
  });

  it('"hard" grows more slowly than "good"', () => {
    let base = gradeCard(undefined, 'good', NOW);
    base = gradeCard(base, 'good', NOW); // interval 6
    const hard = gradeCard(base, 'hard', NOW);
    const good = gradeCard(base, 'good', NOW);
    expect(hard.intervalDays).toBeLessThan(good.intervalDays);
  });

  it('raises ease on "easy" and lowers it on "hard"', () => {
    expect(gradeCard(undefined, 'easy', NOW).ease).toBeGreaterThan(DEFAULT_EASE);
    expect(gradeCard(undefined, 'hard', NOW).ease).toBeLessThan(DEFAULT_EASE);
  });
});

describe('gradeCard — lapses', () => {
  it('resets the interval and returns the card within the session', () => {
    const learned = gradeCard(gradeCard(undefined, 'good', NOW), 'good', NOW);
    const lapsed = gradeCard(learned, 'again', NOW);
    expect(lapsed.repetitions).toBe(0);
    expect(lapsed.intervalDays).toBe(0);
    expect(lapsed.dueMs).toBeGreaterThan(NOW);
    expect(lapsed.dueMs).toBeLessThan(NOW + DAY_MS);
  });

  it('counts a lapse only for a card that had been learned', () => {
    expect(gradeCard(undefined, 'again', NOW).lapses).toBe(0);
    const learned = gradeCard(undefined, 'good', NOW);
    expect(gradeCard(learned, 'again', NOW).lapses).toBe(1);
  });

  it('never lets ease fall below the floor, however often it is failed', () => {
    let s = newSchedule(NOW);
    for (let i = 0; i < 30; i++) s = gradeCard(s, 'again', NOW);
    expect(s.ease).toBeGreaterThanOrEqual(MIN_EASE);
  });
});

describe('isDue / dueCards / dueCount', () => {
  it('treats never-reviewed cards as due', () => {
    expect(isDue(undefined, NOW)).toBe(true);
  });

  it('hides a card until its due date arrives', () => {
    const s = gradeCard(undefined, 'good', NOW); // due in 1 day
    expect(isDue(s, NOW)).toBe(false);
    expect(isDue(s, NOW + DAY_MS)).toBe(true);
  });

  it('lists every card of a fresh set as due', () => {
    const set = makeSet(4);
    expect(dueCards(set, {}, NOW)).toHaveLength(4);
    expect(dueCount(set, {}, NOW)).toBe(4);
  });

  it('drops cards that were just answered correctly', () => {
    const set = makeSet(3);
    const srs: SrsState = { [scheduleKey(set.id, 'c1')]: gradeCard(undefined, 'good', NOW) };
    const due = dueCards(set, srs, NOW);
    expect(due.map((c) => c.id)).toEqual(['c2', 'c3']);
    expect(dueCount(set, srs, NOW)).toBe(2);
  });

  it('puts never-seen cards before overdue ones', () => {
    const set = makeSet(2);
    // c1 reviewed long ago and now overdue; c2 never seen.
    const srs: SrsState = {
      [scheduleKey(set.id, 'c1')]: { ...newSchedule(NOW - 10 * DAY_MS), dueMs: NOW - DAY_MS },
    };
    expect(dueCards(set, srs, NOW).map((c) => c.id)).toEqual(['c2', 'c1']);
  });
});

describe('setMastery', () => {
  it('is 0 for a set that has never been studied', () => {
    expect(setMastery(makeSet(4), {})).toBe(0);
  });

  it('is 100 only when every card is spaced out to maturity', () => {
    const set = makeSet(2);
    const mature = { ...newSchedule(NOW), intervalDays: MATURE_INTERVAL_DAYS, lastReviewedMs: NOW };
    const srs: SrsState = {
      [scheduleKey(set.id, 'c1')]: mature,
      [scheduleKey(set.id, 'c2')]: mature,
    };
    expect(setMastery(set, srs)).toBe(100);
  });

  it('averages across the set, so one strong card cannot carry it', () => {
    const set = makeSet(2);
    const srs: SrsState = {
      [scheduleKey(set.id, 'c1')]: {
        ...newSchedule(NOW),
        intervalDays: MATURE_INTERVAL_DAYS * 5, // way past mature, still caps at 1
        lastReviewedMs: NOW,
      },
    };
    expect(setMastery(set, srs)).toBe(50);
  });

  it('rises as a card is repeatedly recalled', () => {
    const set = makeSet(1);
    const key = scheduleKey(set.id, 'c1');
    let s = gradeCard(undefined, 'good', NOW);
    const first = setMastery(set, { [key]: s });
    s = gradeCard(s, 'good', NOW);
    s = gradeCard(s, 'good', NOW);
    expect(setMastery(set, { [key]: s })).toBeGreaterThan(first);
  });

  it('is 0 for an empty set rather than NaN', () => {
    expect(setMastery(makeSet(0), {})).toBe(0);
  });
});

describe('nextDueMs', () => {
  it('is null while any card is still unseen', () => {
    const set = makeSet(2);
    const srs: SrsState = { [scheduleKey(set.id, 'c1')]: gradeCard(undefined, 'good', NOW) };
    expect(nextDueMs(set, srs)).toBeNull();
  });

  it('is the soonest due time once every card is scheduled', () => {
    const set = makeSet(2);
    const srs: SrsState = {
      [scheduleKey(set.id, 'c1')]: gradeCard(undefined, 'easy', NOW), // 3 days
      [scheduleKey(set.id, 'c2')]: gradeCard(undefined, 'good', NOW), // 1 day
    };
    expect(nextDueMs(set, srs)).toBe(NOW + DAY_MS);
  });
});

describe('formatDueIn', () => {
  it.each([
    [NOW - 1000, 'now'],
    [NOW + 5 * 60_000, 'in 5m'],
    [NOW + 3 * 3_600_000, 'in 3h'],
    [NOW + DAY_MS, 'tomorrow'],
    [NOW + 3 * DAY_MS, 'in 3 days'],
  ])('formats correctly', (due, expected) => {
    expect(formatDueIn(due, NOW)).toBe(expected);
  });
});

describe('cardStage', () => {
  it('labels progression from new through mature', () => {
    expect(cardStage(undefined)).toBe('new');
    expect(cardStage(gradeCard(undefined, 'again', NOW))).toBe('learning');
    expect(cardStage(gradeCard(undefined, 'good', NOW))).toBe('young');
    expect(
      cardStage({ ...newSchedule(NOW), intervalDays: MATURE_INTERVAL_DAYS, lastReviewedMs: NOW }),
    ).toBe('mature');
  });
});
