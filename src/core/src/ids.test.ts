import { describe, expect, it } from 'vitest';
import { uuidv7 } from './ids.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Deterministic filler so the assertions are about structure, not luck. */
const fill = (value: number) => (length: number) => new Uint8Array(length).fill(value);

describe('uuidv7', () => {
  it('matches the v7 layout the server will validate', () => {
    expect(uuidv7(fill(0xab), Date.parse('2026-02-14T14:05:00.000Z'))).toMatch(UUID);
  });

  it('sorts lexicographically by creation time', () => {
    const base = Date.parse('2026-02-14T14:05:00.000Z');
    const ids = [0, 1, 1000, 60_000].map((offset) => uuidv7(fill(0x11), base + offset));
    expect([...ids].sort()).toEqual(ids);
  });

  it('differs when the random source differs at the same instant', () => {
    const at = Date.parse('2026-02-14T14:05:00.000Z');
    expect(uuidv7(fill(0x01), at)).not.toBe(uuidv7(fill(0x02), at));
  });

  it('clamps a negative clock rather than emitting a malformed id', () => {
    expect(uuidv7(fill(0x00), -1)).toMatch(UUID);
  });
});
