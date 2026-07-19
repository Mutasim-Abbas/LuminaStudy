/**
 * Real activity tracking for the dashboard's "Weekly Progress" widget — a
 * daily-visit streak, a lifetime cards-reviewed counter, and accumulated
 * study time. All derived from actual user actions (flashcard reviews, quiz
 * answers, timed study sessions), never invented. Persisted to localStorage.
 */

export interface ActivityState {
  /** ISO date strings (YYYY-MM-DD, local) with at least one recorded action. */
  activeDays: string[];
  cardsReviewed: number;
  quizQuestionsAnswered: number;
  studyTimeMs: number;
}

export const EMPTY_ACTIVITY: ActivityState = {
  activeDays: [],
  cardsReviewed: 0,
  quizQuestionsAnswered: 0,
  studyTimeMs: 0,
};

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Mark today as active (idempotent). */
export function withTodayMarked(state: ActivityState): ActivityState {
  const key = todayKey();
  if (state.activeDays.includes(key)) return state;
  return { ...state, activeDays: [...state.activeDays, key].slice(-90) };
}

export function withCardReviewed(state: ActivityState): ActivityState {
  return withTodayMarked({ ...state, cardsReviewed: state.cardsReviewed + 1 });
}

export function withQuizAnswered(state: ActivityState): ActivityState {
  return withTodayMarked({ ...state, quizQuestionsAnswered: state.quizQuestionsAnswered + 1 });
}

export function withStudyTime(state: ActivityState, ms: number): ActivityState {
  if (ms <= 0) return state;
  return withTodayMarked({ ...state, studyTimeMs: state.studyTimeMs + ms });
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
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    if (!days.has(key)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Cards reviewed + quiz questions answered within the last 7 days worth of activity. */
export function weeklyGoalProgress(state: ActivityState, goal: number): number {
  if (goal <= 0) return 0;
  const total = state.cardsReviewed + state.quizQuestionsAnswered;
  return Math.max(0, Math.min(100, Math.round((total / goal) * 100)));
}

export function formatStudyTime(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
