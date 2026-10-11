import type { Client, ResultSet, Transaction } from '@libsql/client';
import type { Database, SqlValue } from './database.js';

/**
 * The Database interface over libSQL — Turso in production, where the server
 * runs as a stateless Vercel function and the database is reached over the
 * network.
 *
 * Two things differ from local SQLite and the rest of the code allows for:
 *  - Connection settings such as `PRAGMA foreign_keys` don't carry from one
 *    request to the next, so nothing relies on them (deletes are explicit).
 *  - A transaction holds Turso's write lock across several round trips. Calls
 *    from this process wait their turn rather than collide with it, the same
 *    rule as the local backend.
 */

function rowsOf<T>(result: ResultSet): T[] {
  return result.rows.map(
    (row) => Object.fromEntries(result.columns.map((column, i) => [column, row[i]])) as T,
  );
}

/** Statements against the client or an open transaction, without queueing. */
function statements(target: Client | Transaction): Database {
  return {
    async get<T>(sql: string, ...args: SqlValue[]) {
      return rowsOf<T>(await target.execute({ sql, args }))[0];
    },
    async all<T>(sql: string, ...args: SqlValue[]) {
      return rowsOf<T>(await target.execute({ sql, args }));
    },
    async run(sql: string, ...args: SqlValue[]) {
      const result = await target.execute({ sql, args });
      return { changes: result.rowsAffected };
    },
    async exec(sql: string) {
      await target.executeMultiple(sql);
    },
    transaction() {
      return Promise.reject(new Error('Transactions cannot be nested.'));
    },
    async close() {
      target.close();
    },
  };
}

export function libsqlDatabase(client: Client): Database {
  let queue: Promise<unknown> = Promise.resolve();

  /** Runs `task` after everything queued before it, success or failure. */
  function inTurn<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task, task);
    queue = result.catch(() => {});
    return result;
  }

  const direct = statements(client);

  async function inTransaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    const tx = await client.transaction('write');
    try {
      const result = await fn(statements(tx));
      await tx.commit();
      return result;
    } catch (err) {
      await tx.rollback();
      throw err;
    } finally {
      tx.close();
    }
  }

  return {
    get: <T>(sql: string, ...args: SqlValue[]) => inTurn(() => direct.get<T>(sql, ...args)),
    all: <T>(sql: string, ...args: SqlValue[]) => inTurn(() => direct.all<T>(sql, ...args)),
    run: (sql, ...args) => inTurn(() => direct.run(sql, ...args)),
    exec: (sql) => inTurn(() => direct.exec(sql)),
    transaction: (fn) => inTurn(() => inTransaction(fn)),
    close: () => inTurn(() => direct.close()),
  };
}
