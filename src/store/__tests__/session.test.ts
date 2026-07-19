import { beforeEach, describe, expect, it } from 'vitest';
import { SESSION_STORAGE_KEY, useSessionStore } from '../session';
import { pizzaRecipe, PIZZA_CONTENT_VERSION } from '@/recipes/pizza';
import type { BakeSession, WorkflowInputs } from '@/engine';

function buildInputs(overrides: Partial<WorkflowInputs> = {}): WorkflowInputs {
  return {
    // 10h out, comfortably clear of the pizza same-day pathway's minimum-feasible-total at the
    // 24 °C reference ambient (~7.8h) so `generateWorkflow` always succeeds here.
    targetTime: new Date(Date.now() + 10 * 60 * 60_000),
    ovenMaxC: 250,
    hasStoneOrSteel: false,
    ambientC: 24,
    ballCount: 2,
    ballWeightG: 250,
    pathway: 'same-day',
    ...overrides,
  };
}

/** A raw, JSON-round-trippable `BakeSession` shape for tests that plant a payload directly via
 * `localStorage.setItem`, exercising the store's real rehydration path (`migrate()` under the
 * hood) rather than going through `startSession`. Mirrors
 * `engine/__tests__/persistence.test.ts`'s `buildSession` helper, adapted to the pizza recipe. */
function buildRawSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base: BakeSession = {
    schemaVersion: 1,
    sessionKey: 'session-1',
    recipeId: pizzaRecipe.id,
    recipeContentVersion: PIZZA_CONTENT_VERSION,
    inputs: {
      targetTime: new Date(Date.now() + 10 * 60 * 60_000).toISOString(),
      ovenMaxC: 250,
      hasStoneOrSteel: false,
      ambientC: 24,
      ballCount: 2,
      ballWeightG: 250,
      pathway: 'same-day',
    },
    workflow: [
      {
        stageId: 'mix',
        name: 'Mix',
        why: 'why-mix',
        durationMinutes: 15,
        clockStartTime: new Date(),
        isEstimate: false,
      },
      {
        stageId: 'bake',
        name: 'Bake',
        why: 'why-bake',
        durationMinutes: 8,
        clockStartTime: new Date(Date.now() + 15 * 60_000),
        isEstimate: false,
      },
    ],
    stepIndex: 0,
    status: 'in-progress',
  };
  return { ...base, ...overrides };
}

function resetStore(): void {
  useSessionStore.setState({ session: null, migrationNotice: null });
}

beforeEach(() => {
  localStorage.clear();
  resetStore();
});

describe('useSessionStore — round trip', () => {
  it('restores the same session after persist → rehydrate', async () => {
    const result = useSessionStore.getState().startSession(pizzaRecipe, buildInputs());
    expect(result.ok).toBe(true);

    const started = useSessionStore.getState().session;
    expect(started).not.toBeNull();
    // Phase 4.2 plan-change: `bakeAdaptation` must survive generation and be persisted, so a
    // caveated bake's `why`/caveat text can be shown on reload, not just right after generation.
    expect(started?.bakeAdaptation).toBeDefined();
    expect(started?.bakeAdaptation?.bakeTempC).toBe(250);

    await useSessionStore.persist.rehydrate();

    const restored = useSessionStore.getState().session;
    expect(restored?.recipeId).toBe(started?.recipeId);
    expect(restored?.stepIndex).toBe(started?.stepIndex);
    expect(restored?.workflow.length).toBe(started?.workflow.length);
    expect(restored?.workflow).toEqual(started?.workflow);
    expect(restored?.workflow[0]?.clockStartTime).toBeInstanceOf(Date);
    expect(restored?.inputs).toEqual(started?.inputs);
    expect(restored?.bakeAdaptation).toEqual(started?.bakeAdaptation);
    expect(useSessionStore.getState().migrationNotice).toBeNull();
  });

  it('persists under the fixed key "hinokami-session-v1", as raw session JSON (no store envelope)', () => {
    useSessionStore.getState().startSession(pizzaRecipe, buildInputs());

    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    // The stored value is exactly what `serialize()` produces (schemaVersion at the top level),
    // not Zustand's own `{state, version}` persist envelope.
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.recipeId).toBe(pizzaRecipe.id);
  });
});

describe('useSessionStore — applyNudge / lastNudgeClamped (FR-17, review fix pass 2)', () => {
  it('sets lastNudgeClamped: false after a small nudge that stays within bounds', () => {
    useSessionStore.getState().startSession(pizzaRecipe, buildInputs());

    useSessionStore.getState().applyNudge(1);

    expect(useSessionStore.getState().lastNudgeClamped).toBe(false);
  });

  it('sets lastNudgeClamped: true after an absurdly large nudge that must clamp — the real ' +
    'engine signal `NudgePanel` reads, not a UI-side before/after heuristic', () => {
    useSessionStore.getState().startSession(pizzaRecipe, buildInputs());

    useSessionStore.getState().applyNudge(1_000_000);

    expect(useSessionStore.getState().lastNudgeClamped).toBe(true);
  });

  it('resets lastNudgeClamped to false on startSession and resetSession', () => {
    useSessionStore.getState().startSession(pizzaRecipe, buildInputs());
    useSessionStore.getState().applyNudge(1_000_000);
    expect(useSessionStore.getState().lastNudgeClamped).toBe(true);

    useSessionStore.getState().resetSession();
    expect(useSessionStore.getState().lastNudgeClamped).toBe(false);

    useSessionStore.getState().startSession(pizzaRecipe, buildInputs());
    expect(useSessionStore.getState().lastNudgeClamped).toBe(false);
  });
});

describe('useSessionStore — migration (onRehydrateStorage / P4 two-axis check)', () => {
  it('clean start: nothing persisted → session null, no notice', async () => {
    await useSessionStore.persist.rehydrate();
    expect(useSessionStore.getState().session).toBeNull();
    expect(useSessionStore.getState().migrationNotice).toBeNull();
  });

  it('discards corrupt JSON with a notice, no throw', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, '{not valid json');

    await expect(useSessionStore.persist.rehydrate()).resolves.not.toThrow();

    expect(useSessionStore.getState().session).toBeNull();
    expect(useSessionStore.getState().migrationNotice).not.toBeNull();
  });

  it('discards an unknown/future schemaVersion with a notice', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(buildRawSession({ schemaVersion: 99 })));

    await useSessionStore.persist.rehydrate();

    expect(useSessionStore.getState().session).toBeNull();
    expect(useSessionStore.getState().migrationNotice).not.toBeNull();
  });

  it('schema v1 (current), recipe-content version match → restores as-is, no notice', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(buildRawSession()));

    await useSessionStore.persist.rehydrate();

    const { session, migrationNotice } = useSessionStore.getState();
    expect(session).not.toBeNull();
    expect(session?.recipeContentVersion).toBe(PIZZA_CONTENT_VERSION);
    expect(migrationNotice).toBeNull();
  });

  it('recipe-content mismatch → continue-and-notify: workflow/stepIndex unchanged, notice always set', async () => {
    const raw = buildRawSession({ recipeContentVersion: 'some-old-version', stepIndex: 1 });
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(raw));

    await useSessionStore.persist.rehydrate();

    const { session, migrationNotice } = useSessionStore.getState();
    expect(session).not.toBeNull();
    expect(session?.stepIndex).toBe(1);
    expect(session?.workflow).toHaveLength((raw.workflow as unknown[]).length);
    expect(session?.recipeContentVersion).toBe('some-old-version'); // left untouched, per P4
    expect(migrationNotice).not.toBeNull();
  });
});
