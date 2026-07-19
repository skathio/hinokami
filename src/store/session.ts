// The Zustand bridge between the pure engine (Phase 1) and the future React UI (Phase 4). Owns
// the active `BakeSession`, persisted to localStorage under a fixed key, with the two-axis
// (schema + recipe-content) migration check from `engine/persistence.ts` run on load (P4,
// `decisions.md P4`). This store never reimplements engine logic — every action below is a
// thin delegation to `engine/index.ts`'s exported functions.
//
// Implementation note on where the P4 migration logic actually runs: the phase spec names
// `onRehydrateStorage` as the hook. In practice `onRehydrateStorage` only ever receives
// Zustand's own already-parsed `{state, version}` envelope — it has no access to the true raw
// localStorage string. `migrate()` expects that raw string directly (schemaVersion etc. at the
// top level, exactly what `serialize()` produces), so the two-axis check is wired into this
// store's custom `storage.getItem` instead — the only place with access to the actual bytes on
// disk. `onRehydrateStorage` is still configured, for dev-only observability (matching the
// logging convention already used in `persistence.ts`). `migrate()` remains the single owner of
// the two-axis logic either way; nothing here reimplements it.
//
// Hydration is NOT automatic on store creation (`skipHydration: true`). Phase 3 has no UI
// consumer yet, so there is no "app startup" moment to trigger it from, and auto-hydration on
// module import would race unpredictably against this file's own tests (which plant a
// localStorage payload and then need hydration to run strictly after that write). Phase 4's app
// entry point must call `useSessionStore.persist.rehydrate()` once at startup (and can gate a
// splash screen on `useSessionStore.persist.hasHydrated()` in the meantime, per `decisions.md
// P4`'s documented async-rehydration caveat) — flagged here for whoever picks up Phase 4.

import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';
import type { PathwayRef, Recipe } from '@/recipes/contract';
import { recipeRegistry } from '@/recipes/registry';
import { PIZZA_CONTENT_VERSION } from '@/recipes/pizza';
import {
  advance,
  applyNudge as engineApplyNudge,
  back,
  generateWorkflow,
  migrate,
  serialize,
  type BakeSession,
  type GenerateWorkflowResult,
  type WorkflowInputs,
} from '@/engine';

/** Fixed localStorage key (P4/`decisions.md P4`). */
export const SESSION_STORAGE_KEY = 'hinokami-session-v1';

/** Alias matching the phase interface's naming — identical (Date-based) shape to
 * `WorkflowInputs`, the shape `generateWorkflow` accepts. `startSession` converts this into the
 * persisted `BakeSession.inputs` shape (ISO string, pizza-only pathway union) on success. */
export type SessionInputs = WorkflowInputs;

/**
 * Phase 4.1: which screen `App.tsx` renders. Deliberately NOT part of `PersistedSessionState`/
 * `partialize` below — it is ephemeral UI-routing state, not part of the `BakeSession` schema.
 * (Phase 4.2's "Risks" note flags exactly this: if `view` were ever accidentally persisted, a
 * reload mid-bake could restore onto the wrong screen — keeping it out of `partialize` is what
 * prevents that class of bug by construction, not by discipline.)
 */
export type View = 'recipe-select' | 'config' | 'runner';

export interface SessionStore {
  session: BakeSession | null;
  migrationNotice: string | null;
  view: View;
  /** Review fix (Phase 4.2, pass 2): whether the most recent `applyNudge` call had to clamp at
   * least one step's shifted time to the `[0, targetTimeMs]` bounds — i.e. the requested nudge
   * could not be fully honored. This is `engine/schedule.ts`'s `reschedule` clamp signal passed
   * straight through, not something re-derived here or in `NudgePanel`; a UI-side heuristic
   * (comparing only the current step's before/after time) under-fires because steps clamp at
   * different points in the remaining schedule. Ephemeral, deliberately excluded from
   * `PersistedSessionState`/`partialize` below — same class as `view`. */
  lastNudgeClamped: boolean;
  startSession: (recipe: Recipe, inputs: SessionInputs) => GenerateWorkflowResult;
  advanceStep: () => void;
  backStep: () => void;
  applyNudge: (deltaMinutes: number) => void;
  resetSession: () => void;
  dismissMigrationNotice: () => void;
  /** UI-routing transition (Phase 4.1) — the only way screens change `view` directly (e.g.
   * recipe-select → config on selection). `startSession`/`resetSession` drive their own `view`
   * transitions internally rather than requiring callers to remember to call this afterward. */
  setView: (view: View) => void;
  /** Called once by `App.tsx` after `persist.rehydrate()` resolves (see the file-level hydration
   * note above). `view` is never part of the persisted/merged state (it's excluded from
   * `partialize`), so a restored session would otherwise leave `view` at its initial
   * `'recipe-select'` default even though a real session was just loaded — this reconciles the
   * two by routing straight to `'runner'` whenever hydration produced a session. A no-op when
   * there's no session (clean start correctly stays on `'recipe-select'`). */
  syncViewAfterHydration: () => void;
}

type PersistedSessionState = Pick<SessionStore, 'session' | 'migrationNotice'>;

/** `BakeSession.inputs.pathway` is a fixed 2-member union (schema v1, `engine/types.ts`) —
 * narrower than the generic `PathwayRef` (`string`) a `Recipe`'s pathways use. This is a known
 * v1 coupling (only the pizza recipe exists — the same class of coupling as the
 * `PIZZA_CONTENT_VERSION` import below), not something silently papered over: an unrecognized
 * pathway id fails loud instead of being cast through unchecked (repo convention, `context.md
 * §6`: "fail loud, never confidently wrong"). */
function toSessionPathway(pathway: PathwayRef): BakeSession['inputs']['pathway'] {
  if (pathway === 'same-day' || pathway === 'cold-ferment') return pathway;
  throw new Error(
    `useSessionStore.startSession: unsupported pathway "${pathway}" for BakeSession schema v1 ` +
      '(only "same-day"/"cold-ferment" are valid — v1 is pizza-only)',
  );
}

function devWarn(message: string): void {
  if (import.meta.env.DEV) {
    // Dev-only observability (spec.md §8) — never prod console noise.
    console.warn(`[hinokami:session-store] ${message}`);
  }
}

/**
 * Custom persist storage implementing the P4 two-axis check. `getItem` is the only place with
 * access to the true raw localStorage string, so `migrate()` is called from here (see the
 * file-level note above). `setItem` writes exactly `serialize(session)` — the same raw
 * `BakeSession` JSON `engine/persistence.ts` round-trips — never Zustand's own `{state,
 * version}` envelope, so a value planted or inspected directly via `localStorage` always matches
 * what `migrate`/`restore`/`serialize` expect (this is what makes the store's own tests able to
 * plant a payload with a plain `localStorage.setItem` and exercise the real rehydration path).
 */
const sessionStorage: PersistStorage<PersistedSessionState> = {
  getItem: (name) => {
    const raw = localStorage.getItem(name);
    if (raw === null) {
      // Nothing persisted → clean start (P4 step 1). Not routed through `migrate`, which
      // expects a raw value to check.
      return { state: { session: null, migrationNotice: null }, version: 1 };
    }
    const result = migrate(raw, PIZZA_CONTENT_VERSION);
    return { state: { session: result.session, migrationNotice: result.migrationNotice }, version: 1 };
  },
  setItem: (name, value) => {
    if (value.state.session === null) {
      localStorage.removeItem(name);
      return;
    }
    localStorage.setItem(name, serialize(value.state.session));
  },
  removeItem: (name) => localStorage.removeItem(name),
};

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      session: null,
      migrationNotice: null,
      view: 'recipe-select',
      lastNudgeClamped: false,

      startSession: (recipe, inputs) => {
        const result = generateWorkflow(recipe, inputs);
        if (!result.ok) return result;

        const session: BakeSession = {
          schemaVersion: 1,
          sessionKey: crypto.randomUUID(),
          recipeId: recipe.id,
          recipeContentVersion: PIZZA_CONTENT_VERSION,
          inputs: {
            targetTime: inputs.targetTime.toISOString(),
            ovenMaxC: inputs.ovenMaxC,
            hasStoneOrSteel: inputs.hasStoneOrSteel,
            ambientC: inputs.ambientC,
            ballCount: inputs.ballCount,
            ballWeightG: inputs.ballWeightG,
            pathway: toSessionPathway(inputs.pathway),
          },
          workflow: result.steps,
          stepIndex: 0,
          status: 'in-progress',
          bakeAdaptation: result.bakeAdaptation,
        };
        set({ session, migrationNotice: null, view: 'runner', lastNudgeClamped: false });
        return result;
      },

      advanceStep: () => {
        const { session } = get();
        if (!session) return;
        set({ session: advance(session) });
      },

      backStep: () => {
        const { session } = get();
        if (!session) return;
        set({ session: back(session) });
      },

      applyNudge: (deltaMinutes) => {
        const { session } = get();
        if (!session) return;
        const recipe = recipeRegistry.lookup(session.recipeId);
        if (!recipe) {
          throw new Error(
            `useSessionStore.applyNudge: recipe "${session.recipeId}" not found in registry`,
          );
        }
        const result = engineApplyNudge(session, deltaMinutes, recipe);
        set({ session: result.session, lastNudgeClamped: result.clamped });
      },

      resetSession: () =>
        set({ session: null, migrationNotice: null, view: 'recipe-select', lastNudgeClamped: false }),

      dismissMigrationNotice: () => set({ migrationNotice: null }),

      setView: (view) => set({ view }),

      syncViewAfterHydration: () => {
        const { session } = get();
        if (session) set({ view: 'runner' });
      },
    }),
    {
      name: SESSION_STORAGE_KEY,
      storage: sessionStorage,
      // Must match the `version` `sessionStorage.getItem` returns below — otherwise Zustand's
      // own version-mismatch machinery kicks in and discards the hydrated state before it ever
      // reaches this store, since no `migrate` option is configured here (intentionally: the
      // two-axis migration is `engine/persistence.ts`'s `migrate()`, already applied inside
      // `getItem`, not Zustand's own single-axis schema-version migration).
      version: 1,
      skipHydration: true,
      partialize: (state) => ({ session: state.session, migrationNotice: state.migrationNotice }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          devWarn(`rehydration error: ${String(error)}`);
          return;
        }
        if (state?.migrationNotice) {
          devWarn(`rehydrated with a migration notice: ${state.migrationNotice}`);
        }
      },
    },
  ),
);
