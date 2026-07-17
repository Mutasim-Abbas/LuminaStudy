import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { SEED_STUDY_SETS, type StudySet } from '../data/studySets';

type Phase = 'idle' | 'dragging' | 'analyzing' | 'done';

const ANALYSIS_STEPS = [
  'Reading document…',
  'Identifying key concepts…',
  'Generating flashcards…',
  'Building practice questions…',
];

/**
 * Upload & AI Processing. There is no backend yet (see PLAN.md), so this
 * screen is a faithful, fully-interactive preview of the intended flow: real
 * drag-and-drop, a real multi-step "analyzing" sequence, ending in a NEW
 * study set. The generated content is a labelled sample deck, not invented
 * document analysis — that arrives once an AI API is wired up in the backend
 * phase.
 */
export default function Upload() {
  const navigate = useNavigate();
  const [, setStudySets] = useLocalStorage<StudySet[]>('lumina.studySets', SEED_STUDY_SETS);
  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const runAnalysis = (name: string) => {
    setFileName(name);
    setPhase('analyzing');
    setStepIndex(0);
    let i = 0;
    const iv = window.setInterval(() => {
      i++;
      if (i >= ANALYSIS_STEPS.length) {
        window.clearInterval(iv);
        setPhase('done');
        return;
      }
      setStepIndex(i);
    }, 700);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) runAnalysis(file.name);
  };

  const createSet = () => {
    const sample = SEED_STUDY_SETS[0];
    const created: StudySet = {
      ...sample,
      id: crypto.randomUUID(),
      title: fileName ? fileName.replace(/\.[^.]+$/, '') : 'New Study Set',
      mastery: 0,
    };
    setStudySets((sets) => [created, ...sets]);
    navigate(`/study/${created.id}`);
  };

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 py-10 sm:px-6">
      <p className="mb-1 font-mono text-xs font-semibold uppercase tracking-wide text-accent">
        Upload &amp; AI Processing
      </p>
      <h1 className="font-display text-3xl font-bold tracking-tight text-primary">Analyze Document</h1>
      <p className="mt-2 text-secondary">
        Upload your syllabus, lecture slides, or notes to generate intelligent study materials.
      </p>

      {phase === 'idle' || phase === 'dragging' ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setPhase('dragging');
          }}
          onDragLeave={() => setPhase('idle')}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`clay-card mt-6 flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed p-12 text-center transition-colors ${
            phase === 'dragging' ? 'border-accent bg-accent-soft' : 'border-border-strong'
          }`}
        >
          <p className="font-medium text-primary">Drop PDF or slides here</p>
          <p className="text-sm text-muted">or click to browse</p>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.ppt,.pptx,.doc,.docx,.txt"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) runAnalysis(file.name);
            }}
          />
        </div>
      ) : (
        <div className="clay-card mt-6 p-6">
          <div className="flex items-center justify-between">
            <p className="truncate text-sm font-medium text-primary">{fileName}</p>
            {phase === 'analyzing' && (
              <span className="text-xs font-semibold text-accent">
                {Math.round(((stepIndex + 1) / ANALYSIS_STEPS.length) * 100)}%
              </span>
            )}
          </div>

          {phase === 'analyzing' && (
            <>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-tertiary">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-slow"
                  style={{ width: `${((stepIndex + 1) / ANALYSIS_STEPS.length) * 100}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-secondary">{ANALYSIS_STEPS[stepIndex]}</p>
            </>
          )}

          {phase === 'done' && (
            <div className="rise-in mt-4">
              <div className="flex flex-col gap-2 text-sm">
                <span className="flex items-center gap-2 text-primary">
                  <span className="text-mint-hover">✓</span> Flashcards (concepts &amp; definitions)
                </span>
                <span className="flex items-center gap-2 text-primary">
                  <span className="text-mint-hover">✓</span> Practice questions (multiple choice)
                </span>
                <span className="flex items-center gap-2 text-muted">
                  <span>○</span> Study guide summary
                </span>
              </div>
              <p className="mt-4 rounded-lg bg-tertiary px-3 py-2 text-xs text-secondary">
                Preview mode — this demo deck shows the intended experience. Real AI-generated
                content from your document arrives once the backend is connected.
              </p>
              <button
                type="button"
                onClick={createSet}
                className="pill mt-4 bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent shadow-clay"
              >
                Open study set →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
