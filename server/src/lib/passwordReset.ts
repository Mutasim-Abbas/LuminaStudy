import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from '../db.js';

/**
 * Password-reset tokens.
 *
 * A valid token is a full account takeover, so it is treated like a credential:
 *  - 32 random bytes from the CSPRNG, far past guessing range.
 *  - Only its SHA-256 hash is stored, so a database leak yields no usable link.
 *    (Plain SHA-256 rather than scrypt is right here — unlike a password, the
 *    token is already high-entropy, so there is no dictionary to attack.)
 *  - Single use, and short lived.
 *  - Issuing a new one invalidates every earlier one for that account, so a
 *    link that leaked from an old email cannot be used after a fresh request.
 */

export const RESET_TTL_MINUTES = 30;
const RESET_TTL_MS = RESET_TTL_MINUTES * 60 * 1000;

/** Lookups are by hash, so the raw token never touches a query or a log. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Mint a token for a user and return the raw value — the only moment it exists
 * outside the recipient's inbox. Nothing stores it in recoverable form.
 */
export function createResetToken(userId: string, nowMs: number): string {
  // Any outstanding link for this account stops working the moment a new one
  // is requested.
  db.prepare('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL').run(
    nowMs,
    userId,
  );

  const token = randomBytes(32).toString('base64url');
  db.prepare(
    'INSERT INTO password_resets (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
  ).run(randomUUID(), userId, hashToken(token), nowMs, nowMs + RESET_TTL_MS);
  return token;
}

/**
 * Resolve a raw token to its user id, or null when it is unknown, already
 * spent, or past its expiry. Read-only — spending it is a separate step, so a
 * failed password validation doesn't burn the user's link.
 */
export function resolveResetToken(token: string, nowMs: number): string | null {
  const row = db
    .prepare('SELECT user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?')
    .get(hashToken(token)) as { user_id: string; expires_at: number; used_at: number | null } | undefined;

  if (!row) return null;
  if (row.used_at !== null) return null;
  if (row.expires_at <= nowMs) return null;
  return row.user_id;
}

/** Mark a token spent. Called only once the new password is actually stored. */
export function consumeResetToken(token: string, nowMs: number): void {
  db.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL').run(
    nowMs,
    hashToken(token),
  );
}

/** Housekeeping: drop rows that can no longer be used either way. */
export function pruneResetTokens(nowMs: number): void {
  db.prepare('DELETE FROM password_resets WHERE expires_at <= ? OR used_at IS NOT NULL').run(
    nowMs - RESET_TTL_MS,
  );
}
