// Engine-side types NOT on the `Recipe` interface (P1 file layout). These are the shapes the
// engine produces/consumes across scheduling, progression, and persistence.

import type { BakeAdaptation, PathwayRef, RecipeId, StageRef } from '@/recipes/contract';

/** One step in a generated workflow, before real clock times are attached. */
export interface Step {
  readonly stageId: StageRef;
  readonly name: string;
  readonly why: string;
  readonly cue?: string;
  readonly durationMinutes: number;
}

/** A `Step` with a real backward-solved clock start time. `isEstimate` is keyed on cue
 * presence (pass-4 fix) — true whenever the underlying stage carries a `cue`, regardless of
 * `type` — so cue-bearing fixed-duration stages (e.g. `temper`) still surface as estimates. */
export interface ScheduledStep extends Step {
  readonly clockStartTime: Date;
  readonly isEstimate: boolean;
}

/** The inputs a user provides to generate a workflow (FR-2/FR-3) — the schedule-solving side
 * of a `BakeSession`, before it's wrapped with session bookkeeping (schemaVersion, stepIndex, …). */
export interface WorkflowInputs {
  readonly targetTime: Date;
  readonly ovenMaxC: number;
  readonly hasStoneOrSteel: boolean;
  readonly ambientC: number;
  readonly ballCount: number;
  readonly ballWeightG: number;
  readonly pathway: PathwayRef;
}

/** FR-11: the schedule solver's infeasibility result. `earliestFeasibleTarget` is always
 * recomputed from real (actual-ambient) stage durations — see `schedule.ts` — never from the
 * cheap warmest-ambient early-out alone, so the suggestion is honest. */
export interface TargetTooSoon {
  readonly earliestFeasibleTarget: Date;
  readonly alternativePathways: ReadonlyArray<PathwayRef>;
}

/** `solveScheduleBackward`'s own result shape (P1 file layout). */
export type WorkflowResult =
  | { ok: true; steps: ReadonlyArray<ScheduledStep> }
  | { ok: false; error: TargetTooSoon };

/** One scaled ingredient (grams), the output of `scaleFormula` (FR-4). */
export interface ScaledIngredient {
  readonly name: string;
  readonly grams: number;
}

/**
 * Persisted `BakeSession` — schema v1 (planning decision P4). Two independent version axes
 * (D15): `schemaVersion` (this shape) and `recipeContentVersion` (the recipe's stages/timing/
 * oven logic). `sessionKey` is an opaque UUID, never the `RecipeId` (D9) — multi-session-ready
 * from day one even though v1 only ever surfaces a single active session.
 */
export interface BakeSession {
  readonly schemaVersion: 1;
  readonly sessionKey: string;
  readonly recipeId: RecipeId;
  readonly recipeContentVersion: string;
  readonly inputs: {
    readonly targetTime: string; // ISO-8601 — serializable
    readonly ovenMaxC: number;
    readonly hasStoneOrSteel: boolean;
    readonly ambientC: number;
    readonly ballCount: number;
    readonly ballWeightG: number;
    readonly pathway: 'same-day' | 'cold-ferment';
  };
  readonly workflow: ReadonlyArray<ScheduledStep>;
  readonly stepIndex: number;
  readonly status: 'in-progress' | 'completed';
  /** The resolved bake adaptation for this session (Phase 4.2 plan-change, Phase 4.1 review
   * follow-up). `generateWorkflow` already computes this (temp/time tailored to the user's oven,
   * plus optional `doughGuidance`/`caveat` for a 200-219 °C best-effort bake) but it was
   * previously discarded after scheduling — leaving a persisted-and-reloaded session with no way
   * to show the caveat text on the bake step. Optional/additive: no `schemaVersion` bump (v1 is
   * pre-release, no live persisted sessions to migrate — same precedent as Phase 2's P7 fix
   * leaving `PIZZA_CONTENT_VERSION` at `1.0.0`). Absent only for a session serialized before this
   * field existed, which in practice never happened outside dev. */
  readonly bakeAdaptation?: BakeAdaptation;
}
