import type { SqlDriver } from './driver.js';

/**
 * Schema migrations, applied in order and tracked by SQLite's own
 * `user_version` pragma.
 *
 * Append only. A shipped migration is never edited — a phone in the field is
 * routinely running a build from months back, and rewriting history here means
 * two devices claiming the same version with different schemas.
 *
 * Notes on the shape of `breath_events`:
 *
 *   `elapsed_ms` is the monotonic value every derived number is computed from.
 *   `recorded_at` is the wall clock, stored because it is what the record says
 *   and what a human reads, and deliberately never used for arithmetic.
 *
 *   `voided_at` rather than DELETE. Mis-taps are certain with a tap-per-breath
 *   interface, and this is scientific data — a withdrawn breath still happened
 *   as an observation and stays visible in the log.
 */
export const MIGRATIONS: readonly string[] = [
  // 1 — assessments and their breath log
  `
  CREATE TABLE assessments (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    protocol         TEXT NOT NULL,
    protocol_version TEXT NOT NULL,
    started_at       TEXT NOT NULL,
    ended_at         TEXT,
    latitude         REAL,
    longitude        REAL,
    accuracy_meters  REAL,
    notes            TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );

  CREATE TABLE breath_events (
    id            TEXT PRIMARY KEY,
    assessment_id TEXT NOT NULL REFERENCES assessments(id),
    sequence      INTEGER NOT NULL,
    recorded_at   TEXT NOT NULL,
    elapsed_ms    INTEGER NOT NULL,
    voided_at     TEXT,
    created_at    TEXT NOT NULL
  );

  CREATE INDEX breath_events_by_assessment
    ON breath_events (assessment_id, elapsed_ms);

  CREATE UNIQUE INDEX breath_events_sequence
    ON breath_events (assessment_id, sequence);
  `,
];

/** The schema version this build expects. */
export const SCHEMA_VERSION = MIGRATIONS.length;

function currentVersion(driver: SqlDriver): number {
  const row = driver.get<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * Brings a database up to `SCHEMA_VERSION`.
 *
 * Refuses to run against a database written by a *newer* build rather than
 * guessing. That happens when someone installs an older build over a newer one,
 * and silently downgrading would mean writing rows the newer schema can no
 * longer read.
 */
export function migrate(driver: SqlDriver): { from: number; to: number } {
  const from = currentVersion(driver);

  if (from > SCHEMA_VERSION) {
    throw new Error(
      `Database is at schema version ${from} but this build only knows ${SCHEMA_VERSION}. ` +
        `It was written by a newer build; install that build rather than downgrading.`,
    );
  }

  driver.exec('PRAGMA foreign_keys = ON');

  for (let version = from; version < SCHEMA_VERSION; version += 1) {
    const sql = MIGRATIONS[version]!;
    driver.transaction(() => {
      driver.exec(sql);
      // PRAGMA does not accept bound parameters; the value is a loop counter.
      driver.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }

  return { from, to: SCHEMA_VERSION };
}
