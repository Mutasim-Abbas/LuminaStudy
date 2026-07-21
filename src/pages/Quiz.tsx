import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useCountUp } from '../hooks/useCountUp';
import { useStudyTimer } from '../hooks/useStudyTimer';
import { SEED_STUDY_SETS, type StudySet } from '../data/studySets';
import { EMPTY_ACTIVITY, withQuizAnswered, withStudyTime, type ActivityState } from '../engine/activity';
import { PsychologyIcon, ArrowRightIcon, CheckCircleIcon } from '../components/icons';

/** Counts the final score up from zero — a small payoff for finishing. */
function ScoreReveal({ score }: { score: number }) {
  const animated = useCountUp(score, 900);
  return <p className="font-display text-display-xl text-primary">{Math.round(animated)}%</p>;
}

export default function Quiz() {
  const { setId } = useParams();
  const [studySets, setStudySets] = useLocalStorage<StudySet[]>('lumina.studySets', SEED_STUDY_SETS);
  const [, setActivity] = useLocalStorage<ActivityState>('lumina.activity', EMPTY_ACTIVITY);
  const set = studySets.find((s) => s.id === setId);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctByIndex, setCorrectByIndex] = useState<boolean[]>([]);
  const [finished, setFinished] = useState(false);

  useStudyTimer((ms) => setActivity((a) => withStudyTime(a, ms)));

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

  if (set.quiz.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[600px] px-4 py-16 text-center">
        <p className="text-on-surface-variant">This set doesn&apos;t have a quiz yet.</p>
      </div>
    );
  }

  const q = set.quiz[index];
  const correctCount = correctByIndex.filter(Boolean).length;

  const choose = (optIndex: number) => {
    if (picked !== null) return;
    setPicked(optIndex);
    const isCorrect = optIndex === q.answerIndex;
    setCorrectByIndex((arr) => {
      const next = [...arr];
      next[index] = isCorrect;
      return next;
    });
    setActivity((a) => withQuizAnswered(a));
  };

  const next = () => {
    if (index >= set.quiz.length - 1) {
      const score = Math.round((correctCount / set.quiz.length) * 100);
      setStudySets((sets) =>
        sets.map((s) => (s.id !== set.id ? s : { ...s, mastery: Math.round((s.mastery + score) / 2) })),
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
        <p className="font-label-lg text-label-lg uppercase tracking-wide text-primary">Quiz complete</p>
        <ScoreReveal score={score} />
        <p className="mt-2 font-body text-body-lg text-on-surface-variant">
          {correctCount} of {set.quiz.length} correct
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            to={`/study/${set.id}`}
            className="pressable rounded-full bg-surface-container-low px-5 py-2.5 font-label-lg text-label-lg text-primary"
          >
            Back to set
          </Link>
          <Link
            to={`/study/${set.id}/quiz`}
            onClick={() => {
              setIndex(0);
              setPicked(null);
              setCorrectByIndex([]);
              setFinished(false);
            }}
            className="pressable rounded-lg bg-primary px-5 py-2.5 font-label-lg text-label-lg text-on-primary shadow-sm"
          >
            Try again
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-container-max px-4 pb-stack-xl pt-stack-md md:px-gutter">
      <div className="mb-stack-md flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 flex items-center gap-2 font-label-lg text-label-lg uppercase tracking-wider text-primary">
            <PsychologyIcon className="h-4 w-4" />
            {set.title} practice set
          </p>
          <h2 className="font-display text-headline-lg text-on-surface">
            Question {index + 1} of {set.quiz.length}
          </h2>
        </div>
        <Link to={`/study/${set.id}`} className="font-label-lg text-label-lg text-on-surface-variant hover:text-primary">
          ← Back to set
        </Link>
      </div>

      <div className="flex flex-col gap-gutter lg:flex-row">
        {/* Question canvas */}
        <div className="flex flex-1 flex-col gap-stack-md">
          <div className="relative overflow-hidden rounded-xl border border-surface-container border-b-4 border-b-primary bg-surface-container-lowest p-8 shadow-card">
            <p className="max-w-3xl font-display text-title-lg leading-relaxed text-on-surface">{q.prompt}</p>
          </div>

          <div key={q.id} className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2">
            {q.options.map((opt, i) => {
              const isCorrect = i === q.answerIndex;
              const isPicked = picked === i;
              const answered = picked !== null;

              let card = 'border-surface-container-high bg-surface-container-lowest hover:border-secondary hover:bg-surface-container-low';
              let avatar = 'bg-surface-container text-on-surface-variant group-hover:bg-secondary group-hover:text-white';
              if (answered && isCorrect) {
                card = 'border-secondary bg-surface-container-low shadow-[0_4px_12px_rgba(0,108,83,0.1)]';
                avatar = 'bg-secondary text-white';
              } else if (answered && isPicked) {
                card = 'border-error bg-error-container/40';
                avatar = 'bg-error text-white';
              } else if (answered) {
                card = 'border-surface-container-high bg-surface-container-lowest opacity-50';
              }

              return (
                <button
                  key={i}
                  type="button"
                  disabled={answered}
                  onClick={() => choose(i)}
                  className={`group relative flex items-start gap-4 overflow-hidden rounded-xl border-2 p-6 text-left transition-all duration-200 disabled:cursor-default ${card}`}
                >
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full font-label-lg text-label-lg transition-colors ${avatar}`}>
                    {String.fromCharCode(65 + i)}
                  </div>
                  <span className="mt-1 font-body text-body-lg text-on-surface">{opt}</span>
                  {answered && isCorrect && (
                    <CheckCircleIcon className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-secondary" />
                  )}
                </button>
              );
            })}
          </div>

          {picked !== null && (
            <div className="rise-in rounded-xl bg-surface-container-low p-4 font-body text-body-md text-on-surface-variant">
              {q.explanation}
            </div>
          )}

          {picked !== null && (
            <button
              type="button"
              onClick={next}
              className="pressable flex w-fit items-center gap-2 rounded-lg bg-primary px-8 py-3 font-label-lg text-label-lg text-on-primary shadow-sm hover:bg-primary-container"
            >
              {index >= set.quiz.length - 1 ? 'See results' : 'Next question'}
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Question map — read-only progress overview */}
        <aside className="w-full shrink-0 lg:w-72">
          <div className="sticky top-24 rounded-xl border border-surface-container bg-surface-container-lowest p-6 shadow-card">
            <h3 className="mb-4 font-display text-title-lg text-on-surface">Question Map</h3>
            <div className="grid grid-cols-5 gap-2 lg:grid-cols-4">
              {set.quiz.map((_, i) => {
                const state =
                  i === index ? 'current' : i < index ? 'answered' : 'unanswered';
                const cls =
                  state === 'current'
                    ? 'bg-primary text-on-primary shadow-md ring-2 ring-primary/20'
                    : state === 'answered'
                      ? 'bg-surface-container-highest text-on-surface-variant'
                      : 'border border-outline-variant/50 bg-surface-container-lowest text-on-surface-variant';
                return (
                  <div
                    key={i}
                    className={`grid aspect-square place-items-center rounded-lg font-label-sm text-label-sm ${cls}`}
                  >
                    {i + 1}
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex flex-col gap-3 border-t border-outline-variant/30 pt-6">
              <div className="flex items-center gap-2 font-label-sm text-label-sm text-on-surface-variant">
                <div className="h-3 w-3 rounded-sm bg-surface-container-highest" />
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-2 font-label-sm text-label-sm text-on-surface-variant">
                <div className="h-3 w-3 rounded-sm bg-primary" />
                <span>Current</span>
              </div>
              <div className="flex items-center gap-2 font-label-sm text-label-sm text-on-surface-variant">
                <div className="h-3 w-3 rounded-sm border border-outline-variant/50 bg-surface-container-lowest" />
                <span>Unanswered</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
