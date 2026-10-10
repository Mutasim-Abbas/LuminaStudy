import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { env } from './env.js';
import type { Database as AsyncDatabase } from './lib/database.js';
import { migrate } from './lib/migrate.js';
import { sqliteDatabase } from './lib/sqliteDatabase.js';
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

type SqliteHandle = InstanceType<typeof DatabaseSync>;

/** Opens (creating if needed) a local SQLite file with the settings this app relies on. */
function openSqlite(path: string): SqliteHandle {
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

const handle = openSqlite(env.DATABASE_PATH);

/**
 * The raw handle, kept only while the tests move over to `database`. Shares
 * the connection, so both see the same data.
 */
export const db = handle;

/** The app's database, through the async interface. */
export const database: AsyncDatabase = sqliteDatabase(handle);
await runMigrations(database);

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
