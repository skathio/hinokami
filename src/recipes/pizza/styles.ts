// Sicilian and Roman pizza — style variants of the Neapolitan recipe. They reuse its stage list,
// stage timing and content (`pizzaRecipe`) and override only what differs by style: the
// formula, input bounds, the shape/bake instructions and the oven-adaptation curve. Pathway ids
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
} from '../contract';
import { pizzaBounds, pizzaRecipe } from './index';

const BAKE_EXPONENT = 2.8;
const LOW_TEMP_CAVEAT =
  'Results may be pale/undercooked at this temperature — consider preheating longer and ' +
  'baking on the lowest rack.';

interface BakeCurve {
  readonly styleName: string;
  readonly refTempC: number;
  readonly refMinutes: number;
  readonly stoneFactor: number;
}

/** `bakeTime = refMinutes × (refTempC / bakeTempC)^2.8 × (hasStone ? stoneFactor : 1)`, capped
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
      (curve.refTempC / bakeTempC) ** BAKE_EXPONENT *
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

/** Same ingredients with the style's water/salt/oil; yeast follows the base pathway's level. */
function formulaFor(
  base: BakersPercentageFormula,
  style: { water: number; oil: number },
): BakersPercentageFormula {
  const ingredients = base.ingredients.map((i) =>
    i.name === 'Water' ? { ...i, percent: style.water } : i,
  );
  return { ingredients: [...ingredients, { name: 'Olive oil', percent: style.oil }] };
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
  water: number;
  oil: number;
  bounds: Partial<RecipeBounds>;
  curve: BakeCurve;
  how: Record<string, HowStep[]>;
}): Recipe {
  const bounds: RecipeBounds = { ...pizzaBounds, ...opts.bounds };
  const pathways: Pathway[] = pizzaRecipe.pathways.map((p) => ({
    ...p,
    formula: formulaFor(p.formula ?? pizzaRecipe.formula, opts),
  }));
  return {
    ...pizzaRecipe,
    id: createRecipeId(opts.id),
    name: opts.name,
    shortName: opts.shortName,
    icon: opts.icon,
    description: opts.description,
    formula: formulaFor(pizzaRecipe.formula, opts),
    pathways,
    bounds,
    stages: withHow(pizzaRecipe.stages, { mix: mixWithOil(), ...opts.how }),
    adaptBake: makeAdaptBake(bounds, opts.curve),
  };
}

export const sicilianRecipe: Recipe = buildStyle({
  id: 'pizza-sicilian-home',
  name: 'Sicilian pizza',
  shortName: 'Sicilian',
  icon: 'recipes/sicilian.svg',
  description: 'Thick, airy, oily-crisp pan pizza with same-day and cold-ferment paths.',
  water: 72,
  oil: 4,
  // Pan-sized dough: one or two pans, each holding a large single piece.
  bounds: { ballCountMin: 1, ballCountMax: 2, ballWeightGMin: 500, ballWeightGMax: 900, ovenStyleMax: 250 },
  curve: { styleName: 'a Sicilian pan pizza', refTempC: 230, refMinutes: 20, stoneFactor: 0.9 },
  how: {
    shape: [
      { action: 'Generously oil a rimmed baking pan with extra olive oil (not the dough oil).' },
      { action: 'Place the dough in the pan and gently press it out toward the corners; rest 10 minutes if it springs back.' },
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
  description: 'Thin, crisp, high-hydration Roman-style dough with same-day and cold-ferment paths.',
  water: 70,
  oil: 2,
  bounds: { ovenStyleMax: 260 },
  curve: { styleName: 'a Roman-style pizza', refTempC: 250, refMinutes: 10, stoneFactor: 0.85 },
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
