import { DatabaseSync } from 'node:sqlite';
import type { SqlDriver } from './driver.js';

/**
 * A driver over Node's built-in SQLite, for tests.
 *
 * Node ships the same SQLite the phone runs, so migrations and queries proven
 * here are the ones expo-sqlite executes on device. Nothing to install and no
 * native build step, which matters for a CI job that already builds a Docker
 * image and a schema package.
 */
export function createNodeDriver(filename = ':memory:'): SqlDriver & { close(): void } {
  const db = new DatabaseSync(filename);

  return {
    exec: (sql) => db.exec(sql),
    run: (sql, params = []) => {
      db.prepare(sql).run(...(params as never[]));
    },
    all: <T>(sql: string, params: readonly unknown[] = []) =>
      db.prepare(sql).all(...(params as never[])) as T[],
    get: <T>(sql: string, params: readonly unknown[] = []) =>
      db.prepare(sql).get(...(params as never[])) as T | undefined,
    transaction: <T>(fn: () => T): T => {
      db.exec('BEGIN');
      try {
        const result = fn();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => db.close(),
  };
}
