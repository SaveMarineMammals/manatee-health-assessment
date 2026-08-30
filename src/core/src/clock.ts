/**
 * Time for the breath tracker.
 *
 * Every derived number — intervals, rates, and later the alarm — comes from
 * elapsed monotonic milliseconds, never from subtracting wall clocks. A device
 * that resyncs its clock mid-assessment would otherwise silently corrupt every
 * interval spanning the jump, and nothing downstream could detect it.
 *
 * Wall-clock time is still recorded on every event, because that is what the
 * record says and what a human reads. It is just never used for arithmetic.
 */

export interface Clock {
  /** Wall clock as a UTC ISO string. What gets stored and displayed. */
  nowUtc(): string;
  /**
   * A monotonic millisecond counter. Its origin is arbitrary and only
   * differences are meaningful — it does not survive a process restart.
   */
  monoMs(): number;
}

/**
 * Maps the process-local monotonic counter onto milliseconds since an
 * assessment began.
 *
 * The monotonic counter restarts with the process, so after a force-quit there
 * is no way to recover the original origin. Re-anchoring uses the wall clock
 * once, at resume, to re-establish the offset — a single seam whose error is
 * bounded by whatever the clock did while the app was dead. Events already
 * recorded keep their stored elapsed values and stay exactly consistent with
 * each other; only the anchor for *new* events is re-derived.
 *
 * This is the one place wall-clock time is allowed into interval arithmetic,
 * and it is confined to a single function so it stays visible.
 */
export interface ElapsedAnchor {
  readonly elapsedAtAnchorMs: number;
  readonly monoAtAnchorMs: number;
}

/** Anchor for an assessment starting now: elapsed time is zero. */
export function anchorAtStart(clock: Clock): ElapsedAnchor {
  return { elapsedAtAnchorMs: 0, monoAtAnchorMs: clock.monoMs() };
}

/**
 * Anchor for an assessment reopened in a new process.
 *
 * `knownElapsedMs` is the furthest point the assessment is known to have
 * reached — normally the last recorded breath. The wall-clock gap since the
 * assessment started is used as the estimate, floored at `knownElapsedMs` so a
 * backwards clock adjustment can never move the assessment into its own past.
 */
export function anchorAfterResume(
  clock: Clock,
  startedAtUtc: string,
  knownElapsedMs = 0,
): ElapsedAnchor {
  const startedMs = Date.parse(startedAtUtc);
  const wallElapsedMs = Number.isNaN(startedMs) ? 0 : Date.parse(clock.nowUtc()) - startedMs;
  return {
    elapsedAtAnchorMs: Math.max(knownElapsedMs, wallElapsedMs, 0),
    monoAtAnchorMs: clock.monoMs(),
  };
}

/** Milliseconds since the assessment began, as of now. */
export function elapsedNow(anchor: ElapsedAnchor, clock: Clock): number {
  return anchor.elapsedAtAnchorMs + (clock.monoMs() - anchor.monoAtAnchorMs);
}

/**
 * The real clock.
 *
 * `performance.now()` is monotonic and unaffected by clock adjustments;
 * `Date.now()` is not, and is used only for the recorded wall time.
 */
export function systemClock(): Clock {
  return {
    nowUtc: () => new Date().toISOString(),
    monoMs: () => performance.now(),
  };
}

/**
 * A clock the tests drive by hand.
 *
 * Wall and monotonic time advance independently, which is the only way to
 * exercise a device whose clock jumps while the assessment is running.
 */
export function createTestClock(startUtc = '2026-02-14T14:05:00.000Z', startMonoMs = 0) {
  let wallMs = Date.parse(startUtc);
  let monoMs = startMonoMs;

  return {
    nowUtc: () => new Date(wallMs).toISOString(),
    monoMs: () => monoMs,
    /** Advance both clocks together, as normal time passing. */
    advance(ms: number) {
      wallMs += ms;
      monoMs += ms;
    },
    /** Move the wall clock only — an NTP correction mid-assessment. */
    jumpWallClock(ms: number) {
      wallMs += ms;
    },
  } satisfies Clock & { advance(ms: number): void; jumpWallClock(ms: number): void };
}
