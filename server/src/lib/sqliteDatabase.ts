import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { Database, SqlValue } from './database.js';

/**
 * The Database interface over Node's built-in, synchronous SQLite — used for
 * local development, tests, and the Docker image's file on a volume.
 *
 * One statement always runs to completion before the next, but a transaction
 * spans several awaits. While one is open, every other caller waits its turn:
 * otherwise another request's write would land inside the transaction and be
 * rolled back with it.
 */
export function sqliteDatabase(handle: DatabaseSync): Database {
  let queue: Promise<unknown> = Promise.resolve();

  /** Runs `task` after everything queued before it, success or failure. */
  function inTurn<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task, task);
    queue = result.catch(() => {});
    return result;
  }

  const bind = (args: SqlValue[]) => args as SQLInputValue[];

  /** Statements without queueing — for use inside a transaction that already holds the turn. */
  const direct: Database = {
    async get<T>(sql: string, ...args: SqlValue[]) {
      return handle.prepare(sql).get(...bind(args)) as T | undefined;
    },
    async all<T>(sql: string, ...args: SqlValue[]) {
      return handle.prepare(sql).all(...bind(args)) as T[];
    },
    async run(sql: string, ...args: SqlValue[]) {
      const { changes } = handle.prepare(sql).run(...bind(args));
      return { changes: Number(changes) };
    },
    async exec(sql: string) {
      handle.exec(sql);
    },
    transaction() {
      return Promise.reject(new Error('Transactions cannot be nested.'));
    },
    async close() {
      handle.close();
    },
  };

  async function inTransaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    handle.exec('BEGIN');
    try {
      const result = await fn(direct);
      handle.exec('COMMIT');
      return result;
    } catch (err) {
      handle.exec('ROLLBACK');
      throw err;
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
