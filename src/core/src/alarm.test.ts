import { describe, expect, it } from 'vitest';
import {
  ACK_SILENCE_MS,
  ALARM_LADDER,
  REPEAT_EVERY_MS,
  alarmTransition,
  evaluateAlarm,
  levelFor,
  type AlarmState,
} from './alarm.js';
import type { BreathEvent } from './breaths.js';

const START = '2026-02-14T14:05:00.000Z';

function breath(elapsedMs: number): BreathEvent {
  return {
    id: `b${elapsedMs}`,
    sequence: 1,
    recordedAt: new Date(Date.parse(START) + elapsedMs).toISOString(),
    elapsedMs,
  };
}

/** One breath at t=0, then silence — the shape every alarm case needs. */
const oneBreath = [breath(0)];

describe('the ladder', () => {
  it('is quiet below the first rung', () => {
    expect(levelFor(0)).toBe(0);
    expect(levelFor(59_999)).toBe(0);
  });

  it('steps at sixty, one hundred and twenty, and one hundred and eighty seconds', () => {
    expect(levelFor(60_000)).toBe(1);
    expect(levelFor(119_999)).toBe(1);
    expect(levelFor(120_000)).toBe(2);
    expect(levelFor(180_000)).toBe(3);
    expect(levelFor(600_000)).toBe(3); // stays on the top rung
  });

  it('names an asset that the bundled manifest actually ships', () => {
    // A ladder pointing at a clip that does not exist is an alarm that cannot
    // sound. The manifest is validated separately; this checks they agree.
    const shipped = ['no-breath-60s', 'no-breath-120s', 'no-breath-180s'];
    expect(ALARM_LADDER.map((step) => step.assetId)).toEqual(shipped);
  });
});

describe('raising an alarm', () => {
  it('stays idle while the animal is breathing', () => {
    const state = evaluateAlarm({ events: oneBreath, nowElapsedMs: 30_000 });
    expect(state).toMatchObject({ level: 0, visible: false, shouldSpeak: false });
  });

  it('fires at sixty seconds and speaks immediately', () => {
    const state = evaluateAlarm({ events: oneBreath, nowElapsedMs: 60_000 });
    expect(state).toMatchObject({
      level: 1,
      visible: true,
      shouldSpeak: true,
      assetId: 'no-breath-60s',
      severity: 'critical',
    });
  });

  it('measures from the assessment start when nothing has been recorded', () => {
    // An animal that has not breathed at all must still raise the alarm.
    expect(evaluateAlarm({ events: [], nowElapsedMs: 61_000 }).level).toBe(1);
  });

  it('ignores a voided breath when deciding', () => {
    const events = [breath(0), { ...breath(50_000), voidedAt: START }];
    expect(evaluateAlarm({ events, nowElapsedMs: 61_000 }).level).toBe(1);
  });

  it('clears the moment a breath is recorded', () => {
    const events = [breath(0), breath(70_000)];
    expect(evaluateAlarm({ events, nowElapsedMs: 71_000 })).toMatchObject({
      level: 0,
      visible: false,
    });
  });
});

describe('repeating', () => {
  it('stays silent between repeats', () => {
    const state = evaluateAlarm({
      events: oneBreath,
      nowElapsedMs: 65_000,
      lastSpokenAtMs: 60_000,
      lastSpokenLevel: 1,
    });
    expect(state.shouldSpeak).toBe(false);
    expect(state.visible).toBe(true);
  });

  it('speaks again once the repeat interval has passed', () => {
    // A single utterance lost to a passing outboard is an alarm that did not
    // happen, which is why it repeats rather than firing once.
    const state = evaluateAlarm({
      events: oneBreath,
      nowElapsedMs: 60_000 + REPEAT_EVERY_MS,
      lastSpokenAtMs: 60_000,
      lastSpokenLevel: 1,
    });
    expect(state.shouldSpeak).toBe(true);
  });
});

describe('escalation', () => {
  it('moves to the two-minute clip', () => {
    const state = evaluateAlarm({
      events: oneBreath,
      nowElapsedMs: 120_000,
      lastSpokenAtMs: 118_000,
      lastSpokenLevel: 1,
    });
    expect(state).toMatchObject({ level: 2, assetId: 'no-breath-120s', escalated: true });
  });

  it('speaks immediately on escalation rather than waiting for the repeat', () => {
    const state = evaluateAlarm({
      events: oneBreath,
      nowElapsedMs: 120_000,
      lastSpokenAtMs: 119_000, // well inside the repeat interval
      lastSpokenLevel: 1,
    });
    expect(state.shouldSpeak).toBe(true);
  });

  it('overrides an acknowledgement, because the situation got worse', () => {
    // Silence granted for the one-minute rung must not carry into the two-minute
    // one. This is the case most likely to be got wrong and least likely to be
    // noticed.
    const state = evaluateAlarm({
      events: oneBreath,
      nowElapsedMs: 120_000,
      acknowledgedAtMs: 119_000,
      lastSpokenAtMs: 119_000,
      lastSpokenLevel: 1,
    });
    expect(state.silenced).toBe(false);
    expect(state.shouldSpeak).toBe(true);
  });
});

describe('acknowledgement', () => {
  it('silences the sound but leaves the banner up', () => {
    // Acknowledge is not resolve: silencing does not mean the animal breathed.
    const state = evaluateAlarm({
      events: oneBreath,
      nowElapsedMs: 70_000,
      acknowledgedAtMs: 65_000,
      lastSpokenAtMs: 60_000,
      lastSpokenLevel: 1,
    });
    expect(state).toMatchObject({ silenced: true, shouldSpeak: false, visible: true, level: 1 });
  });

  it('expires, and the alarm speaks again', () => {
    // Someone who silences an alarm and is then pulled away by the animal must
    // not be left with a phone that quietly stopped watching.
    const state = evaluateAlarm({
      events: oneBreath,
      nowElapsedMs: 65_000 + ACK_SILENCE_MS,
      acknowledgedAtMs: 65_000,
      lastSpokenAtMs: 65_000,
      lastSpokenLevel: 1,
    });
    expect(state.silenced).toBe(false);
    expect(state.shouldSpeak).toBe(true);
  });

  it('is irrelevant once the animal breathes', () => {
    const events = [breath(0), breath(70_000)];
    expect(evaluateAlarm({ events, nowElapsedMs: 71_000, acknowledgedAtMs: 65_000 }).visible).toBe(
      false,
    );
  });
});

describe('the audit trail', () => {
  const at = (level: number, sinceMs: number): AlarmState => ({
    level,
    severity: level ? 'critical' : null,
    sinceLastBreathMs: sinceMs,
    visible: level > 0,
    shouldSpeak: false,
    assetId: null,
    silenced: false,
    escalated: false,
  });

  it('records a raise', () => {
    expect(alarmTransition(at(0, 30_000), at(1, 60_000), 60_000)).toEqual({
      kind: 'raised',
      level: 1,
      elapsedMs: 60_000,
      sinceLastBreathMs: 60_000,
    });
  });

  it('records an escalation', () => {
    expect(alarmTransition(at(1, 119_000), at(2, 120_000), 120_000)?.kind).toBe('escalated');
  });

  it('records a clear', () => {
    expect(alarmTransition(at(2, 130_000), at(0, 0), 130_000)).toMatchObject({
      kind: 'cleared',
      level: 2,
    });
  });

  it('says nothing while an alarm simply continues', () => {
    expect(alarmTransition(at(1, 70_000), at(1, 80_000), 80_000)).toBeNull();
  });

  it('records the first raise when there is no previous state', () => {
    expect(alarmTransition(null, at(1, 60_000), 60_000)?.kind).toBe('raised');
  });

  it('stays quiet when nothing has ever happened', () => {
    expect(alarmTransition(null, at(0, 10_000), 10_000)).toBeNull();
  });
});
