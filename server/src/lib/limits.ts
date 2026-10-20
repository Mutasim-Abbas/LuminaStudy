import { randomUUID } from 'node:crypto';
import { database } from '../db.js';

/**
 * Usage limits that must survive a restart and can't be dodged by changing IP,
 * so they live in the database keyed by account rather than in the in-memory
 * per-IP rate limiter.
 *
 *  - Sign-in lockout: 5 failures per email, then a 15 minute cool-off.
 *  - AI generation: 3 per rolling 24 hours per account.
 *
 * Both use a sliding window over an append-only log. A fixed daily reset would
 * let someone burn 3 at 23:59 and 3 more at 00:01; sliding avoids that and
 * lets us tell the user exactly when their next one unlocks.
 */

export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

export const AI_FREE_PER_DAY = 3;
export const AI_WINDOW_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Sign-in lockout                                                     */
/* ------------------------------------------------------------------ */

export interface LockoutStatus {
  locked: boolean;
  /** Attempts left before lockout; 0 once locked. */
  remaining: number;
  /** When the lock lifts, epoch ms. Null when not locked. */
  retryAtMs: number | null;
}

/** Failures for this email inside the current window, oldest first. */
async function recentFailures(email: string, nowMs: number): Promise<number[]> {
  const rows = await database.all<{ created_at: number }>(
    'SELECT created_at FROM login_attempts WHERE email = ? AND created_at > ? ORDER BY created_at',
    email,
    nowMs - LOGIN_LOCKOUT_MS,
  );
  return rows.map((r) => r.created_at);
}

export async function loginLockout(email: string, nowMs: number): Promise<LockoutStatus> {
  const failures = await recentFailures(email, nowMs);
  const oldest = failures[0];
  if (failures.length >= LOGIN_MAX_ATTEMPTS && oldest !== undefined) {
    // The clock runs from the oldest failure still inside the window, so the
    // lock lifts gradually rather than all at once.
    return { locked: true, remaining: 0, retryAtMs: oldest + LOGIN_LOCKOUT_MS };
  }
  return { locked: false, remaining: LOGIN_MAX_ATTEMPTS - failures.length, retryAtMs: null };
}

export async function recordLoginFailure(email: string, nowMs: number): Promise<void> {
  await database.run(
    'INSERT INTO login_attempts (id, email, created_at) VALUES (?, ?, ?)',
    randomUUID(),
    email,
    nowMs,
  );
}

/** Called after a successful sign-in, so a good password clears the slate. */
export async function clearLoginFailures(email: string): Promise<void> {
  await database.run('DELETE FROM login_attempts WHERE email = ?', email);
}

/** Housekeeping: drop attempts that have aged out of every window. */
export async function pruneLoginAttempts(nowMs: number): Promise<void> {
  await database.run('DELETE FROM login_attempts WHERE created_at <= ?', nowMs - LOGIN_LOCKOUT_MS);
}

/* ------------------------------------------------------------------ */
/* AI generation quota                                                 */
/* ------------------------------------------------------------------ */

export interface QuotaStatus {
  used: number;
  limit: number;
  remaining: number;
  /** When the next generation unlocks, epoch ms. Null while under the limit. */
  resetAtMs: number | null;
}

export async function aiQuota(userId: string, nowMs: number): Promise<QuotaStatus> {
  const rows = await database.all<{ created_at: number }>(
    'SELECT created_at FROM ai_usage WHERE user_id = ? AND created_at > ? ORDER BY created_at',
    userId,
    nowMs - AI_WINDOW_MS,
  );

  const used = rows.length;
  const remaining = Math.max(0, AI_FREE_PER_DAY - used);
  const oldest = rows[0];
  return {
    used,
    limit: AI_FREE_PER_DAY,
    remaining,
    // Once spent, the next slot frees when the oldest use leaves the window.
    resetAtMs: remaining === 0 && oldest ? oldest.created_at + AI_WINDOW_MS : null,
  };
}

/**
 * Takes one generation from the user's allowance, if any is left, and returns
 * the reservation's id — or null when the allowance is spent.
 *
 * The count and the insert happen in one transaction, before the slow AI call.
 * Checking first and recording after the call would let several requests sent
 * at once all pass the check while none had been recorded yet.
 */
export async function reserveAiUse(userId: string, nowMs: number): Promise<string | null> {
  const id = randomUUID();
  return database.transaction(async (tx) => {
    const row = await tx.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM ai_usage WHERE user_id = ? AND created_at > ?',
      userId,
      nowMs - AI_WINDOW_MS,
    );
    if (Number(row?.n ?? 0) >= AI_FREE_PER_DAY) return null;
    await tx.run(
      'INSERT INTO ai_usage (id, user_id, created_at) VALUES (?, ?, ?)',
      id,
      userId,
      nowMs,
    );
    return id;
  });
}

/** Gives a reserved generation back — the AI call failed, so it shouldn't count. */
export async function releaseAiUse(reservationId: string): Promise<void> {
  await database.run('DELETE FROM ai_usage WHERE id = ?', reservationId);
}

/** "in 3 hours", "in 12 minutes" — for telling the user when to come back. */
export function formatWait(untilMs: number, nowMs: number): string {
  const diff = Math.max(0, untilMs - nowMs);
  const minutes = Math.ceil(diff / 60000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}
