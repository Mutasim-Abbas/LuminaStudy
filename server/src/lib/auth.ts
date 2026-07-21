import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env.js';

/**
 * Session handling.
 *
 * The session token is a JWT delivered in an httpOnly cookie: JavaScript on the
 * page can never read it, so an XSS bug cannot exfiltrate a login. SameSite=Lax
 * keeps other origins from riding the cookie on state-changing requests, and the
 * Secure flag is set whenever we aren't on plain-HTTP localhost.
 */

export const SESSION_COOKIE = 'lumina_session';

/**
 * Seven days, not thirty. Sessions are stateless, so a stolen token is valid
 * until it expires and cannot be revoked — the expiry *is* the containment,
 * which makes a shorter one meaningfully safer.
 */
const SESSION_DAYS = 7;
const SESSION_MAX_AGE_S = SESSION_DAYS * 24 * 60 * 60;

/**
 * Pinned explicitly rather than left to the library's defaults. An unpinned
 * verifier is the root of the classic JWT algorithm-confusion attacks, where a
 * token claiming `alg: none` or a different family is accepted.
 */
const ALGORITHM = 'HS256' as const;

export interface SessionUser {
  id: string;
  email: string;
}

/** Extra fields we attach to the request once authenticated. */
declare module 'fastify' {
  interface FastifyRequest {
    user?: SessionUser;
  }
}

export function signSession(user: SessionUser): string {
  return jwt.sign({ sub: user.id, email: user.email }, env.JWT_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: `${SESSION_DAYS}d`,
  });
}

/** Returns the session user, or null for a missing/expired/tampered token. */
export function verifySession(token: string | undefined): SessionUser | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: [ALGORITHM] });
    if (typeof payload === 'string' || !payload.sub) return null;
    return { id: String(payload.sub), email: String((payload as { email?: string }).email ?? '') };
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

/** Reads the session without requiring one. */
export function currentUser(request: FastifyRequest): SessionUser | null {
  return verifySession(request.cookies?.[SESSION_COOKIE]);
}

/**
 * Fastify preHandler: rejects the request unless a valid session is present,
 * and attaches `request.user` for the route to use.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = currentUser(request);
  if (!user) {
    await reply.code(401).send({ error: 'unauthorized', message: 'Please sign in.' });
    return;
  }
  request.user = user;
}
