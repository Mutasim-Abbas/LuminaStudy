import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { setMastery, type SrsState } from '../engine/srs';
import { SEED_STUDY_SETS, relativeTime, type StudySet } from '../data/studySets';
import { PlusIcon, BiotechIcon, PsychologyIcon, MenuBookIcon } from '../components/icons';

function subjectIcon(subject: string) {
  const s = subject.toLowerCase();
  if (s.includes('bio')) return BiotechIcon;
  if (s.includes('psych')) return PsychologyIcon;
  return MenuBookIcon;
}

/** Real folders — one per subject actually present in the library, with genuine counts. */
function useFolders(studySets: StudySet[]) {
  return useMemo(() => {
    const bySubject = new Map<string, StudySet[]>();
    for (const set of studySets) {
      const list = bySubject.get(set.subject) ?? [];
      list.push(set);
      bySubject.set(set.subject, list);
    }
    return [...bySubject.entries()].map(([subject, sets]) => ({
      subject,
      setCount: sets.length,
      cardCount: sets.reduce((sum, s) => sum + s.cards.length, 0),
    }));
  }, [studySets]);
}

export default function StudySets() {
  const [studySets] = useLocalStorage<StudySet[]>('lumina.studySets', SEED_STUDY_SETS);
  const [srs] = useLocalStorage<SrsState>('lumina.srs', {});
  const folders = useFolders(studySets);

  return (
    <div className="mx-auto w-full max-w-container-max px-4 pb-stack-xl pt-stack-md md:px-gutter">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-headline-lg text-on-surface">Library</h1>
          <p className="mt-1 font-body text-body-lg text-on-surface-variant">
            Browse and manage your study materials.
          </p>
        </div>
        <Link
          to="/upload"
          className="pressable flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-label-lg text-label-lg text-on-primary shadow-sm hover:bg-surface-tint"
        >
          <PlusIcon className="h-4 w-4" />
          New Study Set
        </Link>
      </div>

      {folders.length > 0 && (
        <section className="mt-stack-xl">
          <h2 className="mb-4 font-display text-title-lg text-on-surface">Folders</h2>
          <div className="stagger grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {folders.map((f) => {
              const Icon = subjectIcon(f.subject);
              return (
                <div
                  key={f.subject}
                  className="rounded-xl border border-surface-variant bg-surface-container-lowest p-6 shadow-card"
                >
                  <div className="mb-4 grid h-12 w-12 place-items-center rounded-lg bg-surface-container-low text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-display text-title-lg text-on-surface">{f.subject}</h3>
                  <p className="mt-1 font-label-sm text-label-sm text-on-surface-variant">
                    {f.setCount} {f.setCount === 1 ? 'set' : 'sets'} · {f.cardCount} cards
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-stack-xl">
        <h2 className="mb-4 font-display text-title-lg text-on-surface">
          {folders.length > 0 ? 'Recent Study Sets' : 'Your study sets'}
        </h2>

        {studySets.length > 0 ? (
          <div className="stagger flex flex-col gap-3">
            {studySets.map((set) => {
              const Icon = subjectIcon(set.subject);
              const mastery = setMastery(set, srs);
              const barColor = mastery >= 70 ? 'bg-secondary' : 'bg-primary';
              return (
                <Link
                  key={set.id}
                  to={`/study/${set.id}`}
                  className="pressable flex flex-col gap-4 rounded-xl border border-surface-variant bg-surface-container-lowest p-4 shadow-card lg:flex-row lg:items-center"
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-surface-container-low text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-body-lg font-semibold text-on-surface">
                        {set.title}
                      </h3>
                      <span className="rounded-full bg-surface-container-low px-2 py-0.5 font-label-sm text-label-sm text-primary">
                        {set.subject.toUpperCase()}
                      </span>
                    </div>
                    <p className="font-label-sm text-label-sm text-on-surface-variant">
                      Edited {relativeTime(set.lastUpdatedMs)} · {set.cards.length} cards
                    </p>
                  </div>
                  <div className="flex w-full items-center gap-3 sm:w-48">
                    <div className="flex-1">
                      <div className="mb-1 flex justify-between font-label-sm text-label-sm text-on-surface-variant">
                        <span>Mastery</span>
                        <span>{mastery}%</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${mastery}%` }} />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-surface-variant bg-surface-container-lowest p-8 text-center">
            <p className="text-on-surface-variant">No study sets yet.</p>
            <Link to="/upload" className="mt-2 inline-block font-medium text-primary hover:underline">
              Upload your notes to create one →
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
