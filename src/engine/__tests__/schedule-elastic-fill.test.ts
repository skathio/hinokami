import { describe, expect, it } from 'vitest';
import { solveScheduleBackward } from '../schedule';
import { pizzaRecipe } from '@/recipes/pizza/index';
import type { WorkflowInputs } from '../types';

// When the target sits inside the cold-ferment window, the elastic stage absorbs all the slack
// and the first step lands exactly on `now`. Fractional ambient-adjusted durations must not push
// that start a hair into the past and get the target rejected as "too soon".
const NOW = new Date('2026-11-10T06:13:27.481Z');

function inputsAt(hoursFromNow: number, ambientC: number): WorkflowInputs {
  return {
    targetTime: new Date(NOW.getTime() + hoursFromNow * 3_600_000),
    ovenMaxC: 250,
    hasStoneOrSteel: false,
    ambientC,
    ballCount: 4,
    ballWeightG: 250,
    pathway: 'cold-ferment',
  };
}

describe('solveScheduleBackward — elastic stage filling all slack', () => {
  for (const hours of [30, 48, 60, 72]) {
    for (const ambientC of [19, 22, 27]) {
      it(`accepts a cold-ferment target ${hours} h out at ${ambientC} °C and starts no earlier than now`, () => {
        const result = solveScheduleBackward(pizzaRecipe, inputsAt(hours, ambientC), 8, NOW);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        // Sub-second drift from fractional durations is tolerated; anything more is a real past start.
        expect(result.steps[0].clockStartTime.getTime()).toBeGreaterThanOrEqual(NOW.getTime() - 1000);
        const last = result.steps[result.steps.length - 1];
        expect(last.clockStartTime.getTime() + last.durationMinutes * 60_000).toBeCloseTo(
          inputsAt(hours, ambientC).targetTime.getTime(),
          -1,
        );
      });
    }
  }

  it('accepts the earliest target it suggests when a target is too soon', () => {
    const tooSoon = solveScheduleBackward(pizzaRecipe, inputsAt(20, 22), 8, NOW);
    expect(tooSoon.ok).toBe(false);
    if (tooSoon.ok) return;
    const retry = solveScheduleBackward(
      pizzaRecipe,
      { ...inputsAt(20, 22), targetTime: tooSoon.error.earliestFeasibleTarget },
      8,
      NOW,
    );
    expect(retry.ok).toBe(true);
  });

  it('still rejects a cold-ferment target shorter than the minimum', () => {
    expect(solveScheduleBackward(pizzaRecipe, inputsAt(25, 22), 8, NOW).ok).toBe(false);
  });
});
