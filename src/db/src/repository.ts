import type { BreathEvent } from '@manatee/core';
import type { SqlDriver } from './driver.js';

export interface Assessment {
  id: string;
  name: string;
  protocol: string;
  protocolVersion: string;
  startedAt: string;
  endedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  notes: string | null;
}

interface AssessmentRow {
  id: string;
  name: string;
  protocol: string;
  protocol_version: string;
  started_at: string;
  ended_at: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  notes: string | null;
}

interface BreathRow {
  id: string;
  sequence: number;
  recorded_at: string;
  elapsed_ms: number;
  voided_at: string | null;
}

function toAssessment(row: AssessmentRow): Assessment {
  return {
    id: row.id,
    name: row.name,
    protocol: row.protocol,
    protocolVersion: row.protocol_version,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyMeters: row.accuracy_meters,
    notes: row.notes,
  };
}

function toBreath(row: BreathRow): BreathEvent {
  return {
    id: row.id,
    sequence: row.sequence,
    recordedAt: row.recorded_at,
    elapsedMs: row.elapsed_ms,
    voidedAt: row.voided_at,
  };
}

export interface CreateAssessmentInput {
  id: string;
  name: string;
  protocol: string;
  protocolVersion: string;
  startedAt: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  notes?: string | null;
}

export interface RecordBreathInput {
  id: string;
  assessmentId: string;
  recordedAt: string;
  elapsedMs: number;
}

/**
 * All database access for the tracker.
 *
 * Deliberately a set of plain functions over a driver rather than an ORM: the
 * SQL is short enough to read, and keeping it literal is what makes "the same
 * statements run on device and in CI" a fact rather than an aspiration.
 */
export function createRepository(driver: SqlDriver, now: () => string) {
  return {
    createAssessment(input: CreateAssessmentInput): Assessment {
      const timestamp = now();
      driver.run(
        `INSERT INTO assessments
           (id, name, protocol, protocol_version, started_at, ended_at,
            latitude, longitude, accuracy_meters, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
        [
          input.id,
          input.name,
          input.protocol,
          input.protocolVersion,
          input.startedAt,
          input.latitude ?? null,
          input.longitude ?? null,
          input.accuracyMeters ?? null,
          input.notes ?? null,
          timestamp,
          timestamp,
        ],
      );
      return this.getAssessment(input.id)!;
    },

    getAssessment(id: string): Assessment | undefined {
      const row = driver.get<AssessmentRow>('SELECT * FROM assessments WHERE id = ?', [id]);
      return row ? toAssessment(row) : undefined;
    },

    /** The assessment still being tracked, if any. At most one is open at a time. */
    getOpenAssessment(): Assessment | undefined {
      const row = driver.get<AssessmentRow>(
        'SELECT * FROM assessments WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1',
      );
      return row ? toAssessment(row) : undefined;
    },

    listAssessments(): Assessment[] {
      return driver
        .all<AssessmentRow>('SELECT * FROM assessments ORDER BY started_at DESC')
        .map(toAssessment);
    },

    endAssessment(id: string, endedAt: string): void {
      driver.run('UPDATE assessments SET ended_at = ?, updated_at = ? WHERE id = ?', [
        endedAt,
        now(),
        id,
      ]);
    },

    /**
     * Appends a breath.
     *
     * The sequence number is allocated inside the same transaction as the
     * insert, so two taps racing cannot both claim the same one — the unique
     * index would reject the second, and losing a breath to a lost race is not
     * an acceptable failure here.
     */
    recordBreath(input: RecordBreathInput): BreathEvent {
      return driver.transaction(() => {
        const row = driver.get<{ next: number }>(
          'SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM breath_events WHERE assessment_id = ?',
          [input.assessmentId],
        );
        const sequence = row?.next ?? 1;

        driver.run(
          `INSERT INTO breath_events
             (id, assessment_id, sequence, recorded_at, elapsed_ms, voided_at, created_at)
           VALUES (?, ?, ?, ?, ?, NULL, ?)`,
          [input.id, input.assessmentId, sequence, input.recordedAt, input.elapsedMs, now()],
        );

        return {
          id: input.id,
          sequence,
          recordedAt: input.recordedAt,
          elapsedMs: input.elapsedMs,
          voidedAt: null,
        };
      });
    },

    /** Every breath including voided ones — the raw log, in recorded order. */
    listBreaths(assessmentId: string): BreathEvent[] {
      return driver
        .all<BreathRow>(
          'SELECT id, sequence, recorded_at, elapsed_ms, voided_at FROM breath_events WHERE assessment_id = ? ORDER BY elapsed_ms ASC',
          [assessmentId],
        )
        .map(toBreath);
    },

    /** Marks a breath withdrawn. The row stays; every derivation drops it. */
    voidBreath(id: string, voidedAt: string): void {
      driver.run('UPDATE breath_events SET voided_at = ? WHERE id = ? AND voided_at IS NULL', [
        voidedAt,
        id,
      ]);
    },

    /**
     * The furthest point an assessment is known to have reached, used to
     * re-anchor elapsed time after a restart.
     */
    lastElapsedMs(assessmentId: string): number {
      const row = driver.get<{ max_elapsed: number | null }>(
        'SELECT MAX(elapsed_ms) AS max_elapsed FROM breath_events WHERE assessment_id = ?',
        [assessmentId],
      );
      return row?.max_elapsed ?? 0;
    },
  };
}

export type Repository = ReturnType<typeof createRepository>;
