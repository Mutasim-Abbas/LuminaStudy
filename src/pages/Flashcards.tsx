import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { SEED_STUDY_SETS, type StudySet } from '../data/studySets';

export default function Flashcards() {
  const { setId } = useParams();
  const [studySets, setStudySets] = useLocalStorage<StudySet[]>('lumina.studySets', SEED_STUDY_SETS);
  const set = studySets.find((s) => s.id === setId);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (!set) {
    return (
      <div className="mx-auto w-full max-w-[600px] px-4 py-16 text-center">
        <p className="text-secondary">That study set doesn&apos;t exist.</p>
        <Link to="/study" className="mt-2 inline-block font-medium text-accent hover:underline">
          Back to your library
        </Link>
      </div>
    );
  }

  const card = set.cards[index];
  const atEnd = index >= set.cards.length - 1;

  const advance = () => {
    setFlipped(false);
    if (!atEnd) setIndex((i) => i + 1);
  };

  const markKnown = (known: boolean) => {
    // Nudge mastery — a small, honest signal, not a fake number.
    setStudySets((sets) =>
      sets.map((s) =>
        s.id !== set.id
          ? s
          : { ...s, mastery: Math.max(0, Math.min(100, s.mastery + (known ? 3 : -2))) },
      ),
    );
    advance();
  };

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col items-center px-4 py-10 sm:px-6">
      <div className="mb-4 flex w-full items-center justify-between">
        <Link to={`/study/${set.id}`} className="text-sm font-medium text-muted hover:text-accent">
          ← {set.title}
        </Link>
        <span className="text-sm font-medium text-secondary">
          Card {index + 1} of {set.cards.length}
        </span>
      </div>

      {/* Flip card — real 3D rotation on the Y axis */}
      <div className="flip-scene h-64 w-full">
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-label={flipped ? 'Show question' : 'Show answer'}
          className={`flip-inner ${flipped ? 'is-flipped' : ''}`}
        >
          <span className="flip-face clay-card p-8 text-center">
            <span className="font-display text-xl font-semibold leading-snug text-primary">
              {card.front}
            </span>
          </span>
          <span className="flip-face flip-face-back clay-card bg-tertiary p-8 text-center">
            <span className="font-display text-lg font-semibold leading-snug text-primary">
              {card.back}
            </span>
          </span>
        </button>
      </div>
      <p className="mt-3 text-xs text-muted">
        Tap the card to {flipped ? 'see the question' : 'reveal the answer'}
      </p>

      {flipped ? (
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => markKnown(false)}
            className="pill bg-tertiary px-5 py-2.5 text-sm font-semibold text-secondary"
          >
            Still learning
          </button>
          <button
            type="button"
            onClick={() => markKnown(true)}
            className="pill bg-mint px-5 py-2.5 text-sm font-semibold text-on-mint"
          >
            I know this
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setFlipped(true)}
          className="pill mt-6 bg-accent px-6 py-2.5 text-sm font-semibold text-on-accent shadow-clay"
        >
          Show answer
        </button>
      )}

      {atEnd && flipped === false && index === set.cards.length - 1 && (
        <p className="mt-6 text-sm text-secondary">That was the last card.</p>
      )}
    </div>
  );
}
