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
      className="flex items-start justify-between gap-4 border-b border-line bg-surface px-4 py-3 text-sm text-ink"
    >
      <p>Hinokami has been updated.</p>
      <button
        type="button"
        onClick={handleReload}
        className="min-h-11 shrink-0 rounded-md bg-ember px-4 font-semibold text-on-ember hover:brightness-110"
      >
        Reload
      </button>
    </div>
  );
}
