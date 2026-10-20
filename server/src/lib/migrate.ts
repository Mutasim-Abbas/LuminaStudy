import type { Database } from './database.js';

/**
 * Versioned schema migrations.
 *
 * The schema version lives in SQLite's own `PRAGMA user_version` — an integer
 * in the database file header, which Turso supports too — so there is no
 * bookkeeping table to create first. Each migration runs in its own
 * transaction together with the version bump: SQLite's DDL is transactional,
 * so a migration that fails part-way leaves neither half a schema nor a
 * version that claims it finished.
 */

export interface Migration {
  /** 1, 2, 3, … — the database's `user_version` after this migration. */
  version: number;
  /** What it does, for the startup log. */
  name: string;
  /** Runs inside the migration's transaction; use the `tx` it is given. */
  up(tx: Database): Promise<void>;
}

export async function schemaVersion(db: Database): Promise<number> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  return Number(row?.user_version ?? 0);
}

/** Applies every migration above the database's version, in order. Returns the versions applied. */
export async function migrate(db: Database, migrations: readonly Migration[]): Promise<number[]> {
  // Versions must run 1, 2, 3, … with no gaps or repeats. A gap would be
  // skipped on new databases; a repeat would never run on existing ones.
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(`Migration "${m.name}" is numbered ${m.version} but is at position ${i + 1}.`);
    }
  });

  const current = await schemaVersion(db);
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
    await db.transaction(async (tx) => {
      await migration.up(tx);
      // PRAGMA takes no bound parameters; the version is a number we own.
      await tx.exec(`PRAGMA user_version = ${migration.version}`);
    });
    applied.push(migration.version);
  }
  return applied;
}
