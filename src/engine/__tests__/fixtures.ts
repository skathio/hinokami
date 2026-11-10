// Shared test-only helpers for constructing minimal stub `Recipe`s. Not a `*.test.ts` file, so
// Vitest's default test glob does not pick it up as a suite — it's imported by the real suites.

import { createRecipeId } from '@/recipes/contract';
import type {
  BakeAdaptation,
  OvenContext,
  OvenTooCold,
  Recipe,
  Result,
  StageRef,
  TimingContext,
} from '@/recipes/contract';

export const STUB_RECIPE_ID = createRecipeId('stub-test-recipe');

/** Builds a `stageDuration` implementation from a per-stage-id duration function. A stage id
 * absent from `table` returns the `{ minutes: 0 }` placeholder — mirrors the real contract's
 * `stageDuration(bake, ctx) = 0` (never used for placement/feasibility; see `contract.ts`). */
export function stageDurationFromTable(
  table: Record<StageRef, (ambientC: number) => number>,
): Recipe['stageDuration'] {
  return (stage: StageRef, ctx: TimingContext) => {
    const fn = table[stage];
    return { minutes: fn ? fn(ctx.ambientC) : 0 };
  };
}

/** Builds a constant `adaptBake`: `OvenTooCold` below `ovenMinC`, else a fixed adaptation. */
export function constantAdaptBake(
  bakeTimeMinutes: number,
  bakeTempC: number,
  ovenMinC: number,
): Recipe['adaptBake'] {
  return (ctx: OvenContext): Result<BakeAdaptation, OvenTooCold> => {
    if (ctx.ovenMaxC < ovenMinC) {
      return { ok: false, error: { reason: 'stub: oven too cold', minimumOvenC: ovenMinC } };
    }
    return { ok: true, value: { bakeTempC, bakeTimeMinutes } };
  };
}
