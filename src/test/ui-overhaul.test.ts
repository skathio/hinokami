// Rules for the UI overhaul (Tailwind v4, tokens, themes, brand, icons, prefs isolation).
// Written before the build: these checks read the real project files and public exports.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pwaOptions } from '@/pwa/config';
import { SESSION_STORAGE_KEY } from '@/store/session';

const root = path.resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    return statSync(f).isDirectory() ? walk(f) : [f];
  });
}

function pngSize(file: string): { w: number; h: number } {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// --- token parsing -------------------------------------------------------------------------
const css = () => read('src/index.css');

/** Declarations `--color-x: value` inside blocks whose selector matches `want`. */
function tokens(dark: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of css().matchAll(re)) {
    const isDark = /dark/.test(m[1]);
    if (isDark !== dark) continue;
    for (const d of m[2].matchAll(/--color-([a-z0-9-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  }
  return out;
}

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const NAMES = [
  'canvas', 'surface', 'surface-2', 'ink', 'muted', 'line', 'accent', 'accent-soft',
  'ember', 'sun', 'caution', 'danger',
];

describe('Tailwind v4 migration', () => {
  const pkg = JSON.parse(read('package.json'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  it('uses tailwindcss v4 with @tailwindcss/vite', () => {
    expect(String(deps.tailwindcss)).toMatch(/\^?4\./);
    expect(deps['@tailwindcss/vite']).toBeDefined();
    expect(read('vite.config.ts')).toContain('@tailwindcss/vite');
  });

  it('drops autoprefixer and the v3 postcss/tailwind config files', () => {
    expect(deps.autoprefixer).toBeUndefined();
    expect(existsSync(path.join(root, 'postcss.config.ts'))).toBe(false);
    expect(existsSync(path.join(root, 'tailwind.config.ts'))).toBe(false);
  });
});

describe('semantic colour tokens', () => {
  it.each(['light', 'dark'])('defines every semantic token as hex in the %s theme', (theme) => {
    const t = tokens(theme === 'dark');
    for (const n of NAMES) expect(t[n], `${theme} --color-${n}`).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('uses no oklch for brand colours', () => {
    expect(css()).not.toMatch(/oklch/i);
  });

  it('ember is #ff6a2b in the dark theme and sun is gold #f5a524', () => {
    const t = tokens(true);
    expect(t.ember.toLowerCase()).toBe('#ff6a2b');
    expect(t.sun.toLowerCase()).toBe('#f5a524');
  });

  it('SoMi red #cc1111 is never a text or token colour in the app', () => {
    const t = [...Object.values(tokens(false)), ...Object.values(tokens(true))];
    expect(t.map((v) => v.toLowerCase())).not.toContain('#cc1111');
    const files = walk(path.join(root, 'src')).filter((f) => /\.(tsx|css)$/.test(f) && !f.includes('.test.'));
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/text-\[#cc1111\]/i);
  });
});

describe('WCAG AA contrast of text/background pairs', () => {
  const pairs: [string, string][] = [];
  for (const fg of ['ink', 'muted'])
    for (const bg of ['canvas', 'surface', 'surface-2']) pairs.push([fg, bg]);
  pairs.push(['sun', 'canvas'], ['sun', 'surface']);

  for (const theme of ['light', 'dark']) {
    it.each(pairs)(`${theme}: %s on %s is at least 4.5:1`, (fg, bg) => {
      const t = tokens(theme === 'dark');
      expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('dark text on the ember primary action is at least 4.5:1 in dark theme', () => {
    const t = tokens(true);
    expect(contrast(t.canvas, t.ember)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('theme without a flash', () => {
  const html = () => read('index.html');

  it('has an inline pre-paint script that reads prefers-color-scheme', () => {
    const inline = [...html().matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(inline.some((s) => /prefers-color-scheme/.test(s))).toBe(true);
  });

  it('pre-paint script sits before the app module script', () => {
    const h = html();
    expect(h.indexOf('prefers-color-scheme')).toBeGreaterThan(-1);
    expect(h.indexOf('prefers-color-scheme')).toBeLessThan(h.indexOf('/src/main.tsx'));
  });

  it('no longer hard-codes dark via class="dark" or zinc body classes', () => {
    expect(html()).not.toMatch(/class="dark"/);
    expect(html()).not.toMatch(/zinc-/);
  });
});

describe('no third-party CDN or hard-coded zinc', () => {
  it('index.html, css and sources load nothing from a remote origin', () => {
    const files = [
      path.join(root, 'index.html'),
      ...walk(path.join(root, 'src')).filter((f) => /\.(tsx?|css)$/.test(f) && !f.includes('.test.')),
    ];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/(?:src|href)=["']https?:\/\//);
      expect(text, f).not.toMatch(/url\(\s*["']?https?:\/\//);
      expect(text, f).not.toMatch(/@import\s+(?:url\()?["']?https?:\/\//);
      expect(text, f).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
    }
  });

  it('every @font-face source is a woff2 file', () => {
    for (const m of css().matchAll(/@font-face\s*\{([^}]*)\}/g)) {
      for (const u of m[1].matchAll(/url\(\s*["']?([^"')]+)/g)) expect(u[1]).toMatch(/\.woff2(\?.*)?$/);
    }
  });

  it('components no longer hard-code zinc colour classes', () => {
    const files = walk(path.join(root, 'src')).filter((f) => /\.tsx$/.test(f) && !f.includes('.test.'));
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/\b(?:bg|text|border)-zinc-\d+/);
  });
});

describe('prefs are kept out of the session store', () => {
  it('session storage key is unchanged', () => {
    expect(SESSION_STORAGE_KEY).toBe('hinokami-session-v1');
  });

  it('session store source does not mention theme or unit prefs', () => {
    expect(read('src/store/session.ts')).not.toMatch(/theme|fahrenheit/i);
  });
});

describe('brand mark and icons', () => {
  const manifest = () => {
    const m = pwaOptions.manifest;
    if (!m) throw new Error('expected a manifest object');
    return m;
  };

  it('ships an SVG master', () => {
    const svgs = walk(root.concat('/public')).filter((f) => f.endsWith('.svg'));
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('PNG exports have exact pixel sizes', () => {
    expect(pngSize(path.join(root, 'public/apple-touch-icon.png'))).toEqual({ w: 180, h: 180 });
    expect(pngSize(path.join(root, 'public/icons/icon-192.png'))).toEqual({ w: 192, h: 192 });
    expect(pngSize(path.join(root, 'public/icons/icon-512.png'))).toEqual({ w: 512, h: 512 });
  });

  it('maskable icon is a separate 512 file from the regular 512 icon', () => {
    const icons = manifest().icons ?? [];
    const mask = icons.find((i) => i.purpose === 'maskable');
    const any512 = icons.find((i) => i.sizes === '512x512' && i.purpose !== 'maskable');
    expect(mask).toBeDefined();
    expect(any512).toBeDefined();
    expect(mask!.src).not.toBe(any512!.src);
    expect(pngSize(path.join(root, 'public', mask!.src))).toEqual({ w: 512, h: 512 });
  });

  it('manifest colours are valid hex', () => {
    const m = manifest();
    expect(m.theme_color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(m.background_color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
