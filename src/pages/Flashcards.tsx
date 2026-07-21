import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useStudyTimer } from '../hooks/useStudyTimer';
import { SEED_STUDY_SETS, type StudySet } from '../data/studySets';
import { EMPTY_ACTIVITY, withCardReviewed, withStudyTime, type ActivityState } from '../engine/activity';
import { RefreshIcon, CheckCircleIcon, TouchAppIcon } from '../components/icons';

/** Inline keycap, for teaching the review shortcuts in place. */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-outline-variant/60 bg-surface-container-low px-1.5 py-0.5 font-mono text-[11px] text-on-surface">
      {children}
    </kbd>
  );
}

export default function Flashcards() {
  const { setId } = useParams();
  const [studySets, setStudySets] = useLocalStorage<StudySet[]>('lumina.studySets', SEED_STUDY_SETS);
  const [, setActivity] = useLocalStorage<ActivityState>('lumina.activity', EMPTY_ACTIVITY);
  const set = studySets.find((s) => s.id === setId);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useStudyTimer((ms) => setActivity((a) => withStudyTime(a, ms)));

  const atEnd = set ? index >= set.cards.length - 1 : false;

  const advance = useCallback(() => {
    setFlipped(false);
    if (!atEnd) setIndex((i) => i + 1);
  }, [atEnd]);

  const markKnown = useCallback(
    (known: boolean) => {
      if (!set) return;
      // Nudge mastery — a small, honest signal, not a fake number.
      setStudySets((sets) =>
        sets.map((s) =>
          s.id !== set.id ? s : { ...s, mastery: Math.max(0, Math.min(100, s.mastery + (known ? 3 : -2))) },
        ),
      );
      setActivity((a) => withCardReviewed(a));
      advance();
    },
    [set, advance, setStudySets, setActivity],
  );

  // Keyboard-first review: Space/Enter flips, then 1 = needs work, 2 = known.
  // Arrow keys mirror the on-screen button order for muscle memory.
  // NB: declared before the early return below — hooks must run unconditionally.
  useEffect(() => {
    if (!set) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // Never hijack typing in a field.
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
        return;
      }
      if (!flipped) return;
      if (e.key === '1' || e.key === 'ArrowLeft') {
        e.preventDefault();
        markKnown(false);
      } else if (e.key === '2' || e.key === 'ArrowRight') {
        e.preventDefault();
        markKnown(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [set, flipped, markKnown]);

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

  const card = set.cards[index];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 pb-stack-xl pt-stack-md sm:px-6">
      <Link
        to={`/study/${set.id}`}
        className="mb-6 self-start font-label-lg text-label-lg font-bold text-primary"
      >
        {set.title}
      </Link>

      {/* Progress */}
      <div className="mb-8 flex w-full flex-col items-center gap-3">
        <span className="font-label-lg text-label-lg text-on-surface-variant">
          Card {index + 1} of {set.cards.length}
        </span>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-variant">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-base"
            style={{ width: `${((index + 1) / set.cards.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Flip card — real 3D rotation on the Y axis, matching the reference exactly */}
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

      {/* Actions */}
      {flipped ? (
        <div className="mt-10 flex flex-col items-center gap-4">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => markKnown(false)}
            className="pressable flex items-center gap-2 rounded-lg border-2 border-outline-variant px-8 py-4 font-label-lg text-label-lg text-on-surface transition-all hover:border-primary hover:bg-surface-container-low"
          >
            <RefreshIcon className="h-5 w-5" />
            Need Review
          </button>
          <button
            type="button"
            onClick={() => markKnown(true)}
            className="pressable flex items-center gap-2 rounded-lg bg-primary px-8 py-4 font-label-lg text-label-lg text-on-primary shadow-sm hover:bg-primary-container"
          >
            Got It
            <CheckCircleIcon className="h-5 w-5" />
          </button>
          </div>
          <p className="font-label-sm text-label-sm text-on-surface-variant">
            Press <Kbd>1</Kbd> to review again · <Kbd>2</Kbd> if you got it
          </p>
        </div>
      ) : (
        <p className="mt-10 font-label-sm text-label-sm text-on-surface-variant">
          Press <Kbd>Space</Kbd> to flip the card
        </p>
      )}

      {atEnd && (
        <p className="mt-6 font-body text-body-md text-on-surface-variant">
          {flipped ? 'Last card — mark it to finish this set.' : 'That was the last card.'}
        </p>
      )}
    </div>
  );
}
