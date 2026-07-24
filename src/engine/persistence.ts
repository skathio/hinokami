// serialize / restore / migrate — versioned persistence for `BakeSession` (D4/D15, P4). Pure
// functions: no localStorage I/O here (Phase 3 wires this into Zustand's `persist`). `restore`
// and `migrate` both accept `unknown` — either a raw JSON string (as a real `localStorage.getItem`
// read would hand back) or an already-parsed value — so this module is fully testable with
// hand-constructed inputs and storage-agnostic.

import { isValidRecipeIdShape } from '@/recipes/contract';
import type { BakeAdaptation, HowStep } from '@/recipes/contract';
import type { BakeSession, ScheduledStep } from './types';

const CURRENT_SCHEMA_VERSION = 1 as const;

const DISCARD_NOTICE = 'Your saved bake session could not be read and was discarded.';
const CONTENT_MISMATCH_NOTICE =
  "This recipe was updated after you started this bake — you're continuing on your original schedule.";

/** Registered schema migrations, keyed by the OLD schema version they upgrade FROM. Empty in
 * v1 (schema v1 is both the current and the first version — spec.md §4 assumption 6): this is
 * the extensibility point a future schema bump fills in, so the mechanism "ships ready but
 * never fires on v1 users' first session" (spec.md §9). */
const SCHEMA_MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

function devWarn(message: string): void {
  if (import.meta.env.DEV) {
    // Dev-only observability (spec.md §8) — never prod console noise.
    console.warn(`[hinokami:persistence] ${message}`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Accepts either a raw JSON string or an already-parsed value; returns `undefined` for
 * anything unparseable (never throws). */
function parseRaw(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Iteration 2.1 (D2, D6): a single `how` entry's shape check. */
function isValidHowStepShape(raw: unknown): raw is HowStep {
  if (!isPlainObject(raw)) return false;
  const { action, ingredientRefs } = raw;
  return (
    typeof action === 'string' &&
    (ingredientRefs === undefined ||
      (Array.isArray(ingredientRefs) && ingredientRefs.every((ref) => typeof ref === 'string')))
  );
}

/** `how` is optional/additive (D2, D6) — a step serialized before this field existed simply has
 * no `how` key, which is a valid `undefined` here (same discipline `bakeAdaptation` established).
 * Unlike `bakeAdaptation` (a single object dropped as a whole when malformed), `how` is an array:
 * a malformed entry (e.g. a non-string in `ingredientRefs`) drops only THAT entry, not the whole
 * `how` field or the session — it's caveat-display data, not structurally load-bearing. A
 * present-but-non-array `how` (the field itself is the wrong shape) is dropped in full. An
 * all-malformed array collapses to `undefined` too (review F-16) — otherwise absent/non-array
 * `how` would revive to `undefined` while an all-malformed array revived to a truthy `[]`, and a
 * renderer doing `currentStep.how && <ol>…` would render an empty section for the latter, the
 * exact outcome the phase's exit criterion forbids. This keeps the invariant 2.2's renderer can
 * rely on: `how` is either `undefined` or a non-empty array. */
function reviveHow(raw: unknown): ReadonlyArray<HowStep> | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const filtered = raw.filter(isValidHowStepShape);
  return filtered.length > 0 ? filtered : undefined;
}

function reviveScheduledStep(raw: unknown): ScheduledStep | null {
  if (!isPlainObject(raw)) return null;
  const { stageId, name, why, cue, how, durationMinutes, clockStartTime, isEstimate } = raw;
  if (typeof stageId !== 'string') return null;
  if (typeof name !== 'string') return null;
  if (typeof why !== 'string') return null;
  if (cue !== undefined && typeof cue !== 'string') return null;
  if (typeof durationMinutes !== 'number') return null;
  if (typeof isEstimate !== 'boolean') return null;
  if (typeof clockStartTime !== 'string' && !(clockStartTime instanceof Date)) return null;

  const parsedClockStartTime =
    clockStartTime instanceof Date ? clockStartTime : new Date(clockStartTime);
  if (Number.isNaN(parsedClockStartTime.getTime())) return null;

  return {
    stageId,
    name,
    why,
    cue: cue as string | undefined,
    how: reviveHow(how),
    durationMinutes,
    clockStartTime: parsedClockStartTime,
    isEstimate,
  };
}

/** Phase 4.2 plan-change (Task 1): `bakeAdaptation` is optional/additive on `BakeSession`
 * (`engine/types.ts`) — a session serialized before this field existed simply has no
 * `bakeAdaptation` key, which is a valid `undefined` here, not a validation failure. A present but
 * malformed value (tampered/corrupt localStorage) is dropped rather than failing the whole
 * restore — it's caveat-display data, not structurally load-bearing for the session itself. */
function isValidBakeAdaptationShape(raw: unknown): raw is BakeAdaptation {
  if (!isPlainObject(raw)) return false;
  const { bakeTempC, bakeTimeMinutes, doughGuidance, caveat } = raw;
  return (
    typeof bakeTempC === 'number' &&
    typeof bakeTimeMinutes === 'number' &&
    (doughGuidance === undefined || typeof doughGuidance === 'string') &&
    (caveat === undefined || typeof caveat === 'string')
  );
}

function isValidInputsShape(raw: unknown): raw is BakeSession['inputs'] {
  if (!isPlainObject(raw)) return false;
  const { targetTime, ovenMaxC, hasStoneOrSteel, ambientC, ballCount, ballWeightG, pathway } = raw;
  return (
    typeof targetTime === 'string' &&
    typeof ovenMaxC === 'number' &&
    typeof hasStoneOrSteel === 'boolean' &&
    typeof ambientC === 'number' &&
    typeof ballCount === 'number' &&
    typeof ballWeightG === 'number' &&
    (pathway === 'same-day' || pathway === 'cold-ferment')
  );
}

/**
 * Validates + coerces a CURRENT-schema-shaped raw value into a real `BakeSession`, reviving
 * `Date` fields lost to JSON round-tripping. Returns `null` on any structural problem — never
 * throws (FR-9/E1). `migrate` calls this after resolving the schema-version axis; it is also
 * exported directly for the "serialize → restore → same session" round-trip test.
 */
export function restore(raw: unknown): BakeSession | null {
  const parsed = parseRaw(raw);
  if (!isPlainObject(parsed)) return null;
  if (parsed.schemaVersion !== CURRENT_SCHEMA_VERSION) return null;
  if (typeof parsed.sessionKey !== 'string') return null;
  // Validate the persisted value against the same shape `createRecipeId` enforces (rather than
  // casting a bare `string` straight to the branded `RecipeId`) — a corrupt/tampered
  // localStorage value should be rejected here, not silently accepted as if it had been
  // constructed through the recipe id validator.
  if (!isValidRecipeIdShape(parsed.recipeId)) return null;
  if (typeof parsed.recipeContentVersion !== 'string') return null;
  if (!isValidInputsShape(parsed.inputs)) return null;
  if (!Array.isArray(parsed.workflow)) return null;
  if (typeof parsed.stepIndex !== 'number') return null;
  if (parsed.status !== 'in-progress' && parsed.status !== 'completed') return null;

  const workflow: ScheduledStep[] = [];
  for (const rawStep of parsed.workflow) {
    const step = reviveScheduledStep(rawStep);
    if (!step) return null;
    workflow.push(step);
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    sessionKey: parsed.sessionKey,
    recipeId: parsed.recipeId,
    recipeContentVersion: parsed.recipeContentVersion,
    inputs: parsed.inputs,
    workflow,
    stepIndex: parsed.stepIndex,
    status: parsed.status,
    bakeAdaptation: isValidBakeAdaptationShape(parsed.bakeAdaptation) ? parsed.bakeAdaptation : undefined,
  };
}

/** Serializes a `BakeSession` for storage. `Date` fields become ISO strings via `JSON.stringify`'s
 * built-in `Date#toJSON`; `restore` revives them. */
export function serialize(session: BakeSession): string {
  return JSON.stringify(session);
}

export interface MigrateResult {
  readonly session: BakeSession | null;
  readonly migrationNotice: string | null;
}

/**
 * Two-axis version check (D4/D15/P4):
 *  1. schema axis — current version passes through; an older version with a registered
 *     migration is upgraded in place; anything else (parse failure, unknown/future version) is
 *     discard-with-notice.
 *  2. recipe-content axis — checked against `currentRecipeContentVersion` AFTER the schema axis
 *     resolves. A mismatch is **continue-and-notify** (pass-2 fix): `workflow`/`stepIndex` are
 *     never discarded or re-derived (the baker finishes their in-progress bake on its original
 *     schedule — P4 "let it finish" stands unchanged), but `migrationNotice` always fires so the
 *     resume is disclosed, never silent.
 */
export function migrate(raw: unknown, currentRecipeContentVersion: string): MigrateResult {
  const parsed = parseRaw(raw);
  if (!isPlainObject(parsed)) {
    devWarn('discarded: unparseable or non-object persisted session');
    return { session: null, migrationNotice: DISCARD_NOTICE };
  }

  const schemaVersion = parsed.schemaVersion;
  if (typeof schemaVersion !== 'number') {
    devWarn('discarded: missing/invalid schemaVersion');
    return { session: null, migrationNotice: DISCARD_NOTICE };
  }

  let migratable: Record<string, unknown> = parsed;
  if (schemaVersion !== CURRENT_SCHEMA_VERSION) {
    const migrateStep = SCHEMA_MIGRATIONS[schemaVersion];
    if (!migrateStep) {
      devWarn(`discarded: unsupported schemaVersion ${schemaVersion}`);
      return { session: null, migrationNotice: DISCARD_NOTICE };
    }
    devWarn(`migrating persisted session from schemaVersion ${schemaVersion} to ${CURRENT_SCHEMA_VERSION}`);
    migratable = migrateStep(parsed);
  }

  const session = restore(migratable);
  if (!session) {
    devWarn('discarded: schema-migrated session failed shape validation');
    return { session: null, migrationNotice: DISCARD_NOTICE };
  }

  if (session.recipeContentVersion !== currentRecipeContentVersion) {
    devWarn(
      `recipe-content mismatch: session has "${session.recipeContentVersion}", current is "${currentRecipeContentVersion}" — continuing as-is`,
    );
    return { session, migrationNotice: CONTENT_MISMATCH_NOTICE };
  }

  return { session, migrationNotice: null };
}
