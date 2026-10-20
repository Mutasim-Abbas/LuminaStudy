import { createHash, generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeGoogle } from '../testing/fakeGoogle.js';
import {
  createAuthRequest,
  exchangeCode,
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  GoogleAuthError,
  clearSigningKeyCache,
  verifyIdToken,
} from './google.js';

const CLIENT_ID = 'client-123.apps.googleusercontent.com';
const REDIRECT = 'https://lumina.example/api/auth/google/callback';
const CLIENT = { clientId: CLIENT_ID, clientSecret: 'shh', redirectUri: REDIRECT };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createAuthRequest', () => {
  it('sends the browser to Google with state, nonce and a PKCE challenge', () => {
    const req = createAuthRequest(CLIENT_ID, REDIRECT);
    const url = new URL(req.url);
    expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_AUTH_URL);

    const q = url.searchParams;
    expect(q.get('client_id')).toBe(CLIENT_ID);
    expect(q.get('redirect_uri')).toBe(REDIRECT);
    expect(q.get('response_type')).toBe('code');
    expect(q.get('scope')).toBe('openid email profile');
    expect(q.get('state')).toBe(req.state);
    expect(q.get('nonce')).toBe(req.nonce);
    expect(q.get('code_challenge_method')).toBe('S256');
    // Google gets the hash; the verifier itself never leaves the server.
    expect(q.get('code_challenge')).toBe(
      createHash('sha256').update(req.codeVerifier).digest('base64url'),
    );
    expect(req.url).not.toContain(req.codeVerifier);
  });

  it('uses fresh random values every time', () => {
    const a = createAuthRequest(CLIENT_ID, REDIRECT);
    const b = createAuthRequest(CLIENT_ID, REDIRECT);
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    // 32 random bytes each: long enough that guessing is not an attack.
    expect(a.state.length).toBeGreaterThanOrEqual(43);
  });
});

describe('exchangeCode', () => {
  it('posts the code, verifier and secret to Google and returns the ID token', async () => {
    const fetchMock = vi.fn(async () => Response.json({ id_token: 'the.id.token' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(exchangeCode('auth-code', 'the-verifier', CLIENT)).resolves.toBe('the.id.token');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(GOOGLE_TOKEN_URL);
    const form = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(form)).toEqual({
      code: 'auth-code',
      code_verifier: 'the-verifier',
      client_id: CLIENT_ID,
      client_secret: 'shh',
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code',
    });
  });

  it('fails cleanly when Google refuses the code', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: 'invalid_grant' }, { status: 400 }));
    const err = await exchangeCode('used-code', 'v', CLIENT).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GoogleAuthError);
    expect((err as GoogleAuthError).reason).toBe('exchange_failed');
    expect((err as Error).message).toContain('invalid_grant');
  });

  it('fails cleanly when Google cannot be reached', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed');
    });
    await expect(exchangeCode('c', 'v', CLIENT)).rejects.toMatchObject({ reason: 'exchange_failed' });
  });
});

describe('verifyIdToken', () => {
  const google = fakeGoogle(CLIENT_ID);
  const verify = (token: string, nonce = 'nonce-1') =>
    verifyIdToken(token, { clientId: CLIENT_ID, nonce, now: Date.now() });

  beforeEach(() => {
    clearSigningKeyCache();
    vi.stubGlobal('fetch', google.fetchImpl());
  });

  it('accepts a genuine token and returns who signed in', async () => {
    const token = google.idToken({ nonce: 'nonce-1', email: 'Grace@Example.com' });
    await expect(verify(token)).resolves.toEqual({
      sub: 'google-sub-1',
      email: 'grace@example.com',
      name: 'Grace Hopper',
    });
  });

  it.each([
    ['another app', { aud: 'someone-else.apps.googleusercontent.com' }],
    ['another issuer', { iss: 'https://evil.example' }],
  ])('rejects a token issued to %s', async (_case, claims) => {
    const token = google.idToken({ nonce: 'nonce-1', ...claims });
    await expect(verify(token)).rejects.toMatchObject({ reason: 'invalid_token' });
  });

  it('rejects a token signed by a key that is not Google\'s', async () => {
    // Right key id, wrong key: the classic forgery.
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const token = google.idToken({ nonce: 'nonce-1' }, { key: privateKey });
    await expect(verify(token)).rejects.toMatchObject({ reason: 'invalid_token' });
  });

  it('rejects a token naming a key Google never published', async () => {
    const token = google.idToken({ nonce: 'nonce-1' }, { kid: 'made-up' });
    await expect(verify(token)).rejects.toMatchObject({ reason: 'invalid_token' });
  });

  it('rejects an unsigned token', async () => {
    const [, payload] = google.idToken({ nonce: 'nonce-1' }).split('.');
    const header = Buffer.from(JSON.stringify({ alg: 'none', kid: google.kid })).toString('base64url');
    await expect(verify(`${header}.${payload}.`)).rejects.toMatchObject({ reason: 'invalid_token' });
    // And an HMAC-signed token, the other classic algorithm confusion.
    const hmac = jwt.sign({ nonce: 'nonce-1' }, 'not-a-real-key', { keyid: google.kid });
    await expect(verify(hmac)).rejects.toMatchObject({ reason: 'invalid_token' });
  });

  it('rejects a token from a different sign-in (nonce mismatch)', async () => {
    const token = google.idToken({ nonce: 'someone-elses-nonce' });
    await expect(verify(token)).rejects.toMatchObject({ reason: 'invalid_token' });
  });

  it('rejects an expired token', async () => {
    const past = Math.floor(Date.now() / 1000) - 7200;
    const token = google.idToken({ nonce: 'nonce-1', iat: past, exp: past + 3600 });
    await expect(verify(token)).rejects.toMatchObject({ reason: 'invalid_token' });
  });

  it('rejects an email Google has not verified', async () => {
    const token = google.idToken({ nonce: 'nonce-1', email_verified: false });
    await expect(verify(token)).rejects.toMatchObject({ reason: 'email_unverified' });
  });

  it('fetches Google\'s keys once and reuses them, even for made-up key ids', async () => {
    const fetchSpy = vi.fn(google.fetchImpl());
    vi.stubGlobal('fetch', fetchSpy);
    await verify(google.idToken({ nonce: 'nonce-1' }));
    await verify(google.idToken({ nonce: 'nonce-1' }));
    // A burst of tokens with invented key ids must not become a burst of requests.
    for (let i = 0; i < 5; i++) {
      await verify(google.idToken({ nonce: 'nonce-1' }, { kid: `fake-${i}` })).catch(() => {});
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
