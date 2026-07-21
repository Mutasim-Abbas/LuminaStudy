import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useStudyTimer } from '../hooks/useStudyTimer';
import { type StudySet } from '../data/studySets';
import { EMPTY_ACTIVITY, withCardReviewed, withStudyTime, type ActivityState } from '../engine/activity';
import {
  dueCards,
  formatDueIn,
  gradeCard,
  nextDueMs,
  scheduleKey,
  setMastery,
  type Grade,
  type SrsState,
} from '../engine/srs';
import { pushSetQuietly } from '../lib/api';
import { CheckCircleIcon, TouchAppIcon, TrophyIcon } from '../components/icons';

/** Inline keycap, for teaching the review shortcuts in place. */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-outline-variant/60 bg-surface-container-low px-1.5 py-0.5 font-mono text-[11px] text-on-surface">
      {children}
    </kbd>
  );
}

/** The four grades, in the order they appear on screen and on the number row. */
const GRADES: { grade: Grade; label: string; hint: string; className: string }[] = [
  {
    grade: 'again',
    label: 'Again',
    hint: 'Forgot it',
    className: 'border-2 border-error/60 text-error hover:bg-error/10',
  },
  {
    grade: 'hard',
    label: 'Hard',
    hint: 'Struggled',
    className: 'border-2 border-outline-variant text-on-surface hover:border-primary hover:bg-surface-container-low',
  },
  {
    grade: 'good',
    label: 'Good',
    hint: 'Recalled it',
    className: 'bg-primary text-on-primary hover:bg-primary-container',
  },
  {
    grade: 'easy',
    label: 'Easy',
    hint: 'Instant',
    className: 'bg-secondary text-on-secondary hover:opacity-90',
  },
];

export default function Flashcards() {
  const { setId } = useParams();
  const [studySets, setStudySets] = useLocalStorage<StudySet[]>('lumina.studySets', []);
  const [srs, setSrs] = useLocalStorage<SrsState>('lumina.srs', {});
  const [, setActivity] = useLocalStorage<ActivityState>('lumina.activity', EMPTY_ACTIVITY);

  const set = studySets.find((s) => s.id === setId);

  /** Card ids remaining in this sitting. Built once, then drained. */
  const [queue, setQueue] = useState<string[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const builtFor = useRef<string | null>(null);

  useStudyTimer((ms) => setActivity((a) => withStudyTime(a, ms)));

  // Build the session queue once per set. Deliberately not reacting to `srs`:
  // grading rewrites it, and rebuilding mid-session would drop cards underfoot.
  useEffect(() => {
    if (!set || builtFor.current === set.id) return;
    builtFor.current = set.id;
    setQueue(dueCards(set, srs, Date.now()).map((c) => c.id));
    setReviewed(0);
    setFlipped(false);
  }, [set, srs]);

  const currentId = queue[0];
  const card = set?.cards.find((c) => c.id === currentId);

  /** What each button would schedule, so the learner can see the cost. */
  const previews = useMemo(() => {
    if (!set || !card) return null;
    const now = Date.now();
    const prev = srs[scheduleKey(set.id, card.id)];
    return Object.fromEntries(
      GRADES.map(({ grade }) => {
        const next = gradeCard(prev, grade, now);
        return [grade, formatDueIn(next.dueMs, now)];
      }),
    ) as Record<Grade, string>;
  }, [set, card, srs]);

  const submit = useCallback(
    (grade: Grade) => {
      if (!set || !card) return;
      const now = Date.now();
      const key = scheduleKey(set.id, card.id);
      const nextSrs: SrsState = { ...srs, [key]: gradeCard(srs[key], grade, now) };

      setSrs(nextSrs);
      // Mastery is derived from the schedule, never nudged by hand.
      setStudySets((sets) =>
        sets.map((s) => {
          if (s.id !== set.id) return s;
          const updated = { ...s, mastery: setMastery(s, nextSrs), lastUpdatedMs: now };
          // Best-effort cloud save; a no-op when signed out.
          pushSetQuietly(updated);
          return updated;
        }),
      );
      setActivity((a) => withCardReviewed(a));

      setFlipped(false);
      setReviewed((n) => n + 1);
      // A forgotten card comes back at the end of this sitting.
      setQueue(([head, ...rest]) => (grade === 'again' ? [...rest, head] : rest));
    },
    [set, card, srs, setSrs, setStudySets, setActivity],
  );

  // Keyboard-first review: Space flips, then 1-4 grade the card.
  // Declared before any early return — hooks must run unconditionally.
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
        return;
      }
      if (!flipped) return;
      const index = Number(e.key) - 1;
      if (index >= 0 && index < GRADES.length) {
        e.preventDefault();
        submit(GRADES[index].grade);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, flipped, submit]);

  if (!set) {
    return (
      <div className="mx-auto w-full max-w-[600px] px-4 py-16 text-center">
        <p className="text-on-surface-variant">That study set doesn&apos;t exist.</p>
        <Link to="/study" className="mt-2 inline-block font-medium text-primary hover:underline">
          Back to your library
        </Link>
      </div>
    );
  }

  // ---------------- Session finished ----------------
  if (!card) {
    const upcoming = nextDueMs(set, srs);
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-16 text-center">
        <div className="rise-in grid h-20 w-20 place-items-center rounded-full bg-secondary-container text-on-secondary-container">
          <TrophyIcon className="h-10 w-10" />
        </div>
        <h2 className="mt-6 font-display text-headline-md text-on-surface">
          {reviewed > 0 ? 'Session complete' : 'Nothing due right now'}
        </h2>
        <p className="mt-2 max-w-md font-body text-body-lg text-on-surface-variant">
          {reviewed > 0
            ? `You reviewed ${reviewed} ${reviewed === 1 ? 'card' : 'cards'}. Spacing them out is what makes them stick.`
            : 'Every card in this set is scheduled ahead. Come back when they are due.'}
        </p>
        {upcoming !== null && (
          <p className="mt-3 font-label-lg text-label-lg text-primary">
            Next review {formatDueIn(upcoming, Date.now())}
          </p>
        )}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            to={`/study/${set.id}`}
            className="pressable rounded-lg bg-primary px-8 py-3 font-label-lg text-label-lg text-on-primary"
          >
            Back to set
          </Link>
          <Link
            to={`/study/${set.id}/quiz`}
            className="pressable rounded-lg border-2 border-outline-variant px-8 py-3 font-label-lg text-label-lg text-on-surface hover:border-primary"
          >
            Take the quiz
          </Link>
        </div>
      </div>
    );
  }

  // ---------------- Reviewing ----------------
  const remaining = queue.length;
  const total = reviewed + remaining;
  const progress = total === 0 ? 0 : (reviewed / total) * 100;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 pb-stack-xl pt-stack-md sm:px-6">
      <Link to={`/study/${set.id}`} className="mb-6 self-start font-label-lg text-label-lg font-bold text-primary">
        {set.title}
      </Link>

      {/* Progress */}
      <div className="mb-8 flex w-full flex-col items-center gap-3">
        <span className="font-label-lg text-label-lg text-on-surface-variant">
          {remaining} {remaining === 1 ? 'card' : 'cards'} to go · {reviewed} reviewed
        </span>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-variant">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-base"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Flip card — real 3D rotation on the Y axis */}
      <div className={`flashcard perspective-1000 aspect-[16/9] w-full cursor-pointer ${flipped ? 'is-flipped' : ''}`}>
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-label={flipped ? 'Show question' : 'Show answer'}
          className="flashcard-inner relative h-full w-full rounded-xl shadow-flashcard"
        >
          {/* Front */}
          <div className="backface-hidden absolute inset-0 flex flex-col items-center justify-center rounded-xl border border-surface-variant bg-surface-container-lowest p-12 text-center">
            <span className="absolute left-6 top-6 font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
              Concept
            </span>
            <h2 className="font-display text-headline-md text-primary sm:text-headline-lg">{card.front}</h2>
            <div className="absolute bottom-6 flex items-center gap-2 text-on-surface-variant opacity-60">
              <TouchAppIcon className="h-4 w-4" />
              <span className="font-label-sm text-label-sm">Tap to Flip</span>
            </div>
          </div>
          {/* Back */}
          <div className="backface-hidden rotate-y-180 absolute inset-0 flex flex-col items-center justify-center rounded-xl border border-surface-variant bg-surface-container-lowest p-12 text-center">
            <span className="absolute left-6 top-6 font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
              Definition
            </span>
            <p className="max-w-xl font-body text-body-lg text-on-surface">{card.back}</p>
          </div>
        </button>
      </div>

      {/* Grading */}
      {flipped ? (
        <div className="mt-10 flex w-full flex-col items-center gap-4">
          <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
            {GRADES.map(({ grade, label, hint, className }, i) => (
              <button
                key={grade}
                type="button"
                onClick={() => submit(grade)}
                className={`pressable flex flex-col items-center gap-0.5 rounded-lg px-4 py-3 font-label-lg text-label-lg transition-all ${className}`}
              >
                <span className="flex items-center gap-2">
                  {label}
                  {grade === 'good' && <CheckCircleIcon className="h-4 w-4" />}
                </span>
                <span className="font-label-sm text-[11px] opacity-80">
                  {hint} · {previews?.[grade]}
                </span>
                <span className="font-mono text-[10px] opacity-60">{i + 1}</span>
              </button>
            ))}
          </div>
          <p className="font-label-sm text-label-sm text-on-surface-variant">
            Press <Kbd>1</Kbd>–<Kbd>4</Kbd> to grade — the harder it was, the sooner it comes back
          </p>
        </div>
      ) : (
        <p className="mt-10 font-label-sm text-label-sm text-on-surface-variant">
          Press <Kbd>Space</Kbd> to flip the card
        </p>
      )}
    </div>
  );
}
