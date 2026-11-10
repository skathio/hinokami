import { describe, expect, it } from 'vitest';
import { runConformanceSuite } from '../../conformance';
import { romanRecipe, sicilianRecipe } from '../styles';

runConformanceSuite(sicilianRecipe);
runConformanceSuite(romanRecipe);

describe('pizza style variants', () => {
  it('hydrate higher than Neapolitan and add oil on every pathway', () => {
    for (const r of [sicilianRecipe, romanRecipe]) {
      for (const f of [r.formula, ...r.pathways.map((p) => p.formula!)]) {
        const water = f.ingredients.find((i) => i.name === 'Water')!.percent;
        expect(water).toBeGreaterThan(62);
        expect(f.ingredients.some((i) => i.name === 'Olive oil')).toBe(true);
      }
    }
  });

  it('call for every dough ingredient at mix, and nowhere else', () => {
    for (const r of [sicilianRecipe, romanRecipe]) {
      const refsIn = (id: string) =>
        (r.stages.find((s) => s.id === id)?.how ?? []).flatMap((h) => h.ingredientRefs ?? []);
      expect(new Set(refsIn('mix'))).toEqual(new Set(r.formula.ingredients.map((i) => i.name)));
      for (const s of r.stages.filter((s) => s.id !== 'mix')) expect(refsIn(s.id)).toEqual([]);
    }
  });

  it('bake hotter ovens faster and cap at the style max', () => {
    for (const r of [sicilianRecipe, romanRecipe]) {
      const at = (c: number) => {
        const res = r.adaptBake({ ovenMaxC: c, hasStoneOrSteel: false });
        if (!res.ok) throw new Error('unexpected OvenTooCold');
        return res.value;
      };
      expect(at(r.bounds.ovenMin + 10).bakeTimeMinutes).toBeGreaterThan(at(r.bounds.ovenStyleMax).bakeTimeMinutes);
      expect(at(500).bakeTempC).toBe(r.bounds.ovenStyleMax);
    }
  });

  it('Sicilian uses pan-sized dough', () => {
    expect(sicilianRecipe.bounds.ballWeightGMin).toBeGreaterThanOrEqual(500);
  });
});
