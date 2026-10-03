import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './db.js';
import { schemaVersion } from './lib/migrate.js';
import { MIGRATIONS } from './migrations.js';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

/**
 * Real database files, because the live database is one: these are the
 * upgrades a deployed volume goes through on the first boot of a new build.
 */

const dirs: string[] = [];

function tempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-db-'));
  dirs.push(dir);
  return join(dir, 'lumina.db');
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A database as the server left it before migrations were versioned: tables, version 0. */
function preVersioningDb(path: string, { withName }: { withName: boolean }) {
  const db = new DatabaseSync(path);
  MIGRATIONS[0]!.up(db);
  if (withName) db.exec("ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT ''");
  db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
    'u1',
    'ada@example.com',
    'hash',
    1,
  );
  db.prepare(
    'INSERT INTO study_sets (id, user_id, title, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run('s1', 'u1', 'Biology', '{"cards":[],"quiz":[]}', 1, 1);
  expect(schemaVersion(db)).toBe(0);
  db.close();
}

describe('openDatabase', () => {
  it('upgrades a database from before versioning without losing rows', () => {
    const path = tempDbPath();
    preVersioningDb(path, { withName: true });

    const db = openDatabase(path);
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
    expect(db.prepare('SELECT email, name FROM users').all()).toEqual([
      { email: 'ada@example.com', name: '' },
    ]);
    expect(db.prepare('SELECT title FROM study_sets').all()).toEqual([{ title: 'Biology' }]);
    db.close();
  });

  it('adds users.name to an old database that never got it', () => {
    const path = tempDbPath();
    preVersioningDb(path, { withName: false });

    const db = openDatabase(path);
    expect(db.prepare('SELECT name FROM users').all()).toEqual([{ name: '' }]);
    db.close();
  });

  it('creates a new database file at the latest version, with every table', () => {
    const path = tempDbPath();
    const db = openDatabase(path);
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toEqual([
      'ai_usage',
      'login_attempts',
      'password_resets',
      'study_sets',
      'users',
    ]);
    db.close();
  });
});
