import { beforeEach, describe, expect, it } from 'vitest';
import { database } from '../db.js';
import {
  createSession,
  endAllSessions,
  endSession,
  findSession,
  markReauthenticated,
  pruneSessions,
  recentlyReauthenticated,
  REAUTH_WINDOW_MS,
  SESSION_TTL_MS,
} from './sessions.js';

const NOW = 1_800_000_000_000;

beforeEach(async () => {
  await database.exec('DELETE FROM sessions; DELETE FROM users;');
  for (const id of ['u1', 'u2']) {
    await database.run(
      "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, '', 1)",
      id,
      `${id}@example.com`,
    );
  }
});

describe('sessions', () => {
  it('finds a session by its id until it expires', async () => {
    const id = await createSession('u1', NOW);
    expect(await findSession(id, NOW)).toEqual({ userId: 'u1', reauthenticatedAt: null });
    expect(await findSession(id, NOW + SESSION_TTL_MS)).toBeNull();
  });

  it('stores only a hash of the id', async () => {
    const id = await createSession('u1', NOW);
    const rows = await database.all<{ id_hash: string }>('SELECT id_hash FROM sessions');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id_hash).not.toBe(id);
    expect(rows[0]!.id_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('ends one session without touching the account\'s others', async () => {
    const phone = await createSession('u1', NOW);
    const laptop = await createSession('u1', NOW);
    await endSession(phone);
    expect(await findSession(phone, NOW)).toBeNull();
    expect(await findSession(laptop, NOW)).not.toBeNull();
  });

  it('ends every session of one account, and only that account', async () => {
    const a1 = await createSession('u1', NOW);
    const a2 = await createSession('u1', NOW);
    const b = await createSession('u2', NOW);
    await endAllSessions('u1');
    expect(await findSession(a1, NOW)).toBeNull();
    expect(await findSession(a2, NOW)).toBeNull();
    expect(await findSession(b, NOW)).not.toBeNull();
  });

  it('counts a re-authentication as recent for five minutes', async () => {
    const id = await createSession('u1', NOW);
    await markReauthenticated(id, NOW);
    const session = (await findSession(id, NOW))!;
    expect(recentlyReauthenticated(session, NOW + REAUTH_WINDOW_MS)).toBe(true);
    expect(recentlyReauthenticated(session, NOW + REAUTH_WINDOW_MS + 1)).toBe(false);
  });

  it('prunes expired sessions', async () => {
    await createSession('u1', NOW - SESSION_TTL_MS);
    const live = await createSession('u1', NOW);
    await pruneSessions(NOW);
    expect(await database.get('SELECT COUNT(*) AS n FROM sessions')).toEqual({ n: 1 });
    expect(await findSession(live, NOW)).not.toBeNull();
  });
});
