// Display preferences (theme, °C/°F) under their own localStorage key. Deliberately outside the
// session store (`store/session.ts`) so a preference never rides through its two-axis migration or
// gets wiped with a session reset. Stored data is untrusted: only known values are accepted, and
// anything else silently falls back to the defaults.

import { useSyncExternalStore } from 'react';

export const PREFS_STORAGE_KEY = 'hinokami-prefs-v1';

export type ThemePref = 'system' | 'light' | 'dark';
export type UnitPref = 'C' | 'F';

export interface Prefs {
  readonly theme: ThemePref;
  readonly unit: UnitPref;
}

export const DEFAULT_PREFS: Prefs = { theme: 'system', unit: 'C' };

const THEMES: ReadonlyArray<ThemePref> = ['system', 'light', 'dark'];
const UNITS: ReadonlyArray<UnitPref> = ['C', 'F'];

/** Parses a raw stored string into prefs, accepting only known values field by field. */
export function parsePrefs(raw: string | null): Prefs {
  if (raw === null) return DEFAULT_PREFS;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_PREFS;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return DEFAULT_PREFS;
  const record = data as Record<string, unknown>;
  const theme = THEMES.find((t) => t === record.theme) ?? DEFAULT_PREFS.theme;
  const unit = UNITS.find((u) => u === record.unit) ?? DEFAULT_PREFS.unit;
  return { theme, unit };
}

export function resolveTheme(theme: ThemePref, systemPrefersDark: boolean): 'light' | 'dark' {
  if (theme === 'system') return systemPrefersDark ? 'dark' : 'light';
  return theme;
}

const THEME_COLOR = { light: '#faf6f1', dark: '#14100e' } as const;

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStored(): Prefs {
  try {
    return parsePrefs(localStorage.getItem(PREFS_STORAGE_KEY));
  } catch {
    return DEFAULT_PREFS;
  }
}

let current: Prefs = readStored();
const listeners = new Set<() => void>();

/** Writes the resolved theme to <html data-theme> and the browser-chrome theme-color. */
export function applyTheme(): void {
  const resolved = resolveTheme(current.theme, systemPrefersDark());
  document.documentElement.setAttribute('data-theme', resolved);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved]);
}

function update(next: Prefs): void {
  current = next;
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked or full: the preference still applies for this page view.
  }
  applyTheme();
  listeners.forEach((listener) => listener());
}

export function setTheme(theme: ThemePref): void {
  update({ ...current, theme });
}

export function setUnit(unit: UnitPref): void {
  update({ ...current, unit });
}

/** Re-reads storage (used by tests and when another tab changes the key). */
export function reloadPrefs(): void {
  current = readStored();
  applyTheme();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, () => current, () => DEFAULT_PREFS);
}

/** Wires system-theme changes and cross-tab edits; called once from `main.tsx`. */
export function initPrefs(): void {
  applyTheme();
  if (typeof window.matchMedia === 'function') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (current.theme === 'system') applyTheme();
    });
  }
  window.addEventListener('storage', (event) => {
    if (event.key === PREFS_STORAGE_KEY) reloadPrefs();
  });
}
