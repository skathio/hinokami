// adaptBake — power-law oven-adaptation formula (decisions.md P2, EXPONENT = 2.8).

import { describe, expect, it } from 'vitest';
import { pizzaRecipe } from '../index';
import type { BakeAdaptation } from '../../contract';

function adapt(ovenMaxC: number, hasStoneOrSteel = false): BakeAdaptation {
  const result = pizzaRecipe.adaptBake({ ovenMaxC, hasStoneOrSteel });
  if (!result.ok) throw new Error(`expected an ok adaptBake result at ovenMaxC=${ovenMaxC}`);
  return result.value;
}

describe('adaptBake reference table (decisions.md P2, recomputed at pass-2 to match EXPONENT=2.8)', () => {
  // Every row is the actual output of the formula (not a hand-typed estimate) — validated here
  // to the same precision decisions.md P2 states. Only the 250°C/no-stone row is directly
  // source-bracketed (research-report.md §6, ~7-8 min); every other row is a model-derived
  // interpolation validated by the fitted exponent + monotonicity, per the table's basis notes.
  const REFERENCE_TABLE: ReadonlyArray<{ ovenMaxC: number; stone: boolean; bakeTimeS: number }> = [
    { ovenMaxC: 250, stone: false, bakeTimeS: 466.7 },
    { ovenMaxC: 250, stone: true, bakeTimeS: 396.7 },
    { ovenMaxC: 230, stone: false, bakeTimeS: 589.4 },
    { ovenMaxC: 230, stone: true, bakeTimeS: 501.0 },
    { ovenMaxC: 280, stone: false, bakeTimeS: 339.8 },
    { ovenMaxC: 280, stone: true, bakeTimeS: 288.8 },
    { ovenMaxC: 200, stone: false, bakeTimeS: 871.7 },
    { ovenMaxC: 200, stone: true, bakeTimeS: 740.9 },
  ];

  it.each(REFERENCE_TABLE)(
    'ovenMaxC=$ovenMaxC stone=$stone → $bakeTimeS s (within floating-point tolerance)',
    ({ ovenMaxC, stone, bakeTimeS }) => {
      const { bakeTimeMinutes } = adapt(ovenMaxC, stone);
      expect(bakeTimeMinutes * 60).toBeCloseTo(bakeTimeS, 1);
    },
  );

  it('the 250°C/no-stone row additionally falls within the directly source-bracketed 7–8 min anchor (research-report.md §6)', () => {
    const { bakeTimeMinutes } = adapt(250, false);
    expect(bakeTimeMinutes).toBeGreaterThanOrEqual(7);
    expect(bakeTimeMinutes).toBeLessThanOrEqual(8);
  });
});

describe('bake temperature capping', () => {
  it('bakeTempC = min(ovenMaxC, 280) — the style cap', () => {
    expect(adapt(230).bakeTempC).toBe(230);
    expect(adapt(280).bakeTempC).toBe(280);
    expect(adapt(320).bakeTempC).toBe(280); // an oven hotter than the style cap is still capped
  });
});

describe('OvenTooCold / caveated best-effort boundaries (decisions.md P2)', () => {
  it('reports OvenTooCold below 200°C', () => {
    const result = pizzaRecipe.adaptBake({ ovenMaxC: 150, hasStoneOrSteel: false });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected OvenTooCold at 150°C');
    expect(result.error.minimumOvenC).toBe(200);
  });

  it('emits a caveated best-effort bake (not OvenTooCold) at 210°C', () => {
    const result = pizzaRecipe.adaptBake({ ovenMaxC: 210, hasStoneOrSteel: false });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected an ok, caveated result at 210°C');
    expect(result.value.caveat).toBeDefined();
  });

  it('does not caveat at/above 220°C', () => {
    expect(adapt(220).caveat).toBeUndefined();
    expect(adapt(250).caveat).toBeUndefined();
  });

  it('ok exactly at the 200°C oven-min boundary', () => {
    const result = pizzaRecipe.adaptBake({ ovenMaxC: 200, hasStoneOrSteel: false });
    expect(result.ok).toBe(true);
  });
});

describe('monotonicity invariants', () => {
  it('hotter oven → shorter bake time', () => {
    const t230 = adapt(230).bakeTimeMinutes;
    const t250 = adapt(250).bakeTimeMinutes;
    const t280 = adapt(280).bakeTimeMinutes;
    expect(t250).toBeLessThan(t230);
    expect(t280).toBeLessThan(t250);
  });

  it('stone/steel → shorter bake time than a bare tray, at every reference oven temp', () => {
    for (const ovenMaxC of [200, 230, 250, 280]) {
      expect(adapt(ovenMaxC, true).bakeTimeMinutes).toBeLessThan(adapt(ovenMaxC, false).bakeTimeMinutes);
    }
  });
});

describe('dough guidance (hydration note)', () => {
  it('includes guidance for ovenMaxC ≤ 250°C, omits it above', () => {
    expect(adapt(200).doughGuidance).toBeDefined();
    expect(adapt(250).doughGuidance).toBeDefined();
    expect(adapt(280).doughGuidance).toBeUndefined();
  });
});
