# Deploy Freda Ops Cockpit Beta 0.2.27 on Render

## Render settings

```text
Root Directory: server
Build Command: npm install && npx playwright install chromium
Start Command: node server.js
Health Check Path: /health
```

Do not use `npm install --omit=optional` for 0.2.27 because Playwright/Chromium is required.

## Required env values

```env
ENABLE_BROWSER_SYNC=true
REPORTING_FORCE_BROWSER_SYNC=true
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_BROWSERS_PATH=0
BROWSER_SYNC_TIMEOUT_MS=45000
REPORTING_REQUEST_DELAY_MS=2500
REPORTING_BROWSER_VIEWS=busy_hours.php,product_sales_summary.php,product_sales.php,dashboard.php,eod_summary.php,daily_sales.php
```

Keep the reporting.site cookie/session values fresh in Render. Do not commit real cookies or API keys to GitHub.

## Validation

1. Open `/health`; expected version is `0.2.27`.
2. Open `/api/config/status`; confirm `browserSync.enabled` is `true`.
3. Open `/api/diagnostics/browser-sync`; confirm:
   - `playwrightPackageAvailable: true`
   - `chromiumTypeAvailable: true`
   - `chromiumExecutableExists: true`
4. Run a browser-only POS test:

```js
fetch('/api/sync/pos/day-browser', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ reportingDate: '2026-06-22' })
})
.then(async r => {
  const text = await r.text();
  console.log('STATUS:', r.status);
  console.log(text.slice(0, 5000));
});
```

Expected diagnostics include:

```text
browser_only_requested
browser_fallback_invoked
playwright_import_ok
chromium_launch_start
chromium_launch_ok
browser_fallback_started
```

If these do not appear, the issue is Build/Playwright installation, not reporting.site parsing.
