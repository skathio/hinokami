// Recipe selection (FR-1). v1's registry has exactly one entry (pizza), but this screen reads
// from `recipeRegistry.list()` rather than hardcoding the pizza recipe, so a second recipe is
// additive (NFR-12) — this screen needs no changes when one is registered. Explicit empty-state
// (FR-1 failure behavior) rather than a blank screen if the registry is ever empty.

import type { Recipe } from '@/recipes/contract';
import { recipeRegistry } from '@/recipes/registry';
import AppHeader from './AppHeader';
import Wordmark from './Wordmark';

export interface RecipeSelectScreenProps {
  onSelect: (recipe: Recipe) => void;
}

export default function RecipeSelectScreen({ onSelect }: RecipeSelectScreenProps) {
  const recipes = recipeRegistry.list();

  if (recipes.length === 0) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-canvas p-6 text-center text-ink">
        <h1 className="text-2xl font-semibold">No recipes available</h1>
        <p className="max-w-sm text-muted">
          Hinokami doesn&apos;t have any recipes installed yet. Check back after the next update.
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col bg-canvas text-ink">
      <AppHeader />
      <div className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
        <div className="flex flex-col items-center text-center">
          <img src={`${import.meta.env.BASE_URL}mark.svg`} alt="" width={112} height={112} className="mb-4" />
          <h1 className="text-5xl">
            <Wordmark />
          </h1>
          <p className="mt-2 text-lg text-muted">Pizza, adapted to your actual oven.</p>
          <p className="mt-1 text-base text-muted">Choose a recipe to get started.</p>
        </div>
        <ul className="w-full max-w-sm space-y-3">
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <button
                type="button"
                onClick={() => onSelect(recipe)}
                className="flex min-h-11 w-full items-center gap-4 rounded-lg border border-line bg-surface p-4 text-left hover:border-ember focus:outline-none focus:ring-2 focus:ring-ember"
              >
                <span className="flex-1">
                  <span className="block font-display text-2xl font-bold">{recipe.name}</span>
                  <span className="block text-sm text-muted">{recipe.description}</span>
                </span>
                <span aria-hidden="true" className="text-2xl text-accent">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
