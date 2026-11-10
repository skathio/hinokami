// generateWorkflow — composes scaling, oven-adaptation, and the backward schedule solver into
// one ordered, ready-to-render workflow (FR-1..FR-6). The only place `recipe.adaptBake` is
// called before scheduling (restart-pass-2 fix: `solveScheduleBackward` receives the resolved
// bake time as a plain parameter, never resolving it itself).

import type { BakeAdaptation, OvenContext, OvenTooCold, PathwayRef, Recipe } from '@/recipes/contract';
import { scaleFormula, type Batch } from './scaling';
import { solveScheduleBackward } from './schedule';
import type { ScaledIngredient, ScheduledStep, TargetTooSoon, WorkflowInputs } from './types';

export type GenerateWorkflowResult =
  | {
      ok: true;
      steps: ReadonlyArray<ScheduledStep>;
      scaledIngredients: ReadonlyArray<ScaledIngredient>;
      bakeAdaptation: BakeAdaptation;
    }
  | { ok: false; error: OvenTooCold | TargetTooSoon };

/**
 * P7: a pathway may override the recipe's formula (e.g. cold-ferment's reduced yeast dose).
 * Falls back to `recipe.formula` when the pathway declares no override, or when `pathwayId`
 * itself is unrecognized (the schedule solver throws loudly on that case; scaling doesn't need
 * to duplicate that check). Extracted (iteration 1.1) so `store/session.ts`'s rehydration
 * recompute (`recomputeScaledIngredients`) shares this exact rule instead of a second, drifting
 * copy — the same class of duplication `RecipeBounds.coldFermentHoursMin/Max`'s single-source-
 * of-truth fix exists to avoid.
 */
export function resolveScaledIngredients(
  recipe: Recipe,
  pathwayId: PathwayRef,
  batch: Batch,
): ReadonlyArray<ScaledIngredient> {
  const pathway = recipe.pathways.find((p) => p.id === pathwayId);
  return scaleFormula(pathway?.formula ?? recipe.formula, batch);
}

export function generateWorkflow(
  recipe: Recipe,
  inputs: WorkflowInputs,
  now: Date = new Date(),
): GenerateWorkflowResult {
  const scaledIngredients = resolveScaledIngredients(recipe, inputs.pathway, {
    ballCount: inputs.ballCount,
    ballWeightG: inputs.ballWeightG,
  });

  const ovenCtx: OvenContext = { ovenMaxC: inputs.ovenMaxC, hasStoneOrSteel: inputs.hasStoneOrSteel };
  const bakeResult = recipe.adaptBake(ovenCtx);
  if (!bakeResult.ok) {
    return { ok: false, error: bakeResult.error };
  }

  const scheduleResult = solveScheduleBackward(recipe, inputs, bakeResult.value.bakeTimeMinutes, now);
  if (!scheduleResult.ok) {
    return { ok: false, error: scheduleResult.error };
  }

  return {
    ok: true,
    steps: scheduleResult.steps,
    scaledIngredients,
    bakeAdaptation: bakeResult.value,
  };
}
