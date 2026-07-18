import { describe, expect, it } from 'vitest';
import { migrate, restore, serialize } from '../persistence';
import { createRecipeId } from '@/recipes/contract';
import type { BakeSession } from '../types';

const NOW = new Date('2026-07-17T08:00:00.000Z');

function buildSession(overrides: Partial<BakeSession> = {}): BakeSession {
  return {
    schemaVersion: 1,
    sessionKey: 'session-1',
    recipeId: createRecipeId('pizza-neapolitan-home'),
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
    workflow: [
      {
        stageId: 'mix',
        name: 'Mix',
        why: 'why-mix',
        durationMinutes: 15,
        clockStartTime: NOW,
        isEstimate: false,
      },
      {
        stageId: 'bake',
        name: 'Bake',
        why: 'why-bake',
        durationMinutes: 10,
        clockStartTime: new Date(NOW.getTime() + 15 * 60_000),
        isEstimate: false,
      },
    ],
    stepIndex: 0,
    status: 'in-progress',
    ...overrides,
  };
}

describe('serialize / restore round trip', () => {
  it('produces an identical session after serialize → restore', () => {
    const session = buildSession();
    const restored = restore(serialize(session));
    expect(restored).toEqual(session);
  });
});

describe('restore', () => {
  it('returns null for corrupt (unparseable) JSON', () => {
    expect(restore('{not valid json')).toBeNull();
  });

  it('returns null for a structurally invalid object', () => {
    expect(restore({ schemaVersion: 1, sessionKey: 'x' })).toBeNull();
  });
});

describe('migrate', () => {
  it('discards corrupt JSON with a notice', () => {
    const result = migrate('{not valid json', 'v1');
    expect(result.session).toBeNull();
    expect(result.migrationNotice).not.toBeNull();
  });

  it('discards an unknown/future schemaVersion with a notice', () => {
    const raw = { ...buildSession(), schemaVersion: 99 };
    const result = migrate(raw, 'v1');
    expect(result.session).toBeNull();
    expect(result.migrationNotice).not.toBeNull();
  });

  it('restores as-is with no notice when both schema and recipe-content versions match', () => {
    const session = buildSession();
    const result = migrate(JSON.parse(serialize(session)), 'v1');
    expect(result.session).toEqual(session);
    expect(result.migrationNotice).toBeNull();
  });

  it('continues-and-notifies on a recipe-content mismatch — workflow/stepIndex unchanged, notice always set (pass-2 fix, Blocker 2)', () => {
    const session = buildSession({ stepIndex: 1 });
    const result = migrate(JSON.parse(serialize(session)), 'v2-different-from-session');

    expect(result.session).not.toBeNull();
    expect(result.session?.workflow).toEqual(session.workflow);
    expect(result.session?.stepIndex).toBe(1);
    expect(result.migrationNotice).not.toBeNull();
  });

  it('continues-and-notifies on a mismatch even for an unmutated (fresh) session', () => {
    const session = buildSession();
    const result = migrate(JSON.parse(serialize(session)), 'a-version-nobody-has-ever-seen');

    expect(result.session).toEqual(session);
    expect(result.migrationNotice).not.toBeNull();
  });
});
