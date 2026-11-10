// RTL tests for the input/config form (FR-12 inline validation, FR-10/FR-11 inline exception
// flows). The first three cases exercise the REAL store — they need `generateWorkflow`'s actual
// `adaptBake`/`solveScheduleBackward` behavior to produce a genuine `OvenTooCold`/`TargetTooSoon`
// result, not a stubbed one. Only the last case ("valid inputs → startSession called") mocks the
// store, per the phase file's test list — it's a pure "was the right call made" assertion that
// doesn't need a real generation to succeed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ConfigScreen from '../ConfigScreen';
import { pizzaRecipe } from '@/recipes/pizza';
import { useSessionStore, type SessionStore } from '@/store/session';
import * as sessionStoreModule from '@/store/session';
import { generateWorkflow, type WorkflowInputs } from '@/engine';

// Must match ConfigScreen's `ACCEPT_EARLIEST_BUFFER_MINUTES` (1 minute) — duplicated here rather
// than imported, matching this file's existing convention of re-deriving expectations
// independently (see `toDateTimeLocalValue` below) instead of reaching into the component's
// internals.
const ACCEPT_EARLIEST_BUFFER_MS = 60_000;

function resetStore(): void {
  useSessionStore.setState({ session: null, migrationNotice: null, view: 'config' });
}

beforeEach(() => {
  localStorage.clear();
  resetStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fillOven(valueC: number): void {
  fireEvent.change(screen.getByLabelText('Oven maximum temperature'), { target: { value: String(valueC) } });
}

function fillAmbient(valueC: number): void {
  fireEvent.change(screen.getByLabelText('Ambient room temperature'), { target: { value: String(valueC) } });
}

function fillBallCount(value: number): void {
  fireEvent.change(screen.getByLabelText('Number of dough balls'), { target: { value: String(value) } });
}

function fillTargetTime(date: Date): void {
  fireEvent.change(screen.getByLabelText('Target ready time'), {
    target: { value: toDateTimeLocalValue(date) },
  });
}

function selectPathway(name: string): void {
  fireEvent.click(screen.getByRole('radio', { name }));
}

function submit(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
}

describe('ConfigScreen — inline validation (FR-12)', () => {
  it('submit with a missing required field shows that field’s specific error and does not generate', () => {
    render(<ConfigScreen recipe={pizzaRecipe} />);

    // Fill every field except target ready time.
    fillOven(250);
    fillAmbient(24);
    fillBallCount(2);
    selectPathway('Same-day');
    // targetTime intentionally left blank

    submit();

    expect(screen.getByText('Target ready time is required.')).toBeInTheDocument();
    expect(useSessionStore.getState().session).toBeNull();
  });
});

describe('ConfigScreen — oven-too-cold exception (FR-10)', () => {
  it('submit with oven max = 150°C shows the OvenTooCold banner instead of generating', () => {
    render(<ConfigScreen recipe={pizzaRecipe} />);

    fillTargetTime(new Date(Date.now() + 10 * 60 * 60_000));
    fillOven(150);
    fillAmbient(24);
    fillBallCount(2);
    selectPathway('Same-day');

    submit();

    // Scoped by the banner's own text rather than getByRole('alert'), which would throw
    // "multiple elements" if a field error (also role="alert") were on screen alongside it.
    const banner = screen.getByText(/needs a hotter oven/i).closest('[role="alert"]') as HTMLElement;
    expect(banner).toHaveTextContent('150');
    expect(useSessionStore.getState().session).toBeNull();
  });
});

describe('ConfigScreen — target-too-soon exception (FR-11)', () => {
  it('submit with a target 10 minutes away on the cold-ferment pathway shows the TargetTooSoon banner', () => {
    render(<ConfigScreen recipe={pizzaRecipe} />);

    fillTargetTime(new Date(Date.now() + 10 * 60_000));
    fillOven(250);
    fillAmbient(24);
    fillBallCount(2);
    selectPathway('Cold ferment');

    submit();

    // Scoped by the banner's own text rather than getByRole('alert') — see the OvenTooCold
    // test above for why.
    const banner = screen.getByText(/too soon/i).closest('[role="alert"]') as HTMLElement;
    expect(banner).toHaveTextContent(/earliest feasible/i);
    expect(useSessionStore.getState().session).toBeNull();
  });
});

describe('ConfigScreen — valid inputs (store mocked)', () => {
  it('calls store.startSession with the entered inputs', () => {
    const startSessionSpy = vi.fn().mockReturnValue({
      ok: true,
      steps: [],
      scaledIngredients: [],
      bakeAdaptation: { bakeTempC: 250, bakeTimeMinutes: 8 },
    });
    const fakeState: SessionStore = {
      session: null,
      migrationNotice: null,
      view: 'config',
      lastNudgeClamped: false,
      scaledIngredients: null,
      startSession: startSessionSpy,
      advanceStep: vi.fn(),
      backStep: vi.fn(),
      applyNudge: vi.fn(),
      resetSession: vi.fn(),
      dismissMigrationNotice: vi.fn(),
      setView: vi.fn(),
      syncViewAfterHydration: vi.fn(),
      recomputeScaledIngredients: vi.fn(),
    };
    vi.spyOn(sessionStoreModule, 'useSessionStore').mockImplementation(
      ((selector: (state: SessionStore) => unknown) => selector(fakeState)) as typeof useSessionStore,
    );

    render(<ConfigScreen recipe={pizzaRecipe} />);

    const target = new Date(Date.now() + 10 * 60 * 60_000);
    fillTargetTime(target);
    fillOven(250);
    fillAmbient(24);
    fillBallCount(2);
    selectPathway('Same-day');

    submit();

    expect(startSessionSpy).toHaveBeenCalledTimes(1);
    const [recipeArg, inputsArg] = startSessionSpy.mock.calls[0];
    expect(recipeArg).toBe(pizzaRecipe);
    expect(inputsArg).toMatchObject({
      ovenMaxC: 250,
      hasStoneOrSteel: false,
      ambientC: 24,
      ballCount: 2,
      ballWeightG: 250,
      pathway: 'same-day',
    });
    expect(inputsArg.targetTime).toBeInstanceOf(Date);
  });
});

// Iteration 1.3 — "Use earliest time" minute-truncation bug fix. Two cases per the phase file's
// plan review (F-4): a cheap wiring/shape check (below), and a real-engine regression case that
// actually proves the buffer is large enough, not just that the UI passes *some* later value.

describe('ConfigScreen — "Use earliest time" wiring (bug fix, iteration 1.3)', () => {
  it('resubmits a targetTime at or after earliestFeasibleTarget plus the buffer (store mocked — proves wiring only, not buffer sufficiency)', () => {
    // A fractional-second earliestFeasibleTarget — the exact shape a real Q10 fermentation-stage
    // computation produces (see the real-engine case below for why).
    const fractionalEarliest = new Date(Date.now() + 60 * 60_000 + 30_750);
    const startSessionSpy = vi
      .fn()
      .mockReturnValueOnce({
        ok: false,
        error: { earliestFeasibleTarget: fractionalEarliest, alternativePathways: [] },
      })
      .mockReturnValueOnce({
        ok: true,
        steps: [],
        scaledIngredients: [],
        bakeAdaptation: { bakeTempC: 250, bakeTimeMinutes: 8 },
      });
    const fakeState: SessionStore = {
      session: null,
      migrationNotice: null,
      view: 'config',
      lastNudgeClamped: false,
      scaledIngredients: null,
      startSession: startSessionSpy,
      advanceStep: vi.fn(),
      backStep: vi.fn(),
      applyNudge: vi.fn(),
      resetSession: vi.fn(),
      dismissMigrationNotice: vi.fn(),
      setView: vi.fn(),
      syncViewAfterHydration: vi.fn(),
      recomputeScaledIngredients: vi.fn(),
    };
    vi.spyOn(sessionStoreModule, 'useSessionStore').mockImplementation(
      ((selector: (state: SessionStore) => unknown) => selector(fakeState)) as typeof useSessionStore,
    );

    render(<ConfigScreen recipe={pizzaRecipe} />);

    fillTargetTime(new Date(Date.now() + 10 * 60 * 60_000));
    fillOven(250);
    fillAmbient(24);
    fillBallCount(2);
    selectPathway('Same-day');
    submit();

    expect(startSessionSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /^Use / }));

    expect(startSessionSpy).toHaveBeenCalledTimes(2);
    const [, secondInputs] = startSessionSpy.mock.calls[1];
    expect((secondInputs.targetTime as Date).getTime()).toBeGreaterThanOrEqual(
      fractionalEarliest.getTime() + ACCEPT_EARLIEST_BUFFER_MS,
    );
  });
});

describe('ConfigScreen — "Use earliest time" closes the real feasibility gap (bug fix, iteration 1.3)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resubmission succeeds after simulated wall-clock time elapses before the click (real engine + real store, no mocks)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const baseNow = new Date('2026-07-24T09:00:00.000Z');
    vi.setSystemTime(baseNow);

    // Same-day pathway at a non-reference ambient: `bulk`/`proof` are Q10-scaled and only land on
    // a whole-minute duration at exactly 24°C (the model's reference ambient); 22°C is the common
    // case, not a contrived one, and the oven-adaptation bake time is already fractional at any
    // oven temperature. Together these guarantee a genuinely fractional-minute
    // `earliestFeasibleTarget`, reproducing the exact shape that triggers the bug.
    const inputs: WorkflowInputs = {
      targetTime: new Date(baseNow.getTime() + 5 * 60_000),
      ovenMaxC: 250,
      hasStoneOrSteel: false,
      ambientC: 22,
      ballCount: 2,
      ballWeightG: 250,
      pathway: 'same-day',
    };

    // Precompute the real earliestFeasibleTarget through the exact same engine call the store
    // makes (not a mock), so the test can derive how much simulated wall-clock time must elapse
    // to distinguish a correctly buffered fix from a pure-ceil-only one.
    const probe = generateWorkflow(pizzaRecipe, inputs, baseNow);
    if (probe.ok) {
      throw new Error('test setup expected TargetTooSoon, got ok:true — adjust inputs');
    }
    if ('minimumOvenC' in probe.error) {
      throw new Error('test setup expected TargetTooSoon, got OvenTooCold — adjust inputs');
    }
    const earliestFeasibleTarget = probe.error.earliestFeasibleTarget;
    const msPerMinute = 60_000;
    const remainderMs = earliestFeasibleTarget.getTime() % msPerMinute;
    // Sanity: this must be a genuinely fractional-minute boundary — a clean one would pass
    // trivially regardless of the fix, which is exactly the gap the plan review (F-4) found.
    expect(remainderMs).not.toBe(0);
    const ceilRemainderMs = msPerMinute - remainderMs;
    // Elapse a bit more real wall-clock time than a pure ceil-to-next-minute would cover, but
    // well within the buffer's margin — this is the case that fails with buffer 0 (pure ceil) and
    // only passes once the buffer is actually applied.
    const elapsedMs = ceilRemainderMs + 5_000;

    render(<ConfigScreen recipe={pizzaRecipe} />);

    fillTargetTime(inputs.targetTime);
    fillOven(inputs.ovenMaxC as number);
    fillAmbient(inputs.ambientC as number);
    fillBallCount(inputs.ballCount as number);
    selectPathway('Same-day');
    submit();

    expect(screen.getByText(/too soon/i)).toBeInTheDocument();
    expect(useSessionStore.getState().session).toBeNull();

    // Simulate genuine elapsed wall-clock time between computing the suggestion and the user
    // clicking "Accept earliest".
    vi.setSystemTime(new Date(baseNow.getTime() + elapsedMs));

    fireEvent.click(screen.getByRole('button', { name: /^Use / }));

    expect(useSessionStore.getState().session).not.toBeNull();
    expect(useSessionStore.getState().view).toBe('runner');
    expect(screen.queryByText(/too soon/i)).not.toBeInTheDocument();
  });
});
