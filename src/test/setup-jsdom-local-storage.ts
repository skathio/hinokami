// Node ≥22 ships an experimental global `localStorage` that is inert without a
// `--localstorage-file` CLI flag (accessing it warns and behaves as if nothing is ever stored).
// Vitest's jsdom environment populates `globalThis` from the real jsdom `window` object, but
// skips any key that already exists on Node's `global` unless that key is on its own explicit
// allowlist — `localStorage` isn't on that list, so the bare `localStorage` global in a test (or
// in app code under test, which references it exactly as it would in a real browser) silently
// resolves to Node's non-functional stub instead of jsdom's real `Storage` implementation.
//
// This repoints the global at jsdom's actual storage so `localStorage`/`window.localStorage`
// behave the same as they do in a real browser. Registered once via `vite.config.ts`'s
// `test.setupFiles` so every test file gets a working `localStorage`, not just the store tests
// that first hit this (`src/store/__tests__/session.test.ts`).

declare global {
  // eslint-disable-next-line no-var -- must be `var` to augment `globalThis`
  var jsdom: { window: { localStorage: Storage } } | undefined;
}

if (typeof globalThis.jsdom !== 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    get: () => globalThis.jsdom!.window.localStorage,
    configurable: true,
  });
}
