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
`);

export interface UserRow {
  id: string;
  email: string;
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
