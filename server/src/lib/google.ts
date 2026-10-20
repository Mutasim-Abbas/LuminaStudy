import {
  createHash,
  createPublicKey,
  randomBytes,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';

/**
 * Sign in with Google, as a server-side OpenID Connect authorization-code flow.
 *
 * The browser is sent to Google with three one-time values the server keeps in
 * a short-lived cookie:
 *  - `state`, echoed back by Google, proving the callback answers a sign-in
 *    this browser started (stops an attacker logging a victim into the
 *    attacker's account);
 *  - a PKCE `code_verifier`, whose hash goes to Google, so an intercepted
 *    authorization code is useless without it;
 *  - a `nonce`, which Google writes into the ID token, so a token can't be
 *    replayed into a different sign-in.
 *
 * Only the identity scopes are requested, which Google treats as
 * non-sensitive: no app review is needed for them.
 */

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

export interface AuthRequest {
  /** Where to send the browser. */
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function createAuthRequest(clientId: string, redirectUri: string): AuthRequest {
  const state = randomToken();
  const nonce = randomToken();
  const codeVerifier = randomToken();
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    // Let someone with several Google accounts pick, instead of silently
    // signing in with whichever one the browser used last.
    prompt: 'select_account',
  }).toString();

  return { url: url.toString(), state, nonce, codeVerifier };
}

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface GoogleClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Why a Google sign-in was refused. Logged for the operator, never shown raw. */
export class GoogleAuthError extends Error {
  constructor(
    readonly reason: 'exchange_failed' | 'invalid_token' | 'email_unverified',
    message: string,
  ) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

/**
 * Trades the one-time authorization code for an ID token. Server to Google
 * directly, with the client secret and the PKCE verifier — neither ever passes
 * through the browser.
 */
export async function exchangeCode(
  code: string,
  codeVerifier: string,
  client: GoogleClient,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        code_verifier: codeVerifier,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        redirect_uri: client.redirectUri,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new GoogleAuthError('exchange_failed', `Could not reach Google: ${(err as Error).message}`);
  }

  const body = (await res.json().catch(() => ({}))) as { id_token?: unknown; error?: unknown };
  if (!res.ok || typeof body.id_token !== 'string') {
    throw new GoogleAuthError(
      'exchange_failed',
      `Google refused the code (HTTP ${res.status}${body.error ? `, ${String(body.error)}` : ''})`,
    );
  }
  return body.id_token;
}

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

/** Google's public signing keys by key id, kept as long as Google says they're good. */
let keyCache: { keys: Map<string, KeyObject>; fetchedAt: number; expiresAt: number } | null = null;

async function fetchSigningKeys(now: number): Promise<Map<string, KeyObject>> {
  let res: Response;
  try {
    res = await fetch(GOOGLE_JWKS_URL, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    throw new GoogleAuthError('invalid_token', `Could not reach Google: ${(err as Error).message}`);
  }
  if (!res.ok) {
    throw new GoogleAuthError('invalid_token', `Could not fetch Google's keys (HTTP ${res.status})`);
  }
  const { keys } = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  keyCache = {
    keys: new Map(keys.map((k) => [k.kid, createPublicKey({ key: k, format: 'jwk' })])),
    fetchedAt: now,
    expiresAt: now + maxAge * 1000,
  };
  return keyCache.keys;
}

/**
 * The public key a token names in its header. Google rotates keys, so an
 * unknown id triggers one refresh — but not more than once a minute, or a
 * stream of tokens with made-up ids would turn into a stream of requests.
 */
export async function signingKey(kid: string, now: number): Promise<KeyObject> {
  let keys = keyCache && keyCache.expiresAt > now ? keyCache.keys : await fetchSigningKeys(now);
  if (!keys.has(kid) && keyCache && now - keyCache.fetchedAt > 60_000) {
    keys = await fetchSigningKeys(now);
  }
  const key = keys.get(kid);
  if (!key) throw new GoogleAuthError('invalid_token', 'The ID token names an unknown signing key.');
  return key;
}

/** Forgets the cached keys. For tests. */
export function clearSigningKeyCache(): void {
  keyCache = null;
}
