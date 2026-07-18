// Runs the Phase 1 conformance factory against the real pizza recipe, plus the registration/
// versioning checks from the phase 2 DoD.

import { describe, expect, it } from 'vitest';
import { runConformanceSuite } from '../../conformance';
import { CONTRACT_VERSION } from '../../contract';
import { recipeRegistry } from '../../registry';
import { PIZZA_CONTENT_VERSION, pizzaRecipe } from '../index';

runConformanceSuite(pizzaRecipe);

describe('pizza recipe registration + versioning (phase 2 DoD)', () => {
  it('is registered in the app-wide registry and discoverable via list()', () => {
    expect(recipeRegistry.list()).toContain(pizzaRecipe);
  });

  it('is discoverable via lookup() by its id', () => {
    expect(recipeRegistry.lookup(pizzaRecipe.id)).toBe(pizzaRecipe);
  });

  it('declares the current CONTRACT_VERSION', () => {
    expect(pizzaRecipe.contractVersion).toBe(CONTRACT_VERSION);
  });

  it('exports PIZZA_CONTENT_VERSION as "1.0.0"', () => {
    expect(PIZZA_CONTENT_VERSION).toBe('1.0.0');
  });
});

describe('stage list + pathway shape (phase 2 DoD)', () => {
  it('same-day pathway does not use the cold-ferment/temper stages', () => {
    const sameDay = pizzaRecipe.pathways.find((p) => p.id === 'same-day');
    expect(sameDay?.stageIds).toEqual(['mix', 'bulk', 'shape', 'proof', 'preheat', 'bake']);
  });

  it("cold-ferment pathway uses its own 'temper' stage, not a reused 'proof'", () => {
    const coldFerment = pizzaRecipe.pathways.find((p) => p.id === 'cold-ferment');
    expect(coldFerment?.stageIds).toEqual([
      'mix',
      'bulk',
      'cold-ferment',
      'shape',
      'temper',
      'preheat',
      'bake',
    ]);
    expect(coldFerment?.stageIds).not.toContain('proof');
  });

  it('every stage has a non-empty why; fermentation/estimate stages (bulk, proof, cold-ferment, temper) additionally have a cue', () => {
    const stagesWithCue = new Set(['bulk', 'proof', 'cold-ferment', 'temper']);
    for (const stage of pizzaRecipe.stages) {
      expect(stage.why.length).toBeGreaterThan(0);
      if (stagesWithCue.has(stage.id)) {
        expect(stage.cue, `expected stage "${stage.id}" to have a cue`).toBeDefined();
      } else {
        expect(stage.cue, `expected stage "${stage.id}" to have no cue`).toBeUndefined();
      }
    }
  });
});
