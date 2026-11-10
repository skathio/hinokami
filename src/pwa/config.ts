// Single source of truth for the `VitePWA` plugin options (`vite.config.ts`'s Iteration 5.1
// PWA/offline config — `.somi/plans/hinokami/phases/05-pwa-and-deploy.md`). Lives under `src/`
// (not the repo root) so both `vite.config.ts` (the build-time consumer) and a Vitest test file
// (`src/pwa/__tests__/config.test.ts`) can import the exact same object — the alternative,
// asserting on `vite.config.ts`'s resolved plugin internals, is brittle and couples the test to
// `vite-plugin-pwa`'s implementation rather than to this project's own config values.
//
// `registerType: 'prompt'` (not `'autoUpdate'`) is deliberate: it avoids a silent service-worker
// swap mid-bake that could interrupt an active session. `UpdatePrompt.tsx` is the UI half of this
// contract — it surfaces the reload prompt `useRegisterSW` exposes when an update is waiting.
import type { VitePWAOptions } from 'vite-plugin-pwa';

export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'prompt',
  includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mark.svg'],
  manifest: {
    name: 'Hinokami',
    short_name: 'Hinokami',
    description: 'Adaptive pizza workflow for your actual oven',
    theme_color: '#14100e', // canvas token, dark theme (the installed splash is always dark)
    background_color: '#14100e',
    display: 'standalone',
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
  },
};
