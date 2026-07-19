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
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-950 p-6 text-center text-zinc-100">
        <h1 className="text-2xl font-semibold">No recipes available</h1>
        <p className="max-w-sm text-zinc-400">
          Hinokami doesn&apos;t have any recipes installed yet. Check back after the next update.
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 p-6 text-zinc-100">
      <div className="text-center">
        <h1 className="text-3xl font-semibold">Hinokami</h1>
        <p className="mt-1 text-zinc-400">Choose a recipe to get started.</p>
      </div>
      <ul className="w-full max-w-sm space-y-3">
        {recipes.map((recipe) => (
          <li key={recipe.id}>
            <button
              type="button"
              onClick={() => onSelect(recipe)}
              className="min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-left hover:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              <span className="block text-lg font-medium">{recipe.name}</span>
              <span className="block text-sm text-zinc-400">{recipe.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
