import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { db } from '../db.js';

/**
 * Auth + per-user isolation. The isolation tests matter most: they are what
 * stands between one student and another student's library.
 */

let app: FastifyInstance;

beforeEach(async () => {
  db.exec('DELETE FROM study_sets; DELETE FROM users;');
  if (!app) app = await buildApp();
});

afterAll(async () => {
  await app?.close();
});

const CREDS = { email: 'ada@example.com', password: 'correct horse battery' };

async function signup(creds = CREDS) {
  return app.inject({ method: 'POST', url: '/api/auth/signup', payload: creds });
}

/** Pull the session cookie out of a response so later requests are authenticated. */
function cookieFrom(res: { cookies: Array<{ name: string; value: string }> }): string {
  const c = res.cookies.find((x) => x.name === 'lumina_session');
  if (!c) throw new Error('no session cookie on response');
  return `lumina_session=${c.value}`;
}

function sampleSet(id = 's1', title = 'Bio') {
  return {
    id,
    subject: 'Biology',
    title,
    description: 'cells',
    mastery: 0,
    cards: [{ id: 'c1', front: 'Q', back: 'A' }],
    quiz: [{ id: 'q1', prompt: 'P', options: ['a', 'b'], answerIndex: 0, explanation: '' }],
  };
}

describe('signup', () => {
  it('creates an account and returns a session cookie', async () => {
    const res = await signup();
    expect(res.statusCode).toBe(201);
    expect(res.json().user.email).toBe(CREDS.email);
    expect(res.json().user.password_hash).toBeUndefined();
    expect(cookieFrom(res)).toContain('lumina_session=');
  });

  it('marks the session cookie httpOnly so page scripts cannot read it', async () => {
    const res = await signup();
    const c = res.cookies.find((x) => x.name === 'lumina_session')!;
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite?.toLowerCase()).toBe('lax');
  });

  it('rejects a duplicate email', async () => {
    await signup();
    const res = await signup();
    expect(res.statusCode).toBe(409);
  });

  it('rejects a weak password and a malformed email', async () => {
    expect((await signup({ email: 'a@b.com', password: 'short' })).statusCode).toBe(400);
    expect((await signup({ email: 'nope', password: 'long enough here' })).statusCode).toBe(400);
  });

  it('treats emails case-insensitively', async () => {
    await signup();
    const res = await signup({ ...CREDS, email: 'ADA@example.com' });
    expect(res.statusCode).toBe(409);
  });

  it('never stores the password in plain text', async () => {
    await signup();
    const row = db.prepare('SELECT password_hash FROM users WHERE email = ?').get(CREDS.email) as {
      password_hash: string;
    };
    expect(row.password_hash).not.toContain(CREDS.password);
    expect(row.password_hash.startsWith('scrypt$')).toBe(true);
  });
});

describe('login', () => {
  it('accepts the right password', async () => {
    await signup();
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: CREDS });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe(CREDS.email);
  });

  it('rejects the wrong password', async () => {
    await signup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { ...CREDS, password: 'wrong password here' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('gives the same answer for an unknown email as for a bad password', async () => {
    await signup();
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@example.com', password: 'correct horse battery' },
    });
    const badPass = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { ...CREDS, password: 'nope nope nope' },
    });
    // Identical status and body — no account enumeration.
    expect(unknown.statusCode).toBe(badPass.statusCode);
    expect(unknown.json()).toEqual(badPass.json());
  });
});

describe('session', () => {
  it('reports null when signed out', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.json().user).toBeNull();
  });

  it('reports the user when signed in', async () => {
    const cookie = cookieFrom(await signup());
    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(res.json().user.email).toBe(CREDS.email);
  });

  it('ignores a forged token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: 'lumina_session=not.a.real.jwt' },
    });
    expect(res.json().user).toBeNull();
  });

  it('clears the cookie on logout', async () => {
    const cookie = cookieFrom(await signup());
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    const cleared = res.cookies.find((c) => c.name === 'lumina_session');
    expect(cleared?.value).toBe('');
  });
});

describe('study set routes require a session', () => {
  it.each([
    ['GET', '/api/sets'],
    ['PUT', '/api/sets/s1'],
    ['POST', '/api/sets/sync'],
    ['DELETE', '/api/sets/s1'],
  ])('%s %s is 401 when signed out', async (method, url) => {
    const res = await app.inject({ method: method as 'GET', url, payload: {} });
    expect(res.statusCode).toBe(401);
  });
});

describe('study sets', () => {
  it('saves and returns a set', async () => {
    const cookie = cookieFrom(await signup());
    const put = await app.inject({
      method: 'PUT',
      url: '/api/sets/s1',
      headers: { cookie },
      payload: sampleSet(),
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().set.title).toBe('Bio');
    expect(put.json().set.cards).toHaveLength(1);

    const list = await app.inject({ method: 'GET', url: '/api/sets', headers: { cookie } });
    expect(list.json().sets).toHaveLength(1);
  });

  it('updates an existing set rather than duplicating it', async () => {
    const cookie = cookieFrom(await signup());
    await app.inject({ method: 'PUT', url: '/api/sets/s1', headers: { cookie }, payload: sampleSet() });
    await app.inject({
      method: 'PUT',
      url: '/api/sets/s1',
      headers: { cookie },
      payload: { ...sampleSet('s1', 'Bio renamed'), mastery: 40 },
    });
    const list = await app.inject({ method: 'GET', url: '/api/sets', headers: { cookie } });
    expect(list.json().sets).toHaveLength(1);
    expect(list.json().sets[0].title).toBe('Bio renamed');
    expect(list.json().sets[0].mastery).toBe(40);
  });

  it('rejects a body whose id disagrees with the URL', async () => {
    const cookie = cookieFrom(await signup());
    const res = await app.inject({
      method: 'PUT',
      url: '/api/sets/s1',
      headers: { cookie },
      payload: sampleSet('different'),
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a malformed set', async () => {
    const cookie = cookieFrom(await signup());
    const res = await app.inject({
      method: 'PUT',
      url: '/api/sets/s1',
      headers: { cookie },
      payload: { id: 's1', title: '', cards: [], quiz: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('bulk-syncs local sets into the account', async () => {
    const cookie = cookieFrom(await signup());
    const res = await app.inject({
      method: 'POST',
      url: '/api/sets/sync',
      headers: { cookie },
      payload: { sets: [sampleSet('a', 'A'), sampleSet('b', 'B')] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().sets).toHaveLength(2);
  });

  it('deletes only the requested set', async () => {
    const cookie = cookieFrom(await signup());
    await app.inject({
      method: 'POST',
      url: '/api/sets/sync',
      headers: { cookie },
      payload: { sets: [sampleSet('a', 'A'), sampleSet('b', 'B')] },
    });
    await app.inject({ method: 'DELETE', url: '/api/sets/a', headers: { cookie } });
    const list = await app.inject({ method: 'GET', url: '/api/sets', headers: { cookie } });
    expect(list.json().sets.map((s: { id: string }) => s.id)).toEqual(['b']);
  });
});

describe('per-user isolation', () => {
  async function twoUsers() {
    const a = cookieFrom(await signup({ email: 'a@example.com', password: 'password one!!' }));
    const b = cookieFrom(await signup({ email: 'b@example.com', password: 'password two!!' }));
    return { a, b };
  }

  it('never lists another user’s sets', async () => {
    const { a, b } = await twoUsers();
    await app.inject({ method: 'PUT', url: '/api/sets/s1', headers: { cookie: a }, payload: sampleSet() });

    const mine = await app.inject({ method: 'GET', url: '/api/sets', headers: { cookie: b } });
    expect(mine.json().sets).toHaveLength(0);
  });

  it('cannot overwrite another user’s set by reusing its id', async () => {
    const { a, b } = await twoUsers();
    await app.inject({
      method: 'PUT',
      url: '/api/sets/s1',
      headers: { cookie: a },
      payload: sampleSet('s1', 'Belongs to A'),
    });

    // B tries to claim the same id.
    await app.inject({
      method: 'PUT',
      url: '/api/sets/s1',
      headers: { cookie: b },
      payload: sampleSet('s1', 'Hijacked by B'),
    });

    const aList = await app.inject({ method: 'GET', url: '/api/sets', headers: { cookie: a } });
    expect(aList.json().sets[0].title).toBe('Belongs to A');
  });

  it('cannot delete another user’s set', async () => {
    const { a, b } = await twoUsers();
    await app.inject({ method: 'PUT', url: '/api/sets/s1', headers: { cookie: a }, payload: sampleSet() });

    await app.inject({ method: 'DELETE', url: '/api/sets/s1', headers: { cookie: b } });

    const aList = await app.inject({ method: 'GET', url: '/api/sets', headers: { cookie: a } });
    expect(aList.json().sets).toHaveLength(1);
  });

  it('removes the account’s sets when the account is deleted', async () => {
    const cookie = cookieFrom(await signup());
    await app.inject({ method: 'PUT', url: '/api/sets/s1', headers: { cookie }, payload: sampleSet() });
    await app.inject({ method: 'DELETE', url: '/api/auth/me', headers: { cookie } });
    const rows = db.prepare('SELECT COUNT(*) AS n FROM study_sets').get() as { n: number };
    expect(rows.n).toBe(0);
  });
});
