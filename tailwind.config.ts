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
// | red-700      #b91c1c | white       #ffffff   | destructive "Abandon bake" bg + text        | 6.47:1  | 4.5:1  | PASS   |
// | red-600      #dc2626 | white       #ffffff   | destructive bg (hover/pressed) + text       | 4.83:1  | 4.5:1  | PASS   |
// | charcoal-950 #17120f | charcoal-200 #dcd0c2  | page bg + form-field label (no card wrapper)| 12.25:1 | 4.5:1  | PASS   |
// | charcoal-100 #f0e6d8 | charcoal-950 #17120f  | light/neutral CTA hover bg (charcoal-50) + dark text | 17.14:1 | 4.5:1 | PASS |
// | charcoal-950 #17120f | red-400     #f87171   | inline validation error text (role=alert)   | 6.72:1  | 4.5:1  | PASS   |
//
// Iteration 3.3 additions (pre-bake/config screens) — computed for real, same formula/discipline:
// - `charcoal-950`/`charcoal-200` above: `ConfigScreen`/`TemperatureInput`/`BatchInput`/
//   `PathwayToggle` render form-field labels directly on the page bg (no card wrapper), unlike the
//   `charcoal-900`+`charcoal-200` "label text" row above (that one's a card-bg pairing). Still
//   comfortably PASSes — darker bg than the card case, so contrast can only be higher.
// - `charcoal-100`/`charcoal-950` "hover" row: `ConfigScreen`'s Generate button hovers to
//   `charcoal-50` (lighter than the base `charcoal-100`), so hover contrast against the fixed dark
//   text only increases past 15.06:1 — computed for real anyway (17.14:1) rather than asserted by
//   the monotonic argument alone.
// - `red-400` (inline field-error text, `TemperatureInput`/`BatchInput`/`PathwayToggle`/
//   `ConfigScreen`) was left as a raw Tailwind default, same "distinct semantic color" treatment as
//   `amber-*`/destructive `red-700`/`red-600` — verified against the new `charcoal-950` page bg
//   (was previously verified only against the old `zinc-950`, a different, darker hex) since the
//   bg actually changed under it this iteration.
// - **`charcoal-600`, not `charcoal-700`, for text-`<input>` borders**: naive 1:1 `zinc-700` →
//   `charcoal-700` on `ConfigScreen`/`TemperatureInput`/`BatchInput`'s `<input>` elements measures
//   only 1.64:1 against the `charcoal-900` field bg — a real regression below the 3:1 UI-boundary
//   bar. `charcoal-600` is the shade this table's own note already reserves for "borders that ARE
//   part of an interactive element (buttons, inputs, focus rings)" — reused here (already verified
//   above, "card bg + interactive-element border (UI)", 3.15:1).
// - **`charcoal-400`, not `charcoal-500`, for hint/caption text** (`TemperatureInput`'s "Valid
//   range" line, `BatchInput`'s ball-count/weight range lines): `charcoal-500` measures 4.38:1
//   against `charcoal-950` — passes the 3:1 non-text/decorative bar (and is used exactly that way
//   below, for `RecipeSelectScreen`'s hover-border) but fails the 4.5:1 body-text bar this hint text
//   needs. `charcoal-400` is already verified (6.17:1, "muted/caption text") and reused instead.
// - `charcoal-500` as a border: consumed only as `RecipeSelectScreen`'s `hover:border-charcoal-500`
//   on its list-row buttons — a transient, non-text UI-boundary highlight, held to the 3:1 bar, not
//   the 4.5:1 text bar (see previous note). The border sits adjacent to the button's own
//   `charcoal-900` fill, not the page's `charcoal-950` bg behind it — the actually-relevant
//   adjacency is charcoal-900/charcoal-500 = **4.05:1** (PASS); charcoal-950/charcoal-500 = 4.38:1
//   (computed above) is a different, non-adjacent pairing, cited only because it's the same token
//   pair reused for the hint-text deviation two notes up, not because it's this border's own ratio.
//   Both PASS 3:1 regardless, so this is a citation correction (review F-32), not a token change.
// - `border-charcoal-700` on `RecipeSelectScreen`'s list-row buttons, `TemperatureInput`/
//   `PathwayToggle`'s unselected toggle chips, and `UpdatePrompt`'s banner divider are all the same
//   decorative-border case this table already carves out below ("banners, panel containers, list
//   rows") — each control's own text label is what identifies it, not the border, so these aren't
//   held to 3:1.
// - `UpdatePrompt`'s "Reload" button was retoned from a pre-existing raw `red-900`/`red-800` to
//   `ember-500`/`charcoal-950` (design decision, not a 1:1 swap) — "Reload" applies a pending
//   update, not a destructive action, so it doesn't belong with `AbandonConfirmDialog`'s danger-red;
//   as this banner's one action it gets the same accent-CTA pairing already verified above
//   (4.77:1).
//
// Notes:
// - `red-700`/`red-600` above are raw Tailwind defaults (not `charcoal`/`ember` tokens) —
//   `AbandonConfirmDialog.tsx`'s destructive "Abandon bake" button predates this phase and was
//   deliberately left unmigrated (iteration 3.2 diary: distinct danger semantics, kept separate
//   from the neutral/accent system, same treatment as the `amber-*` warning banners). Added here
//   in iteration 3.2 (review F-29) purely to satisfy this phase's exit criterion — a documented
//   ratio for every foreground/background pair actually rendered, including ones that aren't new
//   `charcoal`/`ember` consumers.
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
