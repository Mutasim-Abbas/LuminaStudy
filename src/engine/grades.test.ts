import { describe, it, expect } from 'vitest';
import {
  currentGrade,
  requiredScore,
  requiredScoreByBand,
  letterFor,
  DEFAULT_SCALE,
  type GradeCategory,
} from './grades';

describe('currentGrade', () => {
  it('is null when nothing is graded', () => {
    expect(currentGrade([{ id: '1', name: 'Midterm', weight: 30, score: null }])).toBeNull();
  });

  it('averages graded categories weighted by their own weight', () => {
    const cats: GradeCategory[] = [
      { id: '1', name: 'Homework', weight: 20, score: 100 },
      { id: '2', name: 'Midterm', weight: 30, score: 60 },
    ];
    // (20*100 + 30*60) / 50 = (2000+1800)/50 = 76
    expect(currentGrade(cats)).toBeCloseTo(76);
  });

  it('ignores ungraded categories when averaging', () => {
    const cats: GradeCategory[] = [
      { id: '1', name: 'Homework', weight: 20, score: 90 },
      { id: '2', name: 'Final', weight: 30, score: null },
    ];
    expect(currentGrade(cats)).toBeCloseTo(90);
  });
});

describe('requiredScore — the "what do I need" reverse calculator', () => {
  it('matches the worked example: 68 on a 70%-weighted midterm, 30% left, target B (80)', () => {
    const graded: GradeCategory[] = [{ id: '1', name: 'Midterm', weight: 70, score: 68 }];
    // required = (80*100 - 70*68) / 30 = (8000 - 4760) / 30 = 108
    const r = requiredScore(graded, 30, 80);
    expect(r.required).toBeCloseTo(108);
    expect(r.achievable).toBe(false); // impossible — can't score >100
  });

  it('is achievable when the math allows a real score', () => {
    const graded: GradeCategory[] = [{ id: '1', name: 'Midterm', weight: 50, score: 90 }];
    // required = (80*100 - 50*90) / 50 = (8000-4500)/50 = 70
    const r = requiredScore(graded, 50, 80);
    expect(r.required).toBeCloseTo(70);
    expect(r.achievable).toBe(true);
    expect(r.guaranteed).toBe(false);
  });

  it('is guaranteed when already above target regardless of what remains', () => {
    const graded: GradeCategory[] = [{ id: '1', name: 'Midterm', weight: 70, score: 95 }];
    // required = (80*100 - 70*95)/30 = (8000-6650)/30 = 45 -> still > 0, not guaranteed at 80
    // Try a lower target that IS guaranteed:
    const r = requiredScore(graded, 30, 60);
    // required = (60*100 - 70*95)/30 = (6000-6650)/30 = -21.67 -> negative => guaranteed
    expect(r.required).toBeLessThan(0);
    expect(r.guaranteed).toBe(true);
    expect(r.achievable).toBe(true);
  });

  it('handles zero remaining weight by locking in the current outcome', () => {
    const graded: GradeCategory[] = [{ id: '1', name: 'Everything', weight: 100, score: 85 }];
    const r = requiredScore(graded, 0, 80);
    expect(r.guaranteed).toBe(true);
    const r2 = requiredScore(graded, 0, 90);
    expect(r2.guaranteed).toBe(false);
  });
});

describe('letterFor', () => {
  it.each([
    [95, 'A'],
    [90, 'A'],
    [89.9, 'B'],
    [80, 'B'],
    [70, 'C'],
    [60, 'D'],
    [59.9, 'F'],
    [0, 'F'],
  ])('%d%% maps to %s', (pct, letter) => {
    expect(letterFor(pct).letter).toBe(letter);
  });

  it('supports a custom scale', () => {
    const scale = [
      { letter: 'Pass', min: 50, gpa: 4 },
      { letter: 'Fail', min: 0, gpa: 0 },
    ];
    expect(letterFor(49, scale).letter).toBe('Fail');
    expect(letterFor(50, scale).letter).toBe('Pass');
  });
});

describe('requiredScoreByBand', () => {
  it('returns one result per band, in scale order', () => {
    const graded: GradeCategory[] = [{ id: '1', name: 'Midterm', weight: 70, score: 68 }];
    const rows = requiredScoreByBand(graded, 30, DEFAULT_SCALE);
    expect(rows.map((r) => r.band.letter)).toEqual(['A', 'B', 'C', 'D', 'F']);
    // Lower bands should require lower (or equal) scores than higher bands.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].result.required).toBeLessThanOrEqual(rows[i - 1].result.required);
    }
  });
});
