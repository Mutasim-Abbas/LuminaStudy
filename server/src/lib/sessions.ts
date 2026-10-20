import { createHash, randomBytes } from 'node:crypto';
import { database } from '../db.js';
import type { Database } from './database.js';

/**
 * Server-side sessions. The signed cookie (lib/auth.ts) names a session; the
 * session row is what makes it valid. Deleting the row ends the session at
 * once — no waiting for the cookie to expire — which is how sign-out, "sign
 * out everywhere", a password reset and account deletion take effect.
 *
 * The id is 32 random bytes and only its SHA-256 hash is stored, so a copy of
 * the database can't be turned back into working sessions.
 */

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** How long a fresh password or Google check counts as recent, for destructive actions. */
export const REAUTH_WINDOW_MS = 5 * 60 * 1000;

export interface ActiveSession {
  userId: string;
  reauthenticatedAt: number | null;
}

function hashId(id: string): string {
  return createHash('sha256').update(id).digest('hex');
}

/** Starts a session for a user and returns its id — the only time the raw id exists. */
export async function createSession(userId: string, now: number, db: Database = database): Promise<string> {
  const id = randomBytes(32).toString('base64url');
  await db.run(
    'INSERT INTO sessions (id_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    hashId(id),
    userId,
    now,
    now + SESSION_TTL_MS,
  );
  return id;
}

/** The live session with this id, or null when it is unknown, ended or expired. */
export async function findSession(id: string, now: number): Promise<ActiveSession | null> {
  const row = await database.get<{
    user_id: string;
    expires_at: number;
    reauthenticated_at: number | null;
  }>('SELECT user_id, expires_at, reauthenticated_at FROM sessions WHERE id_hash = ?', hashId(id));
  if (!row || row.expires_at <= now) return null;
  return { userId: row.user_id, reauthenticatedAt: row.reauthenticated_at };
}

/** Ends one session — this device's sign-out. */
export async function endSession(id: string): Promise<void> {
  await database.run('DELETE FROM sessions WHERE id_hash = ?', hashId(id));
}

/** Ends every session of an account — on every device. */
export async function endAllSessions(userId: string, db: Database = database): Promise<void> {
  await db.run('DELETE FROM sessions WHERE user_id = ?', userId);
}

/** Records that this session's owner just proved who they are again. */
export async function markReauthenticated(id: string, now: number): Promise<void> {
  await database.run('UPDATE sessions SET reauthenticated_at = ? WHERE id_hash = ?', now, hashId(id));
}

export function recentlyReauthenticated(session: ActiveSession, now: number): boolean {
  return session.reauthenticatedAt !== null && now - session.reauthenticatedAt <= REAUTH_WINDOW_MS;
}

/** Housekeeping: drop sessions past their expiry. */
export async function pruneSessions(now: number): Promise<void> {
  await database.run('DELETE FROM sessions WHERE expires_at <= ?', now);
}
