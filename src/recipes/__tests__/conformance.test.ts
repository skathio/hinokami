import { describe, expect, it } from 'vitest';
import { conformanceResults, runConformanceSuite } from '../conformance';
import { createRecipeId } from '../contract';
import type { Recipe, RecipeBounds } from '../contract';

const BOUNDS: RecipeBounds = {
  ballCountMin: 1,
  ballCountMax: 8,
  ballWeightGMin: 200,
  ballWeightGMax: 300,
  ovenMin: 200,
  ovenStyleMax: 280,
  ambientMin: 18,
  ambientMax: 30,
};

/** A well-behaved stub — every conformance invariant should pass against it. */
const wellBehavedRecipe: Recipe = {
  contractVersion: 1,
  id: createRecipeId('conformance-stub-well-behaved'),
  name: 'Well-behaved stub',
  description: 'A stub recipe that satisfies every conformance invariant.',
  formula: { ingredients: [{ name: 'Flour', percent: 100 }] },
  bounds: BOUNDS,
  stages: [
    { id: 'mix', name: 'Mix', type: 'prep', why: 'why-mix' },
    { id: 'ferment', name: 'Ferment', type: 'fermentation', why: 'why-ferment', cue: 'cue-ferment' },
    { id: 'bake', name: 'Bake', type: 'bake', why: 'why-bake' },
  ],
  pathways: [{ id: 'only-pathway', name: 'Only pathway', stageIds: ['mix', 'ferment', 'bake'] }],
  stageDuration: (stage, ctx) => {
    if (stage === 'ferment') {
      // Monotonic non-increasing in ambient: 2^((24 - ambient) / 10) with a 100 min base.
      return { minutes: 100 * 2 ** ((24 - ctx.ambientC) / 10) };
    }
    if (stage === 'bake') return { minutes: 0 };
    return { minutes: 15 };
  },
  adaptBake: (ctx) => {
    if (ctx.ovenMaxC < BOUNDS.ovenMin) {
      return { ok: false, error: { reason: 'too cold', minimumOvenC: BOUNDS.ovenMin } };
    }
    return { ok: true, value: { bakeTempC: Math.min(ctx.ovenMaxC, 280), bakeTimeMinutes: 10 } };
  },
};

/** Deliberately violates D13: `ferment`'s duration INCREASES with ambient instead of
 * decreasing. Used to prove a broken invariant surfaces as a failing check, not a thrown
 * exception that aborts the whole computation. */
const brokenMonotonicityRecipe: Recipe = {
  ...wellBehavedRecipe,
  id: createRecipeId('conformance-stub-broken-monotonicity'),
  stageDuration: (stage, ctx) => {
    if (stage === 'ferment') return { minutes: ctx.ambientC }; // increasing — violates D13
    if (stage === 'bake') return { minutes: 0 };
    return { minutes: 15 };
  },
};

describe('conformanceResults — pure, per-invariant pass/fail (never throws)', () => {
  it('is callable against a well-behaved stub recipe and every invariant passes', () => {
    const results = conformanceResults(wellBehavedRecipe);
    expect(results.length).toBeGreaterThanOrEqual(5);
    for (const result of results) {
      expect(result.pass, `${result.name}: ${result.message ?? ''}`).toBe(true);
    }
  });

  it('reports a broken monotonicity invariant as a failing result, not a thrown exception', () => {
    expect(() => conformanceResults(brokenMonotonicityRecipe)).not.toThrow();

    const results = conformanceResults(brokenMonotonicityRecipe);
    const monotonicity = results.find((r) => r.name.startsWith('monotone timing'));
    expect(monotonicity?.pass).toBe(false);

    // Every OTHER invariant still ran and reported its own result — one broken check doesn't
    // take the rest of the suite down with it.
    const others = results.filter((r) => r !== monotonicity);
    expect(others.every((r) => r.pass)).toBe(true);
  });
});

// The ergonomic wrapper real recipe test suites use (Phase 2's pizza recipe, for example) —
// registered here at the top level against the well-behaved stub, so it runs as real Vitest
// `it()`s and stays part of the green `npm test` run.
runConformanceSuite(wellBehavedRecipe);
