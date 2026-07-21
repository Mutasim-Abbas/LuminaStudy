import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useCountUp } from '../hooks/useCountUp';
import { relativeTime, type StudySet } from '../data/studySets';
import {
  EMPTY_ACTIVITY,
  currentStreak,
  weeklyGoalProgress,
  weeklyReviewCount,
  weeklyStudyTime,
  formatStudyTime,
  type ActivityState,
} from '../engine/activity';
import { dueCount, formatDueIn, nextDueMs, setMastery, type SrsState } from '../engine/srs';
import { StudyHeatmap } from '../components/StudyHeatmap';
import { useAuth } from '../hooks/useAuth';
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
  const { user } = useAuth();
  const [localName, setName] = useLocalStorage('lumina.userName', '');
  const [editingName, setEditingName] = useState(false);
  // The account's name is the real one; the editable local name is a fallback
  // for anyone who set it before accounts existed, and a nickname override.
  const name = localName || user?.name || '';
  const [studySets] = useLocalStorage<StudySet[]>('lumina.studySets', []);
  const [activity] = useLocalStorage<ActivityState>('lumina.activity', EMPTY_ACTIVITY);
  const [srs] = useLocalStorage<SrsState>('lumina.srs', {});

  /** What's ready to review right now, across every set. */
  const dueBySet = useMemo(() => {
    const now = Date.now();
    return studySets
      .map((set) => ({ set, due: dueCount(set, srs, now) }))
      .filter((row) => row.due > 0)
      .sort((a, b) => b.due - a.due);
  }, [studySets, srs]);

  const totalDue = useMemo(() => dueBySet.reduce((n, r) => n + r.due, 0), [dueBySet]);

  /**
   * Mastery is read from the schedule, not from the stored field — a set that
   * was never reviewed must never display progress somebody didn't earn.
   */
  const masteryOf = useCallback((s: StudySet) => setMastery(s, srs), [srs]);

  /** Soonest upcoming review when nothing is due — null if any set is unstudied. */
  const soonest = useMemo(() => {
    const times = studySets.map((s) => nextDueMs(s, srs)).filter((t): t is number => t !== null);
    return times.length === studySets.length && times.length > 0 ? Math.min(...times) : null;
  }, [studySets, srs]);

  const streak = useMemo(() => currentStreak(activity), [activity]);
  const weeklyProgress = useMemo(() => weeklyGoalProgress(activity, WEEKLY_GOAL), [activity]);
  const weekReviews = useMemo(() => weeklyReviewCount(activity), [activity]);
  const weekTime = useMemo(() => weeklyStudyTime(activity), [activity]);

  return (
    <div className="mx-auto w-full max-w-container-max px-4 pb-stack-xl pt-stack-md md:px-gutter">
      {/* ---------------- Hero ---------------- */}
      <div className="mb-stack-xl flex flex-col items-start justify-between gap-6 rounded-xl border border-surface-variant bg-gradient-to-r from-surface-container-low to-surface-bright p-6 shadow-soft md:p-8 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          {editingName ? (
            <input
              autoFocus
              value={localName}
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
          {/* Due Today — the first question a spaced-repetition app should answer */}
          <section className="rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-card">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-title-lg text-on-surface">Due Today</h3>
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                {totalDue > 0
                  ? `${totalDue} ${totalDue === 1 ? 'card' : 'cards'} ready`
                  : soonest !== null
                    ? `Next review ${formatDueIn(soonest, Date.now())}`
                    : 'Nothing scheduled yet'}
              </span>
            </div>

            {dueBySet.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {dueBySet.map(({ set, due }) => (
                  <li key={set.id}>
                    <Link
                      to={`/study/${set.id}/flashcards`}
                      className="pressable flex items-center justify-between gap-4 rounded-lg border border-surface-variant bg-surface-container-low px-4 py-3 transition-colors hover:border-secondary"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-label-lg text-label-lg text-on-surface">
                          {set.title}
                        </span>
                        <span className="block font-label-sm text-label-sm text-on-surface-variant">
                          {set.subject}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-secondary px-3 py-1 font-label-sm text-label-sm font-bold text-on-secondary">
                        {due} due
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-body text-body-md text-on-surface-variant">
                You&apos;re all caught up. Reviews reappear as they come due — that spacing is what moves
                them into long-term memory.
              </p>
            )}
          </section>

          <div className="flex items-center justify-between">
            <h3 className="font-display text-title-lg text-on-surface">Recent Study Sets</h3>
            <Link to="/study" className="font-label-lg text-label-lg text-primary hover:text-surface-tint">
              View All
            </Link>
          </div>

          <div className="stagger grid grid-cols-1 gap-6 sm:grid-cols-2">
            {studySets.map((set) => {
              const Icon = subjectIcon(set.subject);
              const mastery = masteryOf(set);
              const barColor = mastery >= 70 ? 'bg-secondary' : 'bg-primary';
              return (
                <Link
                  key={set.id}
                  to={`/study/${set.id}`}
                  className="pressable group rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-card transition-all hover:border-surface-tint/30"
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
                      <span>{mastery}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${mastery}%` }} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {studySets.length === 0 && (
            <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-8 text-center">
              <p className="text-on-surface-variant">No study sets yet.</p>
              <Link to="/upload" className="mt-2 inline-block font-medium text-primary hover:underline">
                Upload your notes to create one →
              </Link>
            </div>
          )}

          {/* Lumina Insight — honest: surfaces the weakest set, not an invented claim. */}
          {(() => {
            const weakest = studySets.length
              ? [...studySets].sort((a, b) => masteryOf(a) - masteryOf(b))[0]
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
                    You&apos;re at <span className="font-semibold text-on-surface">{masteryOf(weakest)}%</span> on{' '}
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
          <div className="flex flex-col items-center rounded-xl border border-surface-variant bg-surface-container-lowest p-8 shadow-soft">
            <h3 className="mb-6 w-full text-left font-display text-title-lg text-on-surface">Weekly Progress</h3>
            <ProgressRing value={weeklyProgress} />
            <div className="mt-8 grid w-full grid-cols-2 gap-4">
              {/* Weekly figures under a weekly heading — the lifetime totals live below. */}
              <StatTile label="Reviews This Week" value={weekReviews.toLocaleString('en-US')} />
              <StatTile label="Time This Week" value={formatStudyTime(weekTime)} />
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

            {/* All-time totals — kept distinct from the weekly numbers above. */}
            <div className="mt-4 flex w-full items-center justify-between border-t border-surface-variant pt-4">
              <span className="font-label-sm text-label-sm text-on-surface-variant">All time</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                {(() => {
                  const total = activity.cardsReviewed + activity.quizQuestionsAnswered;
                  return `${total.toLocaleString('en-US')} ${total === 1 ? 'review' : 'reviews'}`;
                })()}{' '}
                · {formatStudyTime(activity.studyTimeMs)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Study activity heatmap — full width beneath the grid */}
      <div className="mt-stack-md">
        <StudyHeatmap activity={activity} />
      </div>
    </div>
  );
}
