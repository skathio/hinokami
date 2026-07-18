import { describe, expect, it } from 'vitest';
import { generateWorkflow } from '../workflow';
import { constantAdaptBake, stageDurationFromTable } from './fixtures';
import type { Recipe, RecipeBounds, Stage } from '@/recipes/contract';
import { createRecipeId } from '@/recipes/contract';
import type { WorkflowInputs } from '../types';

const NOW = new Date('2026-07-17T08:00:00.000Z');

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

const STAGES: Stage[] = [
  { id: 'mix', name: 'Mix', type: 'prep', why: 'why-mix' },
  { id: 'bake', name: 'Bake', type: 'bake', why: 'why-bake' },
];

function buildRecipe(): Recipe {
  return {
    contractVersion: 1,
    id: createRecipeId('stub-workflow-recipe'),
    name: 'Stub workflow recipe',
    description: 'A stub recipe for workflow.ts unit tests.',
    formula: { ingredients: [{ name: 'Flour', percent: 100 }, { name: 'Water', percent: 60 }] },
    bounds: BOUNDS,
    stages: STAGES,
    pathways: [{ id: 'test-pathway', name: 'Test pathway', stageIds: ['mix', 'bake'] }],
    stageDuration: stageDurationFromTable({ mix: () => 15 }),
    // bakeTimeMinutes = 10, requires ovenMaxC >= 200 (BOUNDS.ovenMin).
    adaptBake: constantAdaptBake(10, 250, BOUNDS.ovenMin),
  };
}

function baseInputs(overrides: Partial<WorkflowInputs> = {}): WorkflowInputs {
  return {
    targetTime: new Date(NOW.getTime() + 60 * 60_000),
    ovenMaxC: 250,
    hasStoneOrSteel: false,
    ambientC: 24,
    ballCount: 2,
    ballWeightG: 250,
    pathway: 'test-pathway',
    ...overrides,
  };
}

describe('generateWorkflow', () => {
  it('happy path: scales ingredients, adapts the bake, and solves the schedule', () => {
    const recipe = buildRecipe();
    const result = generateWorkflow(recipe, baseInputs(), NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok result');
    expect(result.scaledIngredients.length).toBe(2);
    expect(result.bakeAdaptation).toEqual({ bakeTempC: 250, bakeTimeMinutes: 10 });
    expect(result.steps).toHaveLength(2);
    expect(result.steps[1].stageId).toBe('bake');
  });

  it('surfaces OvenTooCold without attempting to schedule (FR-10)', () => {
    const recipe = buildRecipe();
    const result = generateWorkflow(recipe, baseInputs({ ovenMaxC: 150 }), NOW);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected an OvenTooCold error');
    expect(result.error).toHaveProperty('minimumOvenC');
    expect(result.error).not.toHaveProperty('earliestFeasibleTarget');
  });

  it('surfaces TargetTooSoon when the schedule solver can\'t fit the workflow before target (FR-11)', () => {
    const recipe = buildRecipe();
    // minimum = mix(15) + bake(10) = 25 minutes; give only 5.
    const targetTime = new Date(NOW.getTime() + 5 * 60_000);
    const result = generateWorkflow(recipe, baseInputs({ targetTime }), NOW);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a TargetTooSoon error');
    expect(result.error).toHaveProperty('earliestFeasibleTarget');
    expect(result.error).not.toHaveProperty('minimumOvenC');
  });

  describe('pathway-conditional formula (P7)', () => {
    // A stub recipe with two pathways: one declares a formula override, one doesn't. Both
    // directions of `pathway.formula ?? recipe.formula` must be exercised — a backward
    // implementation (`recipe.formula ?? pathway.formula`) would silently break the no-override
    // pathway, since `recipe.formula` is never undefined and would always win.
    const recipeFormula = { ingredients: [{ name: 'Flour', percent: 100 }, { name: 'Water', percent: 60 }] };
    const overrideFormula = { ingredients: [{ name: 'Flour', percent: 100 }, { name: 'Water', percent: 70 }] };

    function buildTwoPathwayRecipe(): Recipe {
      return {
        contractVersion: 1,
        id: createRecipeId('stub-formula-recipe'),
        name: 'Stub formula recipe',
        description: 'A stub recipe for the pathway-formula-override unit test.',
        formula: recipeFormula,
        bounds: BOUNDS,
        stages: STAGES,
        pathways: [
          { id: 'no-override', name: 'No override', stageIds: ['mix', 'bake'] },
          { id: 'with-override', name: 'With override', stageIds: ['mix', 'bake'], formula: overrideFormula },
        ],
        stageDuration: stageDurationFromTable({ mix: () => 15 }),
        adaptBake: constantAdaptBake(10, 250, BOUNDS.ovenMin),
      };
    }

    it('scales the pathway override formula when present', () => {
      const recipe = buildTwoPathwayRecipe();
      const result = generateWorkflow(recipe, baseInputs({ pathway: 'with-override' }), NOW);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok result');
      const water = result.scaledIngredients.find((i) => i.name === 'Water');
      // batch: 2 balls x 250g = 500g total; totalPercent = 170; flour = 500/1.7 ≈ 294.12g;
      // water @ 70% ≈ 205.88g. Distinct from the 60%-water recipe.formula result below.
      expect(water?.grams).toBeCloseTo(205.9, 1);
    });

    it('falls back to recipe.formula when the pathway declares no override', () => {
      const recipe = buildTwoPathwayRecipe();
      const result = generateWorkflow(recipe, baseInputs({ pathway: 'no-override' }), NOW);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok result');
      const water = result.scaledIngredients.find((i) => i.name === 'Water');
      // batch: 2 balls x 250g = 500g total; totalPercent = 160; flour = 500/1.6 = 312.5g;
      // water @ 60% = 187.5g — recipe.formula's percentage, not the override's 70%.
      expect(water?.grams).toBeCloseTo(187.5, 1);
    });
  });
});
