import { Link, useParams } from 'react-router-dom';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { SEED_STUDY_SETS, type StudySet } from '../data/studySets';
import { LibraryIcon, QuizIcon } from '../components/icons';

export default function StudySetDetail() {
  const { setId } = useParams();
  const [studySets] = useLocalStorage<StudySet[]>('lumina.studySets', SEED_STUDY_SETS);
  const set = studySets.find((s) => s.id === setId);

  if (!set) {
    return (
      <div className="mx-auto w-full max-w-[700px] px-4 py-16 text-center">
        <p className="text-on-surface-variant">That study set doesn&apos;t exist.</p>
        <Link to="/study" className="mt-2 inline-block font-medium text-primary hover:underline">
          Back to your library
        </Link>
      </div>
    );
  }

  const barColor = set.mastery >= 70 ? 'bg-secondary' : 'bg-primary';

  return (
    <div className="mx-auto w-full max-w-[700px] px-4 pb-stack-xl pt-stack-md sm:px-6">
      <span className="rounded-full bg-surface-container-low px-2.5 py-1 font-label-sm text-label-sm font-semibold text-primary">
        {set.subject}
      </span>
      <h1 className="mt-3 font-display text-headline-lg text-on-surface">{set.title}</h1>
      <p className="mt-2 font-body text-body-lg text-on-surface-variant">{set.description}</p>

      <div className="mt-6 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container-high">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${set.mastery}%` }} />
        </div>
        <span className="font-label-lg text-label-lg font-semibold text-on-surface">
          {set.mastery}% mastery
        </span>
      </div>

      <div className="stagger mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          to={`/study/${set.id}/flashcards`}
          className="pressable rounded-xl border border-surface-variant bg-white p-5 shadow-card"
        >
          <LibraryIcon className="mb-3 h-6 w-6 text-primary" />
          <h2 className="font-display text-title-lg text-on-surface">Flashcards</h2>
          <p className="mt-1 font-body text-body-md text-on-surface-variant">
            {set.cards.length} cards to flip through and review.
          </p>
        </Link>
        <Link
          to={`/study/${set.id}/quiz`}
          className="pressable rounded-xl border border-surface-variant bg-white p-5 shadow-card"
        >
          <QuizIcon className="mb-3 h-6 w-6 text-primary" />
          <h2 className="font-display text-title-lg text-on-surface">Practice Quiz</h2>
          <p className="mt-1 font-body text-body-md text-on-surface-variant">
            {set.quiz.length} questions to test yourself.
          </p>
        </Link>
      </div>
    </div>
  );
}
