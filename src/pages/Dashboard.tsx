import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useCountUp } from '../hooks/useCountUp';
import { SEED_STUDY_SETS, relativeTime, type StudySet } from '../data/studySets';
import { EMPTY_ACTIVITY, currentStreak, weeklyGoalProgress, formatStudyTime, type ActivityState } from '../engine/activity';
import { PlusIcon, LightbulbIcon, FlameIcon, BiotechIcon, PsychologyIcon, MenuBookIcon } from '../components/icons';

/** Weekly target for cards reviewed + quiz questions answered, combined. */
const WEEKLY_GOAL = 120;

function subjectIcon(subject: string) {
  const s = subject.toLowerCase();
  if (s.includes('bio')) return BiotechIcon;
  if (s.includes('psych')) return PsychologyIcon;
  return MenuBookIcon;
}

function ProgressRing({ value, size = 176 }: { value: number; size?: number }) {
  const animated = useCountUp(value);
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, animated) / 100) * c;
  const mid = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${value}% of weekly goal`}>
      <circle cx={mid} cy={mid} r={r} fill="none" stroke="var(--surface-container-high)" strokeWidth={stroke} />
      <circle
        cx={mid}
        cy={mid}
        r={r}
        fill="none"
        stroke="var(--secondary)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${mid} ${mid})`}
      />
      <text
        x={mid}
        y={mid - 6}
        textAnchor="middle"
        className="font-display"
        fontSize="32"
        fontWeight="700"
        fill="var(--on-surface)"
      >
        {Math.round(animated)}%
      </text>
      <text x={mid} y={mid + 20} textAnchor="middle" className="font-body" fontSize="12" fill="var(--on-surface-variant)">
        of Goal
      </text>
    </svg>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-surface-variant bg-surface-container-low p-4">
      <span className="block font-label-sm text-label-sm text-on-surface-variant mb-1">{label}</span>
      <span className="font-display text-title-lg font-bold text-primary">{value}</span>
    </div>
  );
}

export default function Dashboard() {
  const [name, setName] = useLocalStorage('lumina.userName', '');
  const [editingName, setEditingName] = useState(false);
  const [studySets] = useLocalStorage<StudySet[]>('lumina.studySets', SEED_STUDY_SETS);
  const [activity] = useLocalStorage<ActivityState>('lumina.activity', EMPTY_ACTIVITY);

  const streak = useMemo(() => currentStreak(activity), [activity]);
  const weeklyProgress = useMemo(() => weeklyGoalProgress(activity, WEEKLY_GOAL), [activity]);

  return (
    <div className="mx-auto w-full max-w-container-max px-4 pb-stack-xl pt-stack-md md:px-gutter">
      {/* ---------------- Hero ---------------- */}
      <div className="mb-stack-xl flex flex-col items-start justify-between gap-6 rounded-xl border border-surface-variant bg-gradient-to-r from-surface-container-low to-surface-bright p-6 shadow-soft md:p-8 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          {editingName ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
              placeholder="Your name"
              className="mb-2 w-full bg-transparent font-display text-headline-lg text-on-surface focus:outline-none"
            />
          ) : (
            <h2 className="mb-2 font-display text-headline-lg text-on-surface">
              Hello{name ? `, ${name}` : ''}!{' '}
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="align-middle text-label-sm font-medium text-on-surface-variant underline decoration-dotted hover:text-primary"
              >
                {name ? 'edit' : 'add your name'}
              </button>
            </h2>
          )}
          <p className="max-w-xl font-body text-body-lg text-on-surface-variant">
            {streak > 0
              ? `Ready for deep work? You're currently on a ${streak}-day study streak. Let's keep the momentum going.`
              : 'Ready for deep work? Start a study set today to begin your streak.'}
          </p>
        </div>
        <Link
          to="/upload"
          className="pressable flex shrink-0 items-center gap-2 rounded-lg bg-primary px-8 py-3 font-label-lg text-label-lg text-on-primary shadow-sm transition-colors hover:bg-surface-tint"
        >
          <PlusIcon className="h-4 w-4" />
          Start New Study Set
        </Link>
      </div>

      {/* ---------------- Main grid ---------------- */}
      <div className="grid grid-cols-1 gap-gutter lg:grid-cols-12">
        {/* Left column */}
        <div className="flex flex-col gap-stack-md lg:col-span-8">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-title-lg text-on-surface">Recent Study Sets</h3>
            <Link to="/study" className="font-label-lg text-label-lg text-primary hover:text-surface-tint">
              View All
            </Link>
          </div>

          <div className="stagger grid grid-cols-1 gap-6 sm:grid-cols-2">
            {studySets.map((set) => {
              const Icon = subjectIcon(set.subject);
              const barColor = set.mastery >= 70 ? 'bg-secondary' : 'bg-primary';
              return (
                <Link
                  key={set.id}
                  to={`/study/${set.id}`}
                  className="pressable group rounded-xl border border-surface-variant bg-white p-6 shadow-card transition-all hover:border-surface-tint/30"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div className="grid h-12 w-12 place-items-center rounded-lg bg-surface-container-low text-primary">
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className="rounded bg-surface-container-high px-2 py-1 font-label-sm text-label-sm text-on-surface-variant">
                      Updated {relativeTime(set.lastUpdatedMs)}
                    </span>
                  </div>
                  <h4 className="mb-1 font-display text-title-lg text-on-surface transition-colors group-hover:text-primary">
                    {set.title}
                  </h4>
                  <p className="mb-6 font-body text-body-md text-on-surface-variant">{set.description}</p>
                  <div className="space-y-2">
                    <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant">
                      <span>Mastery</span>
                      <span>{set.mastery}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${set.mastery}%` }} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {studySets.length === 0 && (
            <div className="rounded-xl border border-surface-variant bg-white p-8 text-center">
              <p className="text-on-surface-variant">No study sets yet.</p>
              <Link to="/upload" className="mt-2 inline-block font-medium text-primary hover:underline">
                Upload your notes to create one →
              </Link>
            </div>
          )}

          {/* Lumina Insight — honest: surfaces the weakest set, not an invented claim. */}
          {(() => {
            const weakest = studySets.length
              ? [...studySets].sort((a, b) => a.mastery - b.mastery)[0]
              : null;
            if (!weakest) return null;
            return (
              <div className="mt-1 flex items-center gap-6 rounded-xl border border-primary-fixed bg-primary-fixed/30 p-6">
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-primary">
                  <LightbulbIcon className="h-8 w-8 text-on-primary" />
                </div>
                <div>
                  <h4 className="mb-2 font-display text-title-lg text-on-surface">Lumina Insight</h4>
                  <p className="font-body text-body-md text-on-surface-variant">
                    You&apos;re at <span className="font-semibold text-on-surface">{weakest.mastery}%</span> on{' '}
                    <span className="font-semibold text-on-surface">{weakest.title}</span>. A quick review
                    session here would raise your overall mastery the most.
                  </p>
                  <Link
                    to={`/study/${weakest.id}`}
                    className="mt-2 inline-block font-label-lg text-label-lg text-primary hover:underline"
                  >
                    Review now →
                  </Link>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Right column — Weekly Progress */}
        <div className="flex flex-col gap-stack-md lg:col-span-4">
          <div className="flex flex-col items-center rounded-xl border border-surface-variant bg-white p-8 shadow-soft">
            <h3 className="mb-6 w-full text-left font-display text-title-lg text-on-surface">Weekly Progress</h3>
            <ProgressRing value={weeklyProgress} />
            <div className="mt-8 grid w-full grid-cols-2 gap-4">
              <StatTile label="Cards Reviewed" value={activity.cardsReviewed.toLocaleString('en-US')} />
              <StatTile label="Study Time" value={formatStudyTime(activity.studyTimeMs)} />
              <div className="col-span-2 flex items-center justify-between rounded-lg border border-surface-variant bg-surface-container-low p-4">
                <div className="flex items-center gap-2">
                  <FlameIcon className="h-5 w-5 text-secondary" />
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Current Streak</span>
                </div>
                <span className="font-display text-title-lg font-bold text-secondary">
                  {streak} {streak === 1 ? 'Day' : 'Days'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
