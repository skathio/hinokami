// The app shell (Phase 4.1, rewrite from the Phase 1 stub). Owns startup rehydration and routes
// between screens based on the store's `view` field.
//
// Startup rehydration (plan-change, `phases/04-ui-and-wake-lock.md` "Overall UI shell" section,
// added after Phase 3's review): Phase 3's store uses `skipHydration: true` — nothing loads the
// persisted session unless something calls `useSessionStore.persist.rehydrate()`. Skipping this
// call is silent: the app still builds, every OTHER test still passes (Phase 4's own component
// tests mock/reset the store directly), and the dev server looks fine at a glance — but every
// persisted session would be invisibly lost on every reload, defeating FR-9 entirely. This is why
// `App.test.tsx` exercises this path against the real store rather than trusting the call exists.

import { useEffect, useState, type ReactNode } from 'react';
import type { Recipe } from '@/recipes/contract';
import { useSessionStore } from '@/store/session';
import RecipeSelectScreen from '@/ui/RecipeSelectScreen';
import ConfigScreen from '@/ui/ConfigScreen';
import StepRunnerScreen from '@/ui/StepRunnerScreen';
import MigrationNotice from '@/ui/MigrationNotice';
import UpdatePrompt from '@/ui/UpdatePrompt';

function SplashScreen() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas text-ink">
      <p className="text-lg text-muted">Loading your bake…</p>
    </main>
  );
}

export default function App() {
  const [hydrated, setHydrated] = useState(() => useSessionStore.persist.hasHydrated());
  const view = useSessionStore((state) => state.view);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);

  useEffect(() => {
    const unsubscribe = useSessionStore.persist.onFinishHydration(() => {
      // Restores `session`/`migrationNotice` (already applied by this point — see
      // `session.ts`'s custom `storage.getItem`, which runs the P4 two-axis migration check).
      // `view` is deliberately excluded from the persisted slice, so it's reconciled explicitly
      // here rather than by the merge itself.
      useSessionStore.getState().syncViewAfterHydration();
      setHydrated(true);
    });
    void useSessionStore.persist.rehydrate();
    return unsubscribe;
  }, []);

  if (!hydrated) {
    return <SplashScreen />;
  }

  function handleSelectRecipe(recipe: Recipe): void {
    setSelectedRecipe(recipe);
    useSessionStore.getState().setView('config');
  }

  let screen: ReactNode;
  if (view === 'runner') {
    screen = <StepRunnerScreen />;
  } else if (view === 'config' && selectedRecipe) {
    screen = <ConfigScreen recipe={selectedRecipe} />;
  } else {
    // Covers the initial `'recipe-select'` view, and the edge case of landing on `'config'`
    // without a selected recipe (e.g. a hot-reload dropping local component state) — falling
    // back to recipe selection is always safe, never a broken form.
    screen = <RecipeSelectScreen onSelect={handleSelectRecipe} />;
  }

  return (
    <>
      <UpdatePrompt />
      <MigrationNotice />
      {screen}
    </>
  );
}
