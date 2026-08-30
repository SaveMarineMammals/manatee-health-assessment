import { describe, expect, it } from 'vitest';
import { validateManateeAssessment, validateManateeMeasurement } from '@mmap/schema/manatee_v1';
import { PROTOCOL, PROTOCOL_VERSION } from '@manatee/core';
import { allCorpusRecords, loadCorpus } from './corpus.js';

/**
 * Asserts that every payload shape this app produces is accepted by the pinned
 * platform schema. Runs on every commit, with no server required.
 *
 * The live-API half of the contract is in api-contract.test.ts.
 */

const records = allCorpusRecords();

function validate(record: (typeof records)[number]) {
  if (record.kind === 'assessment') {
    const payload = record.payload as { assessment_ended_at?: string };
    return validateManateeAssessment(record.payload, {
      mode: payload.assessment_ended_at ? 'complete' : 'draft',
    });
  }
  return validateManateeMeasurement(record.payload);
}

describe('version corpus', () => {
  it('is not empty', () => {
    expect(records.length).toBeGreaterThan(0);
  });

  it('covers the version this build is pinned to', () => {
    const covered = loadCorpus().some(
      (version) => version.protocol === PROTOCOL && version.protocolVersion === PROTOCOL_VERSION,
    );
    expect(
      covered,
      `No corpus fixtures for ${PROTOCOL}@${PROTOCOL_VERSION}. Every pin bump must add a ` +
        `fixture directory so older payload shapes keep being asserted.`,
    ).toBe(true);
  });

  it.each(records.map((record) => [record.label, record] as const))(
    'accepts %s',
    (_label, record) => {
      const result = validate(record);
      expect(result.errors ?? [], JSON.stringify(result.errors, null, 2)).toEqual([]);
      expect(result.success).toBe(true);
    },
  );
});

describe('known upstream gap: fractional respiratory rate', () => {
  /**
   * The app displays breaths per 5 minutes and uploads the average per minute,
   * which is almost never a whole number — 4 breaths in 5 minutes is 0.8/min.
   * `respiratory_rate` is currently `z.number().int().positive()`, so those
   * records are rejected.
   *
   * This test pins the CURRENT behaviour so the limitation is visible in CI
   * rather than folklore. When the upstream relaxation lands, it fails — at
   * which point delete it and move the fixture into the corpus above.
   *
   * Tracking: relax respiratory_rate to a positive number in @mmap/schema.
   */
  const fractional = {
    id: 'f0c8a3d1-4e57-4b92-8a06-1d7e5c2b9f43',
    assessment_id: '6f1c2a54-9c3e-4a1b-8f7d-2b5e9a0c4d11',
    measurement_type: 'respiratory_rate',
    recorded_at: '2026-02-14T14:15:00.000Z',
    value: 0.8,
    unit: 'breaths/min',
    method: 'derived from breath log',
  };

  it('is still rejected by the pinned schema', () => {
    const result = validateManateeMeasurement(fractional);
    expect(
      result.success,
      'respiratory_rate now accepts fractional values — remove this test and add the ' +
        'fractional fixture to the corpus.',
    ).toBe(false);
  });

  it('rejects a sub-1 rate outright, which is the common case for a resting animal', () => {
    // 1 breath in 5 minutes = 0.2/min. Rounded to an integer this is 0, which
    // then fails .positive() — the record cannot be represented at all.
    const result = validateManateeMeasurement({ ...fractional, value: 0.2 });
    expect(result.success).toBe(false);
  });
});
