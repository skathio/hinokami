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

describe('restore — rejects stored values the app cannot run', () => {
  // localStorage is shared by every page on the origin (all skathio.github.io project pages), so a
  // stored session is untrusted input: anything that would crash or mislead the runner is dropped.
  const tampered = (patch: Record<string, unknown>) => JSON.stringify({ ...JSON.parse(serialize(buildSession())), ...patch });
  const withInputs = (patch: Record<string, unknown>) =>
    tampered({ inputs: { ...buildSession().inputs, ...patch } });

  it.each([
    ['past the last step', 2],
    ['negative', -1],
    ['fractional', 0.5],
    ['not finite', Number.MAX_VALUE * 10],
  ])('rejects a stepIndex that is %s', (_label, stepIndex) => {
    expect(restore(tampered({ stepIndex }))).toBeNull();
  });

  it('rejects an empty workflow', () => {
    expect(restore(tampered({ workflow: [], stepIndex: 0 }))).toBeNull();
  });

  it('keeps a completed session that sits on its last step', () => {
    expect(restore(tampered({ stepIndex: 1, status: 'completed' }))).not.toBeNull();
  });

  it.each([
    ['ballCount', -3],
    ['ballCount', 0],
    ['ballCount', 2.5],
    ['ballWeightG', 0],
    ['ballWeightG', -250],
    ['ovenMaxC', 0],
    ['ovenMaxC', -10],
  ])('rejects inputs.%s = %s', (field, value) => {
    expect(restore(withInputs({ [field]: value }))).toBeNull();
  });

  it('rejects an unparseable target time', () => {
    expect(restore(withInputs({ targetTime: 'not a date' }))).toBeNull();
  });

  it('rejects a step with a negative duration', () => {
    const [first, second] = JSON.parse(serialize(buildSession())).workflow;
    expect(restore(tampered({ workflow: [{ ...first, durationMinutes: -5 }, second] }))).toBeNull();
  });
});

describe('how (D2, D6, iteration 2.1)', () => {
  it('round-trips a workflow step with a how array present', () => {
    const session = buildSession();
    const how = [
      { action: 'Combine flour and water', ingredientRefs: ['Flour', 'Water'] },
      { action: 'Knead until smooth' },
    ];
    const sessionWithHow: BakeSession = {
      ...session,
      workflow: [{ ...session.workflow[0], how }, session.workflow[1]],
    };

    const restored = restore(serialize(sessionWithHow));

    expect(restored).toEqual(sessionWithHow);
  });

  it('migrates a pre-Phase-2 session (no how key anywhere, mirroring the existing pre-field ' +
    'fixtures) with how undefined on every step and no migration notice — backward-compat ' +
    'regression guard via the real rehydration entry point (review F-17)', () => {
    // Hand-built raw fixture, deliberately with no `how` key at all on any workflow step —
    // exactly what a session persisted before this field existed looks like. Fed through
    // `migrate()` (not `restore()` directly) because that's the actual production rehydration
    // entry point the iteration's acceptance criterion names — it wraps `restore` with the
    // schema-axis + content-version-notify logic that a bare `restore()` call bypasses.
    const raw = {
      schemaVersion: 1,
      sessionKey: 'session-1',
      recipeId: 'pizza-neapolitan-home',
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
          clockStartTime: NOW.toISOString(),
          isEstimate: false,
        },
        {
          stageId: 'bake',
          name: 'Bake',
          why: 'why-bake',
          durationMinutes: 10,
          clockStartTime: new Date(NOW.getTime() + 15 * 60_000).toISOString(),
          isEstimate: false,
        },
      ],
      stepIndex: 0,
      status: 'in-progress',
    };

    const result = migrate(raw, 'v1');

    expect(result.session).not.toBeNull();
    for (const step of result.session!.workflow) {
      expect(step.how).toBeUndefined();
    }
    expect(result.migrationNotice).toBeNull();
  });

  it('drops only a malformed how entry (a number inside ingredientRefs), not the whole ' +
    'session — iteration 2.1 acceptance; an all-malformed how array collapses to undefined, ' +
    'not a truthy [] (review F-16)', () => {
    const session = buildSession();
    const validHowEntry = { action: 'Combine flour and water', ingredientRefs: ['Flour', 'Water'] };
    const malformedHowEntry = { action: 'Bad entry', ingredientRefs: ['Flour', 5] };
    const raw = {
      ...session,
      workflow: [
        { ...session.workflow[0], how: [validHowEntry, malformedHowEntry] },
        session.workflow[1],
      ],
    };

    const restored = restore(raw);

    expect(restored).not.toBeNull();
    expect(restored?.workflow[0].how).toEqual([validHowEntry]);
    expect(restored?.workflow[1]).toEqual(session.workflow[1]);

    // F-16: when EVERY entry is malformed, `how` must collapse to `undefined`, not a truthy
    // `[]` — otherwise a renderer doing `currentStep.how && <ol>…` (iteration 2.2) would render
    // an empty section, the exact outcome the phase's "no empty section" exit criterion forbids.
    const allMalformedRaw = {
      ...session,
      workflow: [{ ...session.workflow[0], how: [malformedHowEntry] }, session.workflow[1]],
    };

    const allMalformedRestored = restore(allMalformedRaw);

    expect(allMalformedRestored).not.toBeNull();
    expect(allMalformedRestored?.workflow[0].how).toBeUndefined();
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
