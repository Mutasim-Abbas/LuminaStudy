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
  // Litestream briefly locks the database while it checkpoints the WAL into
  // the main file. Without a timeout a write that lands in that moment fails
  // with SQLITE_BUSY at once; with one it waits its turn.
  db.exec('PRAGMA busy_timeout = 5000;');
  // In WAL mode NORMAL stays crash-safe for the database file; it only skips
  // an fsync on every commit, so a power cut can lose the last few commits —
  // which Litestream has usually shipped already. The usual pairing with WAL.
  db.exec('PRAGMA synchronous = NORMAL;');

  // Logged so a deploy that changes the schema says so in the host's logs.
  for (const version of migrate(db, MIGRATIONS)) {
    console.info(`[db] applied migration ${version}: ${MIGRATIONS[version - 1]!.name}`);
  }
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
