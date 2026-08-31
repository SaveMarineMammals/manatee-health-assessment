import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { intervalsFrom, summarise } from '@manatee/core';
import { createNodeDriver } from './node-driver.js';
import { MIGRATIONS, SCHEMA_VERSION, migrate } from './migrations.js';
import { createAlarmRepository, createRepository, type Repository } from './repository.js';

const START = '2026-02-14T14:05:00.000Z';

let driver: ReturnType<typeof createNodeDriver>;
let repo: Repository;
let clockValue = START;

beforeEach(() => {
  driver = createNodeDriver();
  migrate(driver);
  clockValue = START;
  repo = createRepository(driver, () => clockValue);
});

afterEach(() => driver.close());

function openAssessment(id = 'a1'): string {
  repo.createAssessment({
    id,
    name: 'Belize-2026-014',
    protocol: 'manatee_v1',
    protocolVersion: '1.0.0',
    startedAt: START,
    latitude: 17.5043,
    longitude: -88.1962,
  });
  return id;
}

function tap(assessmentId: string, elapsedMs: number, id = `b-${elapsedMs}`) {
  return repo.recordBreath({
    id,
    assessmentId,
    recordedAt: new Date(Date.parse(START) + elapsedMs).toISOString(),
    elapsedMs,
  });
}

describe('migrations', () => {
  it('brings a fresh database to the current version', () => {
    const fresh = createNodeDriver();
    expect(migrate(fresh)).toEqual({ from: 0, to: SCHEMA_VERSION });
    expect(fresh.get<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(
      SCHEMA_VERSION,
    );
    fresh.close();
  });

  it('is idempotent', () => {
    expect(migrate(driver)).toEqual({ from: SCHEMA_VERSION, to: SCHEMA_VERSION });
  });

  it('upgrades a database seeded at an older version', () => {
    // The real upgrade path: a phone that skipped a release.
    const old = createNodeDriver();
    old.exec('PRAGMA user_version = 0');
    expect(migrate(old).from).toBe(0);
    expect(
      old.all('SELECT name FROM sqlite_master WHERE type = ?', ['table']).length,
    ).toBeGreaterThan(0);
    old.close();
  });

  it('refuses to downgrade a database written by a newer build', () => {
    const future = createNodeDriver();
    migrate(future);
    future.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 5}`);
    expect(() => migrate(future)).toThrow(/newer build/);
    future.close();
  });

  it('has an append-only migration list', () => {
    expect(MIGRATIONS).toHaveLength(SCHEMA_VERSION);
  });
});

describe('assessments', () => {
  it('round-trips an assessment', () => {
    const id = openAssessment();
    expect(repo.getAssessment(id)).toMatchObject({
      name: 'Belize-2026-014',
      protocolVersion: '1.0.0',
      startedAt: START,
      endedAt: null,
      latitude: 17.5043,
    });
  });

  it('finds the open assessment and stops finding it once ended', () => {
    const id = openAssessment();
    expect(repo.getOpenAssessment()?.id).toBe(id);
    repo.endAssessment(id, '2026-02-14T14:52:00.000Z');
    expect(repo.getOpenAssessment()).toBeUndefined();
    expect(repo.getAssessment(id)?.endedAt).toBe('2026-02-14T14:52:00.000Z');
  });
});

describe('breath log', () => {
  it('allocates sequence numbers in order', () => {
    const id = openAssessment();
    expect([tap(id, 0), tap(id, 40_000), tap(id, 95_000)].map((b) => b.sequence)).toEqual([
      1, 2, 3,
    ]);
  });

  it('rejects a duplicate sequence rather than losing a breath', () => {
    const id = openAssessment();
    tap(id, 0);
    expect(() =>
      driver.run(
        `INSERT INTO breath_events (id, assessment_id, sequence, recorded_at, elapsed_ms, created_at)
         VALUES ('dup', ?, 1, ?, 1000, ?)`,
        [id, START, START],
      ),
    ).toThrow();
  });

  it('keeps voided breaths in the log and out of derivations', () => {
    const id = openAssessment();
    tap(id, 0);
    const mistake = tap(id, 40_000);
    tap(id, 90_000);

    repo.voidBreath(mistake.id, '2026-02-14T14:07:00.000Z');
    const events = repo.listBreaths(id);

    expect(events).toHaveLength(3);
    expect(events.find((e) => e.id === mistake.id)?.voidedAt).toBe('2026-02-14T14:07:00.000Z');
    expect(intervalsFrom(events)).toEqual([90_000]);
    expect(summarise(events, 300_000).totalBreaths).toBe(2);
  });

  it('will not void the same breath twice', () => {
    const id = openAssessment();
    const breath = tap(id, 0);
    repo.voidBreath(breath.id, '2026-02-14T14:06:00.000Z');
    repo.voidBreath(breath.id, '2026-02-14T14:09:00.000Z');
    expect(repo.listBreaths(id)[0]?.voidedAt).toBe('2026-02-14T14:06:00.000Z');
  });

  it('returns breaths in elapsed order regardless of insertion order', () => {
    const id = openAssessment();
    tap(id, 90_000, 'late');
    tap(id, 10_000, 'early');
    expect(repo.listBreaths(id).map((b) => b.id)).toEqual(['early', 'late']);
  });

  it('reports the furthest point reached, for re-anchoring after a restart', () => {
    const id = openAssessment();
    expect(repo.lastElapsedMs(id)).toBe(0);
    tap(id, 0);
    tap(id, 137_000);
    expect(repo.lastElapsedMs(id)).toBe(137_000);
  });

  it('rolls back a failed transaction rather than half-writing', () => {
    const id = openAssessment();
    tap(id, 0);
    expect(() =>
      driver.transaction(() => {
        driver.run(
          `INSERT INTO breath_events (id, assessment_id, sequence, recorded_at, elapsed_ms, created_at)
           VALUES ('ok', ?, 99, ?, 5000, ?)`,
          [id, START, START],
        );
        throw new Error('interrupted');
      }),
    ).toThrow('interrupted');
    expect(repo.listBreaths(id)).toHaveLength(1);
  });
});

describe('surviving a force quit', () => {
  it('keeps every event and interval intact across a reopen', () => {
    // The P1 gate: force-quit mid-session, nothing lost. A file-backed database
    // reopened with a new driver is exactly what a process restart looks like.
    const file = `${process.env.TEMP ?? '/tmp'}/manatee-p1-${process.pid}.sqlite`;

    const first = createNodeDriver(file);
    migrate(first);
    const before = createRepository(first, () => START);
    before.createAssessment({
      id: 'a1',
      name: 'Belize-2026-014',
      protocol: 'manatee_v1',
      protocolVersion: '1.0.0',
      startedAt: START,
    });
    for (const elapsed of [0, 45_000, 100_000]) {
      before.recordBreath({
        id: `b${elapsed}`,
        assessmentId: 'a1',
        recordedAt: new Date(Date.parse(START) + elapsed).toISOString(),
        elapsedMs: elapsed,
      });
    }
    first.close();

    const second = createNodeDriver(file);
    expect(migrate(second)).toEqual({ from: SCHEMA_VERSION, to: SCHEMA_VERSION });
    const after = createRepository(second, () => START);

    const events = after.listBreaths('a1');
    expect(events.map((e) => e.elapsedMs)).toEqual([0, 45_000, 100_000]);
    expect(intervalsFrom(events)).toEqual([45_000, 55_000]);
    expect(after.getOpenAssessment()?.id).toBe('a1');
    // A breath recorded after the restart continues the sequence.
    expect(
      after.recordBreath({
        id: 'b4',
        assessmentId: 'a1',
        recordedAt: START,
        elapsedMs: 150_000,
      }).sequence,
    ).toBe(4);
    second.close();
  });
});

describe('alarm audit trail', () => {
  it('records raises, escalations, acknowledgements and clears in order', () => {
    const id = openAssessment();
    const alarms = createAlarmRepository(driver, () => clockValue);

    const trail = [
      { kind: 'raised', level: 1, elapsedMs: 60_000, sinceLastBreathMs: 60_000 },
      { kind: 'acknowledged', level: 1, elapsedMs: 65_000, sinceLastBreathMs: 65_000 },
      { kind: 'escalated', level: 2, elapsedMs: 120_000, sinceLastBreathMs: 120_000 },
      { kind: 'cleared', level: 2, elapsedMs: 131_000, sinceLastBreathMs: 0 },
    ];
    for (const [index, entry] of trail.entries()) {
      alarms.record({
        id: `al${index}`,
        assessmentId: id,
        ladderVersion: '0.1.0-draft',
        occurredAt: new Date(Date.parse(START) + entry.elapsedMs).toISOString(),
        ...entry,
      });
    }

    const stored = alarms.list(id);
    expect(stored.map((e) => e.kind)).toEqual(['raised', 'acknowledged', 'escalated', 'cleared']);
    expect(stored.map((e) => e.level)).toEqual([1, 1, 2, 2]);
  });

  it('stamps the ladder version, so a threshold change between seasons is visible', () => {
    // The thresholds are a veterinary decision. Which set was in force when an
    // alarm fired has to be recoverable from the data, not from a build.
    const id = openAssessment();
    const alarms = createAlarmRepository(driver, () => clockValue);
    alarms.record({
      id: 'al1',
      assessmentId: id,
      kind: 'raised',
      level: 1,
      ladderVersion: '0.1.0-draft',
      occurredAt: START,
      elapsedMs: 60_000,
      sinceLastBreathMs: 60_000,
    });
    expect(alarms.list(id)[0]?.ladderVersion).toBe('0.1.0-draft');
  });

  it('is empty for an assessment where nothing was raised', () => {
    expect(createAlarmRepository(driver, () => clockValue).list(openAssessment())).toEqual([]);
  });
});
