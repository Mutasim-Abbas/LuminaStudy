import { useMemo, useState } from 'react';
import {
  currentGrade,
  requiredScoreByBand,
  sumWeight,
  DEFAULT_SCALE,
  type GradeCategory,
  type GradeBand,
} from '../engine/grades';
import { useLocalStorage } from '../hooks/useLocalStorage';

function newCategory(name: string, weight: number, score: number | null): GradeCategory {
  return { id: crypto.randomUUID(), name, weight, score };
}

const SEED: GradeCategory[] = [
  newCategory('Homework', 20, 95),
  newCategory('Midterm', 30, 68),
];

function fmtPct(n: number): string {
  return `${Math.round(n * 10) / 10}%`;
}

function ScaleEditor({
  scale,
  onChange,
  onClose,
}: {
  scale: GradeBand[];
  onChange: (scale: GradeBand[]) => void;
  onClose: () => void;
}) {
  return (
    <div className="clay-card rise-in mt-3 p-4">
      <p className="mb-3 text-sm font-medium text-secondary">
        Minimum percentage for each letter — edit to match your university.
      </p>
      <div className="flex flex-col gap-2">
        {scale.map((band, i) => (
          <div key={band.letter} className="flex items-center gap-3">
            <span className="w-10 font-display text-sm font-bold text-primary">{band.letter}</span>
            <input
              type="number"
              min={0}
              max={100}
              value={band.min}
              onChange={(e) => {
                const next = [...scale];
                next[i] = { ...band, min: Number(e.target.value) };
                onChange(next);
              }}
              className="w-24 rounded-lg border border-border bg-page px-2.5 py-1.5 text-sm text-primary focus:border-accent focus:outline-none"
            />
            <span className="text-xs text-muted">% or higher</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="pill mt-4 bg-tertiary px-4 py-1.5 text-sm font-medium text-accent"
      >
        Done
      </button>
    </div>
  );
}

export default function GradeCalculator() {
  const [categories, setCategories] = useLocalStorage<GradeCategory[]>(
    'lumina.calc.categories',
    SEED,
  );
  const [remainingName, setRemainingName] = useLocalStorage('lumina.calc.remainingName', 'Final Exam');
  const [scale, setScale] = useLocalStorage<GradeBand[]>('lumina.calc.scale', DEFAULT_SCALE);
  const [showScaleEditor, setShowScaleEditor] = useState(false);

  const graded = categories.filter((c) => c.score !== null);
  const gradedWeight = sumWeight(graded);
  const remainingWeight = Math.max(0, 100 - gradedWeight);

  const running = useMemo(() => currentGrade(categories), [categories]);
  const rows = useMemo(
    () => requiredScoreByBand(graded, remainingWeight, scale),
    [graded, remainingWeight, scale],
  );

  const updateCategory = (id: string, patch: Partial<GradeCategory>) => {
    setCategories((cats) => cats.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };
  const removeCategory = (id: string) => {
    setCategories((cats) => cats.filter((c) => c.id !== id));
  };
  const addCategory = () => {
    setCategories((cats) => [...cats, newCategory('New assignment', 0, 0)]);
  };

  const weightIsValid = gradedWeight <= 100;

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-10 sm:px-6">
      <p className="mb-1 font-mono text-xs font-semibold uppercase tracking-wide text-accent">
        Grade Calculator
      </p>
      <h1 className="font-display text-3xl font-bold tracking-tight text-primary sm:text-4xl">
        What do I need on the final?
      </h1>
      <p className="mt-2 max-w-xl text-secondary">
        Enter what you&apos;ve scored so far. We&apos;ll tell you exactly what you need on what&apos;s
        left to land an A, a B, or whatever you&apos;re aiming for.
      </p>

      {/* -------- Graded work -------- */}
      <section className="clay-card mt-8 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-primary">Your grades so far</h2>
          <span className={`text-sm font-medium ${weightIsValid ? 'text-secondary' : 'text-danger'}`}>
            {fmtPct(gradedWeight)} of your grade
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {categories.map((cat) => (
            <div key={cat.id} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
              <input
                aria-label="Assignment name"
                value={cat.name}
                onChange={(e) => updateCategory(cat.id, { name: e.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-border bg-page px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none"
              />
              <div className="flex items-center gap-1.5">
                <input
                  aria-label={`${cat.name} weight`}
                  type="number"
                  min={0}
                  max={100}
                  value={cat.weight}
                  onChange={(e) => updateCategory(cat.id, { weight: Number(e.target.value) })}
                  className="w-16 rounded-lg border border-border bg-page px-2 py-2 text-center text-sm text-primary focus:border-accent focus:outline-none"
                />
                <span className="text-xs text-muted">%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  aria-label={`${cat.name} score`}
                  type="number"
                  min={0}
                  max={100}
                  value={cat.score ?? ''}
                  onChange={(e) => updateCategory(cat.id, { score: Number(e.target.value) })}
                  className="w-16 rounded-lg border border-border bg-page px-2 py-2 text-center text-sm text-primary focus:border-accent focus:outline-none"
                />
                <span className="text-xs text-muted">score</span>
              </div>
              <button
                type="button"
                onClick={() => removeCategory(cat.id)}
                aria-label={`Remove ${cat.name}`}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-tertiary hover:text-danger"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addCategory}
          className="pill mt-4 bg-tertiary px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent-soft"
        >
          + Add assignment
        </button>

        {!weightIsValid && (
          <p className="mt-3 text-sm text-danger">
            Your weights add up to more than 100% — adjust them so the math stays accurate.
          </p>
        )}

        {running !== null && (
          <p className="mt-4 text-sm text-secondary">
            Right now you&apos;re averaging{' '}
            <span className="font-semibold text-primary">{fmtPct(running)}</span> on the work
            you&apos;ve completed.
          </p>
        )}
      </section>

      {/* -------- What's left -------- */}
      <section className="clay-card mt-4 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-primary">What&apos;s left</h2>
          <span className="text-sm font-medium text-secondary">{fmtPct(remainingWeight)} of your grade</span>
        </div>
        <input
          aria-label="Remaining assignment name"
          value={remainingName}
          onChange={(e) => setRemainingName(e.target.value)}
          disabled={remainingWeight === 0}
          className="w-full max-w-xs rounded-lg border border-border bg-page px-3 py-2 text-sm text-primary focus:border-accent focus:outline-none disabled:opacity-50"
        />
        {remainingWeight === 0 && (
          <p className="mt-2 text-sm text-secondary">
            Your grades add up to 100% already — there&apos;s nothing left to solve for.
          </p>
        )}
      </section>

      {/* -------- Results -------- */}
      {remainingWeight > 0 && (
        <section className="mt-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-primary">
              What you need on {remainingName || 'what’s left'}
            </h2>
            <button
              type="button"
              onClick={() => setShowScaleEditor((s) => !s)}
              className="text-sm font-medium text-accent hover:underline"
            >
              Edit grade scale
            </button>
          </div>

          {showScaleEditor && (
            <ScaleEditor scale={scale} onChange={setScale} onClose={() => setShowScaleEditor(false)} />
          )}

          <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2">
            {rows.map(({ band, result }) => {
              // Color the card by outcome so the answer reads at a glance.
              const tone = result.guaranteed
                ? 'border-mint bg-mint-soft'
                : result.achievable
                  ? 'border-border bg-surface-1'
                  : 'border-danger/30 bg-danger/5';
              return (
                <div
                  key={band.letter}
                  className={`clay-card flex items-center justify-between border p-4 ${tone}`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`grid h-10 w-10 place-items-center rounded-full font-display text-base font-bold ${
                        result.guaranteed
                          ? 'bg-mint text-on-mint'
                          : result.achievable
                            ? 'bg-tertiary text-accent'
                            : 'bg-danger/10 text-danger'
                      }`}
                    >
                      {band.letter}
                    </span>
                    <span className="text-sm text-secondary">{band.min}%+ overall</span>
                  </div>
                  <div className="text-right">
                    {result.guaranteed ? (
                      <span className="text-sm font-semibold text-mint-hover">
                        Already locked in
                      </span>
                    ) : result.achievable ? (
                      <>
                        <span className="font-display text-2xl font-bold text-primary">
                          {fmtPct(Math.max(0, result.required))}
                        </span>
                        <span className="block text-[11px] text-muted">on {remainingName}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-sm font-semibold text-danger">Not possible</span>
                        <span className="block text-[11px] text-muted">
                          would need {fmtPct(result.required)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Plain-language verdict — the honest headline answer. */}
          {(() => {
            const best = rows.find((r) => r.result.achievable && !r.result.guaranteed);
            const locked = [...rows].reverse().find((r) => r.result.guaranteed);
            if (!best && locked) {
              return (
                <p className="rise-in mt-4 rounded-xl bg-mint-soft px-4 py-3 text-sm text-on-mint">
                  Whatever happens on {remainingName}, you&apos;ve already secured a{' '}
                  <span className="font-bold">{locked.band.letter}</span>.
                </p>
              );
            }
            if (best) {
              return (
                <p className="rise-in mt-4 rounded-xl bg-tertiary px-4 py-3 text-sm text-secondary">
                  The best grade still within reach is an{' '}
                  <span className="font-bold text-primary">{best.band.letter}</span> — you need{' '}
                  <span className="font-bold text-primary">
                    {fmtPct(Math.max(0, best.result.required))}
                  </span>{' '}
                  on {remainingName}.
                </p>
              );
            }
            return null;
          })()}
        </section>
      )}
    </div>
  );
}
