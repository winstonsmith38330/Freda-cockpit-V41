# Beta 0.2.27 Changelog — Forced Browser Sync Diagnostics

Beta 0.2.27 keeps the 0.2.23 busy-hours POST parser and 0.2.26 Playwright support, then makes the browser path explicit and testable.

## What changed

- Adds `/api/sync/pos/day-browser` to bypass normal server fetch and use Playwright/Chromium only.
- Live POS sync now forces the browser path when `ENABLE_BROWSER_SYNC=true`.
- Adds `/api/diagnostics/browser-sync` to confirm Playwright package availability and Chromium executable status.
- Adds browser sync env visibility to `/api/config/status` without exposing secrets.
- Adds visible sync steps before Playwright import, before Chromium launch, after launch, per page navigation, and per accepted page.
- Keeps POS sync-first policy and uploaded POS files as backup only.
- Keeps Uber, Frieda/Square and production data sourced from uploaded files unless explicitly synced.

## Why

Reporting.site/LiteSpeed may reset Render's server-side HTTP connection with `ECONNRESET`. Earlier versions could parse daily sales and busy hours when reporting.site responded, but could not prove that Playwright actually started when the server-side request was reset. This version is designed to prove the browser path and use it directly.

## New test endpoints

```text
GET  /api/diagnostics/browser-sync
POST /api/sync/pos/day-browser
```

## Recommended Render build command

```bash
npm install && npx playwright install chromium
```

Do not use `npm install --omit=optional` for this beta.
