import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { afterAll } from 'vitest';
import { describeDatabaseContract } from './databaseContract.js';
import { libsqlDatabase } from './libsqlDatabase.js';

/**
 * The libSQL backend against a local file — the same client and code path as
 * Turso, minus the network. (Not `:memory:`: libSQL gives each connection its
 * own in-memory database, and a transaction takes a connection of its own.)
 */
const dir = mkdtempSync(join(tmpdir(), 'lumina-libsql-'));
let n = 0;

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describeDatabaseContract('libSQL (Turso)', async () =>
  libsqlDatabase(createClient({ url: `file:${join(dir, `db-${++n}.db`)}` })),
);
