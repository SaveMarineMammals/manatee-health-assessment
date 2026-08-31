import { describe, expect, it } from 'vitest';
import { ACK_SILENCE_MS, REPEAT_EVERY_MS, type AlarmEvent, type BreathEvent } from '@manatee/core';
import { createFakeAlarmOutput } from './output.js';
import { createAlarmScheduler } from './scheduler.js';

const START = '2026-02-14T14:05:00.000Z';

function breath(elapsedMs: number): BreathEvent {
  return {
    id: `b${elapsedMs}`,
    sequence: 1,
    recordedAt: new Date(Date.parse(START) + elapsedMs).toISOString(),
    elapsedMs,
  };
}

function setup() {
  const output = createFakeAlarmOutput();
  const events: (AlarmEvent & { ladderVersion: string })[] = [];
  const scheduler = createAlarmScheduler({ output, onEvent: (e) => events.push(e) });
  return { output, events, scheduler };
}

/** One breath at t=0, then nothing. */
const silence = [breath(0)];

describe('driving the alarm', () => {
  it('says nothing while the animal is breathing', () => {
    const { output, scheduler } = setup();
    scheduler.tick(silence, 30_000);
    expect(output.spoken()).toEqual([]);
  });

  it('speaks once at sixty seconds, not on every tick', () => {
    // A tick runs several times a second. Without the repeat interval the alarm
    // would stutter over itself continuously.
    const { output, scheduler } = setup();
    for (const t of [60_000, 60_250, 60_500, 61_000, 65_000]) {
      scheduler.tick(silence, t);
    }
    expect(output.spoken()).toEqual(['no-breath-60s']);
  });

  it('repeats after the interval', () => {
    const { output, scheduler } = setup();
    scheduler.tick(silence, 60_000);
    scheduler.tick(silence, 60_000 + REPEAT_EVERY_MS);
    expect(output.spoken()).toEqual(['no-breath-60s', 'no-breath-60s']);
  });

  it('pulses haptics alongside every utterance', () => {
    const { output, scheduler } = setup();
    scheduler.tick(silence, 60_000);
    expect(output.calls.filter((c) => c.method === 'pulse')).toHaveLength(1);
  });

  it('escalates through the ladder', () => {
    const { output, scheduler } = setup();
    scheduler.tick(silence, 60_000);
    scheduler.tick(silence, 120_000);
    scheduler.tick(silence, 180_000);
    expect(output.spoken()).toEqual(['no-breath-60s', 'no-breath-120s', 'no-breath-180s']);
  });

  it('stops when a breath is finally recorded', () => {
    const { output, scheduler } = setup();
    scheduler.tick(silence, 60_000);
    scheduler.tick([...silence, breath(70_000)], 70_500);
    expect(output.calls.at(-1)).toEqual({ method: 'stop' });
  });
});

describe('acknowledgement', () => {
  it('silences the sound but keeps the alarm up', () => {
    const { output, scheduler } = setup();
    scheduler.tick(silence, 60_000);
    scheduler.acknowledge(62_000);

    const state = scheduler.tick(silence, 62_000 + REPEAT_EVERY_MS);
    expect(state.visible).toBe(true);
    expect(state.silenced).toBe(true);
    expect(output.spoken()).toEqual(['no-breath-60s']); // nothing new
  });

  it('lets the alarm speak again at the same rung once the silence expires', () => {
    // The silence is deliberately shorter than the gap between rungs. If it
    // were not, a silenced alarm would only ever be heard again by escalating.
    const { output, scheduler } = setup();
    scheduler.tick(silence, 60_000);
    scheduler.acknowledge(62_000);

    const expiry = 62_000 + ACK_SILENCE_MS;
    expect(expiry).toBeLessThan(120_000); // still on the first rung
    scheduler.tick(silence, expiry);
    expect(output.spoken()).toEqual(['no-breath-60s', 'no-breath-60s']);
  });

  it('is overridden by escalation', () => {
    // Silence granted at one minute must not carry into two.
    const { output, scheduler } = setup();
    scheduler.tick(silence, 60_000);
    scheduler.acknowledge(119_000);
    scheduler.tick(silence, 120_000);
    expect(output.spoken()).toEqual(['no-breath-60s', 'no-breath-120s']);
  });

  it('does not carry into the next alarm of the same assessment', () => {
    // Acknowledging once must not pre-silence a later, unrelated event.
    const { output, scheduler } = setup();
    scheduler.tick(silence, 60_000);
    scheduler.acknowledge(61_000);

    const breathed = [...silence, breath(65_000)];
    scheduler.tick(breathed, 66_000); // clears
    scheduler.tick(breathed, 125_000); // silent again for 60s
    expect(output.spoken()).toEqual(['no-breath-60s', 'no-breath-60s']);
  });

  it('does nothing when no alarm is up', () => {
    const { output, events, scheduler } = setup();
    scheduler.tick(silence, 10_000);
    scheduler.acknowledge(10_000);
    expect(events).toEqual([]);
    expect(output.calls.filter((c) => c.method === 'stop')).toHaveLength(0);
  });
});

describe('the audit trail it emits', () => {
  it('records the whole life of an alarm', () => {
    const { events, scheduler } = setup();
    scheduler.tick(silence, 30_000);
    scheduler.tick(silence, 60_000);
    scheduler.acknowledge(62_000);
    scheduler.tick(silence, 120_000);
    scheduler.tick([...silence, breath(130_000)], 130_500);

    expect(events.map((e) => e.kind)).toEqual(['raised', 'acknowledged', 'escalated', 'cleared']);
  });

  it('stamps the ladder version on every entry', () => {
    // Which thresholds were in force has to be recoverable from the data.
    const { events, scheduler } = setup();
    scheduler.tick(silence, 60_000);
    expect(events[0]?.ladderVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('reports the silence that triggered it', () => {
    const { events, scheduler } = setup();
    scheduler.tick(silence, 61_500);
    expect(events[0]).toMatchObject({ kind: 'raised', level: 1, sinceLastBreathMs: 61_500 });
  });
});

describe('reset', () => {
  it('stops audio and forgets everything', () => {
    const { output, scheduler } = setup();
    scheduler.tick(silence, 60_000);
    scheduler.reset();
    expect(output.calls.at(-1)).toEqual({ method: 'stop' });
    expect(scheduler.current()).toBeNull();
  });
});

describe('readiness', () => {
  it('reports ready only after a successful preload', async () => {
    const output = createFakeAlarmOutput();
    expect(output.isReady()).toBe(false);
    await output.preload();
    expect(output.isReady()).toBe(true);
  });

  it('stays not-ready when preload fails', async () => {
    // An alarm that cannot play is worse than no alarm, because the crew
    // believes it is covered. Preflight must be able to see this.
    const output = createFakeAlarmOutput({ failPreload: true });
    await expect(output.preload()).rejects.toThrow();
    expect(output.isReady()).toBe(false);
  });
});
