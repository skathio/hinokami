# Hinokami

A pizza helper PWA: pick a style (Neapolitan, Sicilian, Roman), enter batch, oven and target
time, and it schedules dough, fermentation and bake steps backwards from when you want to eat,
then runs them step by step. React 19 + TypeScript + Vite + Tailwind 4 + zustand, offline via
vite-plugin-pwa. No backend: all state lives in the browser's localStorage. Deployed to GitHub
Pages at https://skathio.github.io/hinokami/.

## Commands (verified, Node 24 in CI; works on Node 26 locally)

```sh
npm ci            # install from package-lock.json
npm test          # vitest run --coverage (jsdom); ~15 s; writes coverage/lcov.info
npm run build     # tsc -b && vite build -> dist/ (type-check is part of the build)
npm run preview   # serve dist/ on http://localhost:4173/hinokami/
npm run dev       # dev server (Vite default port 5173, printed on start) under /hinokami/
npx vitest run src/engine/__tests__/schedule.test.ts   # one file
```

There is no lint script and no formatter config. `tsc -b` (inside `npm run build`) is the
type gate, with `strict`, `noUnusedLocals` and `noUnusedParameters`, so unused code fails
the build.

## Layout

- `src/engine/`: pure scheduling core (scaling, backward schedule solve, progression,
  persistence/migration). No React, no I/O. Public surface is `src/engine/index.ts`.
- `src/recipes/contract.ts`: the `Recipe` interface, the seam between engine and recipes
  (`CONTRACT_VERSION`). `conformance.ts` is the shared suite every recipe must pass.
  `registry.ts` registers recipes; the UI and engine never import a recipe module directly.
- `src/recipes/pizza/`: Neapolitan (`index.ts`, owns `PIZZA_CONTENT_VERSION`) and the
  Sicilian/Roman style variants (`styles.ts`) that reuse its stages.
- `src/store/session.ts`: zustand store for the active bake, persisted to localStorage with
  `skipHydration`. `App.tsx` must call `persist.rehydrate()`; `App.test.tsx` guards that.
- `src/prefs/prefs.ts`: theme and °C/°F prefs under their own key `hinokami-prefs-v1`.
- `src/ui/`: screens (`RecipeSelectScreen` → `ConfigScreen` → `StepRunnerScreen`) and
  components. `src/hooks/`: wake lock, modal focus, reveal.
- `src/pwa/config.ts`: the PWA manifest/options, imported by `vite.config.ts` and its test.
- `index.html`: an inline pre-paint script sets `<html data-theme>` from prefs or
  `prefers-color-scheme`. Keep it in step with `src/prefs/prefs.ts`.
- `src/index.css`: Tailwind 4 `@theme` colour tokens, with dark values under `[data-theme="dark"]`.
- `scripts/generate-icons.mjs`: regenerates PNG/ICO icons from `public/mark*.svg` using a local
  Chromium (`CHROME=/path/to/chrome node scripts/generate-icons.mjs`).
- Tests sit beside the code in `__tests__/`. The `@/` alias maps to `src/`.

## Rules that are easy to break

- **Session shape changes**: bump `CURRENT_SCHEMA_VERSION` in `src/engine/persistence.ts` and add
  a `SCHEMA_MIGRATIONS` step. Persisted data is untrusted: validate it, never cast it.
- **Recipe timings, steps or oven logic**: bump `PIZZA_CONTENT_VERSION` in
  `src/recipes/pizza/index.ts`. The Sicilian and Roman variants share it.
- **New recipe**: implement `Recipe`, register it in `registry.ts`, and call
  `runConformanceSuite` from its test file.
- **Base path**: the site is served under `/hinokami/` (`base` in `vite.config.ts`). Use
  `%BASE_URL%` in `index.html` and `import.meta.env.BASE_URL` in code, never a bare `/asset`.
- **Time in tests**: anything that touches "now" or awake hours (07:00–23:00 default) must fake
  `Date` at a fixed *local* time (see `src/ui/__tests__/ConfigScreen.test.tsx`). Tests that
  read the real clock pass or fail depending on when CI runs.
- **Colours**: use the theme tokens (`bg-canvas`, `text-ink`, `text-muted`, `bg-ember`, …), not
  raw hex, so both themes stay correct.
- `.somi/` is local tooling state (gitignored, absent in CI and for other contributors). Do not
  add new references to it in code, comments or docs; some older comments (`vite.config.ts`)
  still cite `.somi/plans/…` paths that readers cannot open.

## Visual testing (required)

Any change that affects what renders (components, CSS, `index.html`, icons, PWA manifest,
copy) must be checked visually before it is called done. Build and serve the production
bundle, screenshot every affected screen at **phone (390×844) and desktop (1280×800)**
widths in **light and dark**, look at each image, and put the screenshots, or a precise
description of them, in the PR. Exact steps: `.claude/skills/visual-check/SKILL.md`.
Unit tests in jsdom do not cover layout or colour.

## CI and deploy

- `.github/workflows/ci.yml` runs on every PR, on every push to `main` (a merged PR) and on
  manual dispatch. Its `ci` job calls the pinned reusable workflow
  `skathio/hashira/.github/workflows/static-webapp-ci.yml@<sha>` (hashira v3): `npm ci`,
  `npm run build`, `npm test` with a sticky coverage comment, a scan suite (osv, gitleaks,
  dependency-review; CodeQL and actionlint are off by default) and SoMi's quality gate, which
  fails a PR whose changed code breaks the strict quality limits.
- Its `deploy` job is skipped on PRs; on `main` it deploys `dist/` to GitHub Pages. Merging is
  the approval, and there is no separate release step or tag.
- `.github/workflows/homepage.yml` pings the org homepage when `.github/homepage.json` or
  `public/mark.svg` changes on main.
- When bumping the hashira pin, update both SHAs in `ci.yml` together: the reusable workflow
  `uses:` and the `pages-deploy` action `uses:` (`grep -rn hashira .github/workflows`). v3 checks
  its own actions out at its own commit, so there is no `library_ref` input any more.
- Dependabot opens weekly grouped npm and actions PRs.

## Conventions

- Branches: `feat/…`, `fix/…`, `ci/…`, `chore/…`. Open a PR against `main` and do not push to `main`.
- Commit subjects are short, imperative and sentence-case, saying what changed for the user
  (for example "Bake the base first and add the mozzarella late"). The body explains why.
- Follow `.github/PULL_REQUEST_TEMPLATE.md`, including its checklist.
- Comments explain *why*, and that is the dominant style in this codebase.
