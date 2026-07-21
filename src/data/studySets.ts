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
  /** Study-guide prose written from the source material. May be empty. */
  summary?: string;
  /** Key takeaways, most important first. May be empty. */
  highlights?: string[];
  cards: Flashcard[];
  quiz: QuizQuestion[];
}

export const STUDY_SETS_KEY = 'lumina.studySets';

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
