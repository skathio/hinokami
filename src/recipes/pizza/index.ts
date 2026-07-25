// pizza-neapolitan-home — the v1 pizza recipe (Phase 2, iteration 2.1). Home-oven
// Neapolitan-style dough, same-day + cold-ferment pathways. Everything pizza-specific lives in
// this one file (P1 "navigate by feature") — formula, stage content, `stageDuration`,
// `adaptBake`, and the assembled `Recipe` object. No engine files are touched; this module is
// the first "consumer" that proves the Phase 1 contract actually works (NFR-12).
//
// Every numeric constant below is deliberate and cited — see `.somi/plans/hinokami/decisions.md`
// P2 (oven-adaptation formula) and P3 (fermentation time model), and P6 (why/cue content). Do
// not recompute or "improve" these without updating the cited decision first.

import {
  createRecipeId,
  CONTRACT_VERSION,
  type BakeAdaptation,
  type BakersPercentageFormula,
  type Duration,
  type HowStep,
  type OvenContext,
  type OvenTooCold,
  type Pathway,
  type Recipe,
  type RecipeBounds,
  type Result,
  type Stage,
  type StageRef,
  type TimingContext,
} from '../contract';

// ---------------------------------------------------------------------------------------------
// Bounds (FR-12) — the recipe's input bounds; the engine validates every user input against
// these before calling `stageDuration`/`adaptBake` (contract §5).
// ---------------------------------------------------------------------------------------------

/** Fridge-stage duration band (hours) — the single source of truth for both `pizzaBounds`
 * (below) and the cold-ferment stage's `elastic` field, per `decisions.md P3`'s "24h/72h,
 * reusing bounds.coldFermentHoursMin/Max as the single source of truth" instruction. */
const COLD_FERMENT_HOURS_MIN = 24;
const COLD_FERMENT_HOURS_MAX = 72;

export const pizzaBounds: RecipeBounds = {
  ballCountMin: 1,
  ballCountMax: 6,
  ballWeightGMin: 200,
  ballWeightGMax: 300,
  ovenMin: 200,
  ovenStyleMax: 280,
  ambientMin: 18,
  ambientMax: 30,
  coldFermentHoursMin: COLD_FERMENT_HOURS_MIN,
  coldFermentHoursMax: COLD_FERMENT_HOURS_MAX,
};

// ---------------------------------------------------------------------------------------------
// Formula (FR-4) — baker's percentages, flour = 100%. Per-ball target weight 250 g.
//
// Cold-ferment yeast (P7, iteration 2.2): a 24-72h cold ferment needs roughly half the
// commercial yeast a same-day dough does, or it over-ferments. `pizzaFormula` below is the
// same-day formula (0.2% yeast); `coldFermentFormula` is the cold-ferment pathway's override
// (0.1% yeast, the 24h anchor — longer-cold scaling down to ~0.02-0.03% @72h remains a
// documented follow-up, per the phase spec's original Formula section). The override is
// consumed via `Pathway.formula` (`contract.ts`) — see `coldFermentPathway` below.
// ---------------------------------------------------------------------------------------------

export const pizzaFormula: BakersPercentageFormula = {
  ingredients: [
    { name: 'Flour', percent: 100 },
    { name: 'Water', percent: 62 },
    { name: 'Salt', percent: 2.8 },
    { name: 'Yeast (instant dry)', percent: 0.2 },
  ],
};

/** Cold-ferment override (P7): identical flour/water/salt to `pizzaFormula`, yeast at 0.1%
 * instead of 0.2%. Defined as a complete formula object (not a spread + partial override) since
 * `BakersPercentageFormula.ingredients` is an array, not named fields — a full literal is the
 * clearer shape here and avoids a fragile by-name lookup into `pizzaFormula.ingredients`. */
export const coldFermentFormula: BakersPercentageFormula = {
  ingredients: [
    { name: 'Flour', percent: 100 },
    { name: 'Water', percent: 62 },
    { name: 'Salt', percent: 2.8 },
    { name: 'Yeast (instant dry)', percent: 0.1 },
  ],
};

export const PER_BALL_TARGET_WEIGHT_G = 250;

// ---------------------------------------------------------------------------------------------
// Stage content (FR-14/FR-15, `decisions.md P6`) — every stage's `why`; fermentation/estimate
// stages additionally carry a readiness `cue`. Content is verbatim from P6's authored tables.
// ---------------------------------------------------------------------------------------------

const MIX_WHY =
  "You're building gluten structure and evenly distributing the yeast. The dough will feel " +
  'rough and uneven — that\'s expected.';

const BULK_WHY =
  'Yeast is producing CO₂ and acids that give the dough flavor and lift. It\'s done by feel and ' +
  'look, not just the clock.';
const BULK_CUE =
  'Poke the dough: it should spring back slowly. It should look noticeably puffier — roughly ' +
  '50–75% larger.';

const SHAPE_WHY =
  'Shaping creates surface tension that helps the dough hold its structure during proofing. ' +
  'Avoid tearing the gluten you just built.';

const PROOF_WHY =
  'The shaped ball is relaxing and developing a final, lighter structure. The shorter proof here ' +
  'is why timing matters less than dough feel.';
const PROOF_CUE =
  'The ball should look puffier and feel light when you gently lift it. If it springs back ' +
  'quickly, give it a few more minutes.';

const PREHEAT_WHY =
  'A fully preheated stone or tray is what gives you a good bottom crust — don\'t rush this step.';

const BAKE_WHY =
  "You're driving off moisture and developing crust through the Maillard reaction. Check early: " +
  'your oven may run hotter or cooler than its dial.';

const COLD_FERMENT_WHY =
  "Slow cold fermentation develops complex flavor compounds that shorter room-temp fermentation " +
  "can't match. The fridge just slows, not stops, the yeast.";
const COLD_FERMENT_CUE =
  'The dough should be noticeably larger (roughly doubled) and feel airy when you gently press ' +
  'it. Remove from fridge ~1–2 h before shaping.';

const TEMPER_WHY =
  'Warming the chilled ball brings it back to a workable temperature so it shapes evenly and ' +
  "bakes properly — a cold center won't cook through in the time the crust needs.";
const TEMPER_CUE =
  'The ball should feel cool but no longer cold — close to room temperature. If you have a ' +
  'thermometer, aim for an interior temperature of at least 18°C (64°F).';

// ---------------------------------------------------------------------------------------------
// Stage "how" content (D2, D6, iteration 2.2) — ordered, concrete action steps beneath each
// stage's `why`/`cue`. Grounded in standard home-oven Neapolitan technique (dissolve-then-
// combine mixing, stretch-and-fold during bulk, surface-tension balling, hand-stretched bake).
// Authored, not derived from any cited numeric source the way `why`/`cue` cite `decisions.md P6`
// — this is technique prose, flagged for a human correctness skim before merge (phase 2 file
// §"Risk pointers", brief §8 open risk). `ingredientRefs` names are exact `FormulaIngredient.name`
// matches, resolved against `scaledIngredients` at render time (NF7) — never a hardcoded gram
// figure here. `preheat` has no `how`: its single action ("wait for a full preheat") is already
// fully covered by `PREHEAT_WHY`, so a `how` here would add words, not information.
// ---------------------------------------------------------------------------------------------

const MIX_HOW: HowStep[] = [
  { action: 'Dissolve the yeast into the water.', ingredientRefs: ['Water', 'Yeast (instant dry)'] },
  { action: 'Add the flour and salt, then mix until no dry flour remains.', ingredientRefs: ['Flour', 'Salt'] },
  {
    action:
      'Knead until the dough is smooth and passes the windowpane test — stretch a small piece thin ' +
      'enough to see light through it without it tearing.',
  },
];

const BULK_HOW: HowStep[] = [
  { action: 'Cover the dough to keep it from drying out, then leave it at room temperature to bulk ferment.' },
  {
    action:
      "If the dough feels slack partway through, give it one or two gentle stretch-and-folds to " +
      'strengthen it — optional, not required.',
  },
];

const SHAPE_HOW: HowStep[] = [
  { action: 'Divide the dough into portions at your target ball weight.' },
  {
    action:
      'Shape each portion into a tight ball: cup your hand around it and drag it in a circular ' +
      'motion against the work surface to build surface tension on top.',
  },
  { action: "Space the balls apart on a floured or lightly oiled tray so they don't stick together." },
];

const PROOF_HOW: HowStep[] = [
  {
    action:
      'Cover the balls loosely (a proofing box, plastic wrap, or a floured cloth) to stop them ' +
      'drying out.',
  },
  { action: 'Leave them undisturbed at room temperature until they look and feel puffy.' },
];

const COLD_FERMENT_HOW: HowStep[] = [
  {
    action:
      "Cover the dough tightly (an airtight container or plastic wrap) so it doesn't dry out or " +
      'form a skin.',
  },
  { action: 'Place it in the refrigerator for the scheduled duration.' },
];

const TEMPER_HOW: HowStep[] = [
  { action: 'Take the shaped balls out of the refrigerator and cover them loosely.' },
  { action: 'Let them warm at room temperature until no longer cold to the touch.' },
];

const BAKE_HOW: HowStep[] = [
  {
    action:
      'Stretch the tempered ball into a round by hand, leaving a puffy outer rim — avoid a rolling ' +
      'pin, which knocks out the fermentation gas.',
  },
  { action: 'Add toppings lightly so the crust cooks through in the short bake time.' },
  {
    action:
      'Launch the pizza onto the preheated stone or steel with a floured or semolina-dusted peel, ' +
      'then rotate partway through baking for even color.',
  },
];

// ---------------------------------------------------------------------------------------------
// Stage durations (`decisions.md P3`) — the Q10 = 2 model for fermentation stages, fixed
// durations for everything else. Base durations are all at the 24 °C reference ambient.
// ---------------------------------------------------------------------------------------------

const REFERENCE_AMBIENT_C = 24;
const FERMENTATION_Q10 = 2;

const MIX_MINUTES = 15;
const BULK_BASE_MINUTES = 90;
/** Ball proof base at 24 °C — 5 h, the deep-research-corrected value (not the earlier, wrong
 * 30-min draft, which was actually a post-cold temper duration — see `temper` below). */
const PROOF_BASE_MINUTES = 300;
const PREHEAT_MINUTES = 45;
/** `shape` has no pinned base duration anywhere in the plan (flagged in `progress.md`'s "Still
 * open, for Phase 2" note) — pinned here by the coder: a small, fixed (not ambient-scaled) prep
 * duration, in the same family as `mix`'s 15 min but shorter (shaping one already-risen portion
 * is quicker than the initial mix/knead). See the coder's final report for the full rationale. */
const SHAPE_MINUTES = 10;
/** Post-cold RT ball temper — fixed 150 min (2.5 h, the center of the researched 2–3 h range),
 * distinct from `proof`'s 300-min base (`decisions.md P3` pass-3 fix). NOT ambient-scaled: the
 * research gives a fixed range + a readiness cue (interior temperature), not a rate model, and
 * extrapolating Q10 to "how fast a chilled ball returns to room temperature" would be a
 * different physical process (heat transfer, not fermentation kinetics) that P3 never modeled. */
const TEMPER_MINUTES = 150;

/** Q10 = 2 per 10 °C: `duration = base × 2^((24 − ambientC) / 10)`. Strictly decreasing in
 * `ambientC` for Q10 > 1 — the D13 monotonicity invariant holds by construction. */
function q10Minutes(baseMinutes: number, ambientC: number): number {
  return baseMinutes * FERMENTATION_Q10 ** ((REFERENCE_AMBIENT_C - ambientC) / 10);
}

/**
 * EXTENSION POINT A. Pure, deterministic. Fermentation stages (`bulk`, `proof`) are Q10-scaled
 * by ambient; `temper` is fixed (see above); `mix`/`preheat` are fixed and ambient-insensitive;
 * `cold-ferment` returns its `elastic.minMinutes` floor (used only for the D13
 * minimum-feasible-total sum — the scheduler's elastic slack-clamp determines its *placed*
 * duration, not this function); `bake` returns the stated `{ minutes: 0 }` placeholder (never
 * used for placement/feasibility — the real bake duration is always `adaptBake(ctx).bakeTimeMinutes`).
 */
function stageDuration(stage: StageRef, ctx: TimingContext): Duration {
  switch (stage) {
    case 'mix':
      return { minutes: MIX_MINUTES };
    case 'bulk':
      return { minutes: q10Minutes(BULK_BASE_MINUTES, ctx.ambientC) };
    case 'shape':
      return { minutes: SHAPE_MINUTES };
    case 'proof':
      return { minutes: q10Minutes(PROOF_BASE_MINUTES, ctx.ambientC) };
    case 'cold-ferment':
      return { minutes: COLD_FERMENT_HOURS_MIN * 60 };
    case 'temper':
      return { minutes: TEMPER_MINUTES };
    case 'preheat':
      return { minutes: PREHEAT_MINUTES };
    case 'bake':
      return { minutes: 0 };
    default:
      throw new Error(`pizzaRecipe.stageDuration: unknown stage id "${stage}"`);
  }
}

// ---------------------------------------------------------------------------------------------
// Oven adaptation (`decisions.md P2`) — power-law interpolation between the two cited anchors,
// fitted exponent 2.8. See `decisions.md P2` for the full derivation and reference table; the
// values below reproduce that table exactly (validated in `oven-adaptation.test.ts`).
// ---------------------------------------------------------------------------------------------

/** The recipe's style cap — the engine never asks for a bake hotter than this even if the
 * user's oven goes higher. Equal to `pizzaBounds.ovenStyleMax`. */
const STYLE_MAX_C = 280;
/** The formula's defined anchor point (~1.5 min @ 450 °C, Neapolitan wood-fired). Out-of-domain
 * at runtime — `bakeTempC` never exceeds `STYLE_MAX_C` — but a legitimate extrapolation anchor
 * because the exponent below is fitted from an in-domain point (250 °C), not guessed. */
const BASE_TEMP_C = 450;
const BASE_TIME_S = 90;
/** Fitted to the two cited anchors: `ln(465/90) / ln(450/250) ≈ 2.79 → 2.8`. See `decisions.md P2`. */
const EXPONENT = 2.8;
/** Stone/steel bottom heat-transfer effect — qualitative in the source material, quantified here. */
const STONE_FACTOR = 0.85;
/** Below this, the pizza genuinely will not cook adequately in a Neapolitan style. Equal to
 * `pizzaBounds.ovenMin`. */
const OVEN_TOO_COLD_C = 200;
/** `[OVEN_TOO_COLD_C, CAVEAT_ZONE_MAX_C)` is the caveated best-effort zone (FRD §F2). */
const CAVEAT_ZONE_MAX_C = 220;
const CAVEAT_TEXT =
  'Results may be pale/undercooked at this temperature — consider preheating longer and using a ' +
  'stone/steel if possible.';
/** For `bakeTempC ≤ DOUGH_GUIDANCE_MAX_C`, a hydration nudge helps the crust develop over the
 * longer bake. This recipe's formula default is 62% (`pizzaFormula`, above); the guidance
 * suggests nudging higher still for low-temp ovens. */
const DOUGH_GUIDANCE_MAX_C = 250;
const DOUGH_GUIDANCE_TEXT =
  'This bakes long enough at lower oven temperatures that a slightly higher hydration ' +
  '(up to ~65%, vs. this recipe\'s 62% default) can help the crust develop fully.';

/**
 * EXTENSION POINT B. Pure. `bakeTempC = min(ovenMaxC, STYLE_MAX_C)`;
 * `bakeTimeS = BASE_TIME_S × (BASE_TEMP_C / bakeTempC)^EXPONENT × (hasStone ? STONE_FACTOR : 1)`.
 * `OvenTooCold` below `OVEN_TOO_COLD_C`; caveated best-effort in `[200, 220)`.
 */
function adaptBake(ctx: OvenContext): Result<BakeAdaptation, OvenTooCold> {
  if (ctx.ovenMaxC < OVEN_TOO_COLD_C) {
    return {
      ok: false,
      error: {
        reason:
          `An oven maxing out at ${ctx.ovenMaxC}°C can't reliably bake a Neapolitan-style pizza — ` +
          `${OVEN_TOO_COLD_C}°C is the minimum this recipe adapts to.`,
        minimumOvenC: OVEN_TOO_COLD_C,
      },
    };
  }

  const bakeTempC = Math.min(ctx.ovenMaxC, STYLE_MAX_C);
  const bakeTimeS =
    BASE_TIME_S * (BASE_TEMP_C / bakeTempC) ** EXPONENT * (ctx.hasStoneOrSteel ? STONE_FACTOR : 1.0);
  const bakeTimeMinutes = bakeTimeS / 60;

  const doughGuidance = bakeTempC <= DOUGH_GUIDANCE_MAX_C ? DOUGH_GUIDANCE_TEXT : undefined;
  const caveat = ctx.ovenMaxC < CAVEAT_ZONE_MAX_C ? CAVEAT_TEXT : undefined;

  return {
    ok: true,
    value: { bakeTempC, bakeTimeMinutes, doughGuidance, caveat },
  };
}

// ---------------------------------------------------------------------------------------------
// Stages (FR-7) — the flat, ordered stage list. Both pathways share `mix`, `bulk`, `shape`,
// `preheat`, `bake`; `proof` is same-day-only; `cold-ferment`/`temper` are cold-ferment-only.
// `temper` is a DISTINCT stage from `proof` (not a reuse of its id/duration — `decisions.md P3`
// pass-3 fix; the exact same-day/post-cold conflation class P3 corrected once already, in the
// opposite direction).
// ---------------------------------------------------------------------------------------------

const pizzaStages: Stage[] = [
  { id: 'mix', name: 'Mix', type: 'prep', why: MIX_WHY, how: MIX_HOW },
  { id: 'bulk', name: 'Bulk ferment', type: 'fermentation', why: BULK_WHY, cue: BULK_CUE, how: BULK_HOW },
  { id: 'shape', name: 'Shape', type: 'shape', why: SHAPE_WHY, how: SHAPE_HOW },
  { id: 'proof', name: 'Ball proof', type: 'fermentation', why: PROOF_WHY, cue: PROOF_CUE, how: PROOF_HOW },
  {
    id: 'cold-ferment',
    name: 'Cold ferment',
    type: 'cold-ferment',
    why: COLD_FERMENT_WHY,
    cue: COLD_FERMENT_CUE,
    how: COLD_FERMENT_HOW,
    // Elastic (`decisions.md P3` pass-2 fix, Major 1): `solveScheduleBackward` — not
    // `stageDuration` — clamps available slack into this range, stretching the fridge stage
    // toward the 48h quality sweet spot instead of always defaulting to the 24h floor.
    // Reads `pizzaBounds.coldFermentHoursMin/Max` directly (2.1's review Minor, fixed in P7) so
    // `RecipeBounds.coldFermentHoursMin/Max`'s "single source of truth" comment is actually true,
    // rather than duplicating a disconnected copy of the same two numbers.
    elastic: {
      minMinutes: pizzaBounds.coldFermentHoursMin! * 60,
      maxMinutes: pizzaBounds.coldFermentHoursMax! * 60,
    },
  },
  { id: 'temper', name: 'Temper', type: 'temper', why: TEMPER_WHY, cue: TEMPER_CUE, how: TEMPER_HOW },
  { id: 'preheat', name: 'Preheat', type: 'preheat', why: PREHEAT_WHY },
  { id: 'bake', name: 'Bake', type: 'bake', why: BAKE_WHY, how: BAKE_HOW },
];

// ---------------------------------------------------------------------------------------------
// Pathways (FR-3/D6)
// ---------------------------------------------------------------------------------------------

const sameDayPathway: Pathway = {
  id: 'same-day',
  name: 'Same-day',
  stageIds: ['mix', 'bulk', 'shape', 'proof', 'preheat', 'bake'],
};

const coldFermentPathway: Pathway = {
  id: 'cold-ferment',
  name: 'Cold ferment',
  stageIds: ['mix', 'bulk', 'cold-ferment', 'shape', 'temper', 'preheat', 'bake'],
  // P7: 0.1% yeast instead of the same-day 0.2% — see `coldFermentFormula` above.
  formula: coldFermentFormula,
};

// ---------------------------------------------------------------------------------------------
// The assembled Recipe object + registration surface.
// ---------------------------------------------------------------------------------------------

export const pizzaRecipe: Recipe = {
  contractVersion: CONTRACT_VERSION,
  id: createRecipeId('pizza-neapolitan-home'),
  name: 'Neapolitan-style pizza',
  description: 'Home-oven Neapolitan-style dough with same-day and cold-ferment paths.',
  formula: pizzaFormula,
  pathways: [sameDayPathway, coldFermentPathway],
  bounds: pizzaBounds,
  stages: pizzaStages,
  stageDuration,
  adaptBake,
};

/** Bumped whenever this recipe's stages/timing/oven logic changes (D15, `sdd.md §3`/`§5`) — a
 * persisted `BakeSession` compares this against the live recipe's version at rehydration time.
 * 1.1.0 (iteration 2.2, D15): every stage gained authored `how` content — a real recipe-content
 * change, so a bake already in progress under 1.0.0 hits the "continue-and-notify" mismatch path
 * on its next rehydration rather than silently gaining new content mid-bake. */
export const PIZZA_CONTENT_VERSION = '1.1.0';
