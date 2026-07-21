import { Link, useParams } from 'react-router-dom';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { type StudySet } from '../data/studySets';
import { dueCount, formatDueIn, nextDueMs, setMastery, type SrsState } from '../engine/srs';
import { LibraryIcon, QuizIcon, LightbulbIcon, MenuBookIcon } from '../components/icons';

export default function StudySetDetail() {
  const { setId } = useParams();
  const [studySets] = useLocalStorage<StudySet[]>('lumina.studySets', []);
  const [srs] = useLocalStorage<SrsState>('lumina.srs', {});
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

  // Derived from the schedule so an unreviewed set can never show progress.
  const mastery = setMastery(set, srs);
  const barColor = mastery >= 70 ? 'bg-secondary' : 'bg-primary';
  const now = Date.now();
  const due = dueCount(set, srs, now);
  const upcoming = nextDueMs(set, srs);

  return (
    <div className="mx-auto w-full max-w-[700px] px-4 pb-stack-xl pt-stack-md sm:px-6">
      <span className="rounded-full bg-surface-container-low px-2.5 py-1 font-label-sm text-label-sm font-semibold text-primary">
        {set.subject}
      </span>
      <h1 className="mt-3 font-display text-headline-lg text-on-surface">{set.title}</h1>
      <p className="mt-2 font-body text-body-lg text-on-surface-variant">{set.description}</p>

      <div className="mt-6 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container-high">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${mastery}%` }} />
        </div>
        <span className="font-label-lg text-label-lg font-semibold text-on-surface">
          {mastery}% mastery
        </span>
      </div>

      <div className="stagger mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          to={`/study/${set.id}/flashcards`}
          className="pressable rounded-xl border border-surface-variant bg-surface-container-lowest p-5 shadow-card"
        >
          <div className="mb-3 flex items-center justify-between">
            <LibraryIcon className="h-6 w-6 text-primary" />
            {due > 0 && (
              <span className="rounded-full bg-secondary px-2.5 py-0.5 font-label-sm text-label-sm font-bold text-on-secondary">
                {due} due
              </span>
            )}
          </div>
          <h2 className="font-display text-title-lg text-on-surface">Flashcards</h2>
          <p className="mt-1 font-body text-body-md text-on-surface-variant">
            {due > 0
              ? `${due} of ${set.cards.length} ${due === 1 ? 'card is' : 'cards are'} ready to review.`
              : upcoming !== null
                ? `All caught up — next review ${formatDueIn(upcoming, now)}.`
                : `${set.cards.length} cards to flip through and review.`}
          </p>
        </Link>
        <Link
          to={`/study/${set.id}/quiz`}
          className="pressable rounded-xl border border-surface-variant bg-surface-container-lowest p-5 shadow-card"
        >
          <QuizIcon className="mb-3 h-6 w-6 text-primary" />
          <h2 className="font-display text-title-lg text-on-surface">Practice Quiz</h2>
          <p className="mt-1 font-body text-body-md text-on-surface-variant">
            {set.quiz.length} questions to test yourself.
          </p>
        </Link>
      </div>

      {/* Highlights — the few things to remember if nothing else */}
      {set.highlights && set.highlights.length > 0 && (
        <section className="mt-8 rounded-xl border border-secondary/40 bg-secondary-container/25 p-5">
          <div className="mb-3 flex items-center gap-2">
            <LightbulbIcon className="h-5 w-5 text-secondary" />
            <h2 className="font-display text-title-lg text-on-surface">Key Highlights</h2>
          </div>
          <ul className="flex flex-col gap-2.5">
            {set.highlights.map((point, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-secondary font-label-sm text-[11px] font-bold text-on-secondary">
                  {i + 1}
                </span>
                <span className="font-body text-body-md text-on-surface">{point}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Summary — a study-guide write-up of the source material */}
      {set.summary && set.summary.trim().length > 0 && (
        <section className="mt-6 rounded-xl border border-surface-variant bg-surface-container-lowest p-5 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <MenuBookIcon className="h-5 w-5 text-primary" />
            <h2 className="font-display text-title-lg text-on-surface">Summary</h2>
          </div>
          {/* The model returns paragraphs separated by blank lines. */}
          <div className="flex flex-col gap-3">
            {set.summary
              .split(/\n{2,}/)
              .map((para) => para.trim())
              .filter(Boolean)
              .map((para, i) => (
                <p key={i} className="font-body text-body-md leading-relaxed text-on-surface-variant">
                  {para}
                </p>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
