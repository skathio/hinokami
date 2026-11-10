// RTL tests for the live countdown (Phase 2, iteration 2.3). Two different techniques, on
// purpose:
//  - (a) wall-clock tick and (c) isEstimate framing use a static mocked store (`mockStore`,
//    mirroring `StepRunnerScreen.test.tsx`/`NudgePanel.test.tsx`'s pattern) — pure "does the
//    right thing render" checks that don't need a real schedule.
//  - (b) is the reactivity test: it deliberately uses the REAL `useSessionStore` + the real
//    `applyNudge` action (never a mocked reschedule), the same technique
//    `NudgePanel.test.tsx`'s clamp-notice tests use for the same reason — a mock can't validate
//    whether the component is actually wired to live store state or just to a value it captured
//    once. This is the test that directly closes the brief's flagged countdown-desync risk
//    (plan review F-1): a `clockStartTime` captured at mount would never move, so this test
//    would fail against that implementation (verified by hand: see the diary entry / summary).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import CountdownTimer from '../CountdownTimer';
import * as sessionStoreModule from '@/store/session';
import { useSessionStore, type SessionStore } from '@/store/session';
import { pizzaRecipe } from '@/recipes/pizza';
import type { BakeSession, ScheduledStep } from '@/engine';

function formatClockTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function buildStep(overrides: Partial<ScheduledStep> = {}): ScheduledStep {
  return {
    stageId: 'mix',
    name: 'Mix',
    why: 'Mixing hydrates the flour and starts gluten development.',
    durationMinutes: 60,
    clockStartTime: new Date('2026-07-19T10:00:00'),
    isEstimate: false,
    ...overrides,
  };
}

function buildSession(overrides: Partial<BakeSession> = {}): BakeSession {
  return {
    schemaVersion: 1,
    sessionKey: 'countdown-test-session',
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

/** Mocks `useSessionStore` with a static fake state — mirrors
 * `StepRunnerScreen.test.tsx`/`NudgePanel.test.tsx`'s pattern. Only used by (a)/(c) below; (b)
 * deliberately avoids this and uses the real store instead (see file header). */
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

describe('CountdownTimer — wall-clock tick (a)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('the displayed remaining-minutes figure decreases as wall-clock time passes', () => {
    vi.useFakeTimers();
    const baseNow = new Date('2026-07-19T10:00:00');
    vi.setSystemTime(baseNow);

    mockStore(
      buildSession({
        workflow: [buildStep({ clockStartTime: baseNow, durationMinutes: 60, isEstimate: false })],
      }),
    );

    render(<CountdownTimer />);
    expect(screen.getByText(/≈60m left/)).toBeInTheDocument();

    // 10 ticks of the component's 30s interval = 5 simulated minutes.
    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });

    expect(screen.queryByText(/≈60m left/)).not.toBeInTheDocument();
    expect(screen.getByText(/≈55m left/)).toBeInTheDocument();
  });
});

describe('CountdownTimer — long waits', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads in hours and minutes once the step is two hours or more away', () => {
    vi.useFakeTimers();
    const baseNow = new Date('2026-07-19T10:00:00');
    vi.setSystemTime(baseNow);
    const start = new Date(baseNow.getTime() + 21 * 3_600_000);
    mockStore(
      buildSession({ workflow: [buildStep({ clockStartTime: start, durationMinutes: 19, isEstimate: false })] }),
    );

    render(<CountdownTimer />);

    expect(screen.getByText(/≈21 h 19 m left/)).toBeInTheDocument();
  });

  it('keeps the minutes form just under two hours', () => {
    vi.useFakeTimers();
    const baseNow = new Date('2026-07-19T10:00:00');
    vi.setSystemTime(baseNow);
    mockStore(buildSession({ workflow: [buildStep({ clockStartTime: baseNow, durationMinutes: 119, isEstimate: false })] }));

    render(<CountdownTimer />);

    expect(screen.getByText(/≈119m left/)).toBeInTheDocument();
  });
});

describe('CountdownTimer — reactivity to a real pace-nudge reschedule (b, plan review F-1)', () => {
  it(
    'reflects the RESCHEDULED end time after a real store applyNudge call, without remounting',
    () => {
      const startClock = new Date('2026-07-19T10:00:00');
      useSessionStore.setState({
        session: buildSession({
          workflow: [buildStep({ clockStartTime: startClock, durationMinutes: 60, isEstimate: false })],
          stepIndex: 0,
        }),
        migrationNotice: null,
        view: 'runner',
        lastNudgeClamped: false,
        scaledIngredients: null,
      });

      render(<CountdownTimer />);

      const beforeEnd = formatClockTime(new Date(startClock.getTime() + 60 * 60_000));
      expect(screen.getByText(new RegExp(`ends ~${beforeEnd}`))).toBeInTheDocument();

      // Real store action — `engine/progression.ts`'s `applyNudge`, via `engine/schedule.ts`'s
      // `reschedule` — NOT a mocked reschedule. `reschedule` returns a brand-new `ScheduledStep`
      // object (`schedule.ts:296`) and `applyNudge` builds a brand-new `workflow` array + session
      // (`progression.ts:57-60`); nothing here mutates the original step in place.
      act(() => {
        useSessionStore.getState().applyNudge(15);
      });

      const afterEnd = formatClockTime(new Date(startClock.getTime() + 75 * 60_000));
      // Sanity: the nudge must actually have moved the displayed minute, or this test would pass
      // vacuously regardless of whether the component re-reads the store.
      expect(afterEnd).not.toBe(beforeEnd);

      // No remount happened — same `render()` call throughout. If `CountdownTimer` had captured
      // `clockStartTime` once at mount (or memoized it independently of the store) instead of
      // reading a live selector every render, this component would still show `beforeEnd` here
      // and `getByText(afterEnd)` below would throw — hand-verified by temporarily reverting the
      // component to a mount-captured value and confirming this exact assertion fails.
      expect(screen.queryByText(new RegExp(`ends ~${beforeEnd}`))).not.toBeInTheDocument();
      expect(screen.getByText(new RegExp(`ends ~${afterEnd}`))).toBeInTheDocument();
    },
  );
});

describe('CountdownTimer — isEstimate framing (c, D4 Option C)', () => {
  it('an isEstimate step shows only "ends ~HH:MM (estimate)" — never a live minute count', () => {
    mockStore(
      buildSession({
        workflow: [
          buildStep({
            stageId: 'bulk',
            name: 'Bulk ferment',
            clockStartTime: new Date('2026-07-19T10:00:00'),
            durationMinutes: 240,
            isEstimate: true,
          }),
        ],
      }),
    );

    render(<CountdownTimer />);

    expect(screen.getByText(/ends ~.*\(estimate\)/)).toBeInTheDocument();
    expect(screen.queryByText(/m left/)).not.toBeInTheDocument();
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument();
  });

  it('a non-isEstimate step shows the full live form ("ends ~HH:MM · ≈Nm left")', () => {
    mockStore(
      buildSession({
        workflow: [
          buildStep({
            clockStartTime: new Date('2026-07-19T10:00:00'),
            durationMinutes: 60,
            isEstimate: false,
          }),
        ],
      }),
    );

    render(<CountdownTimer />);

    expect(screen.getByText(/ends ~.*·.*m left/)).toBeInTheDocument();
    expect(screen.queryByText(/\(estimate\)/)).not.toBeInTheDocument();
  });
});
