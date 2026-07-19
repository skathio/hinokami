// Sanity test for the `VitePWA` options this app actually builds with (Phase 5, iteration 5.1 —
// `.somi/plans/hinokami/phases/05-pwa-and-deploy.md`). `vite.config.ts` imports this exact same
// `pwaOptions` object (see `src/pwa/config.ts`'s header comment for why it's factored out), so
// asserting on it here is asserting on the real build-time config, not a duplicate copy that
// could silently drift from what `vite.config.ts` actually uses.
import { describe, expect, it } from 'vitest';
import { pwaOptions } from '../config';

describe('pwaOptions', () => {
  it('registers with prompt, not autoUpdate — avoids a silent SW swap mid-bake', () => {
    expect(pwaOptions.registerType).toBe('prompt');
  });

  it('includes the non-manifest static assets referenced by index.html', () => {
    expect(pwaOptions.includeAssets).toEqual(
      expect.arrayContaining(['favicon.ico', 'apple-touch-icon.png']),
    );
  });

  it('manifest has the required name/theme fields matching the dark theme', () => {
    const manifest = pwaOptions.manifest;
    if (manifest === false || manifest === undefined) {
      throw new Error('expected a manifest object');
    }
    expect(manifest.name).toBe('Hinokami');
    expect(manifest.short_name).toBe('Hinokami');
    expect(manifest.theme_color).toBe('#09090b');
    expect(manifest.background_color).toBe('#09090b');
    expect(manifest.display).toBe('standalone');
  });

  it('manifest icons cover 192/512 plus a maskable 512 entry', () => {
    const manifest = pwaOptions.manifest;
    if (manifest === false || manifest === undefined) {
      throw new Error('expected a manifest object');
    }
    const icons = manifest.icons ?? [];
    expect(icons).toEqual([
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: 'icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ]);
  });

  it('workbox precaches the file types the app actually ships', () => {
    expect(pwaOptions.workbox?.globPatterns).toEqual(['**/*.{js,css,html,ico,png,svg,woff2}']);
  });
});
