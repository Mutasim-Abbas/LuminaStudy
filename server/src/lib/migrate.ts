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
  // Versions must run 1, 2, 3, … with no gaps or repeats. A gap would be
  // skipped on new databases; a repeat would never run on existing ones.
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(`Migration "${m.name}" is numbered ${m.version} but is at position ${i + 1}.`);
    }
  });

  const current = schemaVersion(db);
  const latest = migrations.at(-1)?.version ?? 0;

  // A database written by a newer build — typically after rolling a deploy
  // back. This code doesn't know that schema, so writing to it could corrupt
  // data the newer code relies on. Refuse rather than guess.
  if (current > latest) {
    throw new Error(
      `Database schema is at version ${current}, but this build only knows up to ${latest}. ` +
        'Deploy a build that includes the newer migrations.',
    );
  }

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
