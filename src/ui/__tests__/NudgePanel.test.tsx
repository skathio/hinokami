// RTL tests for the pace nudge (FR-17). Most cases mock the store the same way
// `StepRunnerScreen.test.tsx` does — a static fake `SessionStore` state, spied onto the module
// namespace — since they're pure "does the right thing get called" checks. The clamp-notice
// tests below (review fix, pass 2) deliberately use the REAL store instead, the same technique
// `ConfigScreen.test.tsx`'s exception-flow tests use: the whole point of those tests is that the
// notice reflects a real `reschedule`/`applyNudge` clamp computation, not a mocked one — a mock
// can't validate whether the wiring between the engine's real clamp signal and the UI is correct.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import NudgePanel from '../NudgePanel';
import * as sessionStoreModule from '@/store/session';
import { useSessionStore, type SessionStore } from '@/store/session';
import { pizzaRecipe } from '@/recipes/pizza';
import type { BakeSession, ScheduledStep } from '@/engine';

function buildStep(overrides: Partial<ScheduledStep> = {}): ScheduledStep {
  return {
    stageId: 'mix',
    name: 'Mix',
    why: 'Mixing hydrates the flour and starts gluten development.',
    durationMinutes: 15,
    clockStartTime: new Date('2026-07-19T10:00:00'),
    isEstimate: false,
    ...overrides,
  };
}

function buildSession(overrides: Partial<BakeSession> = {}): BakeSession {
  return {
    schemaVersion: 1,
    sessionKey: 'nudge-test-session',
    recipeId: pizzaRecipe.id,
    recipeContentVersion: '1.0.0',
    inputs: {
      targetTime: new Date('2026-07-19T20:00:00').toISOString(),
      ovenMaxC: 250,
      hasStoneOrSteel: false,
      ambientC: 24,
      ballCount: 2,
      ballWeightG: 250,
      pathway: 'same-day',
    },
    workflow: [buildStep()],
    stepIndex: 0,
    status: 'in-progress',
    ...overrides,
  };
}

function mockStore(session: BakeSession | null, overrides: Partial<SessionStore> = {}): SessionStore {
  const state: SessionStore = {
    session,
    migrationNotice: null,
    view: 'runner',
    lastNudgeClamped: false,
    scaledIngredients: null,
    startSession: vi.fn(),
    advanceStep: vi.fn(),
    backStep: vi.fn(),
    applyNudge: vi.fn(),
    resetSession: vi.fn(),
    dismissMigrationNotice: vi.fn(),
    setView: vi.fn(),
    syncViewAfterHydration: vi.fn(),
    recomputeScaledIngredients: vi.fn(),
    ...overrides,
  };
  vi.spyOn(sessionStoreModule, 'useSessionStore').mockImplementation(
    ((selector: (s: SessionStore) => unknown) => selector(state)) as typeof useSessionStore,
  );
  return state;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NudgePanel — pace nudge buttons (FR-17)', () => {
  it.each([
    ['-15 min', -15],
    ['-5 min', -5],
    ['+5 min', 5],
    ['+15 min', 15],
  ])('the "%s" button calls store.applyNudge(%i)', (label, delta) => {
    const state = mockStore(buildSession());

    render(<NudgePanel onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: label }));

    expect(state.applyNudge).toHaveBeenCalledWith(delta);
  });

  it('calls onClose when the close control is clicked', () => {
    mockStore(buildSession());
    const onClose = vi.fn();

    render(<NudgePanel onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close nudge panel/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when there is no active session', () => {
    mockStore(null);

    const { container } = render(<NudgePanel onClose={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });
});

// Two schedules, distinguished only by how much headroom the LAST (bake) step has before the
// fixed target — the bake step's headroom is always exactly its own `durationMinutes`, since
// `solveScheduleBackward`/`reschedule`'s target is defined as (last step's start + its duration).
// The CURRENT step (mix, index 0) always has generous headroom in both cases — this is the exact
// shape of the bug the review found: a heuristic that only checks the current step's movement
// cannot see the bake step clamping.
function buildNearTargetSession(): BakeSession {
  const t0 = new Date('2026-07-19T10:00:00');
  return buildSession({
    workflow: [
      buildStep({ stageId: 'mix', name: 'Mix', clockStartTime: t0, durationMinutes: 15 }),
      buildStep({
        stageId: 'bake',
        name: 'Bake',
        clockStartTime: new Date(t0.getTime() + 40 * 60_000),
        durationMinutes: 5, // only 5 min of headroom before target
        isEstimate: false,
      }),
    ],
    stepIndex: 0,
  });
}

function buildAmpleSlackSession(): BakeSession {
  const t0 = new Date('2026-07-19T10:00:00');
  return buildSession({
    workflow: [
      buildStep({ stageId: 'mix', name: 'Mix', clockStartTime: t0, durationMinutes: 15 }),
      buildStep({
        stageId: 'bake',
        name: 'Bake',
        clockStartTime: new Date(t0.getTime() + 300 * 60_000),
        durationMinutes: 10, // 10 min of headroom before target
        isEstimate: false,
      }),
    ],
    stepIndex: 0,
  });
}

describe('NudgePanel — clamp notice reflects the real engine signal (review fix, pass 2, Major)', () => {
  beforeEach(() => {
    useSessionStore.setState({
      session: null,
      migrationNotice: null,
      view: 'runner',
      lastNudgeClamped: false,
    });
  });

  it(
    'shows the notice when the engine clamps the BAKE step, even though the CURRENT step ' +
      '(the one a before/after heuristic would check) was not itself clamped',
    () => {
      useSessionStore.setState({ session: buildNearTargetSession() });

      render(<NudgePanel onClose={vi.fn()} />);
      // +15 min: mix (40 min headroom) moves freely; bake (5 min headroom) clamps at target.
      fireEvent.click(screen.getByRole('button', { name: '+15 min' }));

      expect(screen.getByText(/can.t go further/i)).toBeInTheDocument();
    },
  );

  it('does not show the notice when the engine reports the nudge was fully honored', () => {
    useSessionStore.setState({ session: buildAmpleSlackSession() });

    render(<NudgePanel onClose={vi.fn()} />);
    // +5 min stays within bake's 10 min headroom — nothing clamps.
    fireEvent.click(screen.getByRole('button', { name: '+5 min' }));

    expect(screen.queryByText(/can.t go further/i)).not.toBeInTheDocument();
  });

  it('does not show a stale notice on mount, before any press this session', () => {
    // Simulates reopening the panel after an earlier press (in a different mount) left
    // `lastNudgeClamped: true` on the store — the notice must not resurface until a new press.
    useSessionStore.setState({ session: buildNearTargetSession(), lastNudgeClamped: true });

    render(<NudgePanel onClose={vi.fn()} />);

    expect(screen.queryByText(/can.t go further/i)).not.toBeInTheDocument();
  });
});
