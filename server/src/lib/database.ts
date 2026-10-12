/**
 * The one way the server talks to its database.
 *
 * Every call is async, so the same code runs against a local SQLite file
 * (development, tests, the Docker image) and against Turso — hosted SQLite,
 * reached over the network — when the server runs as a stateless function on
 * Vercel. Each backend implements this interface; the SQL is the same.
 *
 * Arguments bind to `?` placeholders. Rows come back as plain objects keyed by
 * column name.
 */

export type SqlValue = string | number | bigint | null | Uint8Array;

export interface Database {
  /** First row of a query, or undefined when there is none. */
  get<T>(sql: string, ...args: SqlValue[]): Promise<T | undefined>;
  /** Every row of a query. */
  all<T>(sql: string, ...args: SqlValue[]): Promise<T[]>;
  /** A write. Resolves to how many rows it changed. */
  run(sql: string, ...args: SqlValue[]): Promise<{ changes: number }>;
  /** Several statements separated by semicolons, with no arguments (schema work). */
  exec(sql: string): Promise<void>;
  /**
   * Runs `fn` in one transaction: committed if it resolves, rolled back if it
   * throws. Inside, use the `tx` it is given — not the outer database.
   */
  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
