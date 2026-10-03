import type { Migration } from './lib/migrate.js';

/**
 * The schema's history, oldest first. Append to this list — never edit or
 * reorder a migration that has shipped, since live databases have already
 * run it and will not run it again.
 *
 * Databases created before versioning existed report version 0 but already
 * have these tables, so the early migrations are written to be harmless on
 * them: `IF NOT EXISTS` for the baseline, and a column check for `name`.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'baseline schema',
    up: (db) =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id            TEXT PRIMARY KEY,
          email         TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          created_at    INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS study_sets (
          id          TEXT PRIMARY KEY,
          user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          subject     TEXT NOT NULL DEFAULT '',
          title       TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          -- Cards + quiz are stored as JSON; the app treats a set as one document.
          data        TEXT NOT NULL,
          mastery     INTEGER NOT NULL DEFAULT 0,
          created_at  INTEGER NOT NULL,
          updated_at  INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_study_sets_user ON study_sets(user_id, updated_at DESC);

        -- One row per AI generation, used to enforce the free daily quota. Kept as an
        -- append-only log rather than a counter so the window can slide (and so usage
        -- stays auditable) instead of resetting on a fixed clock boundary.
        CREATE TABLE IF NOT EXISTS ai_usage (
          id         TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_ai_usage_user_time ON ai_usage(user_id, created_at DESC);

        -- Failed sign-in attempts, for per-account lockout. Cleared on success.
        CREATE TABLE IF NOT EXISTS login_attempts (
          id         TEXT PRIMARY KEY,
          email      TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(email, created_at DESC);

        -- Password-reset tokens. Only a SHA-256 hash of each token is stored, exactly
        -- like a password: whoever holds the raw token can take over the account, so a
        -- database leak must not hand out working reset links. Rows are kept after use
        -- (marked via used_at) rather than deleted, so a replayed link is rejected
        -- explicitly instead of looking like an unknown token.
        CREATE TABLE IF NOT EXISTS password_resets (
          id         TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          used_at    INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id, created_at DESC);
      `),
  },
];
