// The backward schedule solver (FR-5/FR-11) + the bounded pace-nudge (FR-17/D14).
// See `.somi/plans/hinokami/phases/01-engine-and-contract.md` for the full mechanism spec —
// this file implements it verbatim, including the fix history (D13 early-out + the universal
// post-placement guard that replaced the retired elastic-only pre-clamp guard).

import type { Recipe, Stage, TimingContext } from '@/recipes/contract';
import type { ScheduledStep, TargetTooSoon, WorkflowInputs, WorkflowResult } from './types';

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function diffMinutes(later: Date, earlier: Date): number {
  return (later.getTime() - earlier.getTime()) / 60_000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Resolves a pathway's ordered `Stage` objects. Throws on an unknown pathway/stage id — a
 * caller (UI/store) bug, not one of the two expected user-facing failure modes
 * (`TargetTooSoon`/`OvenTooCold`), so this fails loud rather than returning a `Result`. */
function resolveOrderedStages(recipe: Recipe, pathwayId: string): { pathwayId: string; stages: Stage[] } {
  const pathway = recipe.pathways.find((p) => p.id === pathwayId);
  if (!pathway) {
    throw new Error(`solveScheduleBackward: unknown pathway id "${pathwayId}" for recipe "${recipe.id}"`);
  }
  const stages = pathway.stageIds.map((stageId) => {
    const stage = recipe.stages.find((s) => s.id === stageId);
    if (!stage) {
      throw new Error(
        `solveScheduleBackward: pathway "${pathwayId}" references unknown stage id "${stageId}"`,
      );
    }
    return stage;
  });
  const elasticStages = stages.filter((s) => s.elastic);
  if (elasticStages.length > 1) {
    throw new Error(
      `solveScheduleBackward: pathway "${pathwayId}" declares ${elasticStages.length} elastic stages — v1 supports at most one`,
    );
  }
  return { pathwayId, stages };
}

/** A stage's duration at a given ambient, per the "bake contributes bakeTimeMinutes, elastic
 * contributes its floor, everything else calls stageDuration" rule stated throughout the phase
 * spec for every summation (feasibility, slack, guard recomputation) — except this helper is
 * for the *non-elastic, non-bake* case only; callers special-case bake/elastic themselves so
 * each call site's intent (minimum vs. actual-ambient) stays explicit at the call site. */
function fixedStageDurationAt(
  recipe: Recipe,
  pathwayId: string,
  stage: Stage,
  ambientC: number,
): number {
  const ctx: TimingContext = { ambientC, pathway: pathwayId, stage: stage.id };
  return recipe.stageDuration(stage.id, ctx).minutes;
}

/** A stage's minimum possible duration (D13: warmest legal ambient for fixed/fermentation
 * stages; the elastic floor for the elastic stage; the passed-in bake time for bake — bake is
 * not ambient-sensitive, so its "minimum" is just its one real value). */
function minimumDurationOf(
  recipe: Recipe,
  pathwayId: string,
  stage: Stage,
  warmestAmbientC: number,
  bakeTimeMinutes: number,
): number {
  if (stage.type === 'bake') return bakeTimeMinutes;
  if (stage.elastic) return stage.elastic.minMinutes;
  return fixedStageDurationAt(recipe, pathwayId, stage, warmestAmbientC);
}

/** A stage's duration at the *actual* ambient the user reported (bake still contributes the
 * passed-in bake time; an elastic stage still contributes its floor here — this helper is used
 * only by the feasibility-style sums, never by placement, which clamps the elastic stage into
 * its full range instead of pinning it to the floor). */
function actualAmbientMinimumOf(
  recipe: Recipe,
  pathwayId: string,
  stage: Stage,
  actualAmbientC: number,
  bakeTimeMinutes: number,
): number {
  if (stage.type === 'bake') return bakeTimeMinutes;
  if (stage.elastic) return stage.elastic.minMinutes;
  return fixedStageDurationAt(recipe, pathwayId, stage, actualAmbientC);
}

/** Sums `actualAmbientMinimumOf` over a resolved stage list — the "how much time would this
 * pathway really need at the user's actual (possibly colder) kitchen" total. This is the basis
 * for every *suggested* `earliestFeasibleTarget`/`alternativePathways` value: the cheap (a)
 * warmest-ambient check is only ever the early-out *decision*, never the suggestion — see the
 * invariant documented on `TargetTooSoon` in `types.ts`. */
function actualAmbientTotalOf(
  recipe: Recipe,
  pathwayId: string,
  stages: Stage[],
  actualAmbientC: number,
  bakeTimeMinutes: number,
): number {
  return stages.reduce(
    (sum, stage) => sum + actualAmbientMinimumOf(recipe, pathwayId, stage, actualAmbientC, bakeTimeMinutes),
    0,
  );
}

function buildTargetTooSoon(
  recipe: Recipe,
  inputs: WorkflowInputs,
  bakeTimeMinutes: number,
  now: Date,
  earliestFeasibleTargetMinutesFromNow: number,
): TargetTooSoon {
  // Actual ambient, not warmest-legal — a suggested pathway must be genuinely reachable at the
  // user's real kitchen temperature, not merely pass the cheap (a) warmest-ambient check again
  // (which would just trip the (b) universal guard a second time).
  const alternativePathways = recipe.pathways
    .filter((p) => p.id !== inputs.pathway)
    .filter((p) => {
      const { stages } = resolveOrderedStages(recipe, p.id);
      const actualAmbientTotal = actualAmbientTotalOf(recipe, p.id, stages, inputs.ambientC, bakeTimeMinutes);
      return diffMinutes(inputs.targetTime, now) >= actualAmbientTotal;
    })
    .map((p) => p.id);

  return {
    earliestFeasibleTarget: addMinutes(now, earliestFeasibleTargetMinutesFromNow),
    alternativePathways,
  };
}

/**
 * Solves a pathway's stage start times backward from `inputs.targetTime` (the ready/eat time —
 * `spec.md §1`). `bakeTimeMinutes` is the already-resolved bake duration (from
 * `recipe.adaptBake`, via `generateWorkflow`) — this function never calls `adaptBake` itself
 * (restart-pass-2 fix). `now` defaults to the real current time; tests inject a fixed value so
 * the universal post-placement guard (below) is deterministic.
 *
 * Two independent feasibility checks:
 *  (a) a cheap warmest-ambient minimum-feasible-total early-out (D13) — catches "impossible no
 *      matter how warm the kitchen is" before attempting any real placement.
 *  (b) a universal post-placement guard — after placing the full schedule at the user's actual
 *      (possibly colder) ambient, checks whether the earliest stage's clock start time is
 *      already in the past. This is what actually protects placement; (a) is only the cheap
 *      first check. It replaced an earlier elastic-only "pre-clamp" guard that missed the
 *      identical failure class on the same-day pathway — see `decisions.md P3` for the full
 *      fix history.
 */
export function solveScheduleBackward(
  recipe: Recipe,
  inputs: WorkflowInputs,
  bakeTimeMinutes: number,
  now: Date = new Date(),
): WorkflowResult {
  const { stages } = resolveOrderedStages(recipe, inputs.pathway);
  const timeToTargetMinutes = diffMinutes(inputs.targetTime, now);
  const warmestAmbientC = recipe.bounds.ambientMax;

  // (a) D13 minimum-feasible-total early-out. This warmest-ambient total is the correct basis
  // for the cheap *decision* ("is this even theoretically possible") — it must NOT also be used
  // as the *suggested* earliestFeasibleTarget: `stageDuration` is monotonic-decreasing in
  // ambient, so a cooler actual ambient genuinely needs more time than this minimum, and
  // offering it back to the user would still be infeasible at their real kitchen temperature
  // (it would clear this same check again on retry, then trip the (b) guard below). The
  // suggestion is always recomputed at the actual ambient — see `actualAmbientTotalOf`.
  const minimumFeasibleTotal = stages.reduce(
    (sum, stage) => sum + minimumDurationOf(recipe, inputs.pathway, stage, warmestAmbientC, bakeTimeMinutes),
    0,
  );
  if (timeToTargetMinutes < minimumFeasibleTotal) {
    const actualAmbientTotal = actualAmbientTotalOf(recipe, inputs.pathway, stages, inputs.ambientC, bakeTimeMinutes);
    return {
      ok: false,
      error: buildTargetTooSoon(recipe, inputs, bakeTimeMinutes, now, actualAmbientTotal),
    };
  }

  // Placement at the actual ambient. Compute every stage's placed duration first (order does
  // not matter for this pass — the elastic stage's slack calc sums every *other* stage's
  // duration, which is already fully determined at this point since only one elastic stage is
  // allowed per pathway), then do a second, backward pass to assign real clock times.
  const elasticStage = stages.find((s) => s.elastic);
  const placedMinutesByStageId = new Map<string, number>();
  for (const stage of stages) {
    if (stage.type === 'bake') {
      placedMinutesByStageId.set(stage.id, bakeTimeMinutes);
    } else if (!stage.elastic) {
      placedMinutesByStageId.set(
        stage.id,
        fixedStageDurationAt(recipe, inputs.pathway, stage, inputs.ambientC),
      );
    }
  }
  if (elasticStage) {
    const othersSum = stages
      .filter((s) => s.id !== elasticStage.id)
      .reduce((sum, s) => sum + (placedMinutesByStageId.get(s.id) ?? 0), 0);
    const availableSlackMinutes = timeToTargetMinutes - othersSum;
    // Plain clamp, no special-cased early return (restart-pass-2 fix) — any resulting overflow
    // (availableSlackMinutes below elastic.minMinutes) is caught uniformly by the (b) guard
    // below, not here.
    placedMinutesByStageId.set(
      elasticStage.id,
      clamp(availableSlackMinutes, elasticStage.elastic!.minMinutes, elasticStage.elastic!.maxMinutes),
    );
  }

  const scheduledSteps: ScheduledStep[] = [];
  let cursor = inputs.targetTime;
  for (let i = stages.length - 1; i >= 0; i -= 1) {
    const stage = stages[i];
    const durationMinutes = placedMinutesByStageId.get(stage.id)!;
    const clockStartTime = addMinutes(cursor, -durationMinutes);
    scheduledSteps.unshift({
      stageId: stage.id,
      name: stage.name,
      why: stage.why,
      cue: stage.cue,
      how: stage.how,
      durationMinutes,
      clockStartTime,
      isEstimate: stage.cue !== undefined,
    });
    cursor = clockStartTime;
  }

  // (b) Universal post-placement guard — is the earliest placed stage already in the past?
  const earliestStart = scheduledSteps[0]?.clockStartTime ?? inputs.targetTime;
  if (earliestStart.getTime() < now.getTime()) {
    const actualAmbientTotal = actualAmbientTotalOf(recipe, inputs.pathway, stages, inputs.ambientC, bakeTimeMinutes);
    return {
      ok: false,
      error: buildTargetTooSoon(recipe, inputs, bakeTimeMinutes, now, actualAmbientTotal),
    };
  }

  return { ok: true, steps: scheduledSteps };
}

/** `reschedule`'s result (review fix, pass 2): `clamped` is a real engine-computed signal —
 * true if *any* step's shift had to be clamped to the `[0, targetTimeMs]` bounds rather than
 * applied exactly, i.e. the requested nudge could not be fully honored everywhere. Callers (the
 * store, then `NudgePanel`) use this instead of trying to infer clamping themselves by diffing a
 * single step's before/after time — which is unreliable here because steps clamp at different
 * points (the step closest to the target bound clamps first), so no single step's movement (or
 * lack of it) reliably indicates whether the schedule as a whole got clamped. */
export interface RescheduleResult {
  readonly steps: ScheduledStep[];
  readonly clamped: boolean;
}

/**
 * Bounded pace-nudge (D14, FR-17). Shifts every remaining step's `clockStartTime` by
 * `deltaMinutes` (positive = push later, negative = pull earlier). Each resulting start time is
 * independently clamped so it never goes past "target" — the ready/eat time, defined as the
 * fixed end of the last remaining step's placed interval, an invariant of
 * `solveScheduleBackward`'s backward placement — and never goes negative (before the Unix
 * epoch; a defensive floor against a pathological `deltaMinutes` producing a nonsensical date,
 * not a claim about "now"). The progression state machine (`progression.ts`) is responsible for
 * only nudging steps that haven't started yet; this function has no notion of "now" itself.
 *
 * Every step clamps to the *same* `[0, targetTimeMs]` bounds, and `clamp` is monotonic
 * non-decreasing — so a uniform shift followed by this clamp can never reorder an
 * already-ordered sequence (review pass 1, investigated and confirmed: reordering is
 * mathematically impossible here). Multiple trailing steps can collapse to the identical clamped
 * instant on a large enough nudge; that's correct boundary behavior, not a bug.
 */
export function reschedule(
  remaining: ReadonlyArray<ScheduledStep>,
  deltaMinutes: number,
): RescheduleResult {
  if (remaining.length === 0) return { steps: [], clamped: false };

  const lastStep = remaining[remaining.length - 1];
  // Every value here stays a plain number (milliseconds) until the very end. `Date` is only
  // valid within ±8.64e15 ms of the epoch — a pathological `deltaMinutes` (e.g. -1e12, an
  // absurd but not-invalid input) produces a shifted ms value far outside that range. Feeding
  // an out-of-range value into `new Date(...)` before clamping produces an Invalid Date, whose
  // `.getTime()` is `NaN` — and `NaN` poisons `Math.min`/`Math.max` (they return `NaN` whenever
  // any operand is `NaN`), so the clamp would silently stop clamping at exactly the pathological
  // input it exists to guard against. Clamping the raw number first avoids ever constructing a
  // `Date` from an out-of-range value.
  const targetTimeMs = lastStep.clockStartTime.getTime() + lastStep.durationMinutes * 60_000;
  const deltaMs = deltaMinutes * 60_000;
  const epochMs = 0;

  let clamped = false;
  const steps = remaining.map((step) => {
    const shiftedMs = step.clockStartTime.getTime() + deltaMs;
    const clampedMs = clamp(shiftedMs, epochMs, targetTimeMs);
    if (clampedMs !== shiftedMs) clamped = true;
    return { ...step, clockStartTime: new Date(clampedMs) };
  });

  return { steps, clamped };
}
