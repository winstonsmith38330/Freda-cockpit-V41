# Beta 0.2.39 - Dependency-safe POS split sync package

## Purpose

This release fixes the Render runtime dependency issue seen in V38 (`Cannot find package express`).

## What changed

- Removed committed `server/node_modules` from the package.
- Removed stale `server/package-lock.json`.
- Kept V38 POS split-sync behavior.
- Kept V37 Uber/Frieda theoretical fallback display.
- Added a root `package.json` safety wrapper in case Render root directory is not set correctly.
- POS remains reporting.site-first with browser/Playwright fallback.

## Deploy

Preferred Render setup remains: Root Directory `server`, Build Command `npm install --no-audit --no-fund && npx playwright install chromium`, Start Command `node server.js`.

If Root Directory is blank by mistake, use Build Command `npm run render-build` and Start Command `npm start`.
