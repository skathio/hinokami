// RecipeRegistry — enumeration/lookup for the recipes the app knows about (FR-1). The engine
// and UI never import a recipe module directly; they go through the registry so that adding a
// recipe never touches engine code (NFR-12).

import type { Recipe, RecipeId } from './contract';
import { pizzaRecipe } from './pizza';

export interface RecipeRegistry {
  register(recipe: Recipe): void;
  lookup(id: RecipeId): Recipe | undefined;
  list(): ReadonlyArray<Recipe>;
}

/** Factory, not just a singleton — keeps tests isolated from each other and from whatever the
 * app registers into the shared instance below. */
export function createRecipeRegistry(): RecipeRegistry {
  const recipes = new Map<RecipeId, Recipe>();

  return {
    register(recipe) {
      if (recipes.has(recipe.id)) {
        throw new Error(`RecipeRegistry: id "${recipe.id}" is already registered`);
      }
      recipes.set(recipe.id, recipe);
    },
    lookup(id) {
      return recipes.get(id);
    },
    list() {
      return Array.from(recipes.values());
    },
  };
}

/** The app-wide registry. Phase 2's pizza recipe registers itself here; Phase 4's UI reads
 * from it via `list()`/`lookup()`. */
export const recipeRegistry: RecipeRegistry = createRecipeRegistry();

recipeRegistry.register(pizzaRecipe);
