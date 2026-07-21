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
import { CalculatorIcon } from '../components/icons';

function newCategory(name: string, weight: number, score: number | null): GradeCategory {
  return { id: crypto.randomUUID(), name, weight, score };
}

const SEED: GradeCategory[] = [newCategory('Homework', 20, 95), newCategory('Midterm', 30, 68)];

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
    <div className="rise-in mt-3 rounded-xl border border-surface-variant bg-surface-container-lowest p-4 shadow-card">
      <p className="mb-3 font-body text-body-md text-on-surface-variant">
        Minimum percentage for each letter — edit to match your university.
      </p>
      <div className="flex flex-col gap-2">
        {scale.map((band, i) => (
          <div key={band.letter} className="flex items-center gap-3">
            <span className="w-10 font-display text-body-lg font-bold text-primary">{band.letter}</span>
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
              className="w-24 rounded-lg border border-outline-variant bg-surface-container-low px-2.5 py-1.5 font-body text-body-md text-on-surface focus:border-2 focus:border-primary focus:outline-none"
            />
            <span className="font-label-sm text-label-sm text-on-surface-variant">% or higher</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="pressable mt-4 rounded-full bg-surface-container-low px-4 py-1.5 font-label-lg text-label-lg text-primary"
      >
        Done
      </button>
    </div>
  );
}

export default function GradeCalculator() {
  const [categories, setCategories] = useLocalStorage<GradeCategory[]>('lumina.calc.categories', SEED);
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
    <div className="mx-auto w-full max-w-[860px] px-4 pb-stack-xl pt-stack-md sm:px-6">
      <div className="mb-2 flex items-center gap-2 text-primary">
        <CalculatorIcon className="h-5 w-5" />
        <span className="font-label-lg text-label-lg uppercase tracking-wider">Grade Calculator</span>
      </div>
      <h1 className="font-display text-headline-lg text-on-surface">What do I need on the final?</h1>
      <p className="mt-2 max-w-xl font-body text-body-lg text-on-surface-variant">
        Enter what you&apos;ve scored so far. We&apos;ll tell you exactly what you need on what&apos;s
        left to land an A, a B, or whatever you&apos;re aiming for.
      </p>

      {/* -------- Graded work -------- */}
      <section className="mt-8 rounded-xl border border-surface-variant bg-surface-container-lowest p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-title-lg text-on-surface">Your grades so far</h2>
          <span
            className={`font-label-sm text-label-sm font-medium ${weightIsValid ? 'text-on-surface-variant' : 'text-error'}`}
          >
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
                className="min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 font-body text-body-md text-on-surface focus:border-2 focus:border-primary focus:outline-none"
              />
              <div className="flex items-center gap-1.5">
                <input
                  aria-label={`${cat.name} weight`}
                  type="number"
                  min={0}
                  max={100}
                  value={cat.weight}
                  onChange={(e) => updateCategory(cat.id, { weight: Number(e.target.value) })}
                  className="w-16 rounded-lg border border-outline-variant bg-surface-container-low px-2 py-2 text-center font-body text-body-md text-on-surface focus:border-2 focus:border-primary focus:outline-none"
                />
                <span className="font-label-sm text-label-sm text-on-surface-variant">%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  aria-label={`${cat.name} score`}
                  type="number"
                  min={0}
                  max={100}
                  value={cat.score ?? ''}
                  onChange={(e) => updateCategory(cat.id, { score: Number(e.target.value) })}
                  className="w-16 rounded-lg border border-outline-variant bg-surface-container-low px-2 py-2 text-center font-body text-body-md text-on-surface focus:border-2 focus:border-primary focus:outline-none"
                />
                <span className="font-label-sm text-label-sm text-on-surface-variant">score</span>
              </div>
              <button
                type="button"
                onClick={() => removeCategory(cat.id)}
                aria-label={`Remove ${cat.name}`}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-error-container hover:text-error"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addCategory}
          className="pressable mt-4 rounded-full bg-surface-container-low px-4 py-2 font-label-lg text-label-lg text-primary transition-colors hover:bg-primary-fixed/60"
        >
          + Add assignment
        </button>

        {!weightIsValid && (
          <p className="mt-3 font-body text-body-md text-error">
            Your weights add up to more than 100% — adjust them so the math stays accurate.
          </p>
        )}

        {running !== null && (
          <p className="mt-4 font-body text-body-md text-on-surface-variant">
            Right now you&apos;re averaging{' '}
            <span className="font-semibold text-on-surface">{fmtPct(running)}</span> on the work
            you&apos;ve completed.
          </p>
        )}
      </section>

      {/* -------- What's left -------- */}
      <section className="mt-4 rounded-xl border border-surface-variant bg-surface-container-lowest p-5 shadow-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-title-lg text-on-surface">What&apos;s left</h2>
          <span className="font-label-sm text-label-sm font-medium text-on-surface-variant">
            {fmtPct(remainingWeight)} of your grade
          </span>
        </div>
        <input
          aria-label="Remaining assignment name"
          value={remainingName}
          onChange={(e) => setRemainingName(e.target.value)}
          disabled={remainingWeight === 0}
          className="w-full max-w-xs rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 font-body text-body-md text-on-surface focus:border-2 focus:border-primary focus:outline-none disabled:opacity-50"
        />
        {remainingWeight === 0 && (
          <p className="mt-2 font-body text-body-md text-on-surface-variant">
            Your grades add up to 100% already — there&apos;s nothing left to solve for.
          </p>
        )}
      </section>

      {/* -------- Results -------- */}
      {remainingWeight > 0 && (
        <section className="mt-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-title-lg text-on-surface">
              What you need on {remainingName || 'what’s left'}
            </h2>
            <button
              type="button"
              onClick={() => setShowScaleEditor((s) => !s)}
              className="font-label-lg text-label-lg text-primary hover:underline"
            >
              Edit grade scale
            </button>
          </div>

          {showScaleEditor && (
            <ScaleEditor scale={scale} onChange={setScale} onClose={() => setShowScaleEditor(false)} />
          )}

          <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2">
            {rows.map(({ band, result }) => {
              const tone = result.guaranteed
                ? 'border-secondary-fixed bg-secondary-container/25'
                : result.achievable
                  ? 'border-surface-variant bg-surface-container-lowest'
                  : 'border-error-container bg-error-container/30';
              return (
                <div
                  key={band.letter}
                  className={`flex items-center justify-between rounded-xl border p-4 shadow-card ${tone}`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`grid h-10 w-10 place-items-center rounded-full font-display text-body-lg font-bold ${
                        result.guaranteed
                          ? 'bg-secondary-container text-on-secondary-container'
                          : result.achievable
                            ? 'bg-surface-container-low text-primary'
                            : 'bg-error-container text-on-error-container'
                      }`}
                    >
                      {band.letter}
                    </span>
                    <span className="font-body text-body-md text-on-surface-variant">{band.min}%+ overall</span>
                  </div>
                  <div className="text-right">
                    {result.guaranteed ? (
                      <span className="font-label-lg text-label-lg font-semibold text-secondary">
                        Already locked in
                      </span>
                    ) : result.achievable ? (
                      <>
                        <span className="font-display text-title-lg font-bold text-on-surface">
                          {fmtPct(Math.max(0, result.required))}
                        </span>
                        <span className="block font-label-sm text-label-sm text-on-surface-variant">
                          on {remainingName}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-label-lg text-label-lg font-semibold text-error">
                          Not possible
                        </span>
                        <span className="block font-label-sm text-label-sm text-on-surface-variant">
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
                <p className="rise-in mt-4 rounded-xl bg-secondary-container/30 px-4 py-3 font-body text-body-md text-on-secondary-container">
                  Whatever happens on {remainingName}, you&apos;ve already secured a{' '}
                  <span className="font-bold">{locked.band.letter}</span>.
                </p>
              );
            }
            if (best) {
              return (
                <p className="rise-in mt-4 rounded-xl bg-surface-container-low px-4 py-3 font-body text-body-md text-on-surface-variant">
                  The best grade still within reach is an{' '}
                  <span className="font-bold text-on-surface">{best.band.letter}</span> — you need{' '}
                  <span className="font-bold text-on-surface">
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
