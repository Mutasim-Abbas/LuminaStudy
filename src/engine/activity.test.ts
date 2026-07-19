import { describe, it, expect } from 'vitest';
import {
  EMPTY_ACTIVITY,
  withCardReviewed,
  withQuizAnswered,
  withStudyTime,
  currentStreak,
  weeklyGoalProgress,
  formatStudyTime,
  type ActivityState,
} from './activity';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('withCardReviewed / withQuizAnswered / withStudyTime', () => {
  it('increments the right counter and marks today active', () => {
    const s1 = withCardReviewed(EMPTY_ACTIVITY);
    expect(s1.cardsReviewed).toBe(1);
    expect(s1.activeDays).toContain(daysAgo(0));

    const s2 = withQuizAnswered(s1);
    expect(s2.quizQuestionsAnswered).toBe(1);
    expect(s2.cardsReviewed).toBe(1);

    const s3 = withStudyTime(s2, 90_000);
    expect(s3.studyTimeMs).toBe(90_000);
  });

  it('does not duplicate the active-day entry on repeated actions', () => {
    const s1 = withCardReviewed(EMPTY_ACTIVITY);
    const s2 = withCardReviewed(s1);
    expect(s2.activeDays.filter((d) => d === daysAgo(0))).toHaveLength(1);
  });

  it('ignores non-positive study time', () => {
    const s = withStudyTime(EMPTY_ACTIVITY, 0);
    expect(s).toEqual(EMPTY_ACTIVITY);
  });
});

describe('currentStreak', () => {
  it('is 0 with no activity', () => {
    expect(currentStreak(EMPTY_ACTIVITY)).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    const state: ActivityState = {
      ...EMPTY_ACTIVITY,
      activeDays: [daysAgo(0), daysAgo(1), daysAgo(2)],
    };
    expect(currentStreak(state)).toBe(3);
  });

  it('still counts the streak through yesterday if today has no activity yet', () => {
    const state: ActivityState = {
      ...EMPTY_ACTIVITY,
      activeDays: [daysAgo(1), daysAgo(2)],
    };
    expect(currentStreak(state)).toBe(2);
  });

  it('breaks on a gap', () => {
    const state: ActivityState = {
      ...EMPTY_ACTIVITY,
      activeDays: [daysAgo(0), daysAgo(1), daysAgo(3)], // gap at day 2
    };
    expect(currentStreak(state)).toBe(2);
  });
});

describe('weeklyGoalProgress', () => {
  it('is a percentage of cards + quiz answers against the goal, clamped 0-100', () => {
    const state: ActivityState = { ...EMPTY_ACTIVITY, cardsReviewed: 30, quizQuestionsAnswered: 20 };
    expect(weeklyGoalProgress(state, 100)).toBe(50);
    expect(weeklyGoalProgress(state, 10)).toBe(100); // clamped
  });

  it('is 0 for a non-positive goal', () => {
    expect(weeklyGoalProgress(EMPTY_ACTIVITY, 0)).toBe(0);
  });
});

describe('formatStudyTime', () => {
  it.each([
    [0, '0m'],
    [59_000, '0m'],
    [60_000, '1m'],
    [3_600_000, '1h 0m'],
    [3_660_000, '1h 1m'],
    [51_600_000, '14h 20m'],
  ])('%d ms -> %s', (ms, expected) => {
    expect(formatStudyTime(ms)).toBe(expected);
  });
});
