// scaleFormula — FR-4: scales a recipe's baker's-percentage formula to the user's batch.
// Pure, no I/O. The engine calls this once per workflow generation (workflow.ts).

import type { BakersPercentageFormula } from '@/recipes/contract';
import type { ScaledIngredient } from './types';

export interface Batch {
  readonly ballCount: number;
  readonly ballWeightG: number;
}

/**
 * Baker's percentages are relative to the flour line (which must be present at `percent: 100`
 * for the formula to be meaningful, though this function doesn't require it by name — it sums
 * every declared ingredient's percent to find the total-dough-relative-to-flour ratio, which is
 * correct as long as flour is one of the declared ingredients at 100).
 */
export function scaleFormula(
  formula: BakersPercentageFormula,
  batch: Batch,
): ReadonlyArray<ScaledIngredient> {
  const totalDoughWeightG = batch.ballCount * batch.ballWeightG;
  const totalPercent = formula.ingredients.reduce((sum, ingredient) => sum + ingredient.percent, 0);

  if (totalPercent <= 0) {
    throw new Error('scaleFormula: formula.ingredients must sum to a positive percent total');
  }

  const flourWeightG = totalDoughWeightG / (totalPercent / 100);

  return formula.ingredients.map((ingredient) => ({
    name: ingredient.name,
    grams: Math.round(flourWeightG * (ingredient.percent / 100) * 10) / 10,
  }));
}
