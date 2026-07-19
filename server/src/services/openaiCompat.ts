import { env } from '../env.js';
import { GeminiError, type GeneratedSet } from './gemini.js';

/**
 * Fallback provider: any OpenAI-compatible chat API (Groq, OpenRouter, etc.).
 * Used when OPENAI_COMPAT_API_KEY is set — reliable while Google's new "AQ."
 * Gemini keys are rejecting auth (known upstream bug, June 2026+).
 */

const SYSTEM = `You are an expert study assistant. From the user's study material, produce STRICT JSON:
{"subject": string, "title": string, "summary": string,
 "flashcards": [{"front": string, "back": string}],
 "quiz": [{"prompt": string, "options": [string,string,string,string], "answerIndex": number, "explanation": string}]}
Rules: exactly 4 options per question, exactly one correct (answerIndex 0-3), one-sentence explanation.
Base everything strictly on the material. Output ONLY the JSON object, no markdown fences.`;

export async function generateViaOpenAICompat(opts: {
  text: string;
  hint?: string;
  cards?: number;
  questions?: number;
}): Promise<unknown> {
  const res = await fetch(`${env.OPENAI_COMPAT_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_COMPAT_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_COMPAT_MODEL,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `${opts.hint ? `Subject hint: ${opts.hint}\n` : ''}Make about ${opts.cards ?? 10} flashcards and ${opts.questions ?? 6} questions from:\n\n${opts.text}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401) throw new GeminiError('The AI provider rejected the API key. Check the server .env.', 401);
    throw new GeminiError(`AI request failed (${res.status}): ${body.slice(0, 150)}`, 502);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new GeminiError('AI returned an empty response.', 502);
  try {
    return JSON.parse(content) as GeneratedSet;
  } catch {
    throw new GeminiError('AI returned invalid JSON.', 502);
  }
}
