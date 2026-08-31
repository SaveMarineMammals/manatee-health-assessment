/**
 * Breath statistics.
 *
 * Pure functions over a list of events plus a caller-supplied "now" in elapsed
 * milliseconds. No clock, no I/O, no React — the whole surface is testable
 * against a fixture timeline in a few milliseconds.
 *
 * One rule governs everything here: **derived values are always recomputed from
 * the raw log, never stored.** Voiding a mis-tapped breath then flows through
 * intervals, bins and the summary with no reconciliation step.
 */

export const FIVE_MINUTES_MS = 5 * 60 * 1000;

/** A tap. Immutable once written; a mistake is voided, never deleted. */
export interface BreathEvent {
  id: string;
  /** 1-based order of the tap as it was recorded, including voided ones. */
  sequence: number;
  /** UTC ISO wall clock — what the record says and what a human reads. */
  recordedAt: string;
  /** Milliseconds since the assessment began. All arithmetic uses this. */
  elapsedMs: number;
  /** Set when voided. Voided events stay in the log and out of every derivation. */
  voidedAt?: string | null;
}

/** Non-voided events in time order. Every other function starts here. */
export function activeBreaths(events: readonly BreathEvent[]): BreathEvent[] {
  return events.filter((event) => !event.voidedAt).sort((a, b) => a.elapsedMs - b.elapsedMs);
}

/** Milliseconds between consecutive breaths. Empty for fewer than two. */
export function intervalsFrom(events: readonly BreathEvent[]): number[] {
  const active = activeBreaths(events);
  const intervals: number[] = [];
  for (let i = 1; i < active.length; i += 1) {
    intervals.push(active[i]!.elapsedMs - active[i - 1]!.elapsedMs);
  }
  return intervals;
}

/**
 * Time since the last breath, which is the tracker's headline number and what
 * the P2 alarm will watch. Measured from the assessment start when no breath
 * has been recorded yet — an animal that has not breathed at all is exactly the
 * case the alarm exists for.
 */
export function sinceLastBreathMs(events: readonly BreathEvent[], nowElapsedMs: number): number {
  const active = activeBreaths(events);
  const last = active[active.length - 1];
  return Math.max(0, nowElapsedMs - (last?.elapsedMs ?? 0));
}

export interface BreathBin {
  /** 0-based window index from the assessment start. */
  index: number;
  startMs: number;
  endMs: number;
  count: number;
  /** True when the window has not finished yet. Never scaled up. */
  partial: boolean;
}

/**
 * Fixed five-minute bins from the assessment start.
 *
 * Fixed rather than rolling: this is the summary series, and it has to be the
 * same numbers every time it is computed. A trailing incomplete window is
 * returned marked `partial` and is never extrapolated to a full five minutes —
 * scaling two minutes of data up to five invents breaths that did not happen.
 */
export function binsPerFiveMinutes(
  events: readonly BreathEvent[],
  totalElapsedMs: number,
  windowMs: number = FIVE_MINUTES_MS,
): BreathBin[] {
  if (totalElapsedMs <= 0) return [];

  const active = activeBreaths(events);
  const binCount = Math.ceil(totalElapsedMs / windowMs);
  const bins: BreathBin[] = [];

  for (let index = 0; index < binCount; index += 1) {
    const startMs = index * windowMs;
    const fullEndMs = startMs + windowMs;
    const partial = fullEndMs > totalElapsedMs;
    bins.push({
      index,
      startMs,
      endMs: partial ? totalElapsedMs : fullEndMs,
      // Half-open [start, end) so a breath on a boundary lands in exactly one bin.
      count: active.filter((e) => e.elapsedMs >= startMs && e.elapsedMs < fullEndMs).length,
      partial,
    });
  }

  return bins;
}

/**
 * Average breaths per minute for a window — the unit the server takes.
 *
 * Deliberately fractional. Four breaths in five minutes is 0.8/min, and a
 * resting animal is well under one. See docs/SCHEMA-VERSIONING.md for the
 * upstream constraint this currently runs into.
 */
export function ratePerMinute(bin: BreathBin): number {
  const durationMs = bin.endMs - bin.startMs;
  if (durationMs <= 0) return 0;
  return bin.count / (durationMs / 60000);
}

/**
 * Live rate over a trailing window, expressed per five minutes because that is
 * the unit the app displays.
 *
 * Early in an assessment the window is longer than the assessment itself; the
 * elapsed time is used as the denominator so the number means something from
 * the first minute rather than reading falsely low.
 */
export function rollingRatePer5Min(
  events: readonly BreathEvent[],
  nowElapsedMs: number,
  windowMs: number = FIVE_MINUTES_MS,
): number {
  const spanMs = Math.min(windowMs, Math.max(nowElapsedMs, 0));
  if (spanMs <= 0) return 0;
  const from = nowElapsedMs - spanMs;
  const count = activeBreaths(events).filter((e) => e.elapsedMs >= from).length;
  return (count / spanMs) * FIVE_MINUTES_MS;
}

export type TapDecision =
  { accepted: true } | { accepted: false; reason: 'debounced'; sinceLastMs: number };

/**
 * Guards against a double-register from one physical tap.
 *
 * A rejection is never silent — the caller shows how long ago the last breath
 * landed. To a gloved operator a silently dropped tap and a missed tap look
 * identical, and that ambiguity is worse than either.
 */
export function decideTap(
  events: readonly BreathEvent[],
  nowElapsedMs: number,
  debounceMs = 1000,
): TapDecision {
  const active = activeBreaths(events);
  const last = active[active.length - 1];
  if (!last) return { accepted: true };

  const sinceLastMs = nowElapsedMs - last.elapsedMs;
  if (sinceLastMs < debounceMs) {
    return { accepted: false, reason: 'debounced', sinceLastMs };
  }
  return { accepted: true };
}

export interface BreathSummary {
  totalBreaths: number;
  voidedBreaths: number;
  durationMs: number;
  bins: BreathBin[];
  intervalsMs: number[];
  shortestIntervalMs: number | null;
  medianIntervalMs: number | null;
  longestIntervalMs: number | null;
  /** The longest gap, with the breath that ended it — the clinically interesting moment. */
  longestGap: { intervalMs: number; endedAt: string } | null;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function summarise(
  events: readonly BreathEvent[],
  totalElapsedMs: number,
  windowMs: number = FIVE_MINUTES_MS,
): BreathSummary {
  const active = activeBreaths(events);
  const intervalsMs = intervalsFrom(events);

  let longestGap: BreathSummary['longestGap'] = null;
  for (let i = 1; i < active.length; i += 1) {
    const intervalMs = active[i]!.elapsedMs - active[i - 1]!.elapsedMs;
    if (!longestGap || intervalMs > longestGap.intervalMs) {
      longestGap = { intervalMs, endedAt: active[i]!.recordedAt };
    }
  }

  return {
    totalBreaths: active.length,
    voidedBreaths: events.length - active.length,
    durationMs: totalElapsedMs,
    bins: binsPerFiveMinutes(events, totalElapsedMs, windowMs),
    intervalsMs,
    shortestIntervalMs: intervalsMs.length ? Math.min(...intervalsMs) : null,
    medianIntervalMs: median(intervalsMs),
    longestIntervalMs: intervalsMs.length ? Math.max(...intervalsMs) : null,
    longestGap,
  };
}

/** `m:ss`, for the tracker's headline timer. Never negative. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
