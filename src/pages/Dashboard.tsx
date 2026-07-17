import { Suspense, lazy, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useCountUp } from '../hooks/useCountUp';
import { BlurText } from '../components/BlurText';
import { SEED_STUDY_SETS, type StudySet } from '../data/studySets';

// The 3D scene is heavy — load it only once the dashboard mounts.
const StudyOrb = lazy(() =>
  import('../components/three/StudyOrb').then((m) => ({ default: m.StudyOrb })),
);

function MasteryBar({ value }: { value: number }) {
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-tertiary">
      <div
        className="h-full rounded-full bg-mint transition-[width] duration-slow ease-out"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function ProgressRing({ value }: { value: number }) {
  const animated = useCountUp(value);
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c - (animated / 100) * c;
  return (
    <svg width="90" height="90" viewBox="0 0 90 90" role="img" aria-label={`${value}% average mastery`}>
      <circle cx="45" cy="45" r={r} fill="none" stroke="var(--bg-tertiary)" strokeWidth="8" />
      <circle
        cx="45"
        cy="45"
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 45 45)"
      />
      <text
        x="45"
        y="50"
        textAnchor="middle"
        className="font-display text-lg font-bold"
        fill="var(--text-primary)"
      >
        {Math.round(animated)}%
      </text>
    </svg>
  );
}

function StatTile({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  const animated = useCountUp(value);
  return (
    <div className="clay-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-primary">
        {Math.round(animated)}
        {suffix}
      </p>
    </div>
  );
}

export default function Dashboard() {
  const [name, setName] = useLocalStorage('lumina.userName', '');
  const [editingName, setEditingName] = useState(false);
  const [studySets] = useLocalStorage<StudySet[]>('lumina.studySets', SEED_STUDY_SETS);

  const avgMastery = useMemo(
    () =>
      studySets.length === 0
        ? 0
        : Math.round(studySets.reduce((sum, s) => sum + s.mastery, 0) / studySets.length),
    [studySets],
  );

  const totalCards = useMemo(
    () => studySets.reduce((sum, s) => sum + s.cards.length, 0),
    [studySets],
  );
  const totalQuestions = useMemo(
    () => studySets.reduce((sum, s) => sum + s.quiz.length, 0),
    [studySets],
  );

  const weakest = useMemo(
    () => (studySets.length === 0 ? null : [...studySets].sort((a, b) => a.mastery - b.mastery)[0]),
    [studySets],
  );

  return (
    <div>
      {/* ---------------- Hero with 3D orb ---------------- */}
      <section className="relative overflow-hidden border-b border-border bg-surface-1">
        <div className="hero-aurora" aria-hidden="true" />

        {/* The orb sits to the right on desktop, and behind the copy on mobile. */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-full opacity-60 md:w-[52%] md:opacity-100"
          aria-hidden="true"
        >
          <Suspense fallback={null}>
            <StudyOrb style={{ width: '100%', height: '100%' }} />
          </Suspense>
        </div>

        <div className="relative mx-auto w-full max-w-[1000px] px-4 py-16 sm:px-6 md:py-20">
          <div className="max-w-lg">
            {editingName ? (
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
                placeholder="Your name"
                className="w-full bg-transparent font-display text-4xl font-bold text-primary focus:outline-none sm:text-5xl"
              />
            ) : (
              <h1 className="font-display text-4xl font-bold leading-[1.1] tracking-tight text-primary sm:text-5xl">
                <BlurText text={name ? `Hello, ${name}!` : 'Hello there!'} delay={80} />
              </h1>
            )}

            <p className="rise-in mt-3 text-lg text-secondary" style={{ animationDelay: '260ms' }}>
              Ready to master your subjects today?
            </p>

            <div className="rise-in mt-6 flex flex-wrap items-center gap-3" style={{ animationDelay: '340ms' }}>
              <Link
                to="/upload"
                className="pill pressable bg-accent px-5 py-3 text-sm font-semibold text-on-accent shadow-clay-lg"
              >
                + Start New Study Set
              </Link>
              <Link
                to="/calculator"
                className="pill pressable bg-surface-1 px-5 py-3 text-sm font-semibold text-accent shadow-clay"
              >
                What do I need on my final?
              </Link>
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="text-sm font-medium text-muted underline decoration-dotted hover:text-accent"
              >
                {name ? 'edit name' : 'add your name'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1000px] px-4 py-10 sm:px-6">
        {/* ---------------- Stat tiles ---------------- */}
        <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Study sets" value={studySets.length} />
          <StatTile label="Flashcards" value={totalCards} />
          <StatTile label="Questions" value={totalQuestions} />
          <StatTile label="Avg mastery" value={avgMastery} suffix="%" />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
          {/* Recent study sets */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-primary">Recent Study Sets</h2>
              <Link to="/study" className="text-sm font-medium text-accent hover:underline">
                View All
              </Link>
            </div>
            <div className="stagger flex flex-col gap-3">
              {studySets.map((set) => (
                <Link
                  key={set.id}
                  to={`/study/${set.id}`}
                  className="clay-card clay-card-interactive block p-4"
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-mint-hover">
                    {set.subject}
                  </span>
                  <h3 className="mt-1 font-display text-base font-semibold text-primary">
                    {set.title}
                  </h3>
                  <p className="mt-0.5 text-sm text-secondary">{set.description}</p>
                  <MasteryBar value={set.mastery} />
                </Link>
              ))}
              {studySets.length === 0 && (
                <div className="clay-card p-6 text-center text-sm text-secondary">
                  No study sets yet —{' '}
                  <Link to="/upload" className="font-medium text-accent hover:underline">
                    upload your first notes
                  </Link>{' '}
                  to get started.
                </div>
              )}
            </div>
          </section>

          {/* Sidebar */}
          <aside className="stagger flex flex-col gap-4">
            {weakest && (
              <div className="clay-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                  Lumina Insight
                </p>
                <p className="mt-2 text-sm leading-snug text-secondary">
                  You&apos;re at <span className="font-semibold text-primary">{weakest.mastery}%</span>{' '}
                  on <span className="font-semibold text-primary">{weakest.title}</span>. A quick
                  review session could raise your mastery fastest here.
                </p>
                <Link
                  to={`/study/${weakest.id}`}
                  className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
                >
                  Review now →
                </Link>
              </div>
            )}

            <div className="clay-card flex flex-col items-center p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                Average Mastery
              </p>
              <ProgressRing value={avgMastery} />
            </div>

            <div className="clay-card flex flex-col gap-2 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Quick tools
              </p>
              <Link to="/calculator" className="text-sm font-medium text-accent hover:underline">
                Grade Calculator →
              </Link>
              <Link to="/planner" className="text-sm font-medium text-accent hover:underline">
                Degree Planner →
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
