import type { FastifyInstance, FastifyReply } from 'fastify';
import { env } from '../env.js';
import { currentUser } from '../lib/auth.js';
import { createAuthRequest } from '../lib/google.js';

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
}
