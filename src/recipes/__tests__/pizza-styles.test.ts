// Sicilian and Roman pizza types, requested as "add two more pizza types. Sicilian and Roman".
// Ids, formulas and pathways are left open by the request, so recipes are found by name.

import { describe, expect, it } from 'vitest';
import { runConformanceSuite } from '../conformance';
import { CONTRACT_VERSION, type Recipe } from '../contract';
import { createRecipeRegistry, recipeRegistry } from '../registry';
import { pizzaRecipe } from '../pizza';

const byName = (word: string): Recipe | undefined =>
  recipeRegistry.list().find((r) => r.name.toLowerCase().includes(word));

const sicilian = byName('sicilian');
const roman = byName('roman');

describe('Sicilian and Roman pizza types', () => {
  it('registers a Sicilian recipe in the app-wide registry', () => {
    expect(sicilian).toBeDefined();
  });

  it('registers a Roman recipe in the app-wide registry', () => {
    expect(roman).toBeDefined();
  });

  it('keeps the existing Neapolitan pizza and adds exactly two more recipes', () => {
    expect(recipeRegistry.list()).toContain(pizzaRecipe);
    expect(recipeRegistry.list()).toHaveLength(3);
  });

  it('gives all three recipes distinct ids', () => {
    const ids = recipeRegistry.list().map((r) => r.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('looks each new recipe up by its id', () => {
    for (const r of [sicilian, roman]) {
      expect(r && recipeRegistry.lookup(r.id)).toBe(r);
    }
  });

  it('declares the current CONTRACT_VERSION on each new recipe', () => {
    for (const r of [sicilian, roman]) {
      expect(r?.contractVersion).toBe(CONTRACT_VERSION);
    }
  });

  it('refuses to register a new recipe twice (duplicate id throws)', () => {
    for (const r of [sicilian, roman]) {
      if (!r) throw new Error('recipe not registered');
      const registry = createRecipeRegistry();
      registry.register(r);
      expect(() => registry.register(r)).toThrow(/already registered/);
    }
  });
});

if (sicilian) {
  describe('Sicilian conformance', () => runConformanceSuite(sicilian));
}
if (roman) {
  describe('Roman conformance', () => runConformanceSuite(roman));
}
