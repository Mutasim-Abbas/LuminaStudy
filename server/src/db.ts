import { mkdirSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { createClient } from '@libsql/client';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { env } from './env.js';
import type { Database as AsyncDatabase } from './lib/database.js';
import { libsqlDatabase } from './lib/libsqlDatabase.js';
import { migrate } from './lib/migrate.js';
import { sqliteDatabase } from './lib/sqliteDatabase.js';
import { MIGRATIONS } from './migrations.js';

/**
 * Local SQLite via Node's built-in `node:sqlite` (no native compilation),
 * loaded only when a local file is actually used — a deploy on Turso never
 * touches it.
 *
 * It is loaded through createRequire rather than a static import. The module
 * is still flagged experimental, so Node omits it from `module.builtinModules`
 * — the list bundlers consult to decide what to leave alone. Vite therefore
 * strips the `node:` prefix, tries to resolve a bare `sqlite` package, and
 * fails. Going through require hands the specifier straight to Node, which
 * keeps the test runner working.
 */
const nodeRequire = createRequire(import.meta.url);

/** Opens (creating if needed) a local SQLite file with the settings this app relies on. */
function openSqlite(path: string): DatabaseSync {
  const { DatabaseSync } = nodeRequire('node:sqlite') as typeof import('node:sqlite');
  mkdirSync(dirname(path), { recursive: true });
  const handle = new DatabaseSync(path);

  // WAL improves read/write concurrency; foreign keys must be enabled per-connection.
  handle.exec('PRAGMA journal_mode = WAL;');
  handle.exec('PRAGMA foreign_keys = ON;');
  // Litestream briefly locks the database while it checkpoints the WAL into
  // the main file. Without a timeout a write that lands in that moment fails
  // with SQLITE_BUSY at once; with one it waits its turn.
  handle.exec('PRAGMA busy_timeout = 5000;');
  // In WAL mode NORMAL stays crash-safe for the database file; it only skips
  // an fsync on every commit, so a power cut can lose the last few commits —
  // which Litestream has usually shipped already. The usual pairing with WAL.
  handle.exec('PRAGMA synchronous = NORMAL;');
  return handle;
}

/** Brings a database's schema up to date (migrations.ts), logging what ran. */
async function runMigrations(database: AsyncDatabase): Promise<void> {
  // Logged so a deploy that changes the schema says so in the host's logs.
  for (const version of await migrate(database, MIGRATIONS)) {
    console.info(`[db] applied migration ${version}: ${MIGRATIONS[version - 1]!.name}`);
  }
}

/**
 * Opens the database at `path`, schema up to date, through the async
 * interface (lib/database.ts).
 */
export async function openDatabase(path: string): Promise<AsyncDatabase> {
  const database = sqliteDatabase(openSqlite(path));
  await runMigrations(database);
  return database;
}

/**
 * Opens a libSQL database — Turso (`libsql://…` with its token) or a local
 * `file:` URL — schema up to date.
 */
export async function openTurso(url: string, authToken?: string): Promise<AsyncDatabase> {
  const database = libsqlDatabase(createClient({ url, authToken }));
  await runMigrations(database);
  return database;
}

/**
 * The app's database, through the async interface: Turso when DATABASE_URL is
 * set (a stateless deploy such as Vercel), otherwise the local SQLite file.
 */
export const database: AsyncDatabase = env.DATABASE_URL
  ? await openTurso(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN)
  : await openDatabase(env.DATABASE_PATH);

export interface UserRow {
  id: string;
  email: string;
  name: string;
  /** Empty for accounts created through Google, which have no password. */
  password_hash: string;
  /** Google's account id once Google sign-in is linked, else null. */
  google_sub: string | null;
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
