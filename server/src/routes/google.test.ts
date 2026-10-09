import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * Sign in with Google through the real routes, with no network.
 *
 * The env is read once at import, so it is set before the app is loaded —
 * this file runs in its own process (pool: 'forks').
 */

const CLIENT_ID = 'client-123.apps.googleusercontent.com';
const APP_URL = 'https://lumina.example';

let app: FastifyInstance;
let db: (typeof import('../db.js'))['db'];
let clearSigningKeyCache: () => void;

beforeAll(async () => {
  vi.stubEnv('GOOGLE_CLIENT_ID', CLIENT_ID);
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
  vi.stubEnv('APP_URL', APP_URL);
  ({ db } = await import('../db.js'));
  ({ clearSigningKeyCache } = await import('../lib/google.js'));
  const { buildApp } = await import('../app.js');
  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  db.exec('DELETE FROM study_sets; DELETE FROM users;');
  clearSigningKeyCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Click "Continue with Google": what the browser takes to Google and keeps. */
async function begin({ link = false, session }: { link?: boolean; session?: string } = {}) {
  const res = await app.inject({
    method: 'GET',
    url: `/api/auth/google${link ? '?link=1' : ''}`,
    headers: session ? { cookie: session } : {},
  });
  const location = new URL(res.headers.location as string);
  const flow = res.cookies.find((c) => c.name === 'lumina_google');
  return {
    res,
    location,
    state: location.searchParams.get('state') ?? '',
    nonce: location.searchParams.get('nonce') ?? '',
    flowCookie: flow ? `lumina_google=${flow.value}` : '',
  };
}

describe('starting Google sign-in', () => {
  it('sends the browser to Google and keeps the attempt in a short-lived cookie', async () => {
    const { res, location } = await begin();
    expect(res.statusCode).toBe(302);
    expect(location.origin).toBe('https://accounts.google.com');
    expect(location.searchParams.get('redirect_uri')).toBe(
      `${APP_URL}/api/auth/google/callback`,
    );

    const flow = res.cookies.find((c) => c.name === 'lumina_google')!;
    expect(flow.httpOnly).toBe(true);
    expect(flow.sameSite).toBe('Lax');
    expect(flow.path).toBe('/api/auth/google');
    expect(flow.maxAge).toBe(600);
    // Signed, so a tampered attempt is thrown away rather than trusted.
    expect(flow.value).toMatch(/\}\.[A-Za-z0-9+/_-]{20,}$/);
  });

  it('will not start linking without a signed-in account', async () => {
    const { res } = await begin({ link: true });
    expect(res.headers.location).toBe(`${APP_URL}/#/account?google=signed_out`);
  });
});
