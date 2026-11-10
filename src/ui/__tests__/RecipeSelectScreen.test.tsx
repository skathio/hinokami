import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RecipeSelectScreen from '../RecipeSelectScreen';
import { recipeRegistry } from '@/recipes/registry';
import { pizzaRecipe } from '@/recipes/pizza';

afterEach(() => {
  vi.restoreAllMocks();
});

function cardIcon(name: string): string | null {
  return screen.getByText(name, { exact: true }).closest('button')!.querySelector('img')!.getAttribute('src');
}

describe('RecipeSelectScreen', () => {
  it('lists each recipe by its short name, with its own icon', () => {
    render(<RecipeSelectScreen onSelect={() => {}} />);
    for (const [short, icon] of [
      ['Neapolitan', 'recipes/neapolitan.svg'],
      ['Sicilian', 'recipes/sicilian.svg'],
      ['Roman', 'recipes/roman.svg'],
    ]) {
      expect(cardIcon(short)).toMatch(new RegExp(`${icon}$`));
    }
    expect(screen.queryByText('Neapolitan-style pizza')).toBeNull();
  });

  it('falls back to the full name and the app mark', () => {
    const { shortName: _s, icon: _i, ...bare } = pizzaRecipe;
    vi.spyOn(recipeRegistry, 'list').mockReturnValue([bare]);
    render(<RecipeSelectScreen onSelect={() => {}} />);
    expect(cardIcon('Neapolitan-style pizza')).toMatch(/\/mark\.svg$/);
  });

  it('ships an icon file for every registered recipe', () => {
    for (const recipe of recipeRegistry.list()) {
      expect(recipe.icon, recipe.name).toBeDefined();
      expect(existsSync(resolve('public', recipe.icon!)), recipe.icon).toBe(true);
    }
  });
});
