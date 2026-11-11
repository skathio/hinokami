// Sicilian and Roman pizza — style variants of the Neapolitan recipe. They reuse its stage list,
// timing model and content (`pizzaRecipe`) and override only what differs by style: the formula,
// fermentation lengths, input bounds, some stage instructions and the bake curve. Each pathway's
// yeast is chosen for that pathway's fermentation length at the 24 °C reference (the model does
// not derive time from yeast). Numbers follow the calibration research: Craig-derived IDY table
// for yeast, Kenji/ATK pan bakes for Sicilian, Italian pizza-alla-pala recipes for Roman. Pathway ids
// stay "same-day"/"cold-ferment", and the content version is shared (`PIZZA_CONTENT_VERSION`),
// so the session schema and migration need no change.

import {
  createRecipeId,
  type BakeAdaptation,
  type BakersPercentageFormula,
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
import { pizzaBounds, pizzaRecipe, q10Minutes } from './index';

const LOW_TEMP_CAVEAT =
  'Results may be pale/undercooked at this temperature — consider preheating longer and ' +
  'baking on the lowest rack.';

interface BakeCurve {
  readonly styleName: string;
  readonly refTempC: number;
  readonly refMinutes: number;
  /** Power-law exponent: 2.8 for a pizza baked directly on the surface; flatter for a pan
   * pizza, whose bake is set by conduction through the pan rather than oven temperature alone. */
  readonly exponent: number;
  readonly stoneFactor: number;
}

/** `bakeTime = refMinutes × (refTempC / bakeTempC)^exponent × (hasStone ? stoneFactor : 1)`, capped
 * at the style's max temperature; OvenTooCold below `bounds.ovenMin`. */
function makeAdaptBake(bounds: RecipeBounds, curve: BakeCurve) {
  return (ctx: OvenContext): Result<BakeAdaptation, OvenTooCold> => {
    if (ctx.ovenMaxC < bounds.ovenMin) {
      return {
        ok: false,
        error: {
          reason:
            `An oven maxing out at ${ctx.ovenMaxC}°C can't reliably bake ${curve.styleName} — ` +
            `${bounds.ovenMin}°C is the minimum this recipe adapts to.`,
          minimumOvenC: bounds.ovenMin,
        },
      };
    }
    const bakeTempC = Math.min(ctx.ovenMaxC, bounds.ovenStyleMax);
    const bakeTimeMinutes =
      curve.refMinutes *
      (curve.refTempC / bakeTempC) ** curve.exponent *
      (ctx.hasStoneOrSteel ? curve.stoneFactor : 1);
    return {
      ok: true,
      value: {
        bakeTempC,
        bakeTimeMinutes,
        doughGuidance: undefined,
        caveat: ctx.ovenMaxC < bounds.ovenMin + 20 ? LOW_TEMP_CAVEAT : undefined,
      },
    };
  };
}

interface StyleFormula {
  readonly water: number;
  readonly salt: number;
  readonly oil: number;
}

/** The base ingredients with the style's water, salt and oil, and the given yeast %. */
function formulaFor(base: BakersPercentageFormula, style: StyleFormula, yeast: number): BakersPercentageFormula {
  const percents: Record<string, number> = { Water: style.water, Salt: style.salt, 'Yeast (instant dry)': yeast };
  const ingredients = base.ingredients.map((i) =>
    i.name in percents ? { ...i, percent: percents[i.name] } : i,
  );
  return { ingredients: [...ingredients, { name: 'Olive oil', percent: style.oil }] };
}

/** Base minutes at the 24 °C reference for the fermentation stages a style lengthens or
 * shortens; `bulk` and `proof` keep the Q10 ambient scaling, `temper` stays fixed. */
interface StyleTiming {
  readonly bulk: number;
  /** Shorter room-temperature bulk before the fridge, so the dough is not over-risen going in. */
  readonly coldBulk: number;
  readonly proof: number;
  readonly temper: number;
}

function makeStageDuration(timing: StyleTiming) {
  return (stage: StageRef, ctx: TimingContext) => {
    if (stage === 'bulk') {
      const base = ctx.pathway === 'cold-ferment' ? timing.coldBulk : timing.bulk;
      return { minutes: q10Minutes(base, ctx.ambientC) };
    }
    if (stage === 'proof') return { minutes: q10Minutes(timing.proof, ctx.ambientC) };
    if (stage === 'temper') return { minutes: timing.temper };
    return pizzaRecipe.stageDuration(stage, ctx);
  };
}

function withHow(stages: ReadonlyArray<Stage>, how: Record<string, HowStep[]>): Stage[] {
  return stages.map((s) => (how[s.id] ? { ...s, how: how[s.id] } : s));
}

// The oil is a dough ingredient (it is in the formula and counted in the scaled weights), so it
// goes in at mix: after the flour and salt, before kneading.
const OIL_MIX_STEP: HowStep = {
  action: 'Add the olive oil and work it in until the dough has absorbed it.',
  ingredientRefs: ['Olive oil'],
};

function mixWithOil(): HowStep[] {
  const base = pizzaRecipe.stages.find((s) => s.id === 'mix')?.how ?? [];
  return [...base.slice(0, -1), OIL_MIX_STEP, ...base.slice(-1)];
}

function buildStyle(opts: {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  description: string;
  formula: StyleFormula;
  /** Instant dry yeast % per pathway id. */
  yeast: Record<string, number>;
  timing: StyleTiming;
  bounds: Partial<RecipeBounds>;
  curve: BakeCurve;
  how: Record<string, HowStep[]>;
  panBaked?: boolean;
}): Recipe {
  const bounds: RecipeBounds = { ...pizzaBounds, ...opts.bounds };
  const pathways: Pathway[] = pizzaRecipe.pathways.map((p) => ({
    ...p,
    formula: formulaFor(p.formula ?? pizzaRecipe.formula, opts.formula, opts.yeast[p.id]),
  }));
  return {
    ...pizzaRecipe,
    id: createRecipeId(opts.id),
    name: opts.name,
    shortName: opts.shortName,
    icon: opts.icon,
    panBaked: opts.panBaked,
    description: opts.description,
    formula: pathways[0].formula!,
    pathways,
    bounds,
    stages: withHow(pizzaRecipe.stages, { mix: mixWithOil(), ...opts.how }),
    stageDuration: makeStageDuration(opts.timing),
    adaptBake: makeAdaptBake(bounds, opts.curve),
  };
}

export const sicilianRecipe: Recipe = buildStyle({
  panBaked: true,
  id: 'pizza-sicilian-home',
  name: 'Sicilian pizza',
  shortName: 'Sicilian',
  icon: 'recipes/sicilian.svg',
  description: 'Thick, airy, oily-crisp pan pizza with same-day and cold-ferment paths.',
  formula: { water: 70, salt: 2.5, oil: 4 },
  // Same-day: 4 h at 24 °C (2 h bulk + 2 h in the oiled pan). Cold: tuned for the 48 h the
  // scheduler aims for; the pan proof after the fridge is the 180 min temper.
  yeast: { 'same-day': 0.16, 'cold-ferment': 0.15 },
  timing: { bulk: 120, coldBulk: 60, proof: 120, temper: 180 },
  // One piece per pan at about 0.75 g/cm²: ~570 g fills a quarter sheet, ~1140 g a half sheet.
  bounds: {
    ballCountMin: 1,
    ballCountMax: 2,
    ballWeightGMin: 500,
    ballWeightGMax: 1500,
    ballWeightGDefault: 570,
    ovenMin: 220,
    ovenStyleMax: 290,
  },
  // Fitted to 20–25 min at 232 °C (ATK) and 15–20 min at 288 °C (Serious Eats).
  curve: { styleName: 'a Sicilian pan pizza', refTempC: 250, refMinutes: 21, exponent: 1.2, stoneFactor: 0.9 },
  how: {
    shape: [
      { action: 'Generously oil a rimmed baking pan with extra olive oil (not the dough oil).' },
      { action: 'Place the dough in the pan and gently press it out toward the corners; rest 10 minutes if it springs back.' },
    ],
    proof: [
      { action: 'Cover the pan and leave it at room temperature.' },
      { action: 'Press the dough into the corners again once it has relaxed; it is ready when it is puffy and fills the pan.' },
    ],
    temper: [
      { action: 'Cover the pan and leave it at room temperature so the dough warms through and rises.' },
      { action: 'Press the dough into the corners again once it has relaxed; it is ready when it is puffy and fills the pan.' },
    ],
    bake: [
      { action: 'Dimple the dough with oiled fingers, then add sauce and toppings, keeping the edges clear so the crust fries crisp.' },
      { action: 'Bake the pan on the lowest rack until the base is deep golden and the edges are crisp.' },
    ],
  },
});

export const romanRecipe: Recipe = buildStyle({
  id: 'pizza-roman-home',
  name: 'Roman pizza',
  shortName: 'Roman',
  icon: 'recipes/roman.svg',
  description: 'Long, high-hydration pizza alla pala, crisp outside and airy inside.',
  formula: { water: 78, salt: 2.5, oil: 2 },
  // Same-day: 6 h at 24 °C (2 h bulk + 4 h ball proof). Cold: tuned for the scheduler's 48 h.
  yeast: { 'same-day': 0.08, 'cold-ferment': 0.15 },
  timing: { bulk: 120, coldBulk: 60, proof: 240, temper: 180 },
  bounds: { ballWeightGMin: 250, ballWeightGMax: 500, ballWeightGDefault: 300, ovenMin: 230, ovenStyleMax: 290 },
  // 15 min at 250 °C on a tray; about 12 min on a stone.
  curve: { styleName: 'a pizza alla pala', refTempC: 250, refMinutes: 15, exponent: 2.8, stoneFactor: 0.8 },
  how: {
    shape: [
      { action: 'Divide the dough into portions at your target ball weight and dust with flour.' },
      { action: 'Keep the balls loose and untensioned; they should relax rather than spring back.' },
    ],
    bake: [
      { action: 'Stretch the dough thin and long with floured hands, then brush the surface lightly with extra olive oil.' },
      { action: 'Add light toppings, then bake on a preheated stone or tray until the crust is crisp and evenly browned.' },
    ],
  },
});
