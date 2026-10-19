import type { DatabaseSync } from 'node:sqlite';

/**
 * Versioned schema migrations.
 *
 * The schema version lives in SQLite's own `PRAGMA user_version` — an integer
 * in the database file header — so there is no bookkeeping table to create
 * first. Each migration runs in its own transaction together with the version
 * bump: SQLite's DDL is transactional, so a migration that fails part-way
 * leaves neither half a schema nor a version that claims it finished.
 */

export interface Migration {
  /** 1, 2, 3, … — the database's `user_version` after this migration. */
  version: number;
  /** What it does, for the startup log. */
  name: string;
  up(db: DatabaseSync): void;
}

export function schemaVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  return row.user_version;
}

/** Applies every migration above the database's version, in order. Returns the versions applied. */
export function migrate(db: DatabaseSync, migrations: readonly Migration[]): number[] {
  const current = schemaVersion(db);
  const applied: number[] = [];

  for (const migration of migrations) {
    if (migration.version <= current) continue;
    db.exec('BEGIN');
    try {
      migration.up(db);
      // PRAGMA takes no bound parameters; the version is a number we own.
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    applied.push(migration.version);
  }

  return applied;
}
