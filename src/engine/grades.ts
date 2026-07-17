/**
 * Pure grade-calculation engine — no DOM, no React. A course is a set of
 * graded categories (already scored) plus one remaining category (not yet
 * graded, e.g. the final exam). Given a target overall percentage, we solve
 * for the score the remaining category needs.
 */

export interface GradeCategory {
  id: string;
  name: string;
  /** Weight as a percentage of the final grade, e.g. 30 for 30%. */
  weight: number;
  /** Score 0–100, or null if not yet graded. */
  score: number | null;
}

export interface GradeBand {
  letter: string;
  /** Minimum percentage (inclusive) to earn this letter. */
  min: number;
  gpa: number;
}

/** Standard US-style scale. Fully user-editable — not the only option. */
export const DEFAULT_SCALE: GradeBand[] = [
  { letter: 'A', min: 90, gpa: 4.0 },
  { letter: 'B', min: 80, gpa: 3.0 },
  { letter: 'C', min: 70, gpa: 2.0 },
  { letter: 'D', min: 60, gpa: 1.0 },
  { letter: 'F', min: 0, gpa: 0.0 },
];

export function sumWeight(categories: readonly GradeCategory[]): number {
  return categories.reduce((sum, c) => sum + c.weight, 0);
}

/** Weighted average of only the graded categories, normalized to their own weight (0–100), or null if nothing is graded yet. */
export function currentGrade(categories: readonly GradeCategory[]): number | null {
  const graded = categories.filter((c) => c.score !== null);
  const w = sumWeight(graded);
  if (w === 0) return null;
  const points = graded.reduce((sum, c) => sum + c.weight * (c.score as number), 0);
  return points / w;
}

/**
 * Solve for the score needed on `remainingWeight` percent of the course to
 * reach `targetPercent` overall, given the graded categories so far.
 *
 * targetPercent = (sum(graded weight * score) + remainingWeight * x) / 100
 *   => x = (targetPercent * 100 - sum(graded weight * score)) / remainingWeight
 */
export interface RequiredScoreResult {
  /** The score needed, unclamped — can be negative or over 100. */
  required: number;
  /** True if 0 <= required <= 100: a real score can reach this target. */
  achievable: boolean;
  /** True if required <= 0: this grade is locked in no matter what. */
  guaranteed: boolean;
}

export function requiredScore(
  graded: readonly GradeCategory[],
  remainingWeight: number,
  targetPercent: number,
): RequiredScoreResult {
  const earnedPoints = graded.reduce((sum, c) => sum + c.weight * (c.score ?? 0), 0);
  if (remainingWeight <= 0) {
    // Nothing left to grade: the outcome is already fixed.
    const total = sumWeight(graded) > 0 ? earnedPoints / sumWeight(graded) : 0;
    return { required: 0, achievable: total >= targetPercent, guaranteed: total >= targetPercent };
  }
  const required = (targetPercent * 100 - earnedPoints) / remainingWeight;
  return {
    required,
    achievable: required <= 100,
    guaranteed: required <= 0,
  };
}

export function letterFor(percent: number, scale: readonly GradeBand[] = DEFAULT_SCALE): GradeBand {
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  return sorted.find((band) => percent >= band.min) ?? sorted[sorted.length - 1];
}

/** For every band in the scale, the score needed on the remaining work to hit it. */
export function requiredScoreByBand(
  graded: readonly GradeCategory[],
  remainingWeight: number,
  scale: readonly GradeBand[] = DEFAULT_SCALE,
): { band: GradeBand; result: RequiredScoreResult }[] {
  return scale.map((band) => ({
    band,
    result: requiredScore(graded, remainingWeight, band.min),
  }));
}
