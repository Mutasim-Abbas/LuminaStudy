import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { env } from './env.js';
import { migrate } from './lib/migrate.js';
import { MIGRATIONS } from './migrations.js';

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

type Database = InstanceType<typeof DatabaseSync>;

/**
 * Opens (creating if needed) the database at `path` and brings its schema up
 * to date. The schema itself lives in migrations.ts; see lib/migrate.ts for
 * how versions are tracked.
 */
export function openDatabase(path: string): Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);

  // WAL improves read/write concurrency; foreign keys must be enabled per-connection.
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  migrate(db, MIGRATIONS);
  return db;
}

export const db = openDatabase(env.DATABASE_PATH);

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
