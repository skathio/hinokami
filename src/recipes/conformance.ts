// Shared recipe conformance suite (contract §6/§8) — the gate every recipe must pass.
//
// Split into two layers:
//  - `conformanceResults(recipe)` — pure, computes every invariant's pass/fail and NEVER
//    throws (a broken recipe fails its specific invariant, not the whole computation). This is
//    what makes "pass/fail per invariant, not throws" a directly testable property.
//  - `runConformanceSuite(recipe)` — the ergonomic wrapper a recipe's own test file calls at the
//    top level (or inside a `describe` block): it registers one Vitest `it()` per invariant from
//    `conformanceResults`, so a broken invariant shows up as its own failing test in the runner
//    instead of aborting the whole file.

import { describe, expect, it } from 'vitest';
import type { OvenContext, Recipe, TimingContext } from './contract';

export interface ConformanceResult {
  readonly name: string;
  readonly pass: boolean;
  readonly message?: string;
}

function checkPurity(recipe: Recipe): ConformanceResult {
  // Every stage in every pathway, at a couple of different ambients — sampling only
  // `stages[0]` at one ambient would miss an impure `stageDuration` on any other stage (e.g. an
  // ambient-sensitive fermentation stage that happens not to be first in the list).
  const representativeAmbients = [recipe.bounds.ambientMin, recipe.bounds.ambientMax];
  for (const pathway of recipe.pathways) {
    for (const stageId of pathway.stageIds) {
      for (const ambientC of representativeAmbients) {
        const ctx: TimingContext = { ambientC, pathway: pathway.id, stage: stageId };
        const first = recipe.stageDuration(stageId, ctx);
        const second = recipe.stageDuration(stageId, ctx);
        if (first.minutes !== second.minutes) {
          return {
            name: 'purity: stageDuration is deterministic for identical inputs',
            pass: false,
            message: `stage "${stageId}" at ambientC=${ambientC} returned ${first.minutes} then ${second.minutes}`,
          };
        }
      }
    }
  }
  return { name: 'purity: stageDuration is deterministic for identical inputs', pass: true };
}

function checkBoundedOutputs(recipe: Recipe): ConformanceResult {
  const representativeAmbients = [
    recipe.bounds.ambientMin,
    (recipe.bounds.ambientMin + recipe.bounds.ambientMax) / 2,
    recipe.bounds.ambientMax,
  ];
  for (const pathway of recipe.pathways) {
    for (const stageId of pathway.stageIds) {
      for (const ambientC of representativeAmbients) {
        const ctx: TimingContext = { ambientC, pathway: pathway.id, stage: stageId };
        const { minutes } = recipe.stageDuration(stageId, ctx);
        if (!Number.isFinite(minutes) || minutes < 0) {
          return {
            name: 'bounded outputs: stageDuration is non-negative and finite for every stage',
            pass: false,
            message: `stage "${stageId}" at ambientC=${ambientC} returned ${minutes}`,
          };
        }
      }
    }
  }
  return { name: 'bounded outputs: stageDuration is non-negative and finite for every stage', pass: true };
}

function checkMonotoneTiming(recipe: Recipe): ConformanceResult {
  // Scoped to exactly `type === 'fermentation'` — NOT `type === 'cold-ferment'`, whose placed
  // duration is scheduler-determined via the elastic-stage slack-clamp rather than an ambient
  // response, and whose `stageDuration` is a constant (monotonicity is vacuous for a constant).
  const fermentationStages = recipe.stages.filter((stage) => stage.type === 'fermentation');
  for (const stage of fermentationStages) {
    const pathway = recipe.pathways.find((p) => p.stageIds.includes(stage.id));
    if (!pathway) continue;
    const atMin = recipe.stageDuration(stage.id, {
      ambientC: recipe.bounds.ambientMin,
      pathway: pathway.id,
      stage: stage.id,
    });
    const atMax = recipe.stageDuration(stage.id, {
      ambientC: recipe.bounds.ambientMax,
      pathway: pathway.id,
      stage: stage.id,
    });
    if (atMax.minutes > atMin.minutes) {
      return {
        name: "monotone timing (D13): stageDuration is non-increasing in ambientC for type === 'fermentation' stages",
        pass: false,
        message: `stage "${stage.id}": duration at ambientMax (${atMax.minutes}) exceeds duration at ambientMin (${atMin.minutes})`,
      };
    }
  }
  return {
    name: "monotone timing (D13): stageDuration is non-increasing in ambientC for type === 'fermentation' stages",
    pass: true,
  };
}

function checkStableId(recipe: Recipe): ConformanceResult {
  const pass = typeof recipe.id === 'string' && recipe.id.length > 0;
  return { name: 'stable id: recipe.id is a non-empty branded string', pass };
}

function checkOvenTooColdBoundary(recipe: Recipe): ConformanceResult {
  const tooColdCtx: OvenContext = { ovenMaxC: recipe.bounds.ovenMin - 1, hasStoneOrSteel: false };
  const okCtx: OvenContext = { ovenMaxC: recipe.bounds.ovenMin, hasStoneOrSteel: false };
  const tooCold = recipe.adaptBake(tooColdCtx);
  const ok = recipe.adaptBake(okCtx);
  const pass = tooCold.ok === false && ok.ok === true;
  return {
    name: 'adaptBake reports OvenTooCold below bounds.ovenMin and ok at/above it',
    pass,
    message: pass ? undefined : `tooCold.ok=${tooCold.ok}, ok.ok=${ok.ok}`,
  };
}

/** Computes every conformance invariant's pass/fail for `recipe`. Pure — never throws; a
 * malformed recipe fails its specific check(s) instead. */
export function conformanceResults(recipe: Recipe): ConformanceResult[] {
  return [
    checkPurity(recipe),
    checkBoundedOutputs(recipe),
    checkMonotoneTiming(recipe),
    checkStableId(recipe),
    checkOvenTooColdBoundary(recipe),
  ];
}

/** Registers one Vitest `it()` per invariant from `conformanceResults(recipe)`. Call this at
 * the top level of a `*.test.ts` file (or inside a `describe` block) — every recipe module's
 * own test suite should include one call to this. */
export function runConformanceSuite(recipe: Recipe): void {
  describe(`recipe conformance: ${recipe.id}`, () => {
    for (const result of conformanceResults(recipe)) {
      it(result.name, () => {
        expect(result.pass, result.message).toBe(true);
      });
    }
  });
}
