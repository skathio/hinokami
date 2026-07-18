// generateWorkflow — composes scaling, oven-adaptation, and the backward schedule solver into
// one ordered, ready-to-render workflow (FR-1..FR-6). The only place `recipe.adaptBake` is
// called before scheduling (restart-pass-2 fix: `solveScheduleBackward` receives the resolved
// bake time as a plain parameter, never resolving it itself).

import type { BakeAdaptation, OvenContext, OvenTooCold, Recipe } from '@/recipes/contract';
import { scaleFormula } from './scaling';
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

export function generateWorkflow(
  recipe: Recipe,
  inputs: WorkflowInputs,
  now: Date = new Date(),
): GenerateWorkflowResult {
  const scaledIngredients = scaleFormula(recipe.formula, {
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
