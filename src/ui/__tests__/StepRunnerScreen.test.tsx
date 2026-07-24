// RTL tests for the one-step runner (FR-7, FR-14, FR-15, NFR-5, NFR-6). Mocks the store the same
// way `ConfigScreen.test.tsx`'s "valid inputs" case does (`vi.spyOn` on the module namespace,
// selector-driven fake state) — these are pure "does the right thing render / get called" checks
// that don't need a real `generateWorkflow` run. `useWakeLock` is mocked separately so wake-lock
// acquisition (covered by its own test file) never runs against a real/absent browser API here.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import StepRunnerScreen from '../StepRunnerScreen';
import * as sessionStoreModule from '@/store/session';
import { useSessionStore, type SessionStore } from '@/store/session';
import { useWakeLock } from '@/hooks/useWakeLock';
import { pizzaRecipe } from '@/recipes/pizza';
import type { BakeSession, ScheduledStep } from '@/engine';

vi.mock('@/hooks/useWakeLock', () => ({
  useWakeLock: vi.fn(() => ({ wakeLockUnavailable: false })),
}));

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
    sessionKey: 'test-session-1',
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

/** Mocks `useSessionStore` with a static fake state, mirroring `ConfigScreen.test.tsx`'s pattern.
 * Returns the fake state so tests can assert against its action spies. */
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

beforeEach(() => {
  vi.mocked(useWakeLock).mockReturnValue({ wakeLockUnavailable: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('StepRunnerScreen — current step display (FR-14)', () => {
  it('shows the current step name, why text, and scheduled time', () => {
    mockStore(
      buildSession({
        workflow: [buildStep({ name: 'Mix', why: 'Mixing hydrates the flour.' })],
      }),
    );

    render(<StepRunnerScreen />);

    expect(screen.getByRole('heading', { name: 'Mix' })).toBeInTheDocument();
    expect(screen.getByText('Mixing hydrates the flour.')).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 1/i)).toBeInTheDocument();
  });

  it('does not show estimate framing for a step with no cue (e.g. mix)', () => {
    mockStore(buildSession({ workflow: [buildStep({ isEstimate: false })] }));

    render(<StepRunnerScreen />);

    expect(screen.queryByText(/trust dough feel/i)).not.toBeInTheDocument();
  });
});

describe('StepRunnerScreen — estimate framing (FR-15, NFR-5)', () => {
  it('a fermentation step with a cue shows the cue and the estimate label', () => {
    mockStore(
      buildSession({
        workflow: [
          buildStep({
            stageId: 'bulk',
            name: 'Bulk ferment',
            why: 'Bulk fermentation builds flavor and structure.',
            cue: 'Dough has visibly doubled and feels airy.',
            isEstimate: true,
          }),
        ],
      }),
    );

    render(<StepRunnerScreen />);

    expect(screen.getByRole('heading', { name: 'Bulk ferment' })).toBeInTheDocument();
    expect(screen.getByText('Dough has visibly doubled and feels airy.')).toBeInTheDocument();
    expect(screen.getByText(/trust dough feel over the clock/i)).toBeInTheDocument();
  });

  it('the fixed-type temper stage shows its cue + estimate framing too (pass-4 fix regression)', () => {
    // `temper`'s stage `type` is the literal string `'temper'`, not `'fermentation'` — this
    // asserts the rendering path is keyed on cue-presence (`isEstimate`), not on stage `type`,
    // so a `type`-based fermentation-only branch could never accidentally exclude it again.
    mockStore(
      buildSession({
        workflow: [
          buildStep({
            stageId: 'temper',
            name: 'Temper',
            why: 'Cold dough needs to warm before it will stretch properly.',
            cue: 'Dough interior feels close to room temperature.',
            isEstimate: true,
          }),
        ],
      }),
    );

    render(<StepRunnerScreen />);

    expect(screen.getByRole('heading', { name: 'Temper' })).toBeInTheDocument();
    expect(screen.getByText('Dough interior feels close to room temperature.')).toBeInTheDocument();
    expect(screen.getByText(/trust dough feel over the clock/i)).toBeInTheDocument();
  });
});

describe('StepRunnerScreen — bake caveat (Phase 4.2 plan-change, Task 1)', () => {
  it('shows the persisted bakeAdaptation caveat on the bake step when present', () => {
    mockStore(
      buildSession({
        workflow: [buildStep({ stageId: 'bake', name: 'Bake', isEstimate: false })],
        bakeAdaptation: {
          bakeTempC: 210,
          bakeTimeMinutes: 12,
          caveat: 'Your oven runs cooler than ideal — results may be less crisp than a hotter oven.',
        },
      }),
    );

    render(<StepRunnerScreen />);

    expect(
      screen.getByText(/results may be less crisp than a hotter oven/i),
    ).toBeInTheDocument();
  });

  it('shows no caveat banner when bakeAdaptation has none (uncaveated bake)', () => {
    mockStore(
      buildSession({
        workflow: [buildStep({ stageId: 'bake', name: 'Bake', isEstimate: false })],
        bakeAdaptation: { bakeTempC: 280, bakeTimeMinutes: 8 },
      }),
    );

    render(<StepRunnerScreen />);

    expect(screen.queryByRole('note', { name: 'Bake caveat' })).not.toBeInTheDocument();
  });
});

describe('StepRunnerScreen — unconditional bake temp/time (iteration 1.2)', () => {
  it('shows bakeTempC/bakeTimeMinutes on the bake step with no caveat present (today\'s gap)', () => {
    mockStore(
      buildSession({
        workflow: [buildStep({ stageId: 'bake', name: 'Bake', isEstimate: false })],
        bakeAdaptation: { bakeTempC: 280, bakeTimeMinutes: 8 },
      }),
    );

    render(<StepRunnerScreen />);

    expect(screen.getByText(/280°C for 8 min/)).toBeInTheDocument();
  });

  it('shows bakeTempC/bakeTimeMinutes on the bake step alongside a caveat when one is present (regression, unchanged)', () => {
    mockStore(
      buildSession({
        workflow: [buildStep({ stageId: 'bake', name: 'Bake', isEstimate: false })],
        bakeAdaptation: {
          bakeTempC: 210,
          bakeTimeMinutes: 12,
          caveat: 'Your oven runs cooler than ideal — results may be less crisp than a hotter oven.',
        },
      }),
    );

    render(<StepRunnerScreen />);

    expect(screen.getByText(/210°C for 12 min/)).toBeInTheDocument();
    expect(
      screen.getByText(/results may be less crisp than a hotter oven/i),
    ).toBeInTheDocument();
  });

  it('does not show bake temp/time on a non-bake step even when bakeAdaptation exists', () => {
    mockStore(
      buildSession({
        workflow: [buildStep({ stageId: 'mix', name: 'Mix', isEstimate: false })],
        bakeAdaptation: { bakeTempC: 280, bakeTimeMinutes: 8 },
      }),
    );

    render(<StepRunnerScreen />);

    expect(screen.queryByText(/280°C for 8 min/)).not.toBeInTheDocument();
  });
});

describe('StepRunnerScreen — live countdown (iteration 2.3)', () => {
  it('mounts CountdownTimer for the active step, showing its live end time', () => {
    mockStore(
      buildSession({
        workflow: [
          buildStep({
            stageId: 'mix',
            name: 'Mix',
            clockStartTime: new Date('2026-07-19T10:00:00'),
            durationMinutes: 60,
            isEstimate: false,
          }),
        ],
      }),
    );

    render(<StepRunnerScreen />);

    expect(screen.getByText(/ends ~.*·.*m left/)).toBeInTheDocument();
  });

  it('an isEstimate active step shows the no-live-count countdown form (regression: unchanged framing)', () => {
    mockStore(
      buildSession({
        workflow: [
          buildStep({
            stageId: 'bulk',
            name: 'Bulk ferment',
            cue: 'Dough has visibly doubled and feels airy.',
            clockStartTime: new Date('2026-07-19T10:00:00'),
            durationMinutes: 240,
            isEstimate: true,
          }),
        ],
      }),
    );

    render(<StepRunnerScreen />);

    // Existing estimate framing (ESTIMATE_LABEL/cue) still renders unchanged alongside the new
    // countdown — this is the regression guard the phase file calls for.
    expect(screen.getByText(/trust dough feel over the clock/i)).toBeInTheDocument();
    expect(screen.getByText(/ends ~.*\(estimate\)/)).toBeInTheDocument();
    expect(screen.queryByText(/m left/)).not.toBeInTheDocument();
  });
});

describe('StepRunnerScreen — Recipe Card (iteration 1.2)', () => {
  it('the "Recipe" button opens the Recipe Card', () => {
    mockStore(buildSession());

    render(<StepRunnerScreen />);

    expect(screen.queryByRole('dialog', { name: 'Recipe card' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^recipe$/i }));
    expect(screen.getByRole('dialog', { name: 'Recipe card' })).toBeInTheDocument();
  });

  it('closing the Recipe Card (its Close button) removes it from the screen', () => {
    mockStore(buildSession());

    render(<StepRunnerScreen />);

    fireEvent.click(screen.getByRole('button', { name: /^recipe$/i }));
    expect(screen.getByRole('dialog', { name: 'Recipe card' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(screen.queryByRole('dialog', { name: 'Recipe card' })).not.toBeInTheDocument();
  });
});

describe('StepRunnerScreen — advance / back (FR-7)', () => {
  it('"Done — next step" calls store.advanceStep', () => {
    const state = mockStore(buildSession());

    render(<StepRunnerScreen />);
    fireEvent.click(screen.getByRole('button', { name: /done — next step/i }));

    expect(state.advanceStep).toHaveBeenCalledTimes(1);
  });

  it('"Go back" calls store.backStep', () => {
    const state = mockStore(buildSession({ stepIndex: 1, workflow: [buildStep(), buildStep({ stageId: 'bulk', name: 'Bulk ferment' })] }));

    render(<StepRunnerScreen />);
    fireEvent.click(screen.getByRole('button', { name: /go back/i }));

    expect(state.backStep).toHaveBeenCalledTimes(1);
  });
});

describe('StepRunnerScreen — wake-lock hint (NFR-7)', () => {
  it('renders WakeLockHint when the hook reports wake-lock unavailable', () => {
    vi.mocked(useWakeLock).mockReturnValue({ wakeLockUnavailable: true });
    mockStore(buildSession());

    render(<StepRunnerScreen />);

    expect(screen.getByText(/screen may dim/i)).toBeInTheDocument();
  });

  it('does not render WakeLockHint when the hook reports wake-lock available', () => {
    vi.mocked(useWakeLock).mockReturnValue({ wakeLockUnavailable: false });
    mockStore(buildSession());

    render(<StepRunnerScreen />);

    expect(screen.queryByText(/screen may dim/i)).not.toBeInTheDocument();
  });
});

describe('StepRunnerScreen — completion (FR-7, FR-20)', () => {
  it('shows the completion screen once the session status is completed, and "Start a new bake" resets', () => {
    const state = mockStore(buildSession({ status: 'completed', stepIndex: 0 }));

    render(<StepRunnerScreen />);

    expect(screen.getByText(/you.re done — enjoy your pizza/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /start a new bake/i }));
    expect(state.resetSession).toHaveBeenCalledTimes(1);
  });
});
