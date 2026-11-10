import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFS,
  PREFS_STORAGE_KEY,
  parsePrefs,
  reloadPrefs,
  resolveTheme,
  setTheme,
  setUnit,
} from '../prefs';

describe('parsePrefs (untrusted input)', () => {
  it('accepts known values', () => {
    expect(parsePrefs('{"theme":"dark","unit":"F"}')).toEqual({ theme: 'dark', unit: 'F' });
  });

  it.each([null, '', 'not json', '[]', '42', 'null', '{"theme":"neon","unit":"K"}', '{"theme":{},"unit":1}'])(
    'falls back to defaults for %j',
    (raw) => {
      expect(parsePrefs(raw)).toEqual(DEFAULT_PREFS);
    },
  );

  it('keeps a valid field when the other is invalid', () => {
    expect(parsePrefs('{"theme":"light","unit":"K"}')).toEqual({ theme: 'light', unit: 'C' });
  });
});

describe('resolveTheme', () => {
  it('follows the system for "system" and overrides otherwise', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('prefs store', () => {
  beforeEach(() => {
    localStorage.clear();
    reloadPrefs();
  });

  it('persists under its own key and sets data-theme', () => {
    setTheme('dark');
    setUnit('F');
    expect(JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY) ?? '')).toEqual({ theme: 'dark', unit: 'F' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    setTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
