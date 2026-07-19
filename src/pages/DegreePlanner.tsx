import { useMemo, useState } from 'react';
import {
  semesterGPA,
  cumulativeGPA,
  totalCredits,
  projectedGPA,
  type Semester,
  type DegreeCourse,
} from '../engine/degree';
import { DEFAULT_SCALE } from '../engine/grades';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useCountUp } from '../hooks/useCountUp';
import { GraduationCapIcon } from '../components/icons';

const LETTERS = DEFAULT_SCALE.map((b) => b.letter);

function newCourse(name = 'New course', credits = 3): DegreeCourse {
  return { id: crypto.randomUUID(), name, credits, letter: null };
}
function newSemester(name: string): Semester {
  return { id: crypto.randomUUID(), name, courses: [newCourse()] };
}

const SEED: Semester[] = [
  {
    id: crypto.randomUUID(),
    name: 'Fall 2025',
    courses: [
      { id: crypto.randomUUID(), name: 'Calculus I', credits: 4, letter: 'A' },
      { id: crypto.randomUUID(), name: 'Intro to Programming', credits: 3, letter: 'A' },
      { id: crypto.randomUUID(), name: 'Physics I', credits: 4, letter: 'B' },
    ],
  },
];

function fmtGPA(n: number | null): string {
  return n === null ? '—' : n.toFixed(2);
}

/** Big GPA figure that counts to its new value whenever grades change. */
function AnimatedGPA({ value, className }: { value: number | null; className: string }) {
  const animated = useCountUp(value ?? 0);
  return <p className={className}>{value === null ? '—' : animated.toFixed(2)}</p>;
}

export default function DegreePlanner() {
  const [semesters, setSemesters] = useLocalStorage<Semester[]>('lumina.planner.semesters', SEED);
  const [futureCredits, setFutureCredits] = useState(15);
  const [futureGpa, setFutureGpa] = useState(3.7);

  const cumulative = useMemo(() => cumulativeGPA(semesters), [semesters]);
  const credits = useMemo(() => totalCredits(semesters), [semesters]);
  const projected = useMemo(
    () => projectedGPA(semesters, futureCredits, futureGpa),
    [semesters, futureCredits, futureGpa],
  );

  const updateCourse = (semId: string, courseId: string, patch: Partial<DegreeCourse>) => {
    setSemesters((sems) =>
      sems.map((s) =>
        s.id !== semId
          ? s
          : { ...s, courses: s.courses.map((c) => (c.id === courseId ? { ...c, ...patch } : c)) },
      ),
    );
  };
  const addCourse = (semId: string) => {
    setSemesters((sems) => sems.map((s) => (s.id === semId ? { ...s, courses: [...s.courses, newCourse()] } : s)));
  };
  const removeCourse = (semId: string, courseId: string) => {
    setSemesters((sems) =>
      sems.map((s) => (s.id !== semId ? s : { ...s, courses: s.courses.filter((c) => c.id !== courseId) })),
    );
  };
  const addSemester = () => {
    setSemesters((sems) => [...sems, newSemester(`Semester ${sems.length + 1}`)]);
  };
  const removeSemester = (semId: string) => {
    setSemesters((sems) => sems.filter((s) => s.id !== semId));
  };

  return (
    <div className="mx-auto w-full max-w-[960px] px-4 pb-stack-xl pt-stack-md sm:px-6">
      <div className="mb-2 flex items-center gap-2 text-primary">
        <GraduationCapIcon className="h-5 w-5" />
        <span className="font-label-lg text-label-lg uppercase tracking-wider">Degree Planner</span>
      </div>
      <h1 className="font-display text-headline-lg text-on-surface">Your GPA, semester by semester</h1>

      {/* -------- Cumulative summary -------- */}
      <div className="mt-8 flex flex-wrap items-center gap-8 rounded-xl border border-surface-variant bg-white p-6 shadow-soft">
        <div>
          <p className="font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">
            Cumulative GPA
          </p>
          <AnimatedGPA value={cumulative} className="font-display text-headline-md text-primary" />
        </div>
        <div>
          <p className="font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">
            Credits completed
          </p>
          <p className="font-display text-headline-md text-on-surface">{credits}</p>
        </div>
      </div>

      {/* -------- Semesters -------- */}
      <div className="mt-6 flex flex-col gap-4">
        {semesters.map((sem) => {
          const gpa = semesterGPA(sem);
          return (
            <section key={sem.id} className="rounded-xl border border-surface-variant bg-white p-5 shadow-card">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <input
                  aria-label="Semester name"
                  value={sem.name}
                  onChange={(e) =>
                    setSemesters((sems) =>
                      sems.map((s) => (s.id === sem.id ? { ...s, name: e.target.value } : s)),
                    )
                  }
                  className="min-w-0 flex-1 font-display text-title-lg text-on-surface focus:outline-none"
                />
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-label-sm text-label-sm font-medium text-on-surface-variant">
                    Semester GPA: {fmtGPA(gpa)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSemester(sem.id)}
                    className="font-label-sm text-label-sm font-medium text-on-surface-variant hover:text-error"
                  >
                    Remove semester
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {sem.courses.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-2">
                    <input
                      aria-label="Course name"
                      value={c.name}
                      onChange={(e) => updateCourse(sem.id, c.id, { name: e.target.value })}
                      className="min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 font-body text-body-md text-on-surface focus:border-2 focus:border-primary focus:outline-none"
                    />
                    <div className="flex items-center gap-1.5">
                      <input
                        aria-label={`${c.name} credits`}
                        type="number"
                        min={0}
                        max={12}
                        value={c.credits}
                        onChange={(e) => updateCourse(sem.id, c.id, { credits: Number(e.target.value) })}
                        className="w-14 rounded-lg border border-outline-variant bg-surface-container-low px-2 py-2 text-center font-body text-body-md text-on-surface focus:border-2 focus:border-primary focus:outline-none"
                      />
                      <span className="font-label-sm text-label-sm text-on-surface-variant">cr</span>
                    </div>
                    <select
                      aria-label={`${c.name} grade`}
                      value={c.letter ?? ''}
                      onChange={(e) =>
                        updateCourse(sem.id, c.id, { letter: e.target.value === '' ? null : e.target.value })
                      }
                      className="rounded-lg border border-outline-variant bg-surface-container-low px-2.5 py-2 font-body text-body-md text-on-surface focus:border-2 focus:border-primary focus:outline-none"
                    >
                      <option value="">In progress</option>
                      {LETTERS.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeCourse(sem.id, c.id)}
                      aria-label={`Remove ${c.name}`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-on-surface-variant hover:bg-error-container hover:text-error"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => addCourse(sem.id)}
                className="pressable mt-3 rounded-full bg-surface-container-low px-3.5 py-1.5 font-label-sm text-label-sm font-medium text-primary hover:bg-primary-fixed/60"
              >
                + Add course
              </button>
            </section>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addSemester}
        className="pressable mt-4 rounded-lg bg-primary px-5 py-2.5 font-label-lg text-label-lg text-on-primary shadow-sm hover:bg-surface-tint"
      >
        + Add semester
      </button>

      {/* -------- What-if -------- */}
      <section className="mt-8 rounded-xl border border-surface-variant bg-white p-5 shadow-card">
        <h2 className="font-display text-title-lg text-on-surface">What if…</h2>
        <p className="mt-1 font-body text-body-md text-on-surface-variant">
          Project your cumulative GPA after a future term.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 font-label-sm text-label-sm font-medium text-on-surface-variant">
            Credits next term
            <input
              type="number"
              min={0}
              max={30}
              value={futureCredits}
              onChange={(e) => setFutureCredits(Number(e.target.value))}
              className="w-24 rounded-lg border border-outline-variant bg-surface-container-low px-2.5 py-2 font-body text-body-md text-on-surface focus:border-2 focus:border-primary focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 font-label-sm text-label-sm font-medium text-on-surface-variant">
            Expected GPA
            <input
              type="number"
              min={0}
              max={4}
              step={0.1}
              value={futureGpa}
              onChange={(e) => setFutureGpa(Number(e.target.value))}
              className="w-24 rounded-lg border border-outline-variant bg-surface-container-low px-2.5 py-2 font-body text-body-md text-on-surface focus:border-2 focus:border-primary focus:outline-none"
            />
          </label>
          <div>
            <p className="font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">
              Projected cumulative
            </p>
            <p className="font-display text-title-lg font-bold text-secondary">{fmtGPA(projected)}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
