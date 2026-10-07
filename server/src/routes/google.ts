import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { db, type UserRow } from '../db.js';
import { env } from '../env.js';
import { currentUser, setSessionCookie, signSession } from '../lib/auth.js';
import {
  createAuthRequest,
  exchangeCode,
  GoogleAuthError,
  verifyIdToken,
  type GoogleIdentity,
} from '../lib/google.js';

/**
 * Sign in with Google. See lib/google.ts for the protocol; this file decides
 * which account a Google identity belongs to.
 *
 * The one-time values for each attempt live in a signed, httpOnly cookie
 * scoped to these two routes, valid for ten minutes. SameSite=Lax still sends
 * it on the top-level redirect back from Google, which is the only request
 * that needs it.
 */

export const FLOW_COOKIE = 'lumina_google';
const FLOW_PATH = '/api/auth/google';
const FLOW_MAX_AGE_S = 10 * 60;

export interface Flow {
  state: string;
  nonce: string;
  codeVerifier: string;
  /** Set when a signed-in user is connecting Google to their account. */
  linkUserId?: string;
}

/** A page of our own app. Never a URL taken from the request. */
function appUrl(hashPath: string): string {
  return new URL(`/#${hashPath}`, env.APP_URL).toString();
}

/** Back to the sign-in page with a reason it can explain. */
export function fail(reply: FastifyReply, reason: string) {
  return reply.redirect(appUrl(`/account?google=${encodeURIComponent(reason)}`));
}

/** The attempt this browser started, if its cookie is present and untampered. */
function readFlow(request: FastifyRequest): Flow | null {
  const raw = request.cookies[FLOW_COOKIE];
  if (!raw) return null;
  const { valid, value } = request.unsignCookie(raw);
  if (!valid || !value) return null;
  try {
    return JSON.parse(value) as Flow;
  } catch {
    return null;
  }
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function signInAndGo(reply: FastifyReply, row: UserRow) {
  setSessionCookie(reply, signSession({ id: row.id, email: row.email, name: row.name }));
  return reply.redirect(appUrl('/'));
}

export async function googleRoutes(app: FastifyInstance) {
  app.get('/api/auth/google', async (request, reply) => {
    if (!env.googleSignIn) {
      return reply.code(404).send({ error: 'not_configured', message: 'Google sign-in is off.' });
    }

    // ?link=1 connects Google to the account that is signed in right now.
    const linking = (request.query as { link?: string }).link === '1';
    const session = currentUser(request);
    if (linking && !session) return fail(reply, 'signed_out');

    const auth = createAuthRequest(env.GOOGLE_CLIENT_ID!, env.googleRedirectUri);
    const flow: Flow = {
      state: auth.state,
      nonce: auth.nonce,
      codeVerifier: auth.codeVerifier,
      ...(linking && session ? { linkUserId: session.id } : {}),
    };
    reply.setCookie(FLOW_COOKIE, JSON.stringify(flow), {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: FLOW_PATH,
      maxAge: FLOW_MAX_AGE_S,
    });
    return reply.redirect(auth.url);
  });

  app.get('/api/auth/google/callback', async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string };
    const flow = readFlow(request);
    // One attempt, one use: whatever happens next, this cookie is spent.
    reply.clearCookie(FLOW_COOKIE, { path: FLOW_PATH });

    if (!env.googleSignIn) return fail(reply, 'unavailable');
    // Pressing "Cancel" on Google's screen comes back as error=access_denied.
    if (query.error) return fail(reply, 'cancelled');
    if (!flow) return fail(reply, 'expired');
    if (!query.code || !query.state || !sameString(query.state, flow.state)) {
      return fail(reply, 'failed');
    }

    let identity: GoogleIdentity;
    try {
      const idToken = await exchangeCode(query.code, flow.codeVerifier, {
        clientId: env.GOOGLE_CLIENT_ID!,
        clientSecret: env.GOOGLE_CLIENT_SECRET!,
        redirectUri: env.googleRedirectUri,
      });
      identity = await verifyIdToken(idToken, {
        clientId: env.GOOGLE_CLIENT_ID!,
        nonce: flow.nonce,
        now: Date.now(),
      });
    } catch (err) {
      if (!(err instanceof GoogleAuthError)) throw err;
      request.log.warn({ reason: err.reason, detail: err.message }, 'google sign-in refused');
      return fail(reply, err.reason === 'email_unverified' ? 'email_unverified' : 'failed');
    }

    if (flow.linkUserId) {
      // Connecting Google to the signed-in account. The session must still be
      // the one that started this: someone else may have signed in since.
      const session = currentUser(request);
      if (!session || session.id !== flow.linkUserId) return fail(reply, 'signed_out');
      // One Google account signs into one Lumina account, never two.
      const owner = db.prepare('SELECT id FROM users WHERE google_sub = ?').get(identity.sub) as
        | { id: string }
        | undefined;
      if (owner && owner.id !== session.id) return fail(reply, 'already_linked');
      db.prepare('UPDATE users SET google_sub = ? WHERE id = ?').run(identity.sub, session.id);
      request.log.info({ userId: session.id }, 'google linked to account');
      return reply.redirect(appUrl('/account?google=linked'));
    }

    // Keyed on Google's account id, which never changes — not on the email.
    const linked = db.prepare('SELECT * FROM users WHERE google_sub = ?').get(identity.sub) as
      | UserRow
      | undefined;
    if (linked) return signInAndGo(reply, linked);

    // An account already uses this email, but isn't linked to Google. It is
    // deliberately NOT joined automatically: anyone can sign up with a
    // password under an address they don't own, and if Google sign-in then
    // walked into that account, its real owner would be using an account a
    // stranger holds the password to. Linking happens from the account page,
    // after signing in with the password — proof of owning both.
    const byEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(identity.email);
    if (byEmail) return fail(reply, 'account_exists');

    // New to Lumina: create the account. No password — an empty hash, which
    // password sign-in always refuses (see migration 3). No CAPTCHA either:
    // getting here took a Google account and Google's own checks.
    const now = Date.now();
    const row: UserRow = {
      id: randomUUID(),
      email: identity.email,
      name: identity.name || identity.email.split('@')[0]!,
      password_hash: '',
      google_sub: identity.sub,
      created_at: now,
    };
    db.prepare(
      'INSERT INTO users (id, email, name, password_hash, google_sub, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(row.id, row.email, row.name, row.password_hash, row.google_sub, row.created_at);
    request.log.info({ userId: row.id }, 'account created with Google');
    return signInAndGo(reply, row);
  });
}
