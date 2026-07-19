// Startup rehydration guard (plan-change, `phases/04-ui-and-wake-lock.md` "Overall UI shell" /
// Phase 3 review Major). Phase 3's store uses `skipHydration: true` — nothing loads the
// persisted session unless `App` calls `useSessionStore.persist.rehydrate()` on mount. This is
// exactly the class of bug that's silent everywhere except here: the app still builds, every
// other test still passes (they reset/construct store state directly), and the dev server looks
// fine at a glance — but a persisted session would be invisibly lost on every reload (defeating
// FR-9) if `App.tsx` ever dropped the `rehydrate()` call. These tests use the REAL
// `useSessionStore`, not a mock — mocking it would bypass the exact `rehydrate()`/`hasHydrated()`
// path under test. Plants a raw `BakeSession` payload directly into `localStorage` under the
// fixed storage key, the same technique `src/store/__tests__/session.test.ts` uses for its own
// rehydration tests.

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { pizzaRecipe, PIZZA_CONTENT_VERSION } from '@/recipes/pizza';
import { SESSION_STORAGE_KEY, useSessionStore } from '@/store/session';
import type { BakeSession } from '@/engine';

/** A raw, JSON-round-trippable `BakeSession` shape planted directly via `localStorage.setItem`,
 * mirroring `session.test.ts`'s `buildRawSession` helper so this test exercises the same real
 * `migrate()`-under-the-hood rehydration path rather than going through `startSession`. */
function buildRawSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base: BakeSession = {
    schemaVersion: 1,
    sessionKey: 'app-test-session-1',
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
  useSessionStore.setState({ session: null, migrationNotice: null, view: 'recipe-select' });
}

beforeEach(() => {
  localStorage.clear();
  resetStore();
});

describe('App — startup rehydration', () => {
  it('shows recipe-select (not a stuck splash) when there is no persisted session', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/choose a recipe/i)).toBeInTheDocument();
    });
  });

  it('resumes an existing persisted session on a fresh render, instead of showing recipe-select', async () => {
    const raw = buildRawSession();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(raw));

    render(<App />);

    // Note: no assertion on the transient splash screen here — `session.ts`'s custom `persist`
    // storage is fully synchronous (`getItem`/`setItem` never return a `Promise`), and zustand's
    // `persist` middleware special-cases synchronous storages (`toThenable`, `middleware.mjs`) to
    // resolve `rehydrate()`'s entire chain — including this component's `onFinishHydration`
    // callback — synchronously within the same `useEffect` call, before this line even runs. The
    // splash only has a visible window when hydration is genuinely async (e.g. a real
    // asynchronous storage backend); asserting on it here would be asserting an implementation
    // detail of the storage layer, not the rehydration guard itself. The guarantee this test
    // actually needs — gated on `hasHydrated()`, resumes correctly either way — holds regardless
    // of whether that resolution happens synchronously or after a real await, which is what the
    // `waitFor` below verifies without assuming either timing.
    //
    // Asserts against `StepRunnerScreen`'s real render (Phase 4.2) — `buildRawSession`'s first
    // step is `stageId: 'mix'`/`name: 'Mix'` at `stepIndex: 0`, so "Mix" is what a resumed session
    // shows first.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Mix' })).toBeInTheDocument();
    });

    expect(screen.queryByText(/choose a recipe/i)).not.toBeInTheDocument();
    expect(useSessionStore.getState().session?.sessionKey).toBe('app-test-session-1');
    expect(useSessionStore.getState().session?.stepIndex).toBe(0);
    expect(useSessionStore.getState().view).toBe('runner');
  });
});
