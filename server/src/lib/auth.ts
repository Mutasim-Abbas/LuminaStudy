import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { database, type UserRow } from '../db.js';
import { env } from '../env.js';
import type { Database } from './database.js';
import { createSession, findSession, SESSION_TTL_MS, type ActiveSession } from './sessions.js';

/**
 * Session handling.
 *
 * The cookie holds a signed JWT naming a server-side session (lib/sessions.ts).
 * Both must check out: the signature, so forged or tampered tokens are turned
 * away without touching the database, and the session row, so a session can
 * be ended — sign-out, a password reset, account deletion — before the cookie
 * expires. The token carries only the account and session ids: a JWT is
 * signed, not encrypted, so no personal details belong in it.
 *
 * The cookie is httpOnly, so JavaScript on the page can never read it and an
 * XSS bug cannot exfiltrate a login. SameSite=Lax keeps other origins from
 * riding it on state-changing requests, and the Secure flag is set whenever we
 * aren't on plain-HTTP localhost.
 */

export const SESSION_COOKIE = 'lumina_session';

const SESSION_MAX_AGE_S = SESSION_TTL_MS / 1000;

/**
 * Pinned explicitly rather than left to the library's defaults. An unpinned
 * verifier is the root of the classic JWT algorithm-confusion attacks, where a
 * token claiming `alg: none` or a different family is accepted.
 */
const ALGORITHM = 'HS256' as const;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

/** Extra fields we attach to the request once authenticated. */
declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionUser;
    sessionId?: string;
  }
}

export function signSession(sessionId: string, userId: string): string {
  return jwt.sign({ sub: userId, sid: sessionId }, env.JWT_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: SESSION_MAX_AGE_S,
  });
}

/** The ids a token names, or null for a missing, expired, forged or old-format token. */
export function verifySession(token: string | undefined): { userId: string; sessionId: string } | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: [ALGORITHM] });
    if (typeof payload === 'string' || !payload.sub) return null;
    const sid = (payload as { sid?: unknown }).sid;
    if (typeof sid !== 'string') return null;
    return { userId: String(payload.sub), sessionId: sid };
  } catch {
    // Expired or forged — treated the same way: no session.
    return null;
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // Cookies marked Secure are dropped over plain HTTP, which would break
    // local development on http://localhost.
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_S,
  };
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, cookieOptions());
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Signs a user in on this browser: a new session, and the cookie that names it. */
export async function startSession(
  reply: FastifyReply,
  userId: string,
  now: number,
  db?: Database,
): Promise<void> {
  const sessionId = await createSession(userId, now, db);
  setSessionCookie(reply, signSession(sessionId, userId));
}

export interface CurrentSession {
  user: UserRow;
  sessionId: string;
  session: ActiveSession;
}

/**
 * The signed-in account, read fresh from the database, or null. Null unless
 * the token is genuine, its session still exists and belongs to that account,
 * and the account itself still exists.
 */
export async function currentSession(request: FastifyRequest): Promise<CurrentSession | null> {
  const token = verifySession(request.cookies?.[SESSION_COOKIE]);
  if (!token) return null;
  const session = await findSession(token.sessionId, Date.now());
  if (!session || session.userId !== token.userId) return null;
  const user = await database.get<UserRow>('SELECT * FROM users WHERE id = ?', token.userId);
  if (!user) return null;
  return { user, sessionId: token.sessionId, session };
}

/**
 * Fastify preHandler: rejects the request unless a live session is present,
 * and attaches `request.user` and `request.sessionId` for the route to use.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const current = await currentSession(request);
  if (!current) {
    // A cookie for an ended session is useless; drop it so the client stops sending it.
    if (request.cookies?.[SESSION_COOKIE]) clearSessionCookie(reply);
    await reply.code(401).send({ error: 'unauthorized', message: 'Please sign in.' });
    return;
  }
  const { id, email, name } = current.user;
  request.user = { id, email, name };
  request.sessionId = current.sessionId;
}
