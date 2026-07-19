/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { pwaOptions } from './src/pwa/config';

// PWA/offline support (Phase 5, iteration 5.1 — `.somi/plans/hinokami/phases/05-pwa-and-deploy.md`).
// `pwaOptions` lives in `src/pwa/config.ts` so a Vitest test can assert on the same manifest
// object this plugin actually consumes, rather than re-deriving expectations from this file.
export default defineConfig({
  plugins: [react(), VitePWA(pwaOptions)],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
    // Works around a Node ≥22 / Vitest jsdom-environment interaction: Node's own inert global
    // `localStorage` shadows jsdom's real one unless explicitly repointed. See the setup file's
    // header comment (`src/store/session.ts` / Phase 3 is the first module to need a working
    // `localStorage` in tests).
    setupFiles: ['./src/test/setup-jsdom-local-storage.ts', './src/test/setup-rtl.ts'],
  },
});
