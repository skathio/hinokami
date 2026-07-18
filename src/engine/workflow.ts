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
  // P7: a pathway may override the recipe's formula (e.g. cold-ferment's reduced yeast dose).
  // Falls back to recipe.formula when the pathway declares no override, or when the pathway id
  // itself is unrecognized (the schedule solver below throws loudly on that case; scaling
  // doesn't need to duplicate that check).
  const pathway = recipe.pathways.find((p) => p.id === inputs.pathway);
  const scaledIngredients = scaleFormula(pathway?.formula ?? recipe.formula, {
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
