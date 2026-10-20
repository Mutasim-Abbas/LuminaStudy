import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { Database } from './database.js';
import { migrate, schemaVersion, type Migration } from './migrate.js';
import { sqliteDatabase } from './sqliteDatabase.js';

// Loaded through require for the same reason as in db.ts: Vite would strip the
// `node:` prefix from a static import of this still-experimental module.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

function freshDb(): Database {
  return sqliteDatabase(new DatabaseSync(':memory:'));
}

async function tables(db: Database): Promise<string[]> {
  const rows = await db.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  );
  return rows.map((r) => r.name);
}

const MIGRATIONS: Migration[] = [
  { version: 1, name: 'create a', up: (tx) => tx.exec('CREATE TABLE a (id INTEGER PRIMARY KEY)') },
  { version: 2, name: 'create b', up: (tx) => tx.exec('CREATE TABLE b (id INTEGER PRIMARY KEY)') },
];

describe('migrate', () => {
  it('applies every migration to a fresh database, in order', async () => {
    const db = freshDb();
    expect(await migrate(db, MIGRATIONS)).toEqual([1, 2]);
    expect(await schemaVersion(db)).toBe(2);
    expect(await tables(db)).toEqual(['a', 'b']);
  });

  it('applies nothing to a database that is already current', async () => {
    const db = freshDb();
    await migrate(db, MIGRATIONS);
    expect(await migrate(db, MIGRATIONS)).toEqual([]);
    expect(await schemaVersion(db)).toBe(2);
  });

  it('rolls a failing migration back completely', async () => {
    const db = freshDb();
    const broken: Migration = {
      version: 1,
      name: 'half done',
      up: async (tx) => {
        await tx.exec('CREATE TABLE half (id INTEGER PRIMARY KEY)');
        throw new Error('boom');
      },
    };
    await expect(migrate(db, [broken])).rejects.toThrow('boom');
    // Neither the table it created nor the version bump survive.
    expect(await tables(db)).toEqual([]);
    expect(await schemaVersion(db)).toBe(0);
  });

  it('keeps earlier migrations when a later one fails', async () => {
    const db = freshDb();
    const failing: Migration = {
      version: 2,
      name: 'fails',
      up: async () => {
        throw new Error('boom');
      },
    };
    await expect(migrate(db, [MIGRATIONS[0]!, failing])).rejects.toThrow('boom');
    // Migration 1 committed on its own, so the next boot resumes at 2.
    expect(await tables(db)).toEqual(['a']);
    expect(await schemaVersion(db)).toBe(1);
  });

  it('refuses a database from a newer build', async () => {
    const db = freshDb();
    await db.exec('PRAGMA user_version = 3');
    await expect(migrate(db, MIGRATIONS)).rejects.toThrow(/version 3.*only knows up to 2/);
    expect(await tables(db)).toEqual([]);
  });

  it.each([
    ['a gap', [MIGRATIONS[0]!, { ...MIGRATIONS[1]!, version: 3 }]],
    ['a repeat', [MIGRATIONS[0]!, { ...MIGRATIONS[1]!, version: 1 }]],
    ['the wrong order', [MIGRATIONS[1]!, MIGRATIONS[0]!]],
  ])('rejects a migration list with %s before touching the database', async (_case, list) => {
    const db = freshDb();
    await expect(migrate(db, list)).rejects.toThrow(/is numbered/);
    expect(await tables(db)).toEqual([]);
    expect(await schemaVersion(db)).toBe(0);
  });
});
