import { sinceLastBreathMs, type BreathEvent } from './breaths.js';

/**
 * The alarm engine.
 *
 * A pure function of (breath log, now, acknowledgement state) → what should be
 * happening. No timers, no audio, no I/O — the scheduler and the speaker live
 * outside and do what this says. That is what makes the feature the app exists
 * for testable in milliseconds, on CI, without a phone.
 *
 * See docs/ALARM-AUDIO.md for the playback shape and why the clips are
 * pre-rendered rather than synthesised.
 */

export type AlarmSeverity = 'critical';

export interface AlarmStep {
  /** Time without a breath at which this step takes over. */
  atMs: number;
  /** Asset in assets/audio/manifest.json. The tone plays before it. */
  assetId: string;
  severity: AlarmSeverity;
}

/**
 * The escalation ladder.
 *
 * Provisional and pending CMARI review — every threshold here is a veterinary
 * decision, not an engineering one. It is a versioned table rather than
 * constants scattered through the app precisely so it can be signed off, shown
 * in preflight, and attached to the records a season produces.
 */
export const ALARM_LADDER_VERSION = '0.1.0-draft';

export const ALARM_LADDER: readonly AlarmStep[] = [
  { atMs: 60_000, assetId: 'no-breath-60s', severity: 'critical' },
  { atMs: 120_000, assetId: 'no-breath-120s', severity: 'critical' },
  { atMs: 180_000, assetId: 'no-breath-180s', severity: 'critical' },
];

/** How often the utterance repeats while an alarm is sounding. */
export const REPEAT_EVERY_MS = 15_000;

/**
 * How long acknowledging silences the audio.
 *
 * Acknowledge is not resolve: the banner stays until a breath is actually
 * recorded, and the sound comes back when this expires. Someone silencing an
 * alarm and then being pulled away by the animal must not end up with a phone
 * that has quietly stopped watching.
 *
 * Deliberately shorter than the gap between rungs. At sixty seconds it would
 * expire exactly as the next rung arrived, so a silenced alarm would only ever
 * be heard from again by escalating — which makes acknowledgement mean "silence
 * until it gets worse" rather than "silence briefly".
 */
export const ACK_SILENCE_MS = 30_000;

export interface AlarmInput {
  events: readonly BreathEvent[];
  nowElapsedMs: number;
  /** When the current alarm was acknowledged, in elapsed ms. */
  acknowledgedAtMs?: number | null;
  /** When the utterance last started, in elapsed ms. */
  lastSpokenAtMs?: number | null;
  /** Ladder step already spoken, so escalation can be detected. */
  lastSpokenLevel?: number | null;
  ladder?: readonly AlarmStep[];
}

export interface AlarmState {
  /** 0 when no alarm is due; otherwise the 1-based ladder step. */
  level: number;
  severity: AlarmSeverity | null;
  /** Milliseconds since the last breath — what the ladder is measured against. */
  sinceLastBreathMs: number;
  /** The banner is shown. Persists through acknowledgement. */
  visible: boolean;
  /** Start the utterance now. */
  shouldSpeak: boolean;
  assetId: string | null;
  /** Audio is deliberately suppressed by an acknowledgement that still holds. */
  silenced: boolean;
  /** This tick crossed onto a higher rung. */
  escalated: boolean;
}

const IDLE: AlarmState = {
  level: 0,
  severity: null,
  sinceLastBreathMs: 0,
  visible: false,
  shouldSpeak: false,
  assetId: null,
  silenced: false,
  escalated: false,
};

/** The ladder step for a given silence, 0 when none applies. */
export function levelFor(sinceMs: number, ladder: readonly AlarmStep[] = ALARM_LADDER): number {
  let level = 0;
  for (const [index, step] of ladder.entries()) {
    if (sinceMs >= step.atMs) level = index + 1;
  }
  return level;
}

/**
 * What the alarm should be doing right now.
 *
 * Two rules are worth stating because they are easy to get subtly wrong:
 *
 *   Escalation overrides an acknowledgement. Crossing onto a higher rung means
 *   the situation got worse, and silence granted for the old rung should not
 *   carry into the new one.
 *
 *   Acknowledgement expires. It suppresses audio for ACK_SILENCE_MS and then
 *   the alarm speaks again, because the condition has not gone away.
 */
export function evaluateAlarm(input: AlarmInput): AlarmState {
  const ladder = input.ladder ?? ALARM_LADDER;
  const sinceMs = sinceLastBreathMs(input.events, input.nowElapsedMs);
  const level = levelFor(sinceMs, ladder);

  if (level === 0) {
    return { ...IDLE, sinceLastBreathMs: sinceMs };
  }

  const step = ladder[level - 1]!;
  const escalated = (input.lastSpokenLevel ?? 0) > 0 && level > (input.lastSpokenLevel ?? 0);

  const ackAgeMs =
    input.acknowledgedAtMs == null ? null : input.nowElapsedMs - input.acknowledgedAtMs;
  // An acknowledgement from a lower rung does not silence a higher one.
  const silenced = !escalated && ackAgeMs !== null && ackAgeMs < ACK_SILENCE_MS;

  const sinceSpokenMs =
    input.lastSpokenAtMs == null ? null : input.nowElapsedMs - input.lastSpokenAtMs;
  const dueToRepeat = sinceSpokenMs === null || sinceSpokenMs >= REPEAT_EVERY_MS;

  return {
    level,
    severity: step.severity,
    sinceLastBreathMs: sinceMs,
    // The banner never depends on the acknowledgement: silencing the sound does
    // not mean the animal started breathing.
    visible: true,
    shouldSpeak: !silenced && (escalated || dueToRepeat),
    assetId: step.assetId,
    silenced,
    escalated,
  };
}

export type AlarmEventKind = 'raised' | 'escalated' | 'acknowledged' | 'cleared';

export interface AlarmEvent {
  kind: AlarmEventKind;
  level: number;
  elapsedMs: number;
  sinceLastBreathMs: number;
}

/**
 * Diffs two consecutive states into the audit trail.
 *
 * Every alarm the app raises, escalates, silences and clears is recorded. That
 * is scientifically useful — the longest gap is the interesting moment of an
 * assessment — and, if an animal is ever lost, it is the record of what the app
 * told the team and when.
 */
export function alarmTransition(
  previous: AlarmState | null,
  next: AlarmState,
  elapsedMs: number,
): AlarmEvent | null {
  const was = previous?.level ?? 0;

  if (was === 0 && next.level > 0) {
    return {
      kind: 'raised',
      level: next.level,
      elapsedMs,
      sinceLastBreathMs: next.sinceLastBreathMs,
    };
  }
  if (was > 0 && next.level > was) {
    return {
      kind: 'escalated',
      level: next.level,
      elapsedMs,
      sinceLastBreathMs: next.sinceLastBreathMs,
    };
  }
  if (was > 0 && next.level === 0) {
    return { kind: 'cleared', level: was, elapsedMs, sinceLastBreathMs: next.sinceLastBreathMs };
  }
  return null;
}
