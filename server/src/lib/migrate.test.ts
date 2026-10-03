import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { migrate, schemaVersion, type Migration } from './migrate.js';

// Loaded through require for the same reason as in db.ts: Vite would strip the
// `node:` prefix from a static import of this still-experimental module.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

function freshDb() {
  return new DatabaseSync(':memory:');
}

function tables(db: InstanceType<typeof DatabaseSync>): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

const MIGRATIONS: Migration[] = [
  { version: 1, name: 'create a', up: (db) => db.exec('CREATE TABLE a (id INTEGER PRIMARY KEY)') },
  { version: 2, name: 'create b', up: (db) => db.exec('CREATE TABLE b (id INTEGER PRIMARY KEY)') },
];

describe('migrate', () => {
  it('applies every migration to a fresh database, in order', () => {
    const db = freshDb();
    expect(migrate(db, MIGRATIONS)).toEqual([1, 2]);
    expect(schemaVersion(db)).toBe(2);
    expect(tables(db)).toEqual(['a', 'b']);
  });

  it('applies nothing to a database that is already current', () => {
    const db = freshDb();
    migrate(db, MIGRATIONS);
    expect(migrate(db, MIGRATIONS)).toEqual([]);
    expect(schemaVersion(db)).toBe(2);
  });

  it('rolls a failing migration back completely', () => {
    const db = freshDb();
    const broken: Migration = {
      version: 1,
      name: 'half done',
      up: (d) => {
        d.exec('CREATE TABLE half (id INTEGER PRIMARY KEY)');
        throw new Error('boom');
      },
    };
    expect(() => migrate(db, [broken])).toThrow('boom');
    // Neither the table it created nor the version bump survive.
    expect(tables(db)).toEqual([]);
    expect(schemaVersion(db)).toBe(0);
  });

  it('keeps earlier migrations when a later one fails', () => {
    const db = freshDb();
    const failing: Migration = {
      version: 2,
      name: 'fails',
      up: () => {
        throw new Error('boom');
      },
    };
    expect(() => migrate(db, [MIGRATIONS[0]!, failing])).toThrow('boom');
    // Migration 1 committed on its own, so the next boot resumes at 2.
    expect(tables(db)).toEqual(['a']);
    expect(schemaVersion(db)).toBe(1);
  });
});
