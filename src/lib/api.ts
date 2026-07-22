import type { StudySet } from '../data/studySets';

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
  highlights: string[];
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
      // The endpoint requires a session now, so the cookie has to ride along.
      credentials: 'include',
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

/* ------------------------------------------------------------------ */
/* Accounts & cloud sync                                               */
/* ------------------------------------------------------------------ */


export interface AccountUser {
  id: string;
  email: string;
  name: string;
}

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
  /** The token for the CAPTCHA image the user solved. */
  captchaToken: string;
  /** What the user typed from the CAPTCHA image. */
  captcha: string;
  /** Honeypot — a real user leaves this empty. */
  website?: string;
}

export interface Captcha {
  token: string;
  /** Inline SVG markup for the challenge image. */
  svg: string;
}

/** Fetch a fresh CAPTCHA challenge for the sign-up form. */
export async function fetchCaptcha(): Promise<Captcha> {
  return request<Captcha>('/api/auth/captcha');
}

/**
 * Every call sends cookies (`credentials: 'include'`) because the session lives
 * in an httpOnly cookie — this code cannot read the token, which is the point:
 * an XSS bug can't steal a login it has no access to.
 */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: 'include',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    });
  } catch {
    throw new ApiError('Could not reach the server. Is the backend running?', 0);
  }

  const payload = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!res.ok) throw new ApiError(payload?.message ?? 'The request failed.', res.status);
  if (payload === null) throw new ApiError('The server returned an unexpected response.', 502);
  return payload;
}

export async function signUp(input: SignUpInput): Promise<AccountUser> {
  const { user } = await request<{ user: AccountUser }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return user;
}

export async function signIn(email: string, password: string): Promise<AccountUser> {
  const { user } = await request<{ user: AccountUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return user;
}

export async function signOut(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST' });
}

/**
 * Ask for a reset link.
 *
 * Resolves the same way whether or not the address has an account — the server
 * deliberately refuses to say, so that this endpoint can't be used to discover
 * who has one. The UI must therefore show the same confirmation either way.
 */
export async function requestPasswordReset(email: string): Promise<string> {
  const { message } = await request<{ ok: boolean; message: string }>('/api/auth/forgot', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  return message;
}

/** Redeem a reset link. On success the user is signed in already. */
export async function resetPassword(token: string, password: string): Promise<AccountUser> {
  const { user } = await request<{ user: AccountUser }>('/api/auth/reset', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
  return user;
}

/** Current session, or null when signed out. Never throws for "not signed in". */
export async function fetchCurrentUser(): Promise<AccountUser | null> {
  try {
    const { user } = await request<{ user: AccountUser | null }>('/api/auth/me');
    return user;
  } catch {
    // Backend down or unreachable — treat as signed out rather than blocking boot.
    return null;
  }
}

export interface AiQuota {
  used: number;
  limit: number;
  remaining: number;
  resetAtMs: number | null;
  /** Human phrasing of the wait, e.g. "in 7 hours". Null while under the limit. */
  resetIn: string | null;
}

/** Free generations left today. Null if the server can't be reached. */
export async function fetchAiQuota(): Promise<AiQuota | null> {
  try {
    return await request<AiQuota>('/api/generate/quota');
  } catch {
    return null;
  }
}

export async function fetchCloudSets(): Promise<StudySet[]> {
  const { sets } = await request<{ sets: StudySet[] }>('/api/sets');
  return sets;
}

export async function saveCloudSet(set: StudySet): Promise<StudySet> {
  const { set: saved } = await request<{ set: StudySet }>(`/api/sets/${encodeURIComponent(set.id)}`, {
    method: 'PUT',
    body: JSON.stringify(set),
  });
  return saved;
}

/** Pushes local sets into the account and returns the merged server list. */
export async function syncCloudSets(sets: StudySet[]): Promise<StudySet[]> {
  const { sets: merged } = await request<{ sets: StudySet[] }>('/api/sets/sync', {
    method: 'POST',
    body: JSON.stringify({ sets }),
  });
  return merged;
}

export async function deleteCloudSet(id: string): Promise<void> {
  await request(`/api/sets/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * Fire-and-forget push of a single set.
 *
 * Deliberately swallows every error: the app is local-first, so a failed sync
 * (signed out, offline, backend down) must never interrupt a study session.
 * localStorage keeps the authoritative copy either way, and anything missed
 * here is pushed by the bulk sync on the next sign-in.
 */
export function pushSetQuietly(set: StudySet): void {
  void saveCloudSet(set).catch(() => {});
}
