// The `Recipe` interface and its companion types — the expensive-to-reverse seam (D3).
// See `.somi/rd/hinokami/recipe-extension-contract.md` for the full contract deliberation.
// Recipes implement this interface; the engine (src/engine/) is the sole caller. This file
// must stay pure: no I/O, no React, no localStorage.

/** The interface-compatibility gate (contract §8). Bump this — and every recipe's declared
 * `contractVersion` — only for a breaking change to this file's shape or invariants. */
export const CONTRACT_VERSION = 1 as const;

/** Branded opaque id (contract §3/§6) — prevents fabricating/comparing/repurposing ids and
 * makes the "stable id" invariant a type property. Construct only via `createRecipeId`. */
export type RecipeId = string & { readonly __brand: 'RecipeId' };

const RECIPE_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Non-throwing shape check — the single source of truth `createRecipeId` (throwing, for
 * recipe authors) and `persistence.ts`'s `restore` (non-throwing, for untrusted persisted
 * input) both validate against, so the two call sites can never drift out of sync. */
export function isValidRecipeIdShape(value: unknown): value is RecipeId {
  return typeof value === 'string' && RECIPE_ID_PATTERN.test(value);
}

/** Validates and brands a recipe id. The single constructor referenced by the "stable id"
 * invariant (contract §6) — recipe modules call this once when defining `id`. */
export function createRecipeId(value: string): RecipeId {
  if (!isValidRecipeIdShape(value)) {
    throw new Error(
      `Invalid RecipeId "${value}": must be non-empty lowercase kebab-case (e.g. "pizza-neapolitan-home")`,
    );
  }
  return value;
}

/** A stage id, unique within a single recipe's `stages` list. Not branded — stage ids are
 * scoped to one recipe and never persisted/compared across recipes the way `RecipeId` is. */
export type StageRef = string;

/** A pathway id, unique within a single recipe's `pathways` list (e.g. "same-day"). */
export type PathwayRef = string;

/** A duration in whole minutes. Recipe invariant (contract §6): non-negative, finite. */
export interface Duration {
  readonly minutes: number;
}

/** A single-value result/error shape (api-design: stable error shape, no throwing for
 * expected outcomes like an infeasible schedule or an oven that's too cold). */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/** One line item in a recipe's baker's-percentage formula. `percent` is relative to flour,
 * which is always the 100% basis (FR-4). */
export interface FormulaIngredient {
  readonly name: string;
  readonly percent: number;
}

/** A recipe's formula: every ingredient as a baker's percentage of flour. The engine scales
 * this to the user's batch (ball count + per-ball weight) via `scaleFormula` (engine/scaling.ts). */
export interface BakersPercentageFormula {
  readonly ingredients: ReadonlyArray<FormulaIngredient>;
}

/** The single stage-kind discriminator (restart-pass-2 fix: replaces the removed
 * `isFermentation` boolean — `type` is now the only source of truth for stage kind).
 * - `'fermentation'` — ambient-sensitive; subject to the D13 monotonicity invariant.
 * - `'cold-ferment'` — a distinct kind; NOT covered by the D13 monotonicity check (its placed
 *   duration is scheduler-determined via the elastic-stage slack-clamp, not a Q10-style
 *   ambient response — see `schedule.ts`).
 * - `'bake'` — engine-special: `stageDuration` returns the `{ minutes: 0 }` placeholder for
 *   this kind (never used for placement/feasibility); the real duration is always the
 *   `bakeTimeMinutes` parameter threaded through the schedule solver.
 * - the remaining kinds are ordinary fixed/ambient-insensitive stages.
 */
export type StageType =
  | 'prep'
  | 'fermentation'
  | 'cold-ferment'
  | 'shape'
  | 'temper'
  | 'preheat'
  | 'bake';

/** An elastic stage's placed duration is determined by `solveScheduleBackward` via
 * slack-absorption, not by calling `stageDuration` at placement time (contract §8: additive —
 * a `Stage` that omits this field is placed by `stageDuration` alone, unchanged). */
export interface ElasticBounds {
  readonly minMinutes: number;
  readonly maxMinutes: number;
}

/** One authored action within a stage's `how` (D2, D6). `ingredientRefs` names must match a
 * FormulaIngredient.name from the recipe's formula (or the active pathway's override) exactly —
 * resolved against scaledIngredients at render time (NF7: never hardcode a quantity). */
export interface HowStep {
  readonly action: string;
  readonly ingredientRefs?: ReadonlyArray<string>;
}

/** One ordered stage in a recipe's workflow (FR-7). `why` is the required 1-2 sentence
 * teaching string (FR-14); `cue` is the optional readiness cue (FR-15) — its presence, not the
 * stage's `type`, is what the engine uses to mark a step `isEstimate` (see `workflow.ts`). `how`
 * is the optional structured how-to content (D2, D6) — additive (contract §8): a stage that
 * omits it renders exactly as it did before this field existed. */
export interface Stage {
  readonly id: StageRef;
  readonly name: string;
  readonly type: StageType;
  readonly why: string;
  readonly cue?: string;
  readonly elastic?: ElasticBounds;
  readonly how?: ReadonlyArray<HowStep>;
}

/** One fermentation/scheduling pathway a recipe offers (e.g. same-day vs. cold-ferment, D6).
 * `stageIds` is the pathway's ordered, statically enumerable stage sequence (contract §6). */
export interface Pathway {
  readonly id: PathwayRef;
  readonly name: string;
  readonly stageIds: ReadonlyArray<StageRef>;
  /** Optional per-pathway formula override (P7). When present, the engine scales THIS formula
   * instead of `Recipe.formula` for sessions on this pathway (e.g. cold-ferment's reduced yeast
   * dose — see `pizza/index.ts`). Additive (contract §8): omitting it — the default for every
   * pathway before this field existed — preserves exactly the prior behavior, so no existing
   * recipe needs an edit. */
  readonly formula?: BakersPercentageFormula;
}

/** The recipe's input bounds (FR-12) — self-describing enough that the engine can validate
 * every input the recipe depends on before calling `stageDuration`/`adaptBake` (contract §5). */
export interface RecipeBounds {
  readonly ballCountMin: number;
  readonly ballCountMax: number;
  readonly ballWeightGMin: number;
  readonly ballWeightGMax: number;
  /** Weight the config form starts at; optional, so omitting it keeps the form's own default. */
  readonly ballWeightGDefault?: number;
  /** Minimum oven max temperature (°C) this recipe can adapt to at all (below this,
   * `adaptBake` returns `OvenTooCold`). */
  readonly ovenMin: number;
  /** This recipe's style cap (°C) — the engine never asks for a bake hotter than this even if
   * the user's oven goes higher. */
  readonly ovenStyleMax: number;
  readonly ambientMin: number;
  readonly ambientMax: number;
  /** Optional: the fridge-stage duration band (hours) for a recipe with a cold-ferment pathway.
   * Additive (contract §8) — omitted by any recipe without an elastic cold-ferment stage; no
   * engine code reads this today (the elastic clamp range lives on the `Stage.elastic` field
   * itself), so there is no "engine default" to be wrong for existing recipes. It exists purely
   * so a recipe module has one named source of truth for its own `elastic.minMinutes/maxMinutes`
   * instead of a second hardcoded pair (see `pizza/index.ts`). */
  readonly coldFermentHoursMin?: number;
  readonly coldFermentHoursMax?: number;
}

/** The engine-supplied context for `stageDuration` (extension point A). `stage` duplicates the
 * function's first positional argument by contract design (`recipe-extension-contract.md §3`) —
 * it gives a recipe's `stageDuration` implementation a single object to pattern-match/destructure
 * against if it prefers that style over the positional argument. */
export interface TimingContext {
  readonly ambientC: number;
  readonly pathway: PathwayRef;
  readonly stage: StageRef;
}

/** The engine-supplied context for `adaptBake` (extension point B). */
export interface OvenContext {
  readonly ovenMaxC: number;
  readonly hasStoneOrSteel: boolean;
}

/** The resolved bake adaptation (FR-6) — temp/time tailored to the user's oven, plus optional
 * dough guidance and a best-effort caveat (P2's 200-219 °C zone). */
export interface BakeAdaptation {
  readonly bakeTempC: number;
  readonly bakeTimeMinutes: number;
  readonly doughGuidance?: string;
  readonly caveat?: string;
}

/** Reported when the user's oven can't adapt this recipe at all (FR-10) — never a silently
 * wrong bake. */
export interface OvenTooCold {
  readonly reason: string;
  readonly minimumOvenC: number;
}

/**
 * The stable abstraction (D3). A recipe supplies recipe-specific knowledge — ingredients,
 * stages, pathways, the oven band, and two typed conditioning functions — and never
 * reimplements what the engine owns (scaling, scheduling, progression, persistence — NFR-12).
 *
 * Invariants a conforming recipe MUST uphold (contract §6, enforced by `conformance.ts`):
 * purity, bounded outputs, a stable branded id, self-describing bounds, total stage ordering,
 * monotone `stageDuration` for `type === 'fermentation'` stages within `bounds`.
 */
export interface Recipe {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly id: RecipeId;
  readonly name: string;
  readonly description: string;
  /** Compact label for places that list recipes side by side; falls back to `name`. */
  readonly shortName?: string;
  /** Icon path relative to the app's base URL (a file under `public/`); falls back to the app
   * mark. Optional fields, so adding them is not a breaking change to the contract. */
  readonly icon?: string;

  /** True for a style baked in a pan. The "stone or steel" question then means putting the pan on a
   * preheated stone or steel (which still speeds the bake), not baking the dough directly on it. */
  readonly panBaked?: boolean;

  readonly formula: BakersPercentageFormula;
  readonly pathways: ReadonlyArray<Pathway>;
  readonly bounds: RecipeBounds;
  readonly stages: ReadonlyArray<Stage>;

  /**
   * EXTENSION POINT A — pure function: how long `stage` takes given `ctx.ambientC` and
   * `ctx.pathway`. The engine calls this while solving the schedule backward (FR-5). MUST be
   * monotonic non-increasing in `ambientC` within `bounds` for `type === 'fermentation'` stages
   * (D13) — a stage's minimum duration then occurs at `bounds.ambientMax` (the warmest legal
   * ambient), which is what lets the engine derive a pathway's minimum feasible total without
   * any recipe-specific feasibility code. For an elastic stage, this still MUST return a value
   * (used as the `elastic.minMinutes` floor for that sum and by the conformance bounded-outputs
   * check) even though it is never used for placement. For the `bake` stage, this returns the
   * `{ minutes: 0 }` placeholder (never used for placement/feasibility — see `StageType`).
   */
  stageDuration(stage: StageRef, ctx: TimingContext): Duration;

  /**
   * EXTENSION POINT B — pure function: adapt bake temp/time + dough guidance to the user's oven,
   * or report the oven is too cold (FR-6/FR-10). Never throws for the expected "too cold" case.
   */
  adaptBake(ctx: OvenContext): Result<BakeAdaptation, OvenTooCold>;
}
