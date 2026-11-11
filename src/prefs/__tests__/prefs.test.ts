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
    expect(parsePrefs('{"theme":"dark","unit":"F"}')).toEqual({ ...DEFAULT_PREFS, theme: 'dark', unit: 'F' });
  });

  it.each([null, '', 'not json', '[]', '42', 'null', '{"theme":"neon","unit":"K"}', '{"theme":{},"unit":1}'])(
    'falls back to defaults for %j',
    (raw) => {
      expect(parsePrefs(raw)).toEqual(DEFAULT_PREFS);
    },
  );

  it('keeps a valid field when the other is invalid', () => {
    expect(parsePrefs('{"theme":"light","unit":"K"}')).toEqual({ ...DEFAULT_PREFS, theme: 'light', unit: 'C' });
  });

  it('defaults to sleeping through the night and accepts a valid awake window', () => {
    expect(DEFAULT_PREFS.awakeStartMinute).toBe(7 * 60);
    expect(DEFAULT_PREFS.awakeEndMinute).toBe(23 * 60);
    expect(parsePrefs('{"awakeStartMinute":480,"awakeEndMinute":60}')).toMatchObject({
      awakeStartMinute: 480,
      awakeEndMinute: 60,
    });
  });

  it.each([-1, 1440, 7.5, '420', null])('rejects an out-of-range awake minute %j', (bad) => {
    expect(parsePrefs(JSON.stringify({ awakeStartMinute: bad })).awakeStartMinute).toBe(
      DEFAULT_PREFS.awakeStartMinute,
    );
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
    expect(JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY) ?? '')).toEqual({ ...DEFAULT_PREFS, theme: 'dark', unit: 'F' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    setTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
