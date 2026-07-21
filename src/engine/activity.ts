/**
 * Real activity tracking for the dashboard — a daily-visit streak, lifetime
 * counters, and a per-day breakdown that powers the weekly goal ring and the
 * study heatmap. All derived from actual user actions (flashcard reviews, quiz
 * answers, timed study sessions), never invented. Persisted to localStorage.
 */

/** What happened on a single calendar day. */
export interface DayRecord {
  cards: number;
  quiz: number;
  timeMs: number;
}

export interface ActivityState {
  /** ISO date strings (YYYY-MM-DD, local) with at least one recorded action. */
  activeDays: string[];
  /** Lifetime totals — shown as "all time" stats. */
  cardsReviewed: number;
  quizQuestionsAnswered: number;
  studyTimeMs: number;
  /**
   * Per-day breakdown keyed YYYY-MM-DD. Added after launch: saves written by
   * the earlier version have no `days`, so every reader must tolerate it being
   * missing (see `dayMap`). Those users simply start their first real week from
   * zero rather than us inventing a history we never recorded.
   */
  days?: Record<string, DayRecord>;
}

export const EMPTY_ACTIVITY: ActivityState = {
  activeDays: [],
  cardsReviewed: 0,
  quizQuestionsAnswered: 0,
  studyTimeMs: 0,
  days: {},
};

const EMPTY_DAY: DayRecord = { cards: 0, quiz: 0, timeMs: 0 };

/** Keep roughly four months of per-day history — enough for the heatmap. */
const HISTORY_LIMIT = 120;

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayKey(): string {
  return dateKey(new Date());
}

/** Per-day map, tolerating saves from before `days` existed. */
function dayMap(state: ActivityState): Record<string, DayRecord> {
  return state.days ?? {};
}

/** Read one day's record, defaulting to zeroes. */
export function dayRecord(state: ActivityState, key: string): DayRecord {
  return dayMap(state)[key] ?? EMPTY_DAY;
}

/** Drop day entries older than HISTORY_LIMIT so localStorage can't grow forever. */
function pruneDays(days: Record<string, DayRecord>): Record<string, DayRecord> {
  const keys = Object.keys(days).sort();
  if (keys.length <= HISTORY_LIMIT) return days;
  const keep = keys.slice(-HISTORY_LIMIT);
  return Object.fromEntries(keep.map((k) => [k, days[k]]));
}

/** Mark today active and fold `patch` into today's per-day record. */
function recordToday(state: ActivityState, patch: Partial<DayRecord>): ActivityState {
  const key = todayKey();
  const prev = dayRecord(state, key);
  const days = pruneDays({
    ...dayMap(state),
    [key]: {
      cards: prev.cards + (patch.cards ?? 0),
      quiz: prev.quiz + (patch.quiz ?? 0),
      timeMs: prev.timeMs + (patch.timeMs ?? 0),
    },
  });
  const activeDays = state.activeDays.includes(key)
    ? state.activeDays
    : [...state.activeDays, key].slice(-HISTORY_LIMIT);
  return { ...state, activeDays, days };
}

/** Mark today as active without recording any counted work (idempotent). */
export function withTodayMarked(state: ActivityState): ActivityState {
  if (state.activeDays.includes(todayKey())) return state;
  return recordToday(state, {});
}

export function withCardReviewed(state: ActivityState): ActivityState {
  return recordToday({ ...state, cardsReviewed: state.cardsReviewed + 1 }, { cards: 1 });
}

export function withQuizAnswered(state: ActivityState): ActivityState {
  return recordToday({ ...state, quizQuestionsAnswered: state.quizQuestionsAnswered + 1 }, { quiz: 1 });
}

export function withStudyTime(state: ActivityState, ms: number): ActivityState {
  if (ms <= 0) return state;
  return recordToday({ ...state, studyTimeMs: state.studyTimeMs + ms }, { timeMs: ms });
}

/** Consecutive days (including today, if active) with at least one action. */
export function currentStreak(state: ActivityState): number {
  const days = new Set(state.activeDays);
  let streak = 0;
  const cursor = new Date();
  // If today has no activity yet, the streak is still whatever it was
  // through yesterday — don't zero it out just because it's early in the day.
  if (!days.has(todayKey())) cursor.setDate(cursor.getDate() - 1);
  for (;;) {
    if (!days.has(dateKey(cursor))) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** The last `n` day keys, oldest first, ending today. */
export function recentDayKeys(n: number): string[] {
  const keys: string[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - (n - 1));
  for (let i = 0; i < n; i++) {
    keys.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/** Cards + quiz answers recorded in the last 7 days (today inclusive). */
export function weeklyReviewCount(state: ActivityState): number {
  return recentDayKeys(7).reduce((sum, key) => {
    const d = dayRecord(state, key);
    return sum + d.cards + d.quiz;
  }, 0);
}

/** Study time accumulated in the last 7 days. */
export function weeklyStudyTime(state: ActivityState): number {
  return recentDayKeys(7).reduce((sum, key) => sum + dayRecord(state, key).timeMs, 0);
}

/**
 * Progress toward the weekly goal, as a 0-100 percentage. Counts only the last
 * 7 days, so the ring genuinely resets as the week rolls forward.
 */
export function weeklyGoalProgress(state: ActivityState, goal: number): number {
  if (goal <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((weeklyReviewCount(state) / goal) * 100)));
}

export interface HeatmapCell {
  date: string;
  count: number;
  /** 0 (nothing) through 4 (busiest) — drives the colour ramp. */
  level: 0 | 1 | 2 | 3 | 4;
}

/**
 * Day cells for the study heatmap, oldest first. Levels are scaled against the
 * user's own busiest day so the chart stays readable whether they review 5
 * cards a day or 500.
 */
export function heatmapCells(state: ActivityState, days = 91): HeatmapCell[] {
  const keys = recentDayKeys(days);
  const counts = keys.map((key) => {
    const d = dayRecord(state, key);
    return d.cards + d.quiz;
  });
  const busiest = Math.max(...counts, 0);
  return keys.map((date, i) => {
    const count = counts[i];
    let level: HeatmapCell['level'] = 0;
    if (count > 0 && busiest > 0) {
      const ratio = count / busiest;
      level = ratio > 0.75 ? 4 : ratio > 0.5 ? 3 : ratio > 0.25 ? 2 : 1;
    }
    return { date, count, level };
  });
}

export function formatStudyTime(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
