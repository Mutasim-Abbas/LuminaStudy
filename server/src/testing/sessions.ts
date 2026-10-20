import { signSession } from '../lib/auth.js';
import { createSession } from '../lib/sessions.js';

/**
 * A session cookie for an account that already exists, as if it had just
 * signed in — a real session row plus the signed token that names it. For
 * tests only.
 */
export async function sessionCookieFor(userId: string): Promise<string> {
  const sessionId = await createSession(userId, Date.now());
  return `lumina_session=${signSession(sessionId, userId)}`;
}
