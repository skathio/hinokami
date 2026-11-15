// Split bake for stone-baked styles: fresh mozzarella breaks (whey and fat separate) within a
// few minutes at home-oven max, so the base bakes with sauce only and the cheese goes on for the
// last minutes. Reported failure: at 290 °C on a stone, cheese added at launch boiled after about
// 2–3 min while the Roman base still needed the full ~8 min.

import { describe, expect, it } from 'vitest';
import { pizzaRecipe } from '../index';
import { romanRecipe, sicilianRecipe } from '../styles';
import type { BakeAdaptation, Recipe } from '../../contract';

function adapt(recipe: Recipe, ovenMaxC: number, hasStoneOrSteel: boolean): BakeAdaptation {
  const result = recipe.adaptBake({ ovenMaxC, hasStoneOrSteel });
  if (!result.ok) throw new Error(`expected ok at ${ovenMaxC}°C`);
  return result.value;
}

const bakeText = (recipe: Recipe) =>
  (recipe.stages.find((s) => s.id === 'bake')?.how ?? []).map((h) => h.action).join(' ');

describe.each([
  ['Neapolitan', pizzaRecipe],
  ['Roman', romanRecipe],
])('%s split bake', (_name, recipe) => {
  it('gives a cheese time that fresh mozzarella survives at the style max on a stone', () => {
    const { cheeseMinutes, bakeTimeMinutes } = adapt(recipe, recipe.bounds.ovenStyleMax, true);
    expect(cheeseMinutes).toBeDefined();
    expect(cheeseMinutes!).toBeGreaterThanOrEqual(2);
    expect(cheeseMinutes!).toBeLessThanOrEqual(3);
    expect(cheeseMinutes!).toBeLessThan(bakeTimeMinutes);
  });

  it('gives the cheese more time in a cooler oven, and always leaves a sauce-only base bake', () => {
    for (const stone of [true, false]) {
      const cool = adapt(recipe, recipe.bounds.ovenMin, stone);
      const hot = adapt(recipe, recipe.bounds.ovenStyleMax, stone);
      expect(cool.cheeseMinutes!).toBeGreaterThan(hot.cheeseMinutes!);
      expect(cool.cheeseMinutes!).toBeLessThanOrEqual(cool.bakeTimeMinutes / 2);
    }
  });

  it('tells the baker to bake the base with sauce only and add the cheese late', () => {
    const text = bakeText(recipe);
    expect(text).toMatch(/sauce only/i);
    expect(text).toMatch(/mozzarella/i);
    expect(text).toMatch(/fan/i);
    expect(text).not.toMatch(/add (light )?toppings/i);
  });
});

it('Roman at 290 °C on a stone keeps its ~8 min total with about 2 min of cheese', () => {
  const { bakeTimeMinutes, cheeseMinutes } = adapt(romanRecipe, 290, true);
  expect(bakeTimeMinutes).toBeCloseTo(7.9, 1);
  expect(Math.round(cheeseMinutes!)).toBe(2);
});

it('Sicilian (pan) has no cheese split', () => {
  expect(adapt(sicilianRecipe, 250, false).cheeseMinutes).toBeUndefined();
});
