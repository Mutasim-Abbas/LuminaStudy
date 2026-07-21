export interface Flashcard {
  id: string;
  front: string;
  back: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface StudySet {
  id: string;
  subject: string;
  title: string;
  description: string;
  /**
   * 0–100, derived from the spaced-repetition schedule by `setMastery` — how
   * far each card has been spaced out, averaged over the set. Never set by
   * hand: a number you cannot earn is a number that lies to the learner.
   */
  mastery: number;
  /** Updated whenever the set is reviewed — powers the "Updated Xh ago" chip. */
  lastUpdatedMs: number;
  cards: Flashcard[];
  quiz: QuizQuestion[];
}

/**
 * Example content for a brand-new library.
 *
 * These ids are templates, not final: `installSeedSets` rewrites them to fresh
 * UUIDs the first time the app runs. Study-set ids are a global key on the
 * server, so if every account shipped with a literal `bio-101-cell-theory`,
 * the first user to sync would claim it and every later user's copy would be
 * rejected — silently, since the push is fire-and-forget.
 */
export const SEED_STUDY_SETS: StudySet[] = [
  {
    id: 'bio-101-cell-theory',
    subject: 'Biology',
    title: 'Bio 101: Cell Theory',
    description: 'Reviewing mitochondria, cellular respiration, and mitosis basics.',
    mastery: 0,
    lastUpdatedMs: Date.now() - 2 * 60 * 60 * 1000,
    cards: [
      { id: 'c1', front: 'What are the three parts of cell theory?', back: 'All living things are made of cells; the cell is the basic unit of life; all cells come from pre-existing cells.' },
      { id: 'c2', front: 'What is the function of mitochondria?', back: 'Produce ATP (energy) through cellular respiration — the "powerhouse of the cell".' },
      { id: 'c3', front: 'What is mitosis?', back: 'Cell division that produces two genetically identical daughter cells.' },
      { id: 'c4', front: 'What is the cell membrane made of?', back: 'A phospholipid bilayer with embedded proteins.' },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'Which organelle is primarily responsible for producing ATP?',
        options: ['Serotonin', 'Mitochondria', 'Ribosome', 'Golgi apparatus'],
        answerIndex: 1,
        explanation: 'Mitochondria carry out cellular respiration, converting glucose into ATP.',
      },
      {
        id: 'q2',
        prompt: 'Mitosis results in how many daughter cells?',
        options: ['One', 'Two', 'Three', 'Four'],
        answerIndex: 1,
        explanation: 'Mitosis produces two genetically identical daughter cells.',
      },
    ],
  },
  {
    id: 'psych-memory',
    subject: 'Psychology',
    title: 'Intro to Psych: Memory',
    description: 'Key concepts: short vs. long-term memory, encoding, retrieval.',
    mastery: 0,
    lastUpdatedMs: Date.now() - 24 * 60 * 60 * 1000,
    cards: [
      { id: 'c1', front: 'What is the primary brain region for long-term memory?', back: 'The hippocampus.' },
      { id: 'c2', front: 'What is encoding?', back: 'The process of converting information into a form the brain can store.' },
      { id: 'c3', front: 'What is the spacing effect?', back: 'Information is better retained when study sessions are spread out over time rather than crammed.' },
    ],
    quiz: [
      {
        id: 'q1',
        prompt: 'Which brain region is primarily associated with long-term memory?',
        options: ['Hippocampus', 'Amygdala', 'Prefrontal Cortex', 'Occipital Lobe'],
        answerIndex: 0,
        explanation: 'The hippocampus plays a central role in forming and consolidating long-term memories.',
      },
      {
        id: 'q2',
        prompt: 'Cognitive spacing is an evidence-based technique that involves…',
        options: [
          'Reviewing material once, right before the exam',
          'Spreading study sessions out over time to improve long-term retention',
          'Studying only your weakest topics',
          'Memorizing without understanding',
        ],
        answerIndex: 1,
        explanation:
          'Spacing out study sessions (rather than cramming) improves long-term retention — this is the spacing effect.',
      },
    ],
  },
];

export const STUDY_SETS_KEY = 'lumina.studySets';

/**
 * Seeds a first-run library with per-install ids. Idempotent: once anything is
 * stored under STUDY_SETS_KEY — including an empty list — this does nothing, so
 * it can't resurrect sets the user deleted or clobber a synced library.
 */
export function installSeedSets(): void {
  try {
    if (localStorage.getItem(STUDY_SETS_KEY) !== null) return;
    const seeded = SEED_STUDY_SETS.map((set) => ({ ...set, id: crypto.randomUUID() }));
    localStorage.setItem(STUDY_SETS_KEY, JSON.stringify(seeded));
  } catch {
    /* storage unavailable — the app still runs, just without examples */
  }
}

/** "2h ago", "1d ago", "Just now" — relative to the set's lastUpdatedMs. */
export function relativeTime(ms: number | undefined): string {
  if (!ms || !Number.isFinite(ms)) return 'recently';
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
