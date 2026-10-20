import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './db.js';
import type { Database } from './lib/database.js';
import { schemaVersion } from './lib/migrate.js';
import { sqliteDatabase } from './lib/sqliteDatabase.js';
import { MIGRATIONS } from './migrations.js';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

/**
 * Real database files, because the live database is one: these are the
 * upgrades a deployed volume goes through on the first boot of a new build.
 */

const dirs: string[] = [];
const open: Database[] = [];

function tempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-db-'));
  dirs.push(dir);
  return join(dir, 'lumina.db');
}

async function openForTest(path: string): Promise<Database> {
  const db = await openDatabase(path);
  open.push(db);
  return db;
}

afterEach(async () => {
  for (const db of open.splice(0)) await db.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A database as the server left it before migrations were versioned: tables, version 0. */
async function preVersioningDb(path: string, { withName }: { withName: boolean }) {
  const db = sqliteDatabase(new DatabaseSync(path));
  await MIGRATIONS[0]!.up(db);
  if (withName) await db.exec("ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT ''");
  await db.run(
    'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
    'u1',
    'ada@example.com',
    'hash',
    1,
  );
  await db.run(
    'INSERT INTO study_sets (id, user_id, title, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    's1',
    'u1',
    'Biology',
    '{"cards":[],"quiz":[]}',
    1,
    1,
  );
  expect(await schemaVersion(db)).toBe(0);
  await db.close();
}

describe('openDatabase', () => {
  it('upgrades a database from before versioning without losing rows', async () => {
    const path = tempDbPath();
    await preVersioningDb(path, { withName: true });

    const db = await openForTest(path);
    expect(await schemaVersion(db)).toBe(MIGRATIONS.length);
    expect(await db.all('SELECT email, name FROM users')).toEqual([
      { email: 'ada@example.com', name: '' },
    ]);
    expect(await db.all('SELECT title FROM study_sets')).toEqual([{ title: 'Biology' }]);
  });

  it('adds users.name to an old database that never got it', async () => {
    const path = tempDbPath();
    await preVersioningDb(path, { withName: false });

    const db = await openForTest(path);
    expect(await db.all('SELECT name FROM users')).toEqual([{ name: '' }]);
  });

  it('creates a new database file at the latest version, with every table', async () => {
    const db = await openForTest(tempDbPath());
    expect(await schemaVersion(db)).toBe(MIGRATIONS.length);
    const tables = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    expect(tables.map((t) => t.name)).toEqual([
      'ai_usage',
      'captcha_challenges',
      'login_attempts',
      'password_resets',
      'sessions',
      'study_sets',
      'users',
    ]);
  });

  it('lets many accounts have no Google id, but no two share one', async () => {
    const db = await openForTest(tempDbPath());
    const insert = (id: string, email: string, sub: string | null) =>
      db.run(
        "INSERT INTO users (id, email, password_hash, created_at, google_sub) VALUES (?, ?, '', 1, ?)",
        id,
        email,
        sub,
      );
    await insert('u1', 'a@example.com', null);
    await insert('u2', 'b@example.com', null);
    await insert('u3', 'c@example.com', 'google-123');
    await expect(insert('u4', 'd@example.com', 'google-123')).rejects.toThrow(/UNIQUE/);
  });

  it('sets up the connection the way Litestream needs it', async () => {
    const db = await openForTest(tempDbPath());
    const pragma = async (name: string) =>
      Object.values((await db.get<Record<string, unknown>>(`PRAGMA ${name}`))!)[0];
    expect(await pragma('journal_mode')).toBe('wal');
    expect(await pragma('foreign_keys')).toBe(1);
    expect(await pragma('busy_timeout')).toBe(5000);
    expect(await pragma('synchronous')).toBe(1); // NORMAL
  });
});
