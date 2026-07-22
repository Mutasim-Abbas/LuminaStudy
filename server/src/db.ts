import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { env } from './env.js';

/**
 * `node:sqlite` is loaded through createRequire rather than a static import.
 * It is still flagged experimental, so Node omits it from
 * `module.builtinModules` — the list bundlers consult to decide what to leave
 * alone. Vite therefore strips the `node:` prefix, tries to resolve a bare
 * `sqlite` package, and fails. Going through require hands the specifier
 * straight to Node, which keeps the test runner working. Behaviour under
 * `tsx` and the compiled build is unchanged.
 */
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire('node:sqlite') as typeof import('node:sqlite');

/**
 * SQLite via Node's built-in `node:sqlite` (no native compilation). The schema
 * is intentionally portable — column types and constraints map cleanly onto
 * Postgres when we later move to a hosted database.
 */

mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });

export const db = new DatabaseSync(env.DATABASE_PATH);

// WAL improves read/write concurrency; foreign keys must be enabled per-connection.
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    email        TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at   INTEGER NOT NULL
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
`);

/**
 * Migrations for databases that already exist.
 *
 * The CREATE TABLE statements above only shape a *fresh* database — they are
 * no-ops once the table is there, so a column added after launch never appears
 * on a live install. SQLite has no `ADD COLUMN IF NOT EXISTS`, so we inspect
 * the table first. Adding a column with a NOT NULL default is safe to run
 * against a table with rows in it.
 */
function addColumnIfMissing(table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[];
  if (columns.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

addColumnIfMissing('users', 'name', "TEXT NOT NULL DEFAULT ''");

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: number;
}

export interface StudySetRow {
  id: string;
  user_id: string;
  subject: string;
  title: string;
  description: string;
  data: string;
  mastery: number;
  created_at: number;
  updated_at: number;
}
