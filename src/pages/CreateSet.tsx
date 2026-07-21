import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { pushSetQuietly } from '../lib/api';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { SEED_STUDY_SETS, type StudySet, type Flashcard, type QuizQuestion } from '../data/studySets';
import { CloseIcon } from '../components/icons';

/**
 * Manual study-set creator. This makes Lumina fully usable with no AI and no
 * backend — you type your own flashcards and quiz questions and save. The AI
 * upload is an optional accelerator on top of this; the app never depends on it.
 */

type DraftCard = { front: string; back: string };
type DraftQuestion = { prompt: string; options: string[]; answerIndex: number; explanation: string };

const emptyCard = (): DraftCard => ({ front: '', back: '' });
const emptyQuestion = (): DraftQuestion => ({
  prompt: '',
  options: ['', '', '', ''],
  answerIndex: 0,
  explanation: '',
});

export default function CreateSet() {
  const navigate = useNavigate();
  const [, setStudySets] = useLocalStorage<StudySet[]>('lumina.studySets', SEED_STUDY_SETS);

  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [cards, setCards] = useState<DraftCard[]>([emptyCard()]);
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [error, setError] = useState('');

  const validCards = cards.filter((c) => c.front.trim() && c.back.trim());
  const validQuestions = questions.filter(
    (q) => q.prompt.trim() && q.options.filter((o) => o.trim()).length >= 2,
  );
  const canSave = title.trim().length > 0 && (validCards.length > 0 || validQuestions.length > 0);

  const save = () => {
    if (!canSave) {
      setError('Add a title and at least one flashcard or question.');
      return;
    }
    const finalCards: Flashcard[] = validCards.map((c) => ({
      id: crypto.randomUUID(),
      front: c.front.trim(),
      back: c.back.trim(),
    }));
    const finalQuiz: QuizQuestion[] = validQuestions.map((q) => ({
      id: crypto.randomUUID(),
      prompt: q.prompt.trim(),
      options: q.options.map((o) => o.trim()).filter(Boolean),
      answerIndex: Math.min(q.answerIndex, q.options.filter((o) => o.trim()).length - 1),
      explanation: q.explanation.trim(),
    }));
    const set: StudySet = {
      id: crypto.randomUUID(),
      subject: subject.trim() || 'General',
      title: title.trim(),
      description: description.trim() || `${finalCards.length} cards, ${finalQuiz.length} questions`,
      mastery: 0,
      lastUpdatedMs: Date.now(),
      cards: finalCards,
      quiz: finalQuiz,
    };
    // Save to the account too when signed in; a no-op otherwise.
    pushSetQuietly(set);
    setStudySets((sets) => [set, ...sets]);
    navigate(`/study/${set.id}`);
  };

  const input =
    'w-full rounded-lg border border-surface-variant bg-surface-container-lowest px-3 py-2 font-body text-body-md text-on-surface focus:border-primary focus:outline-none';

  return (
    <div className="mx-auto w-full max-w-[820px] px-4 pb-24 pt-6 sm:px-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-display text-headline-md text-on-surface">Create a study set</h1>
          <p className="mt-1 font-body text-body-md text-on-surface-variant">
            Add your own flashcards and questions — no AI needed.
          </p>
        </div>
        <Link
          to="/study"
          aria-label="Cancel"
          className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container-low"
        >
          <CloseIcon className="h-5 w-5" />
        </Link>
      </div>

      {/* Basics */}
      <section className="mb-6 flex flex-col gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest p-5">
        <input
          className={input}
          placeholder="Title (e.g. Bio 101: Cell Theory)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            className={input}
            placeholder="Subject (e.g. Biology)"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <input
            className={input}
            placeholder="Short description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </section>

      {/* Flashcards */}
      <section className="mb-6">
        <h2 className="mb-3 font-display text-title-lg text-on-surface">
          Flashcards <span className="text-on-surface-variant">({validCards.length})</span>
        </h2>
        <div className="flex flex-col gap-3">
          {cards.map((card, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-xl border border-surface-variant bg-surface-container-lowest p-4 sm:flex-row">
              <input
                className={input}
                placeholder="Front (question)"
                value={card.front}
                onChange={(e) =>
                  setCards((cs) => cs.map((c, j) => (j === i ? { ...c, front: e.target.value } : c)))
                }
              />
              <input
                className={input}
                placeholder="Back (answer)"
                value={card.back}
                onChange={(e) =>
                  setCards((cs) => cs.map((c, j) => (j === i ? { ...c, back: e.target.value } : c)))
                }
              />
              <button
                type="button"
                aria-label="Remove flashcard"
                onClick={() => setCards((cs) => cs.filter((_, j) => j !== i))}
                className="grid h-9 w-9 shrink-0 place-items-center self-center rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-error"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setCards((cs) => [...cs, emptyCard()])}
          className="pressable mt-3 rounded-full bg-surface-container-low px-4 py-2 font-label-lg text-label-lg text-primary"
        >
          + Add flashcard
        </button>
      </section>

      {/* Quiz */}
      <section className="mb-6">
        <h2 className="mb-3 font-display text-title-lg text-on-surface">
          Quiz questions <span className="text-on-surface-variant">({validQuestions.length})</span>
        </h2>
        <div className="flex flex-col gap-4">
          {questions.map((q, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-xl border border-surface-variant bg-surface-container-lowest p-4">
              <div className="flex items-center gap-2">
                <input
                  className={input}
                  placeholder="Question"
                  value={q.prompt}
                  onChange={(e) =>
                    setQuestions((qs) => qs.map((x, j) => (j === i ? { ...x, prompt: e.target.value } : x)))
                  }
                />
                <button
                  type="button"
                  aria-label="Remove question"
                  onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-error"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {q.options.map((opt, oi) => (
                  <label key={oi} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`correct-${i}`}
                      checked={q.answerIndex === oi}
                      onChange={() =>
                        setQuestions((qs) => qs.map((x, j) => (j === i ? { ...x, answerIndex: oi } : x)))
                      }
                      className="h-4 w-4 accent-primary"
                      aria-label={`Mark option ${oi + 1} correct`}
                    />
                    <input
                      className={input}
                      placeholder={`Option ${oi + 1}${oi === 0 ? ' (mark the correct one →)' : ''}`}
                      value={opt}
                      onChange={(e) =>
                        setQuestions((qs) =>
                          qs.map((x, j) =>
                            j === i
                              ? { ...x, options: x.options.map((o, k) => (k === oi ? e.target.value : o)) }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
              <input
                className={input}
                placeholder="Explanation (optional)"
                value={q.explanation}
                onChange={(e) =>
                  setQuestions((qs) => qs.map((x, j) => (j === i ? { ...x, explanation: e.target.value } : x)))
                }
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])}
          className="pressable mt-3 rounded-full bg-surface-container-low px-4 py-2 font-label-lg text-label-lg text-primary"
        >
          + Add question
        </button>
      </section>

      {error && <p className="mb-3 font-body text-body-md text-error">{error}</p>}

      <div className="sticky bottom-4 flex items-center justify-end gap-3">
        <Link
          to="/study"
          className="rounded-full border border-secondary bg-surface-container-lowest px-6 py-3 font-label-lg text-label-lg text-secondary"
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="pressable rounded-full bg-primary px-6 py-3 font-label-lg text-label-lg text-on-primary shadow-sm disabled:opacity-50"
        >
          Save study set
        </button>
      </div>
    </div>
  );
}
