// The backward schedule solver (FR-5/FR-11) + the bounded pace-nudge (FR-17/D14).
// See `.somi/plans/hinokami/phases/01-engine-and-contract.md` for the full mechanism spec —
// this file implements it verbatim, including the fix history (D13 early-out + the universal
// post-placement guard that replaced the retired elastic-only pre-clamp guard).

import type { Recipe, Stage, TimingContext } from '@/recipes/contract';
import type { ScheduledStep, WorkflowInputs, WorkflowResult } from './types';

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** When the elastic stage absorbs all the slack, the first step lands exactly on `now`; `Date`
 * drops the fractional milliseconds of each ambient-scaled duration, which can leave that start a
 * few ms in the past. Only a start more than this tolerance in the past is infeasible. */
const PLACEMENT_TOLERANCE_MS = 1000;

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

/** What every duration sum needs besides the stage itself: which recipe and pathway the stage
 * belongs to, and the already-resolved bake time (bake is not ambient-sensitive, so it is passed
 * in rather than looked up). */
interface DurationBasis {
  readonly recipe: Recipe;
  readonly pathwayId: string;
  readonly bakeTimeMinutes: number;
}

/** A stage's minimum duration at `ambientC`: the passed-in bake time for bake, the elastic floor
 * for the elastic stage, and `stageDuration` at that ambient for everything else. Called at the
 * warmest legal ambient for the cheap D13 feasibility decision, and at the user's actual ambient
 * for every suggested value — never for placement, which clamps the elastic stage into its full
 * range instead of pinning it to the floor. */
function stageMinimumAt(basis: DurationBasis, stage: Stage, ambientC: number): number {
  if (stage.type === 'bake') return basis.bakeTimeMinutes;
  if (stage.elastic) return stage.elastic.minMinutes;
  return fixedStageDurationAt(basis.recipe, basis.pathwayId, stage, ambientC);
}

/** Sums `stageMinimumAt` over a resolved stage list. At the user's actual (possibly colder)
 * ambient this is the basis for every *suggested* `earliestFeasibleTarget`/`alternativePathways`
 * value: the cheap (a) warmest-ambient check is only ever the early-out *decision*, never the
 * suggestion — see the invariant documented on `TargetTooSoon` in `types.ts`. */
function minimumTotalAt(basis: DurationBasis, stages: Stage[], ambientC: number): number {
  return stages.reduce((sum, stage) => sum + stageMinimumAt(basis, stage, ambientC), 0);
}

/** The `TargetTooSoon` result for `inputs`, with every suggestion computed at the user's actual
 * ambient, not the warmest legal one — a suggested pathway or time must be genuinely reachable
 * in their real kitchen, not merely pass the cheap (a) check again (which would just trip the (b)
 * universal guard a second time). */
function targetTooSoon(
  recipe: Recipe,
  inputs: WorkflowInputs,
  bakeTimeMinutes: number,
  now: Date,
): WorkflowResult {
  const totalFor = (pathwayId: string) =>
    minimumTotalAt(
      { recipe, pathwayId, bakeTimeMinutes },
      resolveOrderedStages(recipe, pathwayId).stages,
      inputs.ambientC,
    );
  const alternativePathways = recipe.pathways
    .filter((p) => p.id !== inputs.pathway)
    .filter((p) => diffMinutes(inputs.targetTime, now) >= totalFor(p.id))
    .map((p) => p.id);

  return {
    ok: false,
    error: {
      earliestFeasibleTarget: addMinutes(now, totalFor(inputs.pathway)),
      alternativePathways,
    },
  };
}

/** Every stage's placed duration at the user's actual ambient. Order does not matter here: the
 * elastic stage's slack sums every *other* stage's duration, which is fully determined first
 * since only one elastic stage is allowed per pathway. */
function placedDurations(
  basis: DurationBasis,
  stages: Stage[],
  ambientC: number,
  timeToTargetMinutes: number,
): Map<string, number> {
  const placed = new Map<string, number>();
  for (const stage of stages) {
    if (stage.type === 'bake') placed.set(stage.id, basis.bakeTimeMinutes);
    else if (!stage.elastic) placed.set(stage.id, fixedStageDurationAt(basis.recipe, basis.pathwayId, stage, ambientC));
  }
  const elasticStage = stages.find((s) => s.elastic);
  if (elasticStage?.elastic) {
    const othersSum = stages
      .filter((s) => s.id !== elasticStage.id)
      .reduce((sum, s) => sum + (placed.get(s.id) ?? 0), 0);
    // Plain clamp, no special-cased early return (restart-pass-2 fix) — any resulting overflow
    // (slack below elastic.minMinutes) is caught uniformly by the (b) guard, not here.
    const { minMinutes, maxMinutes } = elasticStage.elastic;
    placed.set(elasticStage.id, clamp(timeToTargetMinutes - othersSum, minMinutes, maxMinutes));
  }
  return placed;
}

/** Walks the stages backward from `targetTime`, giving each its clock start time. */
function assignClockTimes(stages: Stage[], placed: Map<string, number>, targetTime: Date): ScheduledStep[] {
  const steps: ScheduledStep[] = [];
  let cursor = targetTime;
  for (let i = stages.length - 1; i >= 0; i -= 1) {
    const stage = stages[i];
    const durationMinutes = placed.get(stage.id)!;
    const clockStartTime = addMinutes(cursor, -durationMinutes);
    steps.unshift({
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
  return steps;
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
  const basis: DurationBasis = { recipe, pathwayId: inputs.pathway, bakeTimeMinutes };
  const timeToTargetMinutes = diffMinutes(inputs.targetTime, now);

  // (a) D13 minimum-feasible-total early-out. This warmest-ambient total is the correct basis
  // for the cheap *decision* ("is this even theoretically possible") — it must NOT also be used
  // as the *suggested* earliestFeasibleTarget: `stageDuration` is monotonic-decreasing in
  // ambient, so a cooler actual ambient genuinely needs more time than this minimum, and
  // offering it back to the user would still be infeasible at their real kitchen temperature
  // (it would clear this same check again on retry, then trip the (b) guard below). The
  // suggestion is always recomputed at the actual ambient — see `targetTooSoon`.
  if (timeToTargetMinutes < minimumTotalAt(basis, stages, recipe.bounds.ambientMax)) {
    return targetTooSoon(recipe, inputs, bakeTimeMinutes, now);
  }

  const placed = placedDurations(basis, stages, inputs.ambientC, timeToTargetMinutes);
  const scheduledSteps = assignClockTimes(stages, placed, inputs.targetTime);

  // (b) Universal post-placement guard — is the earliest placed stage already in the past?
  const earliestStart = scheduledSteps[0]?.clockStartTime ?? inputs.targetTime;
  if (earliestStart.getTime() < now.getTime() - PLACEMENT_TOLERANCE_MS) {
    return targetTooSoon(recipe, inputs, bakeTimeMinutes, now);
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
