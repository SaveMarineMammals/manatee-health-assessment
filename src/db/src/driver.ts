/**
 * The seam between our SQL and whichever SQLite is underneath.
 *
 * On device that is expo-sqlite; in tests it is Node's built-in `node:sqlite`.
 * Both run the same statements against the same engine, so a migration or a
 * query proven in CI is the one the phone executes — the interface deliberately
 * exposes nothing that would let the two diverge.
 *
 * Synchronous by design. A breath tap has to feel instant and is written from a
 * touch handler; an async round trip there buys nothing at these data volumes
 * (hundreds of rows per assessment) and costs ordering guarantees.
 */
export interface SqlDriver {
  /** Run one or more statements for their effect. Used by migrations. */
  exec(sql: string): void;
  /** Run a parameterised statement for its effect. */
  run(sql: string, params?: readonly unknown[]): void;
  /** Every matching row. */
  all<T>(sql: string, params?: readonly unknown[]): T[];
  /** The first matching row, or undefined. */
  get<T>(sql: string, params?: readonly unknown[]): T | undefined;
  /**
   * Run `fn` inside a transaction, rolling back if it throws.
   *
   * Capture and the outbox entry it will gain in P4 must land together or not
   * at all, so this is not optional plumbing.
   */
  transaction<T>(fn: () => T): T;
}
