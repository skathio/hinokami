import type { Config } from 'tailwindcss';

// -----------------------------------------------------------------------------------------------
// Warm design-token layer (recipe-ux-overhaul, Phase 3, iteration 3.1).
//
// Replaces Tailwind's default `zinc` (cool neutral) as the app's dominant surface/text palette
// with a warm neutral scale (`charcoal`) plus a fire-toned accent (`ember`) for primary actions —
// "Hinokami" = fire. These are NEW token names, not an override of the built-in `zinc` palette:
// component files are retoned onto `charcoal-*`/`ember-*` classnames in iterations 3.2/3.3, which
// this iteration does not touch (tokens only, no consumers yet).
//
// WCAG contrast verification — every token pair below is one this iteration's design intends to
// pair as foreground/background (mapped 1:1 onto today's `zinc-*` usage sites, grepped across
// src/ui/*.tsx before choosing these values, so each row corresponds to a real future consumer in
// 3.2/3.3). Computed for real via the WCAG relative-luminance formula
// (https://www.w3.org/WAI/GL/wiki/Relative_luminance), not eyeballed — script kept in the coder's
// scratchpad, not checked in. AA targets: 4.5:1 for body text, 3:1 for large text (≥24px, or
// ≥18.66px bold) and UI-component boundaries (borders/focus rings that are load-bearing for
// perceiving an interactive element — decorative dividers are exempt under WCAG 1.4.11 and are
// called out as such below, not held to the 3:1 bar).
//
// | Background      | Foreground       | Intended use                                   | Ratio   | Target | Result |
// |------------------|-------------------|-------------------------------------------------|---------|--------|--------|
// | charcoal-950 #17120f | charcoal-100 #f0e6d8 | page bg + primary text                     | 15.06:1 | 4.5:1  | PASS   |
// | charcoal-950 #17120f | charcoal-400 #a3927f | page bg + muted/caption text                | 6.17:1  | 4.5:1  | PASS   |
// | charcoal-950 #17120f | charcoal-300 #c2b3a2 | page bg + secondary text                    | 9.08:1  | 4.5:1  | PASS   |
// | charcoal-950 #17120f | charcoal-50  #faf5ee | page bg + emphasis text                     | 17.14:1 | 4.5:1  | PASS   |
// | charcoal-900 #211a16 | charcoal-100 #f0e6d8 | card/dialog bg + primary text               | 13.90:1 | 4.5:1  | PASS   |
// | charcoal-900 #211a16 | charcoal-200 #dcd0c2 | card/dialog bg + label text                 | 11.31:1 | 4.5:1  | PASS   |
// | charcoal-900 #211a16 | charcoal-300 #c2b3a2 | card/dialog bg + secondary text             | 8.39:1  | 4.5:1  | PASS   |
// | charcoal-900 #211a16 | charcoal-400 #a3927f | card/dialog bg + muted text                 | 5.70:1  | 4.5:1  | PASS   |
// | charcoal-800 #2b2320 | charcoal-100 #f0e6d8 | hover bg + button/link text                 | 12.47:1 | 4.5:1  | PASS   |
// | charcoal-800 #2b2320 | charcoal-400 #a3927f | hover bg + muted text                       | 5.11:1  | 4.5:1  | PASS   |
// | charcoal-100 #f0e6d8 | charcoal-950 #17120f | light/neutral CTA bg + dark text            | 15.06:1 | 4.5:1  | PASS   |
// | charcoal-900 #211a16 | charcoal-600 #75675f | card bg + interactive-element border (UI)   | 3.15:1  | 3:1    | PASS   |
// | charcoal-950 #17120f | charcoal-600 #75675f | page bg + interactive-element border (UI)   | 3.42:1  | 3:1    | PASS   |
// | ember-500    #d9591a | charcoal-950 #17120f  | accent CTA bg + dark text                   | 4.77:1  | 4.5:1  | PASS   |
// | ember-600    #b3450f | charcoal-50  #faf5ee  | accent CTA (pressed) bg + light text        | 5.13:1  | 4.5:1  | PASS   |
// | ember-500    #d9591a | charcoal-50  #faf5ee  | accent CTA bg + light text (large-text only)| 3.59:1  | 3:1    | PASS   |
// | charcoal-950 #17120f | ember-400   #e8813f   | page bg + accent text/icon                  | 6.76:1  | 4.5:1  | PASS   |
// | charcoal-900 #211a16 | ember-400   #e8813f   | card bg + accent text/icon                  | 6.24:1  | 4.5:1  | PASS   |
// | charcoal-950 #17120f | ember-500   #d9591a   | page bg + accent focus-ring/border (UI)     | 4.77:1  | 3:1    | PASS   |
// | charcoal-900 #211a16 | ember-500   #d9591a   | card bg + accent focus-ring/border (UI)     | 4.41:1  | 3:1    | PASS   |
//
// Notes:
// - `charcoal-700`/`charcoal-800` also serve as decorative dividers/panel edges (mirroring today's
//   `border-zinc-700`/`border-zinc-800` on banners, panel containers, list rows) — these are NOT
//   load-bearing for perceiving an interactive element, so WCAG 1.4.11 doesn't apply and no ratio
//   is asserted for them; `charcoal-600` is the dedicated shade for borders that ARE part of an
//   interactive element (buttons, inputs, focus rings) and is verified above.
// - `charcoal-500` and `ember-300`/`ember-700` are scale rungs reserved for 3.2/3.3 (gradients,
//   disabled states, subtle tints) with no committed pairing yet — verify contrast for whatever
//   background they land against before shipping, same discipline as this table.
// - Important caveat for whoever consumes `ember-500`/light-text in 3.2/3.3: it only clears AA at
//   large-text size (3.59:1 < 4.5:1). For a normal-size button label on `ember-500`, use
//   `charcoal-950` text (4.77:1) instead, or drop to `ember-600` if pairing with light text.
// -----------------------------------------------------------------------------------------------

// Dark-first product (D1/D2): dark mode is opted into via the `class` strategy so the app
// shell (Phase 4) can force it on by default rather than following OS preference alone.
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm neutral scale — surfaces, borders, and text. Replaces `zinc` as the dominant
        // palette (see comment block above for the contrast verification behind every shade
        // that's paired with another as foreground/background).
        charcoal: {
          50: '#faf5ee',
          100: '#f0e6d8',
          200: '#dcd0c2',
          300: '#c2b3a2',
          400: '#a3927f',
          500: '#8c7768',
          600: '#75675f',
          700: '#4a3d35',
          800: '#2b2320',
          900: '#211a16',
          950: '#17120f',
        },
        // Fire-toned accent — primary actions, focus rings, accent text/icons. "Hinokami" = fire.
        ember: {
          300: '#f0aa74',
          400: '#e8813f',
          500: '#d9591a',
          600: '#b3450f',
          700: '#8a3410',
        },
      },
      fontFamily: {
        // Display/heading font: a warm system serif stack (Georgia-led), paired against the
        // default sans body text for visual distinction. No bundled asset — system fonts only,
        // per the offline-PWA constraint and this iteration's default-to-system-fonts guidance.
        // Consumed via `font-display` on headings starting in 3.2/3.3 (e.g. app title, card/modal
        // headings) — no such usage exists yet, this iteration only defines the token.
        display: ['Georgia', 'Cambria', '"Times New Roman"', 'Times', 'serif'],
      },
      boxShadow: {
        // Elevation for overlay surfaces (modals/dialogs) — a warm-tinted shadow (using
        // `charcoal-950` rather than pure black) rather than relying on borders alone. Not
        // consumed yet; available for 3.2/3.3's modal/dialog retoning.
        elevated: '0 8px 30px -4px rgba(23, 18, 15, 0.65), 0 2px 8px -2px rgba(23, 18, 15, 0.5)',
      },
    },
  },
  plugins: [],
} satisfies Config;
