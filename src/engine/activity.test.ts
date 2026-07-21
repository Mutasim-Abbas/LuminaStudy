import { describe, it, expect } from 'vitest';
import {
  EMPTY_ACTIVITY,
  withCardReviewed,
  withQuizAnswered,
  withStudyTime,
  currentStreak,
  weeklyGoalProgress,
  weeklyReviewCount,
  heatmapCells,
  recentDayKeys,
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
  /** Build a state with `count` reviews recorded on the day `n` days ago. */
  function onDay(n: number, count: number): ActivityState {
    return {
      ...EMPTY_ACTIVITY,
      activeDays: [daysAgo(n)],
      days: { [daysAgo(n)]: { cards: count, quiz: 0, timeMs: 0 } },
    };
  }

  it('is a percentage of the last 7 days against the goal, clamped 0-100', () => {
    const state: ActivityState = {
      ...EMPTY_ACTIVITY,
      days: {
        [daysAgo(0)]: { cards: 30, quiz: 20, timeMs: 0 },
      },
    };
    expect(weeklyGoalProgress(state, 100)).toBe(50);
    expect(weeklyGoalProgress(state, 10)).toBe(100); // clamped
  });

  it('counts work from anywhere inside the 7-day window', () => {
    expect(weeklyReviewCount(onDay(6, 40))).toBe(40);
  });

  it('ignores work older than the window, so the ring resets weekly', () => {
    expect(weeklyReviewCount(onDay(7, 40))).toBe(0);
    expect(weeklyGoalProgress(onDay(30, 999), 100)).toBe(0);
  });

  it('lifetime counters alone do not fill the weekly ring', () => {
    // Saves written before per-day tracking existed: honest zero, not a fake week.
    const legacy: ActivityState = { ...EMPTY_ACTIVITY, cardsReviewed: 500, days: undefined };
    expect(weeklyGoalProgress(legacy, 100)).toBe(0);
  });

  it('is 0 for a non-positive goal', () => {
    expect(weeklyGoalProgress(EMPTY_ACTIVITY, 0)).toBe(0);
  });
});

describe('per-day recording', () => {
  it('records today in the day map as well as the lifetime counter', () => {
    const s = withQuizAnswered(withCardReviewed(EMPTY_ACTIVITY));
    expect(s.days?.[daysAgo(0)]).toEqual({ cards: 1, quiz: 1, timeMs: 0 });
    expect(weeklyReviewCount(s)).toBe(2);
  });

  it('accumulates study time for the day', () => {
    const s = withStudyTime(withStudyTime(EMPTY_ACTIVITY, 1000), 500);
    expect(s.days?.[daysAgo(0)].timeMs).toBe(1500);
  });
});

describe('heatmapCells', () => {
  it('returns one cell per day, oldest first, ending today', () => {
    const cells = heatmapCells(EMPTY_ACTIVITY, 7);
    expect(cells).toHaveLength(7);
    expect(cells[6].date).toBe(daysAgo(0));
    expect(cells[0].date).toBe(daysAgo(6));
  });

  it('is all level 0 with no activity', () => {
    expect(heatmapCells(EMPTY_ACTIVITY, 7).every((c) => c.level === 0)).toBe(true);
  });

  it('scales levels against the busiest day', () => {
    const state: ActivityState = {
      ...EMPTY_ACTIVITY,
      days: {
        [daysAgo(0)]: { cards: 100, quiz: 0, timeMs: 0 }, // busiest -> 4
        [daysAgo(1)]: { cards: 10, quiz: 0, timeMs: 0 }, // 10% -> 1
      },
    };
    const cells = heatmapCells(state, 7);
    expect(cells[6].level).toBe(4);
    expect(cells[5].level).toBe(1);
    expect(cells[0].level).toBe(0);
  });
});

describe('recentDayKeys', () => {
  it('returns n consecutive keys ending today', () => {
    expect(recentDayKeys(3)).toEqual([daysAgo(2), daysAgo(1), daysAgo(0)]);
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
