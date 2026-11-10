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

// Calibration: each value below is a sourced data point or pick from the calibration research.
const pct = (r: typeof sicilianRecipe, pathway: string, name: string) =>
  r.pathways.find((p) => p.id === pathway)!.formula!.ingredients.find((i) => i.name === name)!.percent;
const bakeMin = (r: typeof sicilianRecipe, ovenMaxC: number, hasStoneOrSteel = false) => {
  const res = r.adaptBake({ ovenMaxC, hasStoneOrSteel });
  if (!res.ok) throw new Error('unexpected OvenTooCold');
  return res.value.bakeTimeMinutes;
};
const minutesAt24 = (r: typeof sicilianRecipe, stage: 'bulk' | 'proof' | 'temper', pathway = 'same-day') =>
  r.stageDuration(stage, { stage, ambientC: 24, pathway }).minutes;

describe('Sicilian calibration', () => {
  it('uses 70% water, 2.5% salt and 4% oil on both pathways', () => {
    for (const p of ['same-day', 'cold-ferment']) {
      expect([pct(sicilianRecipe, p, 'Water'), pct(sicilianRecipe, p, 'Salt'), pct(sicilianRecipe, p, 'Olive oil')]).toEqual([70, 2.5, 4]);
    }
  });

  it('matches yeast to fermentation length: 0.16% for 4 h same-day, 0.15% for a 48 h cold ferment', () => {
    expect(pct(sicilianRecipe, 'same-day', 'Yeast (instant dry)')).toBe(0.16);
    expect(pct(sicilianRecipe, 'cold-ferment', 'Yeast (instant dry)')).toBe(0.15);
    expect(minutesAt24(sicilianRecipe, 'bulk') + minutesAt24(sicilianRecipe, 'proof')).toBe(240);
    expect(minutesAt24(sicilianRecipe, 'temper', 'cold-ferment')).toBe(180);
    expect(minutesAt24(sicilianRecipe, 'bulk', 'cold-ferment')).toBe(60);
  });

  it('bakes on a flat pan curve: 20–25 min at 232 °C, 15–20 min at 288 °C', () => {
    expect(bakeMin(sicilianRecipe, 232)).toBeGreaterThanOrEqual(20);
    expect(bakeMin(sicilianRecipe, 232)).toBeLessThanOrEqual(25);
    expect(bakeMin(sicilianRecipe, 288)).toBeGreaterThanOrEqual(15);
    expect(bakeMin(sicilianRecipe, 288)).toBeLessThanOrEqual(20);
  });

  it('sizes dough for home pans and adapts ovens from 220 °C up to a 290 °C cap', () => {
    expect(sicilianRecipe.bounds).toMatchObject({ ballWeightGMax: 1500, ballWeightGDefault: 570, ovenMin: 220, ovenStyleMax: 290 });
  });
});

describe('Roman (alla pala) calibration', () => {
  it('uses 78% water, 2.5% salt and 2% oil on both pathways', () => {
    for (const p of ['same-day', 'cold-ferment']) {
      expect([pct(romanRecipe, p, 'Water'), pct(romanRecipe, p, 'Salt'), pct(romanRecipe, p, 'Olive oil')]).toEqual([78, 2.5, 2]);
    }
  });

  it('matches yeast to fermentation length: 0.08% for 6 h same-day, 0.15% for a 48 h cold ferment', () => {
    expect(pct(romanRecipe, 'same-day', 'Yeast (instant dry)')).toBe(0.08);
    expect(pct(romanRecipe, 'cold-ferment', 'Yeast (instant dry)')).toBe(0.15);
    expect(minutesAt24(romanRecipe, 'bulk') + minutesAt24(romanRecipe, 'proof')).toBe(360);
    expect(minutesAt24(romanRecipe, 'bulk', 'cold-ferment')).toBe(60);
  });

  it('bakes 15 min at 250 °C on a tray and 12 min on a stone', () => {
    expect(bakeMin(romanRecipe, 250)).toBeCloseTo(15);
    expect(bakeMin(romanRecipe, 250, true)).toBeCloseTo(12);
  });

  it('uses 300 g pala balls and needs at least 230 °C', () => {
    expect(romanRecipe.bounds).toMatchObject({ ballWeightGMin: 250, ballWeightGMax: 500, ballWeightGDefault: 300, ovenMin: 230, ovenStyleMax: 290 });
  });
});
