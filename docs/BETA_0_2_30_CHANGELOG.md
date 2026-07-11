# Beta 0.2.31 Changelog

## Purpose
V30 turns the proven V29 browser POS sync into the default operational workflow for Freda and fixes the selected-date / historical-date reliability gaps.

## Fixes
- Rewired the front-end Sync POS / Sync POS now buttons to call the working browser POS endpoint instead of older file-only or server-fetch sync paths.
- The UI now sends the exact visible Reporting date from the date picker at sync time, so stale localStorage dates do not leak into the request.
- POS browser sync runs stores sequentially and saves after each store, so one store timing out cannot lose another store's successful result.
- Normal `/api/sync/pos/day` and `/api/sync/pos` now use the browser path automatically when `ENABLE_BROWSER_SYNC=true`.
- Added browser-context selected-date POST before page-navigation fallback. This sends the requested date directly to reporting.site with the authenticated Chromium session instead of relying only on the reporting.site UI date picker.
- Kept V29 runtime hourly extraction from Busy Hours JavaScript state.
- Kept one-store diagnostic endpoint for fast troubleshooting.

## Main endpoints
- `POST /api/sync/pos/day-browser` — selected-date POS sync for all stores, sequential partial-save mode.
- `POST /api/sync/pos/day-browser-store?store=beverly_hills` — one-store browser POS test.
- `POST /api/sync/pos/day` — now maps to browser POS sync when browser sync is enabled.
- `GET /api/diagnostics/browser-sync` — Playwright/Chromium diagnostic.

## Known limits
- Uber and Frieda/Square still depend on uploaded files or explicit connector credentials.
- Full ticket-level enrichment remains skipped in recent live fallback mode for speed.
- If reporting.site itself returns no data for a selected day/store, V30 will save an empty selected-date page rather than invent data.
