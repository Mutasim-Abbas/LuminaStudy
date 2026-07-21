import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { type StudySet } from '../data/studySets';
import {
  generateStudySet,
  getHealth,
  fetchAiQuota,
  ApiError,
  type GeneratedSet,
  type AiQuota,
  pushSetQuietly,
} from '../lib/api';
import { ExtractError, extractTextFromFile, isSupportedFile } from '../lib/extractText';
import {
  UploadFileIcon,
  DocumentIcon,
  CheckCircleIcon,
  SyncIcon,
  QuizIcon,
  MenuBookIcon,
  CloseIcon,
} from '../components/icons';

type Phase = 'idle' | 'analyzing' | 'done' | 'error' | 'quota';

// Shown while the real Gemini request is in flight — perceived progress.
const GENERATION_STEPS = [
  { label: 'Reading your material', icon: null },
  { label: 'Identifying key concepts', icon: null },
  { label: 'Writing flashcards', icon: null },
  { label: 'Building practice questions', icon: QuizIcon },
  { label: 'Summarizing', icon: MenuBookIcon },
];

const MAX_CHARS = 40000;

function toStudySet(gen: GeneratedSet): StudySet {
  return {
    id: crypto.randomUUID(),
    subject: gen.subject || 'General',
    title: gen.title || 'New Study Set',
    description: gen.summary ? gen.summary.slice(0, 140) : 'AI-generated from your material.',
    // The full summary and highlights are kept, not just the truncated blurb.
    summary: gen.summary ?? '',
    highlights: gen.highlights ?? [],
    mastery: 0,
    lastUpdatedMs: Date.now(),
    cards: gen.flashcards.map((c) => ({ id: crypto.randomUUID(), front: c.front, back: c.back })),
    quiz: gen.quiz.map((q) => ({
      id: crypto.randomUUID(),
      prompt: q.prompt,
      options: q.options,
      answerIndex: q.answerIndex,
      explanation: q.explanation,
    })),
  };
}

export default function Upload() {
  const navigate = useNavigate();
  const [, setStudySets] = useLocalStorage<StudySet[]>('lumina.studySets', []);

  const [phase, setPhase] = useState<Phase>('idle');
  const [text, setText] = useState('');
  const [hint, setHint] = useState('');
  const [stepIndex, setStepIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [result, setResult] = useState<GeneratedSet | null>(null);
  const [quota, setQuota] = useState<AiQuota | null>(null);
  /** Name of the file currently being parsed, or null. */
  const [readingFile, setReadingFile] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check whether the server has a key, so we can guide the user honestly.
  useEffect(() => {
    getHealth().then((h) => setAiEnabled(h.aiEnabled));
  }, []);

  // How many free generations are left today.
  useEffect(() => {
    fetchAiQuota().then(setQuota);
  }, []);

  const readFile = async (file: File) => {
    if (!isSupportedFile(file)) {
      setErrorMsg('Use a PDF or a plain-text file (.txt, .md, .csv) — or paste your notes below.');
      setPhase('error');
      return;
    }
    setReadingFile(file.name);
    setErrorMsg('');
    try {
      const content = await extractTextFromFile(file);
      setText(content.slice(0, MAX_CHARS));
      if (content.length > MAX_CHARS) {
        setErrorMsg(
          `That file has ${content.length.toLocaleString()} characters — kept the first ${MAX_CHARS.toLocaleString()}.`,
        );
      }
      setPhase('idle');
    } catch (err) {
      setErrorMsg(err instanceof ExtractError ? err.message : 'Could not read that file.');
      setPhase('error');
    } finally {
      setReadingFile(null);
    }
  };

  /**
   * Handle anything droppable. A file from the OS arrives in `files`; a chunk
   * of text or a link dragged over from another browser tab arrives as
   * text/plain instead — treat that as pasted notes rather than ignoring it.
   */
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      void readFile(file);
      return;
    }
    const dropped = e.dataTransfer.getData('text/plain').trim();
    if (dropped) {
      setText((prev) => (prev.trim() ? `${prev}\n\n${dropped}` : dropped).slice(0, MAX_CHARS));
      setPhase('idle');
      setErrorMsg('');
    }
  };

  // A drop that misses the zone would make the browser navigate to the file,
  // wiping the app. Neutralise stray drops everywhere else on the window.
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  const generate = async () => {
    const trimmed = text.trim();
    if (trimmed.length < 20) {
      setErrorMsg('Paste at least a paragraph of notes to generate a study set.');
      setPhase('error');
      return;
    }

    setPhase('analyzing');
    setStepIndex(0);
    setErrorMsg('');

    // Cycle the checklist while we wait on the model.
    const iv = window.setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, GENERATION_STEPS.length - 1));
    }, 900);

    try {
      const gen = await generateStudySet({ text: trimmed, hint: hint.trim() || undefined });
      window.clearInterval(iv);
      setStepIndex(GENERATION_STEPS.length - 1);
      setResult(gen);
      setPhase('done');
      void fetchAiQuota().then(setQuota);
    } catch (err) {
      window.clearInterval(iv);
      // 402 means the free daily allowance is spent — a different situation
      // from a failure, so it gets its own state rather than an error message.
      if (err instanceof ApiError && err.status === 402) {
        void fetchAiQuota().then(setQuota);
        setErrorMsg(err.message);
        setPhase('quota');
        return;
      }
      const msg =
        err instanceof ApiError
          ? err.status === 503
            ? 'The AI isn’t connected yet — add your Groq key to the server’s .env file.'
            : err.message
          : 'Something went wrong generating your study set.';
      setErrorMsg(msg);
      setPhase('error');
    }
  };

  const openCreatedSet = () => {
    if (!result) return;
    const created = toStudySet(result);
    // Save to the account too when signed in; a no-op otherwise.
    pushSetQuietly(created);
    setStudySets((sets) => [created, ...sets]);
    navigate(`/study/${created.id}`);
  };

  const progressPct = Math.round(((stepIndex + 1) / GENERATION_STEPS.length) * 100);

  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-surface-container-low/60 p-4 md:p-gutter">
      <div className="w-full max-w-[820px] overflow-hidden rounded-xl border border-surface-variant bg-surface-container-lowest shadow-modal">
        <header className="flex items-start justify-between border-b border-surface-variant p-stack-md">
          <div>
            <h1 className="mb-2 font-display text-headline-md text-on-surface">
              Create a study set with AI
            </h1>
            <p className="font-body text-body-lg text-on-surface-variant">
              Paste your notes and Lumina turns them into flashcards and a quiz — or{' '}
              <Link to="/create" className="font-medium text-primary underline">
                make one yourself
              </Link>
              .
            </p>
          </div>
          <Link
            to="/study"
            aria-label="Close"
            className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            <CloseIcon className="h-5 w-5" />
          </Link>
        </header>

        <div className="grid grid-cols-1 gap-stack-md p-stack-md md:grid-cols-2">
          {/* Left: input */}
          <div className="flex flex-col gap-3">
            {phase === 'analyzing' ? (
              <div className="relative flex h-full min-h-[280px] flex-col overflow-hidden rounded-xl border border-surface-variant bg-surface-container-low p-6">
                <div className="absolute bottom-0 left-0 h-1 w-full bg-surface-variant">
                  <div
                    className="h-full bg-primary transition-all duration-slow ease-out"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="mb-6 flex items-start gap-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-primary-fixed">
                    <DocumentIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-title-lg text-on-surface">Generating…</h3>
                    <p className="font-body text-body-md text-on-surface-variant">
                      Reading {text.trim().length.toLocaleString()} characters
                    </p>
                  </div>
                </div>
                <div className="mt-auto flex items-end justify-between">
                  <span className="font-label-lg text-label-lg text-primary">
                    {GENERATION_STEPS[stepIndex]?.label}…
                  </span>
                  <span className="font-display text-headline-md text-primary">{progressPct}%</span>
                </div>
              </div>
            ) : (
              <>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={onDrop}
                  className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
                    dragActive
                      ? 'border-primary bg-primary/5'
                      : 'border-outline-variant'
                  }`}
                >
                  <UploadFileIcon className="mb-2 h-8 w-8 text-primary-container" />
                  {readingFile ? (
                    <p className="mb-3 flex items-center gap-2 font-body text-body-md text-on-surface-variant">
                      <SyncIcon className="h-4 w-4 animate-spin text-primary" />
                      Reading {readingFile}…
                    </p>
                  ) : (
                    <p className="mb-3 font-body text-body-md text-on-surface-variant">
                      Drop a PDF or .txt file — or drag text from another tab
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="pressable rounded-full bg-primary px-5 py-2 font-label-lg text-label-lg text-on-primary"
                  >
                    Browse files
                  </button>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.txt,.md,.csv,application/pdf,text/plain"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void readFile(file);
                      // Allow re-picking the same file after an error.
                      e.target.value = '';
                    }}
                  />
                </div>

                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                  placeholder="Paste your lecture notes, textbook section, or slides text here…"
                  className="min-h-[140px] w-full resize-y rounded-xl border border-surface-variant bg-surface-container-lowest p-3 font-body text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <div className="flex items-center justify-between">
                  <input
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                    placeholder="Subject (optional), e.g. Biology"
                    className="w-1/2 rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 font-body text-body-sm text-on-surface focus:border-primary focus:outline-none"
                  />
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Right: checklist / result */}
          <div className="rounded-xl border border-surface-variant bg-surface-bright p-6">
            {phase === 'done' && result ? (
              <div className="rise-in max-h-[420px] overflow-y-auto pr-1">
                <h3 className="mb-2 font-display text-title-lg text-on-surface">{result.title}</h3>
                <p className="mb-4 font-body text-body-md text-on-surface-variant">{result.summary}</p>

                {result.highlights.length > 0 && (
                  <div className="mb-5">
                    <h4 className="mb-2 font-label-sm text-label-sm uppercase tracking-wider text-on-surface/70">
                      Key highlights
                    </h4>
                    <ul className="flex flex-col gap-1.5">
                      {result.highlights.map((point, i) => (
                        <li key={i} className="flex gap-2 font-body text-body-sm text-on-surface">
                          <span className="text-secondary">•</span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-col gap-3 font-body text-body-lg text-on-surface">
                  <span className="flex items-center gap-3">
                    <CheckCircleIcon className="h-5 w-5 text-secondary" />
                    {result.flashcards.length} flashcards
                  </span>
                  <span className="flex items-center gap-3">
                    <CheckCircleIcon className="h-5 w-5 text-secondary" />
                    {result.quiz.length} practice questions
                  </span>
                </div>
              </div>
            ) : (
              <>
                <h3 className="mb-6 font-label-lg text-label-lg uppercase tracking-wider text-on-surface/80">
                  What we&apos;re generating
                </h3>
                <ul className="flex flex-col gap-4">
                  {GENERATION_STEPS.map((step, i) => {
                    const done = phase === 'analyzing' && i < stepIndex;
                    const active = phase === 'analyzing' && i === stepIndex;
                    const Icon = step.icon;
                    return (
                      <li
                        key={step.label}
                        className={`flex items-center gap-4 ${!done && !active ? 'opacity-50' : ''}`}
                      >
                        {done ? (
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary-container">
                            <CheckCircleIcon className="h-4 w-4 text-on-secondary-container" />
                          </div>
                        ) : active ? (
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-fixed">
                            <SyncIcon className="h-4 w-4 animate-spin text-primary" />
                          </div>
                        ) : (
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-outline-variant">
                            {Icon ? (
                              <Icon className="h-4 w-4 text-outline-variant" />
                            ) : (
                              <span className="h-2 w-2 rounded-full bg-outline-variant" />
                            )}
                          </div>
                        )}
                        <span className="font-body text-body-lg text-on-surface">{step.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* Error banner */}
        {phase === 'error' && (
          <div className="rise-in border-t border-surface-variant px-stack-md pt-stack-md">
            <p className="rounded-lg bg-error/10 px-3 py-2 font-body text-body-md text-error">{errorMsg}</p>
          </div>
        )}

        {/* Free allowance spent — an upgrade prompt, not an error */}
        {phase === 'quota' && (
          <div className="rise-in border-t border-surface-variant px-stack-md pt-stack-md">
            <div className="rounded-xl border border-secondary/40 bg-secondary-container/30 p-5">
              <h3 className="font-display text-title-lg text-on-surface">You&apos;ve used today&apos;s free scans</h3>
              <p className="mt-2 font-body text-body-md text-on-surface-variant">{errorMsg}</p>
              <p className="mt-3 font-body text-body-sm text-on-surface-variant">
                Every account gets {quota?.limit ?? 3} AI study sets a day. Flashcards, quizzes and
                everything already in your library stay available — only new generation is paused.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  to="/create"
                  className="pressable rounded-lg bg-primary px-5 py-2.5 font-label-lg text-label-lg text-on-primary"
                >
                  Build a set by hand
                </Link>
                <Link
                  to="/study"
                  className="pressable rounded-lg border-2 border-outline-variant px-5 py-2.5 font-label-lg text-label-lg text-on-surface hover:border-primary"
                >
                  Review what&apos;s due
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Remaining allowance, shown before they spend one */}
        {quota && phase !== 'done' && phase !== 'quota' && (
          <div className="px-stack-md pt-3">
            <p className="font-label-sm text-label-sm text-on-surface-variant">
              {quota.remaining > 0
                ? `${quota.remaining} of ${quota.limit} free AI study sets left today.`
                : `No free study sets left${quota.resetIn ? ` — resets ${quota.resetIn}` : ''}.`}
            </p>
          </div>
        )}

        {/* AI-not-configured hint */}
        {aiEnabled === false && phase !== 'done' && (
          <div className="px-stack-md pt-3">
            <p className="rounded-lg bg-surface-container-low px-3 py-2 font-label-sm text-label-sm text-on-surface-variant">
              Heads up: the server has no AI key yet, so generation will fail until one is added
              to <code>server/.env</code>.
            </p>
          </div>
        )}

        <footer className="flex items-center justify-end gap-3 border-t border-surface-variant bg-surface-container-lowest p-stack-md">
          <Link
            to="/study"
            className="rounded-full border border-secondary px-6 py-3 font-label-lg text-label-lg text-secondary transition-colors hover:bg-secondary/5"
          >
            {phase === 'done' ? 'Close' : 'Cancel'}
          </Link>
          {phase === 'done' ? (
            <button
              type="button"
              onClick={openCreatedSet}
              className="pressable rounded-full bg-primary px-6 py-3 font-label-lg text-label-lg text-on-primary shadow-sm"
            >
              Open study set →
            </button>
          ) : (
            <button
              type="button"
              onClick={generate}
              disabled={phase === 'analyzing'}
              className="pressable rounded-full bg-primary px-6 py-3 font-label-lg text-label-lg text-on-primary shadow-sm disabled:opacity-50"
            >
              {phase === 'analyzing' ? 'Generating…' : 'Generate study set'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
