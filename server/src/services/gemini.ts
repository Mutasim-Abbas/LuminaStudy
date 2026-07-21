import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../env.js';

/**
 * Turns raw study material into a structured study set using Gemini. We force
 * JSON output with a response schema, so the model returns exactly the shape
 * the app expects rather than prose we'd have to parse loosely.
 *
 * Uses the current `@google/genai` SDK, which supports the new `AQ.` auth-key
 * format issued by Google AI Studio.
 */

export interface GeneratedFlashcard {
  front: string;
  back: string;
}
export interface GeneratedQuestion {
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}
export interface GeneratedSet {
  subject: string;
  title: string;
  /** A few paragraphs a student could revise from on its own. */
  summary: string;
  /** The handful of points worth remembering if nothing else is. */
  highlights: string[];
  flashcards: GeneratedFlashcard[];
  quiz: GeneratedQuestion[];
}

/** Thrown when the AI isn't configured or the upstream call fails. */
export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    subject: { type: Type.STRING, description: 'Broad subject, e.g. "Biology"' },
    title: { type: Type.STRING, description: 'A short title for this study set' },
    summary: {
      type: Type.STRING,
      description: 'A study-guide summary of 2-3 short paragraphs, revisable on its own',
    },
    highlights: {
      type: Type.ARRAY,
      description: '4-8 key takeaways, one sentence each, ordered by importance',
      items: { type: Type.STRING },
    },
    flashcards: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          front: { type: Type.STRING },
          back: { type: Type.STRING },
        },
        required: ['front', 'back'],
      },
    },
    quiz: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          prompt: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          answerIndex: { type: Type.INTEGER, description: '0-based index of the correct option' },
          explanation: { type: Type.STRING },
        },
        required: ['prompt', 'options', 'answerIndex', 'explanation'],
      },
    },
  },
  required: ['subject', 'title', 'summary', 'highlights', 'flashcards', 'quiz'],
};

function buildPrompt(text: string, hint: string | undefined, cards: number, questions: number): string {
  return [
    'You are an expert study assistant. From the study material below, create a study set.',
    `Produce about ${cards} flashcards (clear question on the front, concise answer on the back)`,
    `and about ${questions} multiple-choice questions. Each question must have exactly 4 options`,
    'with exactly one correct answer, and a one-sentence explanation of why it is correct.',
    'Also write a summary of 2-3 short paragraphs that a student could revise from on its own,',
    'and 4-8 highlights: the single most important takeaways, one sentence each, most important first.',
    'Base everything strictly on the material — do not invent facts that are not supported by it.',
    hint ? `The user says this material is about: "${hint}".` : '',
    '',
    '--- STUDY MATERIAL START ---',
    text,
    '--- STUDY MATERIAL END ---',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Basic shape validation so a malformed model response can't reach the client. */
function coerce(parsed: unknown): GeneratedSet {
  const obj = parsed as Partial<GeneratedSet> | null;
  if (!obj || typeof obj !== 'object') throw new GeminiError('AI returned an unexpected response.', 502);

  const flashcards = Array.isArray(obj.flashcards)
    ? obj.flashcards
        .filter((c): c is GeneratedFlashcard => !!c && typeof c.front === 'string' && typeof c.back === 'string')
        .map((c) => ({ front: c.front.trim(), back: c.back.trim() }))
    : [];

  const quiz = Array.isArray(obj.quiz)
    ? obj.quiz
        .filter(
          (q): q is GeneratedQuestion =>
            !!q &&
            typeof q.prompt === 'string' &&
            Array.isArray(q.options) &&
            q.options.length >= 2 &&
            typeof q.answerIndex === 'number' &&
            q.answerIndex >= 0 &&
            q.answerIndex < q.options.length,
        )
        .map((q) => ({
          prompt: q.prompt.trim(),
          options: q.options.map((o) => String(o).trim()),
          answerIndex: q.answerIndex,
          explanation: typeof q.explanation === 'string' ? q.explanation.trim() : '',
        }))
    : [];

  if (flashcards.length === 0 && quiz.length === 0) {
    throw new GeminiError('The AI could not produce study material from that text.', 422);
  }

  // Highlights are best-effort: a model that skips them shouldn't fail the whole
  // generation, so an absent or malformed list becomes an empty one.
  const highlights = Array.isArray(obj.highlights)
    ? obj.highlights
        .filter((h): h is string => typeof h === 'string' && h.trim().length > 0)
        .map((h) => h.trim())
        .slice(0, 8)
    : [];

  return {
    subject: typeof obj.subject === 'string' ? obj.subject.trim() : 'General',
    title: typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : 'New Study Set',
    summary: typeof obj.summary === 'string' ? obj.summary.trim() : '',
    highlights,
    flashcards,
    quiz,
  };
}

export async function generateStudySet(opts: {
  text: string;
  hint?: string;
  cards?: number;
  questions?: number;
}): Promise<GeneratedSet> {
  if (!env.aiEnabled) {
    throw new GeminiError('AI is not configured on the server (no API key in .env).', 503);
  }

  // Prefer the OpenAI-compatible provider when configured (reliable while
  // Google's "AQ." Gemini keys are failing auth upstream).
  if (env.aiProvider === 'openai-compat') {
    const { generateViaOpenAICompat } = await import('./openaiCompat.js');
    return coerce(await generateViaOpenAICompat(opts));
  }

  if (!env.GEMINI_API_KEY) {
    throw new GeminiError('AI is not configured on the server (missing GEMINI_API_KEY).', 503);
  }

  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

  let rawText: string | undefined;
  try {
    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: buildPrompt(opts.text, opts.hint, opts.cards ?? 10, opts.questions ?? 6),
      config: {
        responseMimeType: 'application/json',
        responseSchema,
        temperature: 0.4,
      },
    });
    rawText = response.text;
  } catch (err) {
    // Never leak upstream internals to the client.
    const message = err instanceof Error ? err.message : 'Upstream AI request failed.';
    const unauthorized = /401|unauthorized|invalid auth|api key/i.test(message);
    throw new GeminiError(
      unauthorized
        ? 'Gemini rejected the API key. Check GEMINI_API_KEY in the server .env.'
        : `AI request failed: ${message.slice(0, 200)}`,
      unauthorized ? 401 : 502,
    );
  }

  if (!rawText) throw new GeminiError('AI returned an empty response.', 502);

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new GeminiError('AI returned invalid JSON.', 502);
  }
  return coerce(parsed);
}
