import { describe, expect, it } from 'vitest';
import { advance, applyNudge, back, isStepActive, isTerminal } from '../progression';
import { constantAdaptBake, stageDurationFromTable } from './fixtures';
import type { Recipe, RecipeBounds } from '@/recipes/contract';
import { createRecipeId } from '@/recipes/contract';
import type { BakeSession, ScheduledStep } from '../types';

const NOW = new Date('2026-07-17T08:00:00.000Z');

const BOUNDS: RecipeBounds = {
  ballCountMin: 1,
  ballCountMax: 8,
  ballWeightGMin: 200,
  ballWeightGMax: 300,
  ovenMin: 200,
  ovenStyleMax: 280,
  ambientMin: 18,
  ambientMax: 30,
};

function buildRecipe(id = 'stub-progression-recipe'): Recipe {
  return {
    contractVersion: 1,
    id: createRecipeId(id),
    name: 'Stub progression recipe',
    description: 'A stub recipe for progression.ts unit tests.',
    formula: { ingredients: [{ name: 'Flour', percent: 100 }] },
    bounds: BOUNDS,
    stages: [
      { id: 'mix', name: 'Mix', type: 'prep', why: 'why-mix' },
      { id: 'proof', name: 'Proof', type: 'fermentation', why: 'why-proof', cue: 'cue-proof' },
      { id: 'bake', name: 'Bake', type: 'bake', why: 'why-bake' },
    ],
    pathways: [{ id: 'test-pathway', name: 'Test pathway', stageIds: ['mix', 'proof', 'bake'] }],
    stageDuration: stageDurationFromTable({ mix: () => 15, proof: () => 60 }),
    adaptBake: constantAdaptBake(10, 250, BOUNDS.ovenMin),
  };
}

function buildWorkflow(): ScheduledStep[] {
  const bakeStart = new Date(NOW.getTime() + 60 * 60_000);
  const proofStart = new Date(bakeStart.getTime() - 60 * 60_000);
  const mixStart = new Date(proofStart.getTime() - 15 * 60_000);
  return [
    { stageId: 'mix', name: 'Mix', why: 'why-mix', durationMinutes: 15, clockStartTime: mixStart, isEstimate: false },
    {
      stageId: 'proof',
      name: 'Proof',
      why: 'why-proof',
      cue: 'cue-proof',
      durationMinutes: 60,
      clockStartTime: proofStart,
      isEstimate: true,
    },
    { stageId: 'bake', name: 'Bake', why: 'why-bake', durationMinutes: 10, clockStartTime: bakeStart, isEstimate: false },
  ];
}

function buildSession(overrides: Partial<BakeSession> = {}): BakeSession {
  return {
    schemaVersion: 1,
    sessionKey: 'session-1',
    recipeId: createRecipeId('stub-progression-recipe'),
    recipeContentVersion: 'v1',
    inputs: {
      targetTime: NOW.toISOString(),
      ovenMaxC: 250,
      hasStoneOrSteel: false,
      ambientC: 24,
      ballCount: 2,
      ballWeightG: 250,
      pathway: 'same-day',
    },
    workflow: buildWorkflow(),
    stepIndex: 0,
    status: 'in-progress',
    ...overrides,
  };
}

describe('advance', () => {
  it('moves to the next step index', () => {
    const session = buildSession({ stepIndex: 0 });
    const next = advance(session);
    expect(next.stepIndex).toBe(1);
    expect(next.status).toBe('in-progress');
  });

  it('marks the session completed instead of stepping past the last index', () => {
    const session = buildSession({ stepIndex: 2 }); // last index (workflow.length - 1)
    const next = advance(session);
    expect(next.stepIndex).toBe(2);
    expect(next.status).toBe('completed');
  });
});

describe('back', () => {
  it('moves to the previous step index', () => {
    const session = buildSession({ stepIndex: 2 });
    const prev = back(session);
    expect(prev.stepIndex).toBe(1);
  });

  it('clamps at the first step', () => {
    const session = buildSession({ stepIndex: 0 });
    const prev = back(session);
    expect(prev.stepIndex).toBe(0);
  });

  it('resumes a completed session as in-progress', () => {
    const session = buildSession({ stepIndex: 2, status: 'completed' });
    const prev = back(session);
    expect(prev.status).toBe('in-progress');
  });
});

describe('isStepActive / isTerminal', () => {
  it('isStepActive is true only while status is in-progress', () => {
    expect(isStepActive(buildSession({ status: 'in-progress' }))).toBe(true);
    expect(isStepActive(buildSession({ status: 'completed' }))).toBe(false);
  });

  it('isTerminal is true only at the last step with status completed', () => {
    expect(isTerminal(buildSession({ stepIndex: 2, status: 'completed' }))).toBe(true);
    expect(isTerminal(buildSession({ stepIndex: 2, status: 'in-progress' }))).toBe(false);
    expect(isTerminal(buildSession({ stepIndex: 1, status: 'completed' }))).toBe(false);
  });
});

describe('applyNudge', () => {
  it('reschedules every step from stepIndex onward, leaving earlier steps untouched', () => {
    const recipe = buildRecipe();
    const session = buildSession({ stepIndex: 1 }); // currently on "proof"
    const originalMixStart = session.workflow[0].clockStartTime;
    const originalProofStart = session.workflow[1].clockStartTime;

    const nudged = applyNudge(session, -10, recipe);

    expect(nudged.workflow[0].clockStartTime).toEqual(originalMixStart); // untouched (already past)
    expect(nudged.workflow[1].clockStartTime).toEqual(
      new Date(originalProofStart.getTime() - 10 * 60_000),
    );
  });

  it('throws if the session belongs to a different recipe (fail loud, sdd.md §6)', () => {
    const otherRecipe = buildRecipe('a-different-recipe');
    const session = buildSession();
    expect(() => applyNudge(session, 10, otherRecipe)).toThrow();
  });
});
