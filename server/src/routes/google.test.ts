import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { fakeGoogle } from '../testing/fakeGoogle.js';

/**
 * Sign in with Google through the real routes. Google is the fake from
 * testing/fakeGoogle.ts: genuinely signed tokens, no network.
 *
 * The env is read once at import, so it is set before the app is loaded —
 * this file runs in its own process (pool: 'forks').
 */

const CLIENT_ID = 'client-123.apps.googleusercontent.com';
const APP_URL = 'https://lumina.example';
const google = fakeGoogle(CLIENT_ID);

let app: FastifyInstance;
let database: (typeof import('../db.js'))['database'];
let clearSigningKeyCache: () => void;
let signSession: (typeof import('../lib/auth.js'))['signSession'];

beforeAll(async () => {
  vi.stubEnv('GOOGLE_CLIENT_ID', CLIENT_ID);
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
  vi.stubEnv('APP_URL', APP_URL);
  ({ database } = await import('../db.js'));
  ({ clearSigningKeyCache } = await import('../lib/google.js'));
  ({ signSession } = await import('../lib/auth.js'));
  const { buildApp } = await import('../app.js');
  app = await buildApp();
});

afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await database.exec('DELETE FROM study_sets; DELETE FROM users;');
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

type Attempt = Awaited<ReturnType<typeof begin>>;

/**
 * Google sends the browser back. `claims` shape the ID token Google issues;
 * `query` replaces the callback's query string; `cookies` what the browser sends.
 */
async function finish(
  attempt: Attempt,
  opts: { claims?: Record<string, unknown>; query?: Record<string, string>; cookies?: string } = {},
) {
  vi.stubGlobal(
    'fetch',
    google.fetchImpl(() =>
      Response.json({ id_token: google.idToken({ nonce: attempt.nonce, ...opts.claims }) }),
    ),
  );
  const query = new URLSearchParams(opts.query ?? { code: 'auth-code', state: attempt.state });
  const cookie = opts.cookies ?? attempt.flowCookie;
  return app.inject({
    method: 'GET',
    url: `/api/auth/google/callback?${query}`,
    headers: cookie ? { cookie } : {},
  });
}

/** Where the callback sent the browser: the app, or the sign-in page with a reason. */
function landing(res: { headers: Record<string, unknown> }): string {
  return String(res.headers.location).replace(APP_URL, '');
}

function sessionFrom(res: { cookies: Array<{ name: string; value: string }> }) {
  const c = res.cookies.find((x) => x.name === 'lumina_session' && x.value);
  return c ? `lumina_session=${c.value}` : undefined;
}

describe('starting Google sign-in', () => {
  it('sends the browser to Google and keeps the attempt in a short-lived cookie', async () => {
    const { res, location } = await begin();
    expect(res.statusCode).toBe(302);
    expect(location.origin).toBe('https://accounts.google.com');
    expect(location.searchParams.get('redirect_uri')).toBe(`${APP_URL}/api/auth/google/callback`);

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

describe('the callback refuses', () => {
  it("a sign-in the user cancelled on Google's screen", async () => {
    const attempt = await begin();
    const res = await finish(attempt, { query: { error: 'access_denied', state: attempt.state } });
    expect(landing(res)).toBe('/#/account?google=cancelled');
    expect(sessionFrom(res)).toBeUndefined();
  });

  it('a callback with no attempt cookie (expired, or started elsewhere)', async () => {
    const attempt = await begin();
    const res = await finish(attempt, { cookies: '' });
    expect(landing(res)).toBe('/#/account?google=expired');
  });

  it('a state that does not match the attempt (login CSRF)', async () => {
    const attempt = await begin();
    const res = await finish(attempt, { query: { code: 'auth-code', state: 'attacker-state' } });
    expect(landing(res)).toBe('/#/account?google=failed');
    expect(sessionFrom(res)).toBeUndefined();
  });

  it('an attempt cookie that was tampered with', async () => {
    const attempt = await begin();
    const forged = `lumina_google=${encodeURIComponent(JSON.stringify({ state: attempt.state, nonce: 'n', codeVerifier: 'v' }))}`;
    const res = await finish(attempt, { cookies: forged });
    expect(landing(res)).toBe('/#/account?google=expired');
  });

  it('when Google rejects the code', async () => {
    const attempt = await begin();
    vi.stubGlobal(
      'fetch',
      google.fetchImpl(() => Response.json({ error: 'invalid_grant' }, { status: 400 })),
    );
    const res = await app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=used&state=${attempt.state}`,
      headers: { cookie: attempt.flowCookie },
    });
    expect(landing(res)).toBe('/#/account?google=failed');
    expect(sessionFrom(res)).toBeUndefined();
    expect(await database.get('SELECT count(*) AS n FROM users')).toEqual({ n: 0 });
  });

  it('to leave an attempt behind that could be replayed', async () => {
    const attempt = await begin();
    const first = await finish(attempt);
    // The cookie is cleared on the way back, whatever the outcome.
    const cleared = first.cookies.find((c) => c.name === 'lumina_google');
    expect(cleared?.value).toBe('');
  });
});

describe('signing in with Google', () => {
  it('creates an account for someone new and signs them in', async () => {
    const res = await finish(await begin());
    expect(landing(res)).toBe('/#/');

    const session = sessionFrom(res);
    expect(session).toBeDefined();
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: session! },
    });
    expect(me.json().user).toMatchObject({
      email: 'grace@example.com',
      name: 'Grace Hopper',
      google: true,
    });

    // No password: the account can only be entered through Google.
    const row = await database.get('SELECT password_hash, google_sub FROM users');
    expect(row).toEqual({ password_hash: '', google_sub: 'google-sub-1' });
  });

  it('falls back to the email name when Google gives none', async () => {
    const res = await finish(await begin(), { claims: { name: undefined } });
    expect(landing(res)).toBe('/#/');
    expect(await database.get('SELECT name FROM users')).toEqual({ name: 'grace' });
  });

  it('refuses an email Google has not verified', async () => {
    const res = await finish(await begin(), { claims: { email_verified: false } });
    expect(landing(res)).toBe('/#/account?google=email_unverified');
    expect(await database.get('SELECT count(*) AS n FROM users')).toEqual({ n: 0 });
  });
});

describe('returning to Google sign-in', () => {
  it('signs into the same account every time, without duplicating it', async () => {
    await finish(await begin());
    const again = await finish(await begin());
    expect(landing(again)).toBe('/#/');
    expect(sessionFrom(again)).toBeDefined();
    expect(await database.get('SELECT count(*) AS n FROM users')).toEqual({ n: 1 });
  });

  it('follows the Google account even after its email changes', async () => {
    await finish(await begin());
    const res = await finish(await begin(), { claims: { email: 'grace@navy.example' } });
    expect(landing(res)).toBe('/#/');
    // Matched on Google's account id, so it is still the one account.
    expect(await database.all('SELECT email FROM users')).toEqual([{ email: 'grace@example.com' }]);
  });
});

describe('an email that already has a password account', () => {
  it('is not joined to Google automatically', async () => {
    // Possibly made by someone who doesn't own the address (pre-hijacking).
    await database.run(
      "INSERT INTO users (id, email, name, password_hash, created_at) VALUES ('p1', 'grace@example.com', 'Grace', 'scrypt$00$00', 1)",
    );

    const res = await finish(await begin());
    expect(landing(res)).toBe('/#/account?google=account_exists');
    expect(sessionFrom(res)).toBeUndefined();
    expect(await database.get('SELECT google_sub FROM users')).toEqual({ google_sub: null });
  });
});

describe('connecting Google to a password account', () => {
  /** Ada, signed in with her password. */
  async function passwordAccount(id = 'p1', email = 'ada@example.com') {
    await database.run(
      "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, 'Ada', 'scrypt$00$00', 1)",
      id,
      email,
    );
    return `lumina_session=${signSession({ id, email, name: 'Ada' })}`;
  }

  it('links the Google account, and Google sign-in then opens that account', async () => {
    const session = await passwordAccount();
    const attempt = await begin({ link: true, session });
    const res = await finish(attempt, { cookies: `${attempt.flowCookie}; ${session}` });
    expect(landing(res)).toBe('/#/account?google=linked');
    expect(await database.get("SELECT google_sub FROM users WHERE id = 'p1'")).toEqual({
      google_sub: 'google-sub-1',
    });

    // A Google account with a different email can be linked; it is the
    // Google id that counts from now on.
    const signIn = await finish(await begin());
    expect(landing(signIn)).toBe('/#/');
    expect(await database.get('SELECT count(*) AS n FROM users')).toEqual({ n: 1 });
  });

  it('does not finish linking if that account is no longer signed in', async () => {
    const session = await passwordAccount();
    const attempt = await begin({ link: true, session });
    // Back from Google without the session (signed out, or another browser).
    const res = await finish(attempt);
    expect(landing(res)).toBe('/#/account?google=signed_out');
    expect(await database.get('SELECT google_sub FROM users')).toEqual({ google_sub: null });
  });

  it('refuses a Google account that already opens a different account', async () => {
    await finish(await begin()); // Grace's Google account made its own Lumina account
    const session = await passwordAccount();
    const attempt = await begin({ link: true, session });
    const res = await finish(attempt, { cookies: `${attempt.flowCookie}; ${session}` });
    expect(landing(res)).toBe('/#/account?google=already_linked');
    expect(await database.get("SELECT google_sub FROM users WHERE id = 'p1'")).toEqual({
      google_sub: null,
    });
  });
});

describe('health', () => {
  it('tells the sign-in page that Google sign-in is available', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.json().googleSignIn).toBe(true);
  });
});
