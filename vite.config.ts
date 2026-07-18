/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// vite-plugin-pwa is installed (package.json) but wired up in Phase 5 (PWA + deploy) —
// Phase 1 is engine + contract only, no service worker yet.
export default defineConfig({
  plugins: [react()],
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
    setupFiles: ['./src/test/setup-jsdom-local-storage.ts'],
  },
});
