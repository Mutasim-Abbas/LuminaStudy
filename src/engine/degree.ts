import { DEFAULT_SCALE, type GradeBand } from './grades';

export interface DegreeCourse {
  id: string;
  name: string;
  credits: number;
  /** Letter grade earned, or null if still in progress / not yet taken. */
  letter: string | null;
}

export interface Semester {
  id: string;
  name: string;
  courses: DegreeCourse[];
}

function gpaFor(letter: string, scale: readonly GradeBand[]): number {
  return scale.find((b) => b.letter === letter)?.gpa ?? 0;
}

/** Credits and quality points for one course (0 credits if not yet graded). */
function coursePoints(course: DegreeCourse, scale: readonly GradeBand[]): { credits: number; points: number } {
  if (course.letter === null) return { credits: 0, points: 0 };
  return { credits: course.credits, points: course.credits * gpaFor(course.letter, scale) };
}

export function semesterGPA(semester: Semester, scale: readonly GradeBand[] = DEFAULT_SCALE): number | null {
  const totals = semester.courses.reduce(
    (acc, c) => {
      const p = coursePoints(c, scale);
      return { credits: acc.credits + p.credits, points: acc.points + p.points };
    },
    { credits: 0, points: 0 },
  );
  return totals.credits === 0 ? null : totals.points / totals.credits;
}

export function cumulativeGPA(semesters: readonly Semester[], scale: readonly GradeBand[] = DEFAULT_SCALE): number | null {
  let credits = 0;
  let points = 0;
  for (const s of semesters) {
    for (const c of s.courses) {
      const p = coursePoints(c, scale);
      credits += p.credits;
      points += p.points;
    }
  }
  return credits === 0 ? null : points / credits;
}

export function totalCredits(semesters: readonly Semester[]): number {
  return semesters.reduce(
    (sum, s) => sum + s.courses.reduce((cs, c) => cs + (c.letter !== null ? c.credits : 0), 0),
    0,
  );
}

/**
 * What-if: given the current semesters, project the cumulative GPA if a
 * hypothetical future term earns `futureGpa` across `futureCredits` credits.
 */
export function projectedGPA(
  semesters: readonly Semester[],
  futureCredits: number,
  futureGpa: number,
  scale: readonly GradeBand[] = DEFAULT_SCALE,
): number | null {
  let credits = 0;
  let points = 0;
  for (const s of semesters) {
    for (const c of s.courses) {
      const p = coursePoints(c, scale);
      credits += p.credits;
      points += p.points;
    }
  }
  credits += futureCredits;
  points += futureCredits * futureGpa;
  return credits === 0 ? null : points / credits;
}
