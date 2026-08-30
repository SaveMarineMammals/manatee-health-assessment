import { fireEvent, render, screen } from '@testing-library/react-native';
import { createTestClock, anchorAtStart, type BreathEvent } from '@manatee/core';
import { ELEVATED_AFTER_MS, TrackerScreen } from './TrackerScreen';

/**
 * The invariant these tests exist for: **the record target does not move.**
 *
 * A note on what is and is not checked here. React Native's test renderer has
 * no layout engine, so this cannot measure pixels. What it can prove is the
 * thing that actually breaks — that no zone is conditionally inserted, removed
 * or restyled between states, which is how a button ends up somewhere else.
 * Measured geometry on a real screen is a device test, and belongs to the
 * Maestro suite in P6.
 */

const START = '2026-02-14T14:05:00.000Z';

function breath(sequence: number, elapsedMs: number): BreathEvent {
  return {
    id: `b${sequence}`,
    sequence,
    recordedAt: new Date(Date.parse(START) + elapsedMs).toISOString(),
    elapsedMs,
  };
}

function renderTracker(overrides: Partial<Parameters<typeof TrackerScreen>[0]> = {}) {
  const clock = createTestClock(START);
  const props = {
    assessmentName: 'Belize-2026-014',
    events: [] as BreathEvent[],
    clock,
    anchor: anchorAtStart(clock),
    onRecordBreath: jest.fn(),
    onVoidLast: jest.fn(),
    onEnd: jest.fn(),
    elapsedMsOverride: 0,
    ...overrides,
  };
  return { ...render(<TrackerScreen {...props} />), props, clock };
}

/** Resolved style of a node, flattened across the array form. */
function styleOf(testID: string) {
  const style = screen.getByTestId(testID).props.style;
  return JSON.stringify(Array.isArray(style) ? Object.assign({}, ...style.flat()) : style);
}

describe('locked zones', () => {
  const calm = { events: [breath(1, 10_000)], elapsedMsOverride: 20_000 };
  const elevated = { events: [breath(1, 10_000)], elapsedMsOverride: 10_000 + ELEVATED_AFTER_MS };

  it('renders every zone in both states', () => {
    for (const state of [calm, elevated]) {
      const view = renderTracker(state);
      for (const zone of ['reserved-slot', 'record-zone', 'log-zone']) {
        expect(screen.getByTestId(zone)).toBeTruthy();
      }
      view.unmount();
    }
  });

  it('gives the record zone an identical resolved style in both states', () => {
    const first = renderTracker(calm);
    const calmStyle = styleOf('record-zone');
    first.unmount();

    renderTracker(elevated);
    expect(styleOf('record-zone')).toBe(calmStyle);
  });

  it('keeps the reserved slot present when calm, rather than inserting it on alarm', () => {
    // The original bug: the warning was inserted above the button and pushed it
    // down. The slot must exist in both states and only swap its contents.
    const first = renderTracker(calm);
    const calmSlot = styleOf('reserved-slot');
    expect(screen.getByText(/1 BREATHS/)).toBeTruthy();
    first.unmount();

    renderTracker(elevated);
    expect(styleOf('reserved-slot')).toBe(calmSlot);
    expect(screen.getByText(/CONSIDER INDUCING/)).toBeTruthy();
  });

  it('keeps the zones in the same order in both states', () => {
    const order = () =>
      ['reserved-slot', 'record-zone', 'log-zone'].map((id) => screen.getByTestId(id).type);
    const first = renderTracker(calm);
    const calmOrder = order();
    first.unmount();
    renderTracker(elevated);
    expect(order()).toEqual(calmOrder);
  });
});

describe('recording a breath', () => {
  it('reports the tap with elapsed milliseconds', () => {
    const { props, clock } = renderTracker({ elapsedMsOverride: undefined });
    clock.advance(42_000);
    fireEvent.press(screen.getByTestId('record-breath'));
    expect(props.onRecordBreath).toHaveBeenCalledWith(42_000);
  });

  it('rejects a second tap 400 ms later and says so on screen', () => {
    const clock = createTestClock(START);
    const anchor = anchorAtStart(clock);
    clock.advance(60_000);
    const onRecordBreath = jest.fn();

    render(
      <TrackerScreen
        assessmentName="Belize-2026-014"
        events={[breath(1, 60_000)]}
        clock={clock}
        anchor={anchor}
        onRecordBreath={onRecordBreath}
        onVoidLast={jest.fn()}
        onEnd={jest.fn()}
      />,
    );

    clock.advance(400);
    fireEvent.press(screen.getByTestId('record-breath'));

    expect(onRecordBreath).not.toHaveBeenCalled();
    // Silence would be indistinguishable from a missed tap.
    expect(screen.getByText(/IGNORED — BREATH RECORDED 0\.4s AGO/)).toBeTruthy();
  });
});

describe('the log', () => {
  it('lists newest first so the latest entry is always in view', () => {
    renderTracker({
      events: [breath(1, 0), breath(2, 45_000), breath(3, 100_000)],
      elapsedMsOverride: 110_000,
    });
    const rows = screen.getAllByText(/^#\d/);
    expect(rows.map((r) => r.props.children.join(''))).toEqual([
      '#3 14:06:40',
      '#2 14:05:45',
      '#1 14:05:00',
    ]);
  });

  it('shows the interval against each breath but not the first', () => {
    renderTracker({ events: [breath(1, 0), breath(2, 45_000)], elapsedMsOverride: 50_000 });
    expect(screen.getByText('+0:45')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('excludes voided breaths', () => {
    const voided = { ...breath(2, 45_000), voidedAt: START };
    renderTracker({ events: [breath(1, 0), voided], elapsedMsOverride: 50_000 });
    expect(screen.queryByText(/^#2/)).toBeNull();
  });

  it('undoes the last breath through a control of its own, not a gesture', () => {
    const { props } = renderTracker({ events: [breath(1, 0)], elapsedMsOverride: 5_000 });
    fireEvent.press(screen.getByLabelText('Undo last breath'));
    expect(props.onVoidLast).toHaveBeenCalledTimes(1);
  });

  it('disables undo when there is nothing to undo', () => {
    const { props } = renderTracker();
    fireEvent.press(screen.getByLabelText('Undo last breath'));
    expect(props.onVoidLast).not.toHaveBeenCalled();
  });
});

describe('the headline timer', () => {
  it('counts from the last breath', () => {
    renderTracker({ events: [breath(1, 10_000)], elapsedMsOverride: 33_000 });
    expect(screen.getByTestId('since-last-breath').props.children).toBe('0:23');
  });

  it('counts from the assessment start when nothing has been recorded', () => {
    renderTracker({ elapsedMsOverride: 45_000 });
    expect(screen.getByTestId('since-last-breath').props.children).toBe('0:45');
  });
});

describe('ending an assessment', () => {
  it('is reachable from the header, away from the record target', () => {
    const { props } = renderTracker();
    fireEvent.press(screen.getByLabelText('End assessment'));
    expect(props.onEnd).toHaveBeenCalledTimes(1);
  });
});
