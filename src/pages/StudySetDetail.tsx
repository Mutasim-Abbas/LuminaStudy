import { Link, useParams } from 'react-router-dom';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { SEED_STUDY_SETS, type StudySet } from '../data/studySets';

export default function StudySetDetail() {
  const { setId } = useParams();
  const [studySets] = useLocalStorage<StudySet[]>('lumina.studySets', SEED_STUDY_SETS);
  const set = studySets.find((s) => s.id === setId);

  if (!set) {
    return (
      <div className="mx-auto w-full max-w-[700px] px-4 py-16 text-center">
        <p className="text-secondary">That study set doesn&apos;t exist.</p>
        <Link to="/study" className="mt-2 inline-block font-medium text-accent hover:underline">
          Back to your library
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[700px] px-4 py-10 sm:px-6">
      <span className="text-xs font-semibold uppercase tracking-wide text-mint-hover">{set.subject}</span>
      <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-primary sm:text-4xl">
        {set.title}
      </h1>
      <p className="mt-2 text-secondary">{set.description}</p>

      <div className="mt-6 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-tertiary">
          <div className="h-full rounded-full bg-mint" style={{ width: `${set.mastery}%` }} />
        </div>
        <span className="text-sm font-semibold text-primary">{set.mastery}% mastery</span>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link to={`/study/${set.id}/flashcards`} className="clay-card clay-card-interactive p-5">
          <h2 className="font-display text-lg font-semibold text-primary">Flashcards</h2>
          <p className="mt-1 text-sm text-secondary">{set.cards.length} cards to flip through and review.</p>
        </Link>
        <Link to={`/study/${set.id}/quiz`} className="clay-card clay-card-interactive p-5">
          <h2 className="font-display text-lg font-semibold text-primary">Practice Quiz</h2>
          <p className="mt-1 text-sm text-secondary">{set.quiz.length} questions to test yourself.</p>
        </Link>
      </div>
    </div>
  );
}
