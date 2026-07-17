import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { SEED_STUDY_SETS, type StudySet } from '../data/studySets';

export default function Quiz() {
  const { setId } = useParams();
  const [studySets, setStudySets] = useLocalStorage<StudySet[]>('lumina.studySets', SEED_STUDY_SETS);
  const set = studySets.find((s) => s.id === setId);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);

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

  if (set.quiz.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[600px] px-4 py-16 text-center">
        <p className="text-secondary">This set doesn&apos;t have a quiz yet.</p>
      </div>
    );
  }

  const q = set.quiz[index];

  const choose = (optIndex: number) => {
    if (picked !== null) return;
    setPicked(optIndex);
    if (optIndex === q.answerIndex) setCorrectCount((c) => c + 1);
  };

  const next = () => {
    if (index >= set.quiz.length - 1) {
      const score = Math.round((correctCount / set.quiz.length) * 100);
      setStudySets((sets) =>
        sets.map((s) =>
          s.id !== set.id ? s : { ...s, mastery: Math.round((s.mastery + score) / 2) },
        ),
      );
      setFinished(true);
      return;
    }
    setIndex((i) => i + 1);
    setPicked(null);
  };

  if (finished) {
    const score = Math.round((correctCount / set.quiz.length) * 100);
    return (
      <div className="mx-auto flex w-full max-w-[500px] flex-col items-center px-4 py-16 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Quiz complete</p>
        <p className="mt-2 font-display text-5xl font-bold text-primary">{score}%</p>
        <p className="mt-2 text-secondary">
          {correctCount} of {set.quiz.length} correct
        </p>
        <div className="mt-6 flex gap-3">
          <Link to={`/study/${set.id}`} className="pill bg-tertiary px-5 py-2.5 text-sm font-semibold text-accent">
            Back to set
          </Link>
          <Link
            to={`/study/${set.id}/quiz`}
            onClick={() => {
              setIndex(0);
              setPicked(null);
              setCorrectCount(0);
              setFinished(false);
            }}
            className="pill bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent shadow-clay"
          >
            Try again
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 py-10 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <Link to={`/study/${set.id}`} className="text-sm font-medium text-muted hover:text-accent">
          ← {set.title}
        </Link>
        <span className="text-sm font-medium text-secondary">
          Question {index + 1} of {set.quiz.length}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-tertiary">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-base"
          style={{ width: `${((index + (picked !== null ? 1 : 0)) / set.quiz.length) * 100}%` }}
        />
      </div>

      <h1 className="mt-6 font-display text-xl font-semibold leading-snug text-primary">{q.prompt}</h1>

      <div className="mt-5 flex flex-col gap-2.5">
        {q.options.map((opt, i) => {
          const isCorrect = i === q.answerIndex;
          const isPicked = picked === i;
          let cls = 'border-border bg-surface-1 text-primary hover:border-accent';
          if (picked !== null && isCorrect) cls = 'border-mint bg-mint-soft text-on-mint';
          else if (picked !== null && isPicked) cls = 'border-danger bg-danger/10 text-danger';
          else if (picked !== null) cls = 'border-border bg-surface-1 text-muted opacity-60';
          return (
            <button
              key={i}
              type="button"
              disabled={picked !== null}
              onClick={() => choose(i)}
              className={`clay-card flex items-center gap-3 border p-4 text-left text-sm font-medium transition-colors disabled:cursor-default ${cls}`}
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-current text-xs">
                {String.fromCharCode(65 + i)}
              </span>
              {opt}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <div className="rise-in mt-4 rounded-xl bg-tertiary p-4 text-sm text-secondary">
          {q.explanation}
        </div>
      )}

      {picked !== null && (
        <button
          type="button"
          onClick={next}
          className="pill mt-5 bg-accent px-6 py-2.5 text-sm font-semibold text-on-accent shadow-clay"
        >
          {index >= set.quiz.length - 1 ? 'See results' : 'Next question'} →
        </button>
      )}
    </div>
  );
}
