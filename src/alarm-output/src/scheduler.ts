import {
  ALARM_LADDER_VERSION,
  alarmTransition,
  evaluateAlarm,
  type AlarmEvent,
  type AlarmState,
  type BreathEvent,
} from '@manatee/core';
import type { AlarmOutput } from './output.js';

/**
 * Drives the pure alarm engine into a device.
 *
 * Holds the small amount of state the engine deliberately does not: when the
 * utterance last started, which rung it was for, and whether the operator has
 * acknowledged. Everything about *what should happen* stays in the engine; this
 * only carries the memory between ticks and performs the effects.
 *
 * `tick` takes the time rather than reading a clock, so a caller can drive it
 * through a whole assessment in a test without waiting for any of it.
 */
export interface AlarmSchedulerOptions {
  output: AlarmOutput;
  /** Called for each raise, escalation, acknowledgement and clear. */
  onEvent?: (event: AlarmEvent & { ladderVersion: string }) => void;
}

export function createAlarmScheduler({ output, onEvent }: AlarmSchedulerOptions) {
  let previous: AlarmState | null = null;
  let lastSpokenAtMs: number | null = null;
  let lastSpokenLevel: number | null = null;
  let acknowledgedAtMs: number | null = null;

  function emit(event: AlarmEvent | null) {
    if (event && onEvent) onEvent({ ...event, ladderVersion: ALARM_LADDER_VERSION });
  }

  return {
    /** Evaluate and perform. Returns the state so the UI can render it. */
    tick(events: readonly BreathEvent[], nowElapsedMs: number): AlarmState {
      const state = evaluateAlarm({
        events,
        nowElapsedMs,
        acknowledgedAtMs,
        lastSpokenAtMs,
        lastSpokenLevel,
      });

      emit(alarmTransition(previous, state, nowElapsedMs));

      if (state.level === 0) {
        if (previous && previous.level > 0) {
          void output.stop();
        }
        // A cleared alarm starts fresh: an acknowledgement does not carry into
        // the next time the animal stops breathing.
        acknowledgedAtMs = null;
        lastSpokenAtMs = null;
        lastSpokenLevel = null;
      } else if (state.shouldSpeak) {
        if (state.escalated) acknowledgedAtMs = null;
        lastSpokenAtMs = nowElapsedMs;
        lastSpokenLevel = state.level;
        void output.speak(state.assetId!);
        // Sound is never alone: on a working boat any single channel can lose.
        output.pulse();
      }

      previous = state;
      return state;
    },

    /**
     * Silence the sound for a bounded period.
     *
     * Does not clear the alarm — the banner stays until a breath is actually
     * recorded, and the sound returns when the silence expires.
     */
    acknowledge(nowElapsedMs: number): void {
      if (!previous || previous.level === 0) return;
      acknowledgedAtMs = nowElapsedMs;
      void output.stop();
      emit({
        kind: 'acknowledged',
        level: previous.level,
        elapsedMs: nowElapsedMs,
        sinceLastBreathMs: previous.sinceLastBreathMs,
      });
    },

    /** Current state without evaluating, for rendering between ticks. */
    current: () => previous,

    /** Drop all memory. Used when an assessment ends. */
    reset(): void {
      previous = null;
      lastSpokenAtMs = null;
      lastSpokenLevel = null;
      acknowledgedAtMs = null;
      void output.stop();
    },
  };
}

export type AlarmScheduler = ReturnType<typeof createAlarmScheduler>;
