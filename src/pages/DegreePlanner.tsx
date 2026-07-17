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
    <div className="mx-auto w-full max-w-[960px] px-4 py-10 sm:px-6">
      <p className="mb-1 font-mono text-xs font-semibold uppercase tracking-wide text-accent">
        Degree Planner
      </p>
      <h1 className="font-display text-3xl font-bold tracking-tight text-primary sm:text-4xl">
        Your GPA, semester by semester
      </h1>

      {/* -------- Cumulative summary -------- */}
      <div className="clay-card mt-8 flex flex-wrap items-center gap-8 p-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Cumulative GPA</p>
          <p className="font-display text-4xl font-bold text-accent">{fmtGPA(cumulative)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Credits completed</p>
          <p className="font-display text-4xl font-bold text-primary">{credits}</p>
        </div>
      </div>

      {/* -------- Semesters -------- */}
      <div className="mt-6 flex flex-col gap-4">
        {semesters.map((sem) => {
          const gpa = semesterGPA(sem);
          return (
            <section key={sem.id} className="clay-card p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <input
                  aria-label="Semester name"
                  value={sem.name}
                  onChange={(e) =>
                    setSemesters((sems) =>
                      sems.map((s) => (s.id === sem.id ? { ...s, name: e.target.value } : s)),
                    )
                  }
                  className="min-w-0 flex-1 font-display text-lg font-semibold text-primary focus:outline-none"
                />
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-medium text-secondary">Semester GPA: {fmtGPA(gpa)}</span>
                  <button
                    type="button"
                    onClick={() => removeSemester(sem.id)}
                    className="text-xs font-medium text-muted hover:text-danger"
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
                      className="min-w-0 flex-1 rounded-lg border border-border bg-page px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
                    />
                    <div className="flex items-center gap-1.5">
                      <input
                        aria-label={`${c.name} credits`}
                        type="number"
                        min={0}
                        max={12}
                        value={c.credits}
                        onChange={(e) => updateCourse(sem.id, c.id, { credits: Number(e.target.value) })}
                        className="w-14 rounded-lg border border-border bg-page px-2 py-2 text-center text-sm text-primary focus:border-accent focus:outline-none"
                      />
                      <span className="text-xs text-muted">cr</span>
                    </div>
                    <select
                      aria-label={`${c.name} grade`}
                      value={c.letter ?? ''}
                      onChange={(e) =>
                        updateCourse(sem.id, c.id, { letter: e.target.value === '' ? null : e.target.value })
                      }
                      className="rounded-lg border border-border bg-page px-2.5 py-2 text-sm text-primary focus:border-accent focus:outline-none"
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
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-tertiary hover:text-danger"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => addCourse(sem.id)}
                className="pill mt-3 bg-tertiary px-3.5 py-1.5 text-xs font-medium text-accent hover:bg-accent-soft"
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
        className="pill mt-4 bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent shadow-clay"
      >
        + Add semester
      </button>

      {/* -------- What-if -------- */}
      <section className="clay-card mt-8 p-5">
        <h2 className="font-display text-lg font-semibold text-primary">What if…</h2>
        <p className="mt-1 text-sm text-secondary">
          Project your cumulative GPA after a future term.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Credits next term
            <input
              type="number"
              min={0}
              max={30}
              value={futureCredits}
              onChange={(e) => setFutureCredits(Number(e.target.value))}
              className="w-24 rounded-lg border border-border bg-page px-2.5 py-2 text-sm text-primary focus:border-accent focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Expected GPA
            <input
              type="number"
              min={0}
              max={4}
              step={0.1}
              value={futureGpa}
              onChange={(e) => setFutureGpa(Number(e.target.value))}
              className="w-24 rounded-lg border border-border bg-page px-2.5 py-2 text-sm text-primary focus:border-accent focus:outline-none"
            />
          </label>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Projected cumulative</p>
            <p className="font-display text-2xl font-bold text-mint-hover">{fmtGPA(projected)}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
