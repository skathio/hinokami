import { describe, expect, it } from 'vitest';
import { isAwakeAt, solveScheduleBackward } from '../schedule';
import { pizzaRecipe } from '@/recipes/pizza/index';
import type { AwakeWindow, WorkflowInputs } from '../types';

// Local-time dates throughout: awake hours are the user's wall clock, whatever the machine's zone.
const AWAKE: AwakeWindow = { startMinute: 7 * 60, endMinute: 23 * 60 };
const NOW = new Date(2026, 10, 10, 9, 0);

function inputs(target: Date, pathway: string, awake: AwakeWindow | null = AWAKE): WorkflowInputs {
  return {
    targetTime: target,
    ovenMaxC: 250,
    hasStoneOrSteel: false,
    ambientC: 22,
    ballCount: 4,
    ballWeightG: 250,
    pathway,
    ...(awake ? { awake } : {}),
  };
}

describe('isAwakeAt', () => {
  it('treats the end of the window as exclusive', () => {
    expect(isAwakeAt(new Date(2026, 0, 1, 22, 59), AWAKE)).toBe(true);
    expect(isAwakeAt(new Date(2026, 0, 1, 23, 0), AWAKE)).toBe(false);
    expect(isAwakeAt(new Date(2026, 0, 1, 7, 0), AWAKE)).toBe(true);
    expect(isAwakeAt(new Date(2026, 0, 1, 3, 0), AWAKE)).toBe(false);
  });

  it('supports a window that wraps past midnight', () => {
    const night: AwakeWindow = { startMinute: 22 * 60, endMinute: 6 * 60 };
    expect(isAwakeAt(new Date(2026, 0, 1, 2, 0), night)).toBe(true);
    expect(isAwakeAt(new Date(2026, 0, 1, 12, 0), night)).toBe(false);
  });

  it('treats equal bounds as always available', () => {
    expect(isAwakeAt(new Date(2026, 0, 1, 3, 0), { startMinute: 0, endMinute: 0 })).toBe(true);
  });
});

/** Asserts the awake-hours contract for one cold-ferment target; true if, unconstrained, it would
 * have started a step at night. */
function checkTarget(target: Date): boolean {
  const free = solveScheduleBackward(pizzaRecipe, inputs(target, 'cold-ferment', null), 8, NOW);
  const clashes = free.ok && free.steps.some((s) => !isAwakeAt(s.clockStartTime, AWAKE));
  const result = solveScheduleBackward(pizzaRecipe, inputs(target, 'cold-ferment'), 8, NOW);
  if (result.ok) {
    for (const step of result.steps) {
      expect(isAwakeAt(step.clockStartTime, AWAKE)).toBe(true);
      expect(step.clockStartTime.getTime()).toBeGreaterThanOrEqual(NOW.getTime() - 1000);
    }
  } else if (free.ok) {
    // Could not be dodged: the user is told so and offered a ready time that works.
    expect(clashes).toBe(true);
    expect(result.error.blockedByAwakeHours).toBe(true);
  }
  return clashes;
}

describe('solveScheduleBackward with awake hours', () => {
  it('keeps every cold-ferment step within awake hours across a range of targets', () => {
    let hadNightClash = 0;
    for (let halfHours = 52; halfHours <= 180; halfHours += 1) {
      if (checkTarget(new Date(NOW.getTime() + halfHours * 1_800_000))) hadNightClash += 1;
    }
    // Guards the test itself: the range must actually contain targets that would wake someone.
    expect(hadNightClash).toBeGreaterThan(0);
  });

  it('never suggests a night-time start when asked for a target that forces one', () => {
    // A same-day bake ready at 08:00 would need mixing around 01:00-02:00.
    const target = new Date(2026, 10, 11, 8, 0);
    const result = solveScheduleBackward(pizzaRecipe, inputs(target, 'same-day'), 8, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.blockedByAwakeHours).toBe(true);
    expect(result.error.earliestFeasibleTarget.getTime()).toBeGreaterThan(target.getTime());

    const retry = solveScheduleBackward(
      pizzaRecipe,
      inputs(new Date(result.error.earliestFeasibleTarget.getTime() + 2 * 60_000), 'same-day'),
      8,
      NOW,
    );
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.steps.every((s) => isAwakeAt(s.clockStartTime, AWAKE))).toBe(true);
  });

  it('only offers alternative pathways that also respect the awake hours', () => {
    const target = new Date(2026, 10, 11, 8, 0);
    const result = solveScheduleBackward(pizzaRecipe, inputs(target, 'same-day'), 8, NOW);
    if (result.ok) throw new Error('expected infeasible');
    for (const id of result.error.alternativePathways) {
      const alt = solveScheduleBackward(pizzaRecipe, inputs(target, id), 8, NOW);
      expect(alt.ok).toBe(true);
    }
  });

  it('reports a window too narrow for the pathway instead of suggesting a night start', () => {
    const narrow: AwakeWindow = { startMinute: 12 * 60, endMinute: 13 * 60 };
    const result = solveScheduleBackward(pizzaRecipe, inputs(new Date(2026, 10, 11, 12, 30), 'same-day', narrow), 8, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.awakeHoursTooNarrow).toBe(true);
  });

  it('leaves the schedule untouched when no awake hours are set', () => {
    const target = new Date(NOW.getTime() + 65 * 3_600_000); // ready at 02:00
    const result = solveScheduleBackward(pizzaRecipe, inputs(target, 'cold-ferment', null), 8, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.steps.some((s) => !isAwakeAt(s.clockStartTime, AWAKE))).toBe(true);
    expect(Math.abs(result.steps[0].clockStartTime.getTime() - NOW.getTime())).toBeLessThan(1000);
  });
});
