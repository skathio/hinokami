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
      startSession: startSessionSpy,
      advanceStep: vi.fn(),
      backStep: vi.fn(),
      applyNudge: vi.fn(),
      resetSession: vi.fn(),
      dismissMigrationNotice: vi.fn(),
      setView: vi.fn(),
      syncViewAfterHydration: vi.fn(),
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
