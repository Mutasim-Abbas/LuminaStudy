import { Link } from 'react-router-dom';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { SEED_STUDY_SETS, type StudySet } from '../data/studySets';

export default function StudySets() {
  const [studySets] = useLocalStorage<StudySet[]>('lumina.studySets', SEED_STUDY_SETS);

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mb-1 font-mono text-xs font-semibold uppercase tracking-wide text-accent">
            Study Sets
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-primary sm:text-4xl">
            Your library
          </h1>
        </div>
        <Link
          to="/upload"
          className="pill bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent shadow-clay"
        >
          + New Study Set
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {studySets.map((set) => (
          <Link key={set.id} to={`/study/${set.id}`} className="clay-card clay-card-interactive p-5">
            <span className="text-xs font-semibold uppercase tracking-wide text-mint-hover">
              {set.subject}
            </span>
            <h2 className="mt-1 font-display text-lg font-semibold text-primary">{set.title}</h2>
            <p className="mt-1 text-sm text-secondary">{set.description}</p>
            <div className="mt-3 flex items-center justify-between text-xs text-muted">
              <span>{set.cards.length} flashcards</span>
              <span>{set.quiz.length} quiz questions</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-tertiary">
              <div className="h-full rounded-full bg-mint" style={{ width: `${set.mastery}%` }} />
            </div>
          </Link>
        ))}
      </div>

      {studySets.length === 0 && (
        <div className="clay-card mt-4 p-8 text-center">
          <p className="text-secondary">No study sets yet.</p>
          <Link to="/upload" className="mt-2 inline-block font-medium text-accent hover:underline">
            Upload your notes to create one →
          </Link>
        </div>
      )}
    </div>
  );
}
