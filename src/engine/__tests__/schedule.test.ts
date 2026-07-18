import { describe, expect, it } from 'vitest';
import { reschedule, solveScheduleBackward } from '../schedule';
import { constantAdaptBake, stageDurationFromTable } from './fixtures';
import type { Recipe, RecipeBounds, Stage } from '@/recipes/contract';
import { createRecipeId } from '@/recipes/contract';
import type { ScheduledStep, WorkflowInputs } from '../types';

const NOW = new Date('2026-07-17T08:00:00.000Z');

const DEFAULT_BOUNDS: RecipeBounds = {
  ballCountMin: 1,
  ballCountMax: 8,
  ballWeightGMin: 200,
  ballWeightGMax: 300,
  ovenMin: 200,
  ovenStyleMax: 280,
  ambientMin: 18,
  ambientMax: 30,
};

const Q10 = 2;
const REFERENCE_AMBIENT_C = 24;

/** A Q10-style ambient-sensitive duration: monotonic non-increasing in ambientC (D13). */
function q10Minutes(baseMinutes: number) {
  return (ambientC: number) => baseMinutes * Q10 ** ((REFERENCE_AMBIENT_C - ambientC) / 10);
}

function buildRecipe(config: {
  stages: Stage[];
  durations: Record<string, (ambientC: number) => number>;
  boundsOverrides?: Partial<RecipeBounds>;
}): Recipe {
  const bounds = { ...DEFAULT_BOUNDS, ...config.boundsOverrides };
  return {
    contractVersion: 1,
    id: createRecipeId('stub-schedule-recipe'),
    name: 'Stub schedule recipe',
    description: 'A stub recipe for schedule.ts unit tests.',
    formula: { ingredients: [{ name: 'Flour', percent: 100 }] },
    bounds,
    stages: config.stages,
    pathways: [{ id: 'test-pathway', name: 'Test pathway', stageIds: config.stages.map((s) => s.id) }],
    stageDuration: stageDurationFromTable(config.durations),
    adaptBake: constantAdaptBake(10, 250, bounds.ovenMin),
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

describe('solveScheduleBackward', () => {
  it('places stage start times correctly for a trivial (fixed-duration) recipe stub', () => {
    const stages: Stage[] = [
      { id: 'mix', name: 'Mix', type: 'prep', why: 'why-mix' },
      { id: 'bake', name: 'Bake', type: 'bake', why: 'why-bake' },
    ];
    const recipe = buildRecipe({ stages, durations: { mix: () => 15 } });
    const targetTime = new Date(NOW.getTime() + 60 * 60_000);
    const inputs = baseInputs({ targetTime });

    const result = solveScheduleBackward(recipe, inputs, 10, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok result');
    expect(result.steps).toHaveLength(2);
    const [mixStep, bakeStep] = result.steps;
    expect(bakeStep.clockStartTime).toEqual(new Date(targetTime.getTime() - 10 * 60_000));
    expect(mixStep.clockStartTime).toEqual(new Date(targetTime.getTime() - 25 * 60_000));
    expect(mixStep.durationMinutes).toBe(15);
    expect(bakeStep.durationMinutes).toBe(10);
  });

  it('returns TargetTooSoon when time-to-target is below the D13 minimum-feasible-total', () => {
    const stages: Stage[] = [
      { id: 'mix', name: 'Mix', type: 'prep', why: 'why-mix' },
      { id: 'bake', name: 'Bake', type: 'bake', why: 'why-bake' },
    ];
    const recipe = buildRecipe({ stages, durations: { mix: () => 15 } });
    // minimum = mix(15) + bake(10) = 25 minutes; give only 20.
    const targetTime = new Date(NOW.getTime() + 20 * 60_000);
    const inputs = baseInputs({ targetTime });

    const result = solveScheduleBackward(recipe, inputs, 10, NOW);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected TargetTooSoon');
    expect(result.error.earliestFeasibleTarget).toEqual(new Date(NOW.getTime() + 25 * 60_000));
  });

  it('recomputes the (a) early-out\'s suggested earliestFeasibleTarget at the ACTUAL ambient, not the warmest-legal ambient used for the cheap decision (regression: types.ts\'s "never from the warmest-ambient early-out alone" invariant)', () => {
    // Fermentation stage: base 200 min @ 24°C reference — ambient-sensitive, unlike the
    // fixed-duration `mix` stub the two tests above use (which is why this defect was invisible
    // to them: for an ambient-insensitive stage, "warmest-ambient" and "actual-ambient" totals
    // are numerically identical, so a bug that conflates the two produces no observable diff).
    //   warmest (30°C): 200 * 2^(-0.6) ≈ 131.97 min → D13 minimum ≈ 141.97 min (+ bake 10)
    //   actual   (18°C): 200 * 2^(0.6)  ≈ 303.14 min → real requirement ≈ 313.14 min (+ bake 10)
    const stages: Stage[] = [
      { id: 'ferment', name: 'Ferment', type: 'fermentation', why: 'why-ferment' },
      { id: 'bake', name: 'Bake', type: 'bake', why: 'why-bake' },
    ];
    const recipe = buildRecipe({ stages, durations: { ferment: q10Minutes(200) } });

    // Only 100 minutes available — below even the ~142 min warmest-ambient minimum, so the (a)
    // early-out itself fires (this test is about what it SUGGESTS, not the decision to reject).
    const targetTime = new Date(NOW.getTime() + 100 * 60_000);
    const inputs = baseInputs({ targetTime, ambientC: 18 });

    const result = solveScheduleBackward(recipe, inputs, 10, NOW);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected TargetTooSoon');

    const warmestAmbientMinutes = q10Minutes(200)(30) + 10; // ≈ 141.97
    const actualAmbientMinutes = q10Minutes(200)(18) + 10; // ≈ 313.14

    // The suggestion must be genuinely reachable at the user's real (cooler) kitchen — strictly
    // later than the cheap warmest-ambient floor a buggy implementation would have echoed back
    // (which would itself still be infeasible and would just trip the (b) guard on retry).
    expect(result.error.earliestFeasibleTarget.getTime()).toBeGreaterThan(
      NOW.getTime() + warmestAmbientMinutes * 60_000,
    );
    // And it should match the actual-ambient total exactly (same formula, so bit-exact).
    expect(result.error.earliestFeasibleTarget).toEqual(
      new Date(NOW.getTime() + actualAmbientMinutes * 60_000),
    );
  });

  it('universal post-placement guard fires on the same-day (non-elastic) pathway when actual-ambient placement would overflow the target, even though the warmest-ambient early-out passed (restart-pass-1-review Major)', () => {
    // Fermentation stage: base 200 min @ 24°C reference.
    // At warmest legal ambient (30°C): 200 * 2^(-0.6) ≈ 131.96 min → D13 minimum ≈ 141.96 min (+ bake 10).
    // At actual ambient (18°C, cooler than warmest): 200 * 2^(0.6) ≈ 303.14 min → real total ≈ 313.14 min (+ bake 10).
    const stages: Stage[] = [
      { id: 'ferment', name: 'Ferment', type: 'fermentation', why: 'why-ferment' },
      { id: 'bake', name: 'Bake', type: 'bake', why: 'why-bake' },
    ];
    const recipe = buildRecipe({ stages, durations: { ferment: q10Minutes(200) } });

    // 200 minutes is comfortably above the ~142 min warmest-ambient minimum (so (a) passes)
    // but well below the ~313 min actual-ambient (18°C) requirement (so placement overflows).
    const targetTime = new Date(NOW.getTime() + 200 * 60_000);
    const inputs = baseInputs({ targetTime, ambientC: 18, pathway: 'test-pathway' });

    const result = solveScheduleBackward(recipe, inputs, 10, NOW);

    expect(result.ok).toBe(false);
    if (result.ok) {
      // Guard against the exact historical bug: a past-dated first step instead of TargetTooSoon.
      throw new Error(
        `expected TargetTooSoon, got a placed schedule with earliest start ${result.steps[0]?.clockStartTime.toISOString()}`,
      );
    }
  });

  describe('elastic-stage slack absorption (pass-2 fix, Major 1)', () => {
    const stages: Stage[] = [
      { id: 'prep', name: 'Prep', type: 'prep', why: 'why-prep' },
      {
        id: 'cold-ferment',
        name: 'Cold ferment',
        type: 'cold-ferment',
        why: 'why-cold',
        cue: 'cue-cold',
        elastic: { minMinutes: 1440, maxMinutes: 4320 },
      },
      { id: 'bake', name: 'Bake', type: 'bake', why: 'why-bake' },
    ];
    const recipe = buildRecipe({ stages, durations: { prep: () => 10 } });

    it('clamps the placed duration to maxMinutes when available slack exceeds it', () => {
      // slack = timeToTarget - prep(10) - bake(10) = 5000 > maxMinutes(4320) → clamps to 4320.
      const targetTime = new Date(NOW.getTime() + (10 + 10 + 5000) * 60_000);
      const inputs = baseInputs({ targetTime, ambientC: 24 });

      const result = solveScheduleBackward(recipe, inputs, 10, NOW);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok result');
      const coldStep = result.steps.find((s) => s.stageId === 'cold-ferment');
      expect(coldStep?.durationMinutes).toBe(4320);
    });

    it('places the exact available slack when it falls between minMinutes and maxMinutes', () => {
      // slack = timeToTarget - prep(10) - bake(10) = 3000, within [1440, 4320].
      const targetTime = new Date(NOW.getTime() + (10 + 10 + 3000) * 60_000);
      const inputs = baseInputs({ targetTime, ambientC: 24 });

      const result = solveScheduleBackward(recipe, inputs, 10, NOW);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok result');
      const coldStep = result.steps.find((s) => s.stageId === 'cold-ferment');
      expect(coldStep?.durationMinutes).toBe(3000);
    });

    it("uses elastic.minMinutes as the elastic stage's D13 minimum-feasible-total contribution (TargetTooSoon right at the floor)", () => {
      // minimum = prep(10) + elastic.minMinutes(1440) + bake(10) = 1460. One minute short → TargetTooSoon.
      const targetTime = new Date(NOW.getTime() + 1459 * 60_000);
      const inputs = baseInputs({ targetTime, ambientC: 24 });

      const result = solveScheduleBackward(recipe, inputs, 10, NOW);

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected TargetTooSoon at the elastic-floor boundary');
      expect(result.error.earliestFeasibleTarget).toEqual(new Date(NOW.getTime() + 1460 * 60_000));
    });
  });

  it('universal post-placement guard fires on the elastic pathway when the actual (cooler) ambient makes placement overflow even though warmest-ambient feasibility passed (pass-3 mechanism, replaced by the universal guard at restart-pass-2)', () => {
    // Non-elastic fermentation stage: base 100 min @ 24°C.
    //   warmest (30°C): 100 * 2^(-0.6) ≈ 65.98 min
    //   actual   (18°C): 100 * 2^(0.6)  ≈ 151.57 min
    // Elastic cold-ferment stage: [1440, 4320] minMinutes/maxMinutes. bakeTimeMinutes = 10.
    // D13 minimum (warmest ambient) = 65.98 + 1440 + 10 ≈ 1515.98 min.
    const stages: Stage[] = [
      { id: 'ferment', name: 'Ferment', type: 'fermentation', why: 'why-ferment' },
      {
        id: 'cold-ferment',
        name: 'Cold ferment',
        type: 'cold-ferment',
        why: 'why-cold',
        elastic: { minMinutes: 1440, maxMinutes: 4320 },
      },
      { id: 'bake', name: 'Bake', type: 'bake', why: 'why-bake' },
    ];
    const recipe = buildRecipe({ stages, durations: { ferment: q10Minutes(100) } });

    // 1520 min clears the ~1515.98 min warmest-ambient minimum (so (a) passes), but at the
    // actual 18°C ambient, availableSlack = 1520 - 151.57 - 10 ≈ 1358.43 < elastic.minMinutes
    // (1440) → the clamp floors at 1440 and the real placed total (≈1601.57) overflows the target.
    const targetTime = new Date(NOW.getTime() + 1520 * 60_000);
    const inputs = baseInputs({ targetTime, ambientC: 18 });

    const result = solveScheduleBackward(recipe, inputs, 10, NOW);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error(
        `expected TargetTooSoon, got a placed schedule with earliest start ${result.steps[0]?.clockStartTime.toISOString()}`,
      );
    }
  });

  it('threads bakeTimeMinutes correctly through the minimum-feasible-total, the elastic slack calc, and placement (pass-4 fix, regression guard)', () => {
    // Only an elastic stage + bake — a tight boundary target that is exactly the D13 minimum
    // (elastic.minMinutes + bakeTimeMinutes). If bakeTimeMinutes were ever dropped from one of
    // the three summations (feasibility, slack, or the guard's recomputation), this exact
    // boundary would misbehave — either falsely rejecting a feasible target or (if dropped only
    // from the slack calc) letting the elastic stage over-absorb bake's share of the available
    // time, which the universal guard would then have to catch as a past-"now" first step.
    const stages: Stage[] = [
      {
        id: 'cold-ferment',
        name: 'Cold ferment',
        type: 'cold-ferment',
        why: 'why-cold',
        elastic: { minMinutes: 1440, maxMinutes: 4320 },
      },
      { id: 'bake', name: 'Bake', type: 'bake', why: 'why-bake' },
    ];
    const recipe = buildRecipe({ stages, durations: {} });
    const bakeTimeMinutes = 12;

    // Exactly at the boundary: elastic.minMinutes(1440) + bakeTimeMinutes(12) = 1452.
    const targetTime = new Date(NOW.getTime() + 1452 * 60_000);
    const inputs = baseInputs({ targetTime, ambientC: 24 });

    const result = solveScheduleBackward(recipe, inputs, bakeTimeMinutes, NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected the boundary target to be exactly feasible');
    for (const step of result.steps) {
      expect(step.clockStartTime.getTime()).toBeGreaterThanOrEqual(NOW.getTime());
    }
    const bakeStep = result.steps.find((s) => s.stageId === 'bake');
    const coldStep = result.steps.find((s) => s.stageId === 'cold-ferment');
    expect(bakeStep?.durationMinutes).toBe(12);
    expect(coldStep?.durationMinutes).toBe(1440);
  });
});

describe('reschedule (bounded pace-nudge, D14/FR-17)', () => {
  function buildRemaining(): ScheduledStep[] {
    // Two back-to-back steps ending exactly at "target".
    const target = new Date(NOW.getTime() + 100 * 60_000);
    const bakeStart = new Date(target.getTime() - 10 * 60_000);
    const proofStart = new Date(bakeStart.getTime() - 30 * 60_000);
    return [
      {
        stageId: 'proof',
        name: 'Proof',
        why: 'why',
        durationMinutes: 30,
        clockStartTime: proofStart,
        isEstimate: true,
      },
      {
        stageId: 'bake',
        name: 'Bake',
        why: 'why',
        durationMinutes: 10,
        clockStartTime: bakeStart,
        isEstimate: false,
      },
    ];
  }

  it('shifts every remaining step by delta minutes when the shift stays within bounds', () => {
    const remaining = buildRemaining();
    const result = reschedule(remaining, -15);
    expect(result[0].clockStartTime).toEqual(new Date(remaining[0].clockStartTime.getTime() - 15 * 60_000));
    expect(result[1].clockStartTime).toEqual(new Date(remaining[1].clockStartTime.getTime() - 15 * 60_000));
  });

  it('never produces a clockStartTime past the target (end of the last remaining step)', () => {
    const remaining = buildRemaining();
    const target = new Date(remaining[1].clockStartTime.getTime() + remaining[1].durationMinutes * 60_000);

    const result = reschedule(remaining, 10_000); // an absurdly large positive nudge

    for (const step of result) {
      expect(step.clockStartTime.getTime()).toBeLessThanOrEqual(target.getTime());
    }
  });

  it('never produces a negative (pre-epoch) clockStartTime', () => {
    const remaining = buildRemaining();

    const result = reschedule(remaining, -1e12); // an absurdly large negative nudge

    for (const step of result) {
      expect(step.clockStartTime.getTime()).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns an empty array for an empty remaining list', () => {
    expect(reschedule([], 15)).toEqual([]);
  });
});
