import { describe, expect, it } from 'vitest';
import {
  FIVE_MINUTES_MS,
  activeBreaths,
  binsPerFiveMinutes,
  decideTap,
  formatElapsed,
  intervalsFrom,
  ratePerMinute,
  rollingRatePer5Min,
  sinceLastBreathMs,
  summarise,
  type BreathEvent,
} from './breaths.js';
import { anchorAfterResume, anchorAtStart, createTestClock, elapsedNow } from './clock.js';

const START = '2026-02-14T14:05:00.000Z';

/** Builds a timeline from elapsed-second offsets. */
function timeline(...seconds: number[]): BreathEvent[] {
  return seconds.map((s, i) => ({
    id: `b${i + 1}`,
    sequence: i + 1,
    recordedAt: new Date(Date.parse(START) + s * 1000).toISOString(),
    elapsedMs: s * 1000,
  }));
}

describe('intervals', () => {
  it('measures gaps between consecutive breaths', () => {
    expect(intervalsFrom(timeline(0, 45, 100))).toEqual([45_000, 55_000]);
  });

  it('needs two breaths to have an interval', () => {
    expect(intervalsFrom(timeline(30))).toEqual([]);
    expect(intervalsFrom([])).toEqual([]);
  });

  it('measures across a voided breath rather than around it', () => {
    // Voiding the middle breath must join its neighbours into one long gap —
    // that gap is real, and it is exactly what the alarm cares about.
    const events = timeline(0, 40, 90);
    events[1]!.voidedAt = START;
    expect(intervalsFrom(events)).toEqual([90_000]);
  });
});

describe('since last breath', () => {
  it('counts from the most recent breath', () => {
    expect(sinceLastBreathMs(timeline(0, 40), 65_000)).toBe(25_000);
  });

  it('counts from the assessment start before any breath is recorded', () => {
    // An animal that has not breathed at all is the case the alarm exists for,
    // so this must not read as zero.
    expect(sinceLastBreathMs([], 70_000)).toBe(70_000);
  });

  it('ignores a voided last breath', () => {
    const events = timeline(0, 60);
    events[1]!.voidedAt = START;
    expect(sinceLastBreathMs(events, 90_000)).toBe(90_000);
  });
});

describe('five-minute bins', () => {
  it('assigns each breath to exactly one window', () => {
    // 299s and 300s straddle the boundary; half-open bins put them either side.
    const bins = binsPerFiveMinutes(timeline(0, 299, 300, 600), 900_000);
    expect(bins.map((b) => b.count)).toEqual([2, 1, 1]);
  });

  it('marks a trailing partial window and never scales it up', () => {
    // 7 minutes elapsed: one full window, one 2-minute remainder.
    const bins = binsPerFiveMinutes(timeline(10, 20, 400), 420_000);
    expect(bins).toHaveLength(2);
    expect(bins[0]).toMatchObject({ partial: false, count: 2, endMs: FIVE_MINUTES_MS });
    expect(bins[1]).toMatchObject({ partial: true, count: 1, endMs: 420_000 });
  });

  it('excludes voided breaths', () => {
    const events = timeline(10, 20, 30);
    events[1]!.voidedAt = START;
    expect(binsPerFiveMinutes(events, 300_000)[0]!.count).toBe(2);
  });

  it('has no bins before any time has passed', () => {
    expect(binsPerFiveMinutes([], 0)).toEqual([]);
  });
});

describe('rate per minute', () => {
  it('is fractional, because a manatee breathes well under once a minute', () => {
    const [bin] = binsPerFiveMinutes(timeline(10, 60, 120, 240), 300_000);
    expect(ratePerMinute(bin!)).toBeCloseTo(0.8, 5);
  });

  it('handles a quiet window below one breath per minute', () => {
    // The case the upstream integer constraint cannot represent at all.
    const [bin] = binsPerFiveMinutes(timeline(30), 300_000);
    expect(ratePerMinute(bin!)).toBeCloseTo(0.2, 5);
  });

  it('uses the real duration of a partial window', () => {
    const bins = binsPerFiveMinutes(timeline(0, 310), 420_000);
    expect(ratePerMinute(bins[1]!)).toBeCloseTo(0.5, 5); // 1 breath in 2 min
  });
});

describe('rolling rate', () => {
  it('uses elapsed time as the denominator early on, not the full window', () => {
    // 2 breaths in the first minute reads as 10 per 5 min, not 2.
    expect(rollingRatePer5Min(timeline(5, 30), 60_000)).toBeCloseTo(10, 5);
  });

  it('drops breaths that fall out of the trailing window', () => {
    expect(rollingRatePer5Min(timeline(0, 10, 400), 600_000)).toBeCloseTo(1, 5);
  });

  it('is zero at the very start', () => {
    expect(rollingRatePer5Min([], 0)).toBe(0);
  });
});

describe('tap debounce', () => {
  it('rejects a second tap 400 ms after the first', () => {
    expect(decideTap(timeline(60), 60_400)).toEqual({
      accepted: false,
      reason: 'debounced',
      sinceLastMs: 400,
    });
  });

  it('accepts a tap once the guard has passed', () => {
    expect(decideTap(timeline(60), 61_000)).toEqual({ accepted: true });
  });

  it('always accepts the first tap of an assessment', () => {
    expect(decideTap([], 0)).toEqual({ accepted: true });
  });

  it('measures from the last non-voided breath', () => {
    const events = timeline(60, 61);
    events[1]!.voidedAt = START;
    expect(decideTap(events, 61_500)).toEqual({ accepted: true });
  });
});

describe('summary', () => {
  it('reports totals, spread, and the longest gap with its wall-clock time', () => {
    const summary = summarise(timeline(0, 40, 100, 130), 420_000);
    expect(summary.totalBreaths).toBe(4);
    expect(summary.intervalsMs).toEqual([40_000, 60_000, 30_000]);
    expect(summary.shortestIntervalMs).toBe(30_000);
    expect(summary.medianIntervalMs).toBe(40_000);
    expect(summary.longestIntervalMs).toBe(60_000);
    expect(summary.longestGap).toEqual({
      intervalMs: 60_000,
      endedAt: '2026-02-14T14:06:40.000Z',
    });
  });

  it('counts voided breaths separately and excludes them from derivations', () => {
    const events = timeline(0, 40, 100);
    events[1]!.voidedAt = START;
    const summary = summarise(events, 300_000);
    expect(summary.totalBreaths).toBe(2);
    expect(summary.voidedBreaths).toBe(1);
    expect(summary.intervalsMs).toEqual([100_000]);
  });

  it('survives an assessment with no breaths at all', () => {
    const summary = summarise([], 120_000);
    expect(summary).toMatchObject({
      totalBreaths: 0,
      intervalsMs: [],
      medianIntervalMs: null,
      longestGap: null,
    });
  });
});

describe('elapsed formatting', () => {
  it('renders m:ss', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(23_400)).toBe('0:23');
    expect(formatElapsed(68_000)).toBe('1:08');
    expect(formatElapsed(600_000)).toBe('10:00');
  });

  it('never renders a negative time', () => {
    expect(formatElapsed(-5000)).toBe('0:00');
  });
});

describe('clock behaviour', () => {
  it('is unaffected when the wall clock jumps ten minutes mid-series', () => {
    // The failure this whole design exists to prevent: an NTP correction must
    // not stretch the interval that spans it.
    const clock = createTestClock(START);
    const anchor = anchorAtStart(clock);

    clock.advance(40_000);
    const first = elapsedNow(anchor, clock);

    clock.jumpWallClock(10 * 60 * 1000);
    clock.advance(20_000);
    const second = elapsedNow(anchor, clock);

    expect(second - first).toBe(20_000);
  });

  it('keeps counting through three minutes in the background', () => {
    // A throttled JS timer misses ticks; elapsed time is recomputed from the
    // clock on resume rather than accumulated per tick, so nothing is lost.
    const clock = createTestClock(START);
    const anchor = anchorAtStart(clock);
    clock.advance(180_000);
    expect(elapsedNow(anchor, clock)).toBe(180_000);
  });

  it('re-anchors after a restart using the wall clock', () => {
    // performance.now() restarts with the process, so resuming has to fall back
    // to the wall clock once. Events already recorded keep their own values.
    const clock = createTestClock(START);
    clock.advance(300_000);
    const resumed = anchorAfterResume(clock, START, 240_000);
    expect(elapsedNow(resumed, clock)).toBe(300_000);

    clock.advance(15_000);
    expect(elapsedNow(resumed, clock)).toBe(315_000);
  });

  it('never moves an assessment into its own past on a backwards clock', () => {
    const clock = createTestClock(START);
    clock.advance(300_000);
    clock.jumpWallClock(-600_000);
    // Wall clock now claims the assessment has not started; the last recorded
    // breath is the floor.
    const resumed = anchorAfterResume(clock, START, 240_000);
    expect(elapsedNow(resumed, clock)).toBe(240_000);
  });
});

describe('active breaths', () => {
  it('sorts by elapsed time regardless of insertion order', () => {
    const events = [...timeline(0, 60, 30)].reverse();
    expect(activeBreaths(events).map((e) => e.elapsedMs)).toEqual([0, 30_000, 60_000]);
  });
});
