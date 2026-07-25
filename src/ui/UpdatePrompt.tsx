// Non-blocking "a new version is available" banner (Phase 5, iteration 5.1 —
// `.somi/plans/hinokami/phases/05-pwa-and-deploy.md`). Backed by `vite-plugin-pwa`'s React
// integration (`virtual:pwa-register/react`'s `useRegisterSW`), which pairs with
// `vite.config.ts`'s `registerType: 'prompt'` (see `src/pwa/config.ts`): the plugin never swaps
// the active service worker on its own — it waits for `updateServiceWorker(true)` to be called,
// which this banner's "Reload" button does. That's deliberate: an app auto-updating mid-bake
// could interrupt an active session. Mounted once at the top of `App.tsx`, alongside
// `MigrationNotice` — same "always-visible banner above whichever screen is active" convention.

import { useRegisterSW } from 'virtual:pwa-register/react';

export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      // A failed SW registration shouldn't break the app — it just means offline support isn't
      // active this session. Logged for diagnosis, never surfaced as a blocking error.
      console.error('Service worker registration failed', error);
    },
  });

  if (!needRefresh) return null;

  function handleReload(): void {
    // `true` = skip waiting + reload, per `virtual:pwa-register/react`'s contract.
    void updateServiceWorker(true);
  }

  return (
    <div
      role="status"
      className="flex items-start justify-between gap-4 border-b border-charcoal-700 bg-charcoal-900 px-4 py-3 text-sm text-charcoal-200"
    >
      <p>Hinokami has been updated.</p>
      <button
        type="button"
        onClick={handleReload}
        // Retoned from the pre-existing raw `red-900`/`red-800` to the warm accent (iteration 3.3
        // design decision, not a 1:1 shade swap): "Reload" applies a pending update — it isn't a
        // destructive action, so it doesn't belong in the danger-red family
        // `AbandonConfirmDialog.tsx` reserves for that semantic (3.2 diary). It's this banner's one
        // action, i.e. a primary CTA, so it gets the same `ember-500`/`charcoal-950` pairing the
        // runner's CTAs use (tailwind.config.ts, 4.77:1); `hover:bg-ember-400` only increases
        // contrast further (lighter shade, same fixed dark text).
        className="min-h-11 shrink-0 rounded-md bg-ember-500 px-4 font-medium text-charcoal-950 hover:bg-ember-400"
      >
        Reload
      </button>
    </div>
  );
}
