/**
 * Thin client for the Lumina backend. In dev, Vite proxies /api to the server,
 * so we only ever call same-origin relative paths — the Gemini key stays on the
 * server and never reaches this code.
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
  summary: string;
  flashcards: GeneratedFlashcard[];
  quiz: GeneratedQuestion[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface HealthInfo {
  ok: boolean;
  aiEnabled: boolean;
  model: string | null;
}

/** Is the AI configured on the server? Used to guide the UI before a request. */
export async function getHealth(): Promise<HealthInfo> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return { ok: false, aiEnabled: false, model: null };
    return (await res.json()) as HealthInfo;
  } catch {
    return { ok: false, aiEnabled: false, model: null };
  }
}

export async function generateStudySet(input: {
  text: string;
  hint?: string;
}): Promise<GeneratedSet> {
  let res: Response;
  try {
    res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    throw new ApiError('Could not reach the server. Is the backend running?', 0);
  }

  const payload = (await res.json().catch(() => null)) as
    | { set?: GeneratedSet; message?: string }
    | null;

  if (!res.ok) {
    throw new ApiError(payload?.message ?? 'The request failed.', res.status);
  }
  if (!payload?.set) {
    throw new ApiError('The server returned an unexpected response.', 502);
  }
  return payload.set;
}
