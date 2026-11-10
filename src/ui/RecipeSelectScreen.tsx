// Recipe selection (FR-1). v1's registry has exactly one entry (pizza), but this screen reads
// from `recipeRegistry.list()` rather than hardcoding the pizza recipe, so a second recipe is
// additive (NFR-12) — this screen needs no changes when one is registered. Explicit empty-state
// (FR-1 failure behavior) rather than a blank screen if the registry is ever empty.

import type { Recipe } from '@/recipes/contract';
import { recipeRegistry } from '@/recipes/registry';

export interface RecipeSelectScreenProps {
  onSelect: (recipe: Recipe) => void;
}

export default function RecipeSelectScreen({ onSelect }: RecipeSelectScreenProps) {
  const recipes = recipeRegistry.list();

  if (recipes.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-charcoal-950 p-6 text-center text-charcoal-100">
        <h1 className="text-2xl font-semibold">No recipes available</h1>
        <p className="max-w-sm text-charcoal-400">
          Hinokami doesn&apos;t have any recipes installed yet. Check back after the next update.
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-charcoal-950 p-6 text-charcoal-100">
      <div className="text-center">
        <h1 className="text-3xl font-semibold">Hinokami</h1>
        <p className="mt-1 text-charcoal-400">Choose a recipe to get started.</p>
      </div>
      <ul className="w-full max-w-sm space-y-3">
        {recipes.map((recipe) => (
          <li key={recipe.id}>
            <button
              type="button"
              onClick={() => onSelect(recipe)}
              // `border-charcoal-700` — a list-row border (tailwind.config.ts's own decorative-
              // divider carve-out names "list rows" explicitly), not held to the 3:1 interactive-
              // border bar since the row's text content already identifies it as a control.
              // `hover:border-charcoal-500`/`focus:ring-charcoal-400` are transient highlight states,
              // both comfortably above 3:1 against this `charcoal-900` card bg (4.05:1 / 5.70:1;
              // charcoal-500 measures 4.38:1 against the page's charcoal-950, a different, non-
              // adjacent pairing — see tailwind.config.ts's contrast table for both figures).
              className="min-h-11 w-full rounded-lg border border-charcoal-700 bg-charcoal-900 p-4 text-left hover:border-charcoal-500 focus:outline-none focus:ring-2 focus:ring-charcoal-400"
            >
              <span className="block text-lg font-medium">{recipe.name}</span>
              <span className="block text-sm text-charcoal-400">{recipe.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
