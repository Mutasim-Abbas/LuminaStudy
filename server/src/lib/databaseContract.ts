import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from './database.js';

/**
 * What every database backend must do, run against each one (see the
 * *Database.test.ts files). If local SQLite and Turso both pass, code written
 * against the interface behaves the same on either.
 */
export function describeDatabaseContract(name: string, open: () => Promise<Database>) {
  describe(`${name} database`, () => {
    let db: Database;

    beforeEach(async () => {
      db = await open();
      await db.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)');
    });

    afterEach(async () => {
      await db.close();
    });

    it('reads and writes rows as plain objects, binding ? arguments', async () => {
      await db.run('INSERT INTO notes (id, body) VALUES (?, ?)', 1, 'cells');
      await db.run('INSERT INTO notes (id, body) VALUES (?, ?)', 2, 'genes');
      expect(await db.get('SELECT body FROM notes WHERE id = ?', 2)).toEqual({ body: 'genes' });
      expect(await db.all('SELECT id, body FROM notes ORDER BY id')).toEqual([
        { id: 1, body: 'cells' },
        { id: 2, body: 'genes' },
      ]);
    });

    it('returns undefined for a query with no rows', async () => {
      expect(await db.get('SELECT body FROM notes WHERE id = ?', 99)).toBeUndefined();
      expect(await db.all('SELECT body FROM notes')).toEqual([]);
    });

    it('reports how many rows a write changed', async () => {
      await db.exec("INSERT INTO notes (body) VALUES ('a'); INSERT INTO notes (body) VALUES ('b');");
      expect(await db.run("UPDATE notes SET body = 'c'")).toEqual({ changes: 2 });
      expect(await db.run('DELETE FROM notes WHERE id = ?', 99)).toEqual({ changes: 0 });
    });

    it('commits a transaction that succeeds', async () => {
      const result = await db.transaction(async (tx) => {
        await tx.run("INSERT INTO notes (body) VALUES ('kept')");
        return 'done';
      });
      expect(result).toBe('done');
      expect(await db.all('SELECT body FROM notes')).toEqual([{ body: 'kept' }]);
    });

    it('rolls back every write of a transaction that throws', async () => {
      await expect(
        db.transaction(async (tx) => {
          await tx.run("INSERT INTO notes (body) VALUES ('lost')");
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await db.all('SELECT body FROM notes')).toEqual([]);
    });

    it('keeps a concurrent write out of a transaction that rolls back', async () => {
      let opened!: () => void;
      const isOpen = new Promise<void>((r) => (opened = r));
      let release!: () => void;
      const held = new Promise<void>((r) => (release = r));

      const failing = db.transaction(async (tx) => {
        await tx.run("INSERT INTO notes (body) VALUES ('inside')");
        opened();
        await held;
        throw new Error('boom');
      });
      // Another request writes while the transaction is open and has written…
      await isOpen;
      const outside = db.run("INSERT INTO notes (body) VALUES ('outside')");
      release();

      await expect(failing).rejects.toThrow('boom');
      await outside;
      // …and its row survives the rollback.
      expect(await db.all('SELECT body FROM notes')).toEqual([{ body: 'outside' }]);
    });
  });
}
