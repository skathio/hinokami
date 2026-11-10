// RTL tests for the Recipe Card modal (D2, iteration 1.2). Store mocked the same way
// `AbandonConfirmDialog.test.tsx`/`StepRunnerScreen.test.tsx` do — a static fake `SessionStore`
// state, spied onto the module namespace — since `RecipeCard` reads `session`/`scaledIngredients`
// from the store directly rather than taking them as props (matching `AbandonConfirmDialog`/
// `NudgePanel`'s "read-heavy components subscribe to the store themselves" convention).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import RecipeCard from '../RecipeCard';
import * as sessionStoreModule from '@/store/session';
import { useSessionStore, type SessionStore } from '@/store/session';
import { pizzaRecipe } from '@/recipes/pizza';
import type { BakeSession, ScaledIngredient, ScheduledStep } from '@/engine';

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

/** Mocks `useSessionStore` with a static fake state, mirroring `AbandonConfirmDialog.test.tsx`'s
 * pattern. Returns the fake state so tests can assert against it if needed. */
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

const SAMPLE_INGREDIENTS: ReadonlyArray<ScaledIngredient> = [
  { name: 'Flour', grams: 300 },
  { name: 'Water', grams: 195 },
  { name: 'Salt', grams: 6.6 },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RecipeCard — ingredients', () => {
  it('renders every scaledIngredients entry with its gram amount', () => {
    mockStore(buildSession(), { scaledIngredients: SAMPLE_INGREDIENTS });

    render(<RecipeCard onClose={vi.fn()} />);

    expect(screen.getByText('Flour')).toBeInTheDocument();
    expect(screen.getByText('300 g')).toBeInTheDocument();
    expect(screen.getByText('Water')).toBeInTheDocument();
    expect(screen.getByText('195 g')).toBeInTheDocument();
    expect(screen.getByText('Salt')).toBeInTheDocument();
    expect(screen.getByText('6.6 g')).toBeInTheDocument();
  });

  it('renders gracefully when scaledIngredients is null', () => {
    mockStore(buildSession(), { scaledIngredients: null });

    render(<RecipeCard onClose={vi.fn()} />);

    expect(screen.getByText(/ingredients unavailable/i)).toBeInTheDocument();
  });
});

describe('RecipeCard — equipment', () => {
  it('shows "Pizza stone or steel" when hasStoneOrSteel is true', () => {
    mockStore(buildSession({ inputs: { ...buildSession().inputs, hasStoneOrSteel: true } }));

    render(<RecipeCard onClose={vi.fn()} />);

    expect(screen.getByText('Pizza stone or steel')).toBeInTheDocument();
  });

  it('shows "Baking tray or pan" when hasStoneOrSteel is false', () => {
    mockStore(buildSession({ inputs: { ...buildSession().inputs, hasStoneOrSteel: false } }));

    render(<RecipeCard onClose={vi.fn()} />);

    expect(screen.getByText('Baking tray or pan')).toBeInTheDocument();
  });
});

describe('RecipeCard — bake spec', () => {
  it('renders bakeTempC, bakeTimeMinutes, and doughGuidance from session.bakeAdaptation', () => {
    mockStore(
      buildSession({
        bakeAdaptation: {
          bakeTempC: 280,
          bakeTimeMinutes: 8,
          doughGuidance: 'Stretch gently, keep the rim thick.',
        },
      }),
    );

    render(<RecipeCard onClose={vi.fn()} />);

    expect(screen.getByText(/280°C for 8 min/)).toBeInTheDocument();
    expect(screen.getByText('Stretch gently, keep the rim thick.')).toBeInTheDocument();
  });

  it('rounds a fractional bakeTimeMinutes rather than rendering the raw float', () => {
    mockStore(
      buildSession({
        bakeAdaptation: { bakeTempC: 250, bakeTimeMinutes: 6.6110919727718125 },
      }),
    );

    render(<RecipeCard onClose={vi.fn()} />);

    expect(screen.getByText(/250°C for 7 min/)).toBeInTheDocument();
    expect(screen.queryByText(/6\.611/)).not.toBeInTheDocument();
  });

  it('renders gracefully when bakeAdaptation is absent', () => {
    mockStore(buildSession({ bakeAdaptation: undefined }));

    render(<RecipeCard onClose={vi.fn()} />);

    expect(screen.getByText(/bake spec unavailable/i)).toBeInTheDocument();
  });
});

describe('RecipeCard — focus management (NFR-11, matches TimelineOverview/AbandonConfirmDialog)', () => {
  it('moves focus into the dialog on mount', () => {
    mockStore(buildSession());

    render(<RecipeCard onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^close$/i })).toHaveFocus();
  });

  it('Escape calls onClose, the same as clicking Close', () => {
    mockStore(buildSession());
    const onClose = vi.fn();
    render(<RecipeCard onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking Close calls onClose', () => {
    mockStore(buildSession());
    const onClose = vi.fn();
    render(<RecipeCard onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
