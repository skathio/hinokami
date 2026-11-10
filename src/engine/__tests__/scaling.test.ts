import { describe, expect, it } from 'vitest';
import { scaleFormula } from '../scaling';
import type { BakersPercentageFormula } from '@/recipes/contract';

// A representative Neapolitan-style formula: flour 100%, water 60%, salt 2%, yeast 0.3%.
const formula: BakersPercentageFormula = {
  ingredients: [
    { name: 'Flour', percent: 100 },
    { name: 'Water', percent: 60 },
    { name: 'Salt', percent: 2 },
    { name: 'Yeast', percent: 0.3 },
  ],
};

describe('scaleFormula', () => {
  it('scales a single ball to the correct per-ingredient gram weights', () => {
    // totalPercent = 162.3; one 250g ball → totalDough 250g → flour = 250 / 1.623 ≈ 154.0g
    const scaled = scaleFormula(formula, { ballCount: 1, ballWeightG: 250 });

    const byName = Object.fromEntries(scaled.map((i) => [i.name, i.grams]));
    expect(byName.Flour).toBeCloseTo(154.0, 1);
    expect(byName.Water).toBeCloseTo(92.4, 1);
    expect(byName.Salt).toBeCloseTo(3.1, 1);
    expect(byName.Yeast).toBeCloseTo(0.5, 1);
  });

  it('scales linearly with batch size (ballCount × ballWeightG)', () => {
    const one = scaleFormula(formula, { ballCount: 1, ballWeightG: 250 });
    const four = scaleFormula(formula, { ballCount: 4, ballWeightG: 250 });

    for (let i = 0; i < one.length; i += 1) {
      expect(four[i].grams).toBeCloseTo(one[i].grams * 4, 0);
    }
  });

  it('reproduces the flour weight when percent(flour) === 100 and it is the only other-than-itself basis', () => {
    // A trivial single-ingredient formula: flour scales 1:1 with total dough weight when it's
    // the only ingredient present.
    const flourOnly: BakersPercentageFormula = { ingredients: [{ name: 'Flour', percent: 100 }] };
    const scaled = scaleFormula(flourOnly, { ballCount: 2, ballWeightG: 300 });
    expect(scaled).toEqual([{ name: 'Flour', grams: 600 }]);
  });

  it('rejects a formula whose percentages sum to zero (division-by-zero guard)', () => {
    const broken: BakersPercentageFormula = { ingredients: [{ name: 'Flour', percent: 0 }] };
    expect(() => scaleFormula(broken, { ballCount: 1, ballWeightG: 250 })).toThrow();
  });
});
