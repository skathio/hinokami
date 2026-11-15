---
name: visual-check
description: Build, serve and screenshot Hinokami at phone and desktop widths in light and dark mode, then inspect the images. Use for every change that affects what renders (components, CSS, index.html, icons, manifest, copy) before calling it done or opening a PR.
---

# Visual check for Hinokami

The app is a static Vite PWA served under `/hinokami/`. Check the production build, not the
dev server: the base path, the service worker and the bundled font only behave as deployed
in `dist/`.

## 1. Build and serve

```sh
npm run build
lsof -iTCP:4173 -sTCP:LISTEN && echo "4173 is taken: stop, do not reuse or kill it"
npm run preview -- --port 4173 --strictPort   # run in the background
```

If port 4173 is already in use, something else owns it. Do not kill it, and do not screenshot
it either. Pick another free port and use that port everywhere below.

URL: **http://localhost:4173/hinokami/** (always use the `/hinokami/` path, because `/` is only a redirect).
Wait until `curl -sf http://localhost:4173/hinokami/` succeeds. Afterwards, stop only this
server: stop the background task you started. Run
`kill $(lsof -t -iTCP:4173 -sTCP:LISTEN)` only if the port was free before you started it. Avoid `pkill -f "vite preview"`. It also kills
other projects' preview servers, and it kills the shell running it, because the shell's
own command line matches the pattern.

## 2. Screenshot with the Playwright MCP server (preferred)

The repo has no Playwright dependency. Use the `mcp__playwright__*` tools, loading them
with ToolSearch if they are deferred. For each width × scheme:

| Name    | `browser_resize`      | `browser_emulate_media` |
|---------|-----------------------|-------------------------|
| phone   | width 390, height 844 | colorScheme `light` / `dark` |
| desktop | width 1280, height 800| colorScheme `light` / `dark` |

1. `browser_resize`, then `browser_emulate_media`, then `browser_navigate` to the URL.
   Once loaded, changing the colour scheme repaints live because the theme toggle defaults to
   **Auto**, so you need not reload.
2. `browser_take_screenshot` with `scale: "css"`, `fullPage: true` and
   `filename: ".playwright-mcp/<screen>-<phone|desktop>-<light|dark>.png"`. The MCP server only
   writes inside the repo, and `.playwright-mcp/` is gitignored, so it never gets committed.
3. **Read every PNG** with the Read tool and look at it. Check: nothing overflows or scrolls
   horizontally at 390 px, text contrast in both themes, the ember buttons, icons loaded
   (a broken image usually means a missing `BASE_URL` prefix), and no layout jump.
4. `browser_console_messages` at level `warning` should be empty.

### Reaching the other screens

- **Recipe select**: the landing page.
- **Config**: `browser_snapshot`, then `browser_click` a recipe card (for example "Neapolitan").
- **Step runner**: on Config, fill the form and press Generate, then start the bake.
  The session persists in localStorage, so a reload lands back on the runner.
- **Forced theme**: the header toggle (Auto / Light / Dark) stores `theme` in
  `hinokami-prefs-v1`. If a previous run left Light or Dark selected, emulated media is
  ignored. Click **Auto**, or run `browser_evaluate` with
`localStorage.removeItem('hinokami-prefs-v1')` and reload. Do not clear all storage: the
origin is shared with anything else served on that port.
- **Stale build**: the service worker can serve the previous bundle after a rebuild. Reload
  twice, or clear site data with `browser_evaluate` and
  `navigator.serviceWorker.getRegistrations().then(r => r.forEach(x => x.unregister()))`,
  then reload.

Screenshot only the screens your change touches, plus the landing page as a smoke check.

## 3. Fallback without the MCP server: headless Chromium CLI

This is the same approach as `scripts/generate-icons.mjs`, using Playwright's cached Chromium.
It only reaches the landing page, because it cannot click.

```sh
CH=$(ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome | sort -V | tail -n 1)
OUT="${OUT:?set OUT to your scratchpad dir}"
for size in 390,844 1280,800; do
  "$CH" --headless=new --no-sandbox --hide-scrollbars --virtual-time-budget=5000 \
    --window-size=$size --screenshot=$OUT/home-${size/,/x}-light.png http://localhost:4173/hinokami/
  "$CH" --headless=new --no-sandbox --hide-scrollbars --virtual-time-budget=5000 --force-dark-mode \
    --window-size=$size --screenshot=$OUT/home-${size/,/x}-dark.png http://localhost:4173/hinokami/
done
```

`--force-dark-mode` sets `prefers-color-scheme: dark`.

## 4. Report in the PR

Attach the screenshots to the PR, or when you cannot upload images, describe each one:
the screen, width, theme, and what you checked. Say which screens you did not check.
Do not commit screenshots.
