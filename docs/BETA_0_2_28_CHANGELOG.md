# Beta 0.2.28 Changelog — Browser Navigation Stabilizer

Beta 0.2.28 keeps the 0.2.27 forced Playwright browser-sync path, then fixes the next failure seen in Render:

`page.content: Unable to retrieve content because the page is navigating and changing the content.`

## Changes

- Keeps sync-first POS policy and the 0.2.23 busy-hours POST parser.
- Keeps `/api/diagnostics/browser-sync` and `/api/sync/pos/day-browser`.
- Adds navigation-stable HTML capture for Playwright pages.
- Uses explicit navigation races after date-range form submission.
- Waits for DOM readiness and network quiet, but does not fail just because the page never becomes fully idle.
- Captures `document.documentElement.outerHTML` with retries instead of relying only on `page.content()`.
- Calls `window.stop()` as a last resort before reading HTML if reporting.site keeps navigating.
- Adds a best-effort browser login step using `REPORTING_EMAIL` and `REPORTING_PASSWORD` when the browser lands on `index.php`.

## Why

V27 proved that Playwright and Chromium were installed and launching correctly. After refreshing cookies, reporting.site no longer showed only the login page, but the page continued navigating while the app tried to read HTML. V28 stabilizes that browser capture step.

## Render build command

Use:

```bash
npm install && npx playwright install chromium
```

Do not use `npm install --omit=optional` for this browser-sync build.
