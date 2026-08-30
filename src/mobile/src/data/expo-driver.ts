import * as SQLite from 'expo-sqlite';
import type { SqlDriver } from '@manatee/db';

/**
 * The only code in the app that touches expo-sqlite.
 *
 * Everything above it works against SqlDriver, which is why the migrations and
 * queries CI proves against node:sqlite are literally the ones running here.
 *
 * Synchronous on purpose: a breath is written from a touch handler and has to
 * feel instant. WAL keeps a write from blocking the reads that redraw the log.
 */
export function createExpoDriver(name = 'manatee.db'): SqlDriver {
  const db = SQLite.openDatabaseSync(name);
  db.execSync('PRAGMA journal_mode = WAL');

  return {
    exec: (sql) => db.execSync(sql),
    run: (sql, params = []) => {
      db.runSync(sql, params as SQLite.SQLiteBindValue[]);
    },
    all: <T>(sql: string, params: readonly unknown[] = []) =>
      db.getAllSync(sql, params as SQLite.SQLiteBindValue[]) as T[],
    get: <T>(sql: string, params: readonly unknown[] = []) =>
      (db.getFirstSync(sql, params as SQLite.SQLiteBindValue[]) ?? undefined) as T | undefined,
    transaction: <T>(fn: () => T): T => {
      db.execSync('BEGIN');
      try {
        const result = fn();
        db.execSync('COMMIT');
        return result;
      } catch (error) {
        db.execSync('ROLLBACK');
        throw error;
      }
    },
  };
}
