import { describe, it, expect } from 'vitest';
import { semesterGPA, cumulativeGPA, totalCredits, projectedGPA } from './degree';
import type { Semester } from './degree';

const fall: Semester = {
  id: 's1',
  name: 'Fall 2025',
  courses: [
    { id: 'c1', name: 'Calculus', credits: 4, letter: 'A' }, // 16 pts
    { id: 'c2', name: 'Physics', credits: 3, letter: 'B' }, // 9 pts
  ],
};
// 25 credits total? no: 4+3=7 credits, points=16+9=25, gpa=25/7≈3.571

const spring: Semester = {
  id: 's2',
  name: 'Spring 2026',
  courses: [
    { id: 'c3', name: 'Algorithms', credits: 3, letter: 'A' }, // 12
    { id: 'c4', name: 'In progress', credits: 3, letter: null }, // excluded
  ],
};

describe('semesterGPA', () => {
  it('computes credit-weighted GPA for a semester', () => {
    expect(semesterGPA(fall)).toBeCloseTo(25 / 7);
  });

  it('excludes ungraded (in-progress) courses', () => {
    expect(semesterGPA(spring)).toBeCloseTo(4.0); // only Algorithms counts: 12/3
  });

  it('is null when nothing in the semester is graded yet', () => {
    const empty: Semester = { id: 's3', name: 'New', courses: [{ id: 'c5', name: 'TBD', credits: 3, letter: null }] };
    expect(semesterGPA(empty)).toBeNull();
  });
});

describe('cumulativeGPA', () => {
  it('is credit-weighted across all semesters', () => {
    // fall: 7 credits, 25 points. spring (graded only): 3 credits, 12 points.
    // total: 10 credits, 37 points => 3.7
    expect(cumulativeGPA([fall, spring])).toBeCloseTo(3.7);
  });

  it('is null with no graded courses anywhere', () => {
    const empty: Semester = { id: 's', name: 'E', courses: [{ id: 'c', name: 'x', credits: 3, letter: null }] };
    expect(cumulativeGPA([empty])).toBeNull();
  });
});

describe('totalCredits', () => {
  it('counts only graded courses', () => {
    expect(totalCredits([fall, spring])).toBe(7 + 3); // spring's in-progress course excluded
  });
});

describe('projectedGPA (what-if)', () => {
  it('blends a hypothetical future term into the running total', () => {
    // current: 10 credits, 37 points (from fall+spring test above)
    // add 15 credits at 4.0 => (37 + 60) / 25 = 3.88
    expect(projectedGPA([fall, spring], 15, 4.0)).toBeCloseTo(97 / 25);
  });

  it('returns null when there is no data at all', () => {
    expect(projectedGPA([], 0, 4.0)).toBeNull();
  });
});
