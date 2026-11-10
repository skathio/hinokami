// Content-integrity regression (iteration 2.2): every authored `how` step's `ingredientRefs`
// entry must name a real `FormulaIngredient` — in BOTH `pizzaFormula` (same-day) and
// `coldFermentFormula` (the cold-ferment pathway override), since the UI resolves refs against
// whichever formula is active for the session's pathway (`store/session.ts`'s
// `recomputeScaledIngredients` / `engine/workflow.ts`'s `resolveScaledIngredients`). A ref that
// only exists in one formula would silently fail to resolve — and fire the `devWarn` in
// `StepRunnerScreen.tsx` — for sessions on the other pathway; this test catches that at author
// time instead of at runtime.

import { describe, expect, it } from 'vitest';
import { coldFermentFormula, pizzaFormula, pizzaRecipe } from '../index';

function ingredientNames(formula: { ingredients: ReadonlyArray<{ name: string }> }): Set<string> {
  return new Set(formula.ingredients.map((ingredient) => ingredient.name));
}

describe('pizza "how" content integrity (iteration 2.2)', () => {
  it('every ingredientRefs entry across every stage resolves against pizzaFormula', () => {
    const names = ingredientNames(pizzaFormula);
    for (const stage of pizzaRecipe.stages) {
      for (const howStep of stage.how ?? []) {
        for (const ref of howStep.ingredientRefs ?? []) {
          expect(
            names.has(ref),
            `stage "${stage.id}" how step "${howStep.action}" references unknown ingredient "${ref}" (pizzaFormula)`,
          ).toBe(true);
        }
      }
    }
  });

  it('every ingredientRefs entry across every stage resolves against coldFermentFormula', () => {
    const names = ingredientNames(coldFermentFormula);
    for (const stage of pizzaRecipe.stages) {
      for (const howStep of stage.how ?? []) {
        for (const ref of howStep.ingredientRefs ?? []) {
          expect(
            names.has(ref),
            `stage "${stage.id}" how step "${howStep.action}" references unknown ingredient "${ref}" (coldFermentFormula)`,
          ).toBe(true);
        }
      }
    }
  });

  it('every stage that declares "how" declares a non-empty array (2.1\'s invariant: undefined or non-empty)', () => {
    for (const stage of pizzaRecipe.stages) {
      if (stage.how !== undefined) {
        expect(stage.how.length, `stage "${stage.id}" declares an empty "how" array`).toBeGreaterThan(0);
      }
    }
  });

  it('every how step has a non-empty action string', () => {
    for (const stage of pizzaRecipe.stages) {
      for (const howStep of stage.how ?? []) {
        expect(howStep.action.length, `stage "${stage.id}" has a how step with an empty action`).toBeGreaterThan(0);
      }
    }
  });

  it('at least one stage (mix) references ingredients, proving the resolution path is exercised', () => {
    const mix = pizzaRecipe.stages.find((stage) => stage.id === 'mix');
    const refs = mix?.how?.flatMap((howStep) => howStep.ingredientRefs ?? []) ?? [];
    expect(refs.length).toBeGreaterThan(0);
  });
});
