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
    up: (tx) =>
      tx.exec(`
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
  {
    version: 2,
    name: 'users.name',
    up: async (tx) => {
      // Before versioning, this column was added by a startup check, so some
      // version-0 databases already have it. SQLite has no ADD COLUMN IF NOT
      // EXISTS; look first. A NOT NULL column with a default is safe to add to
      // a table that has rows.
      const columns = await tx.all<{ name: string }>('PRAGMA table_info(users)');
      if (!columns.some((c) => c.name === 'name')) {
        await tx.exec("ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT ''");
      }
    },
  },
  {
    version: 3,
    name: 'users.google_sub',
    up: (tx) =>
      // Google's stable account id (the ID token's `sub`), never its email,
      // which a Google account can change. SQLite can't add a UNIQUE column, so
      // uniqueness is a separate index; it allows any number of NULLs.
      //
      // Accounts created through Google have no password. SQLite can only drop
      // the NOT NULL on password_hash by rebuilding `users`, and with foreign
      // keys on, dropping the old table would cascade-delete every study set.
      // So a password-less account stores an empty hash instead.
      tx.exec(`
        ALTER TABLE users ADD COLUMN google_sub TEXT;
        CREATE UNIQUE INDEX idx_users_google_sub ON users(google_sub);
      `),
  },
];
