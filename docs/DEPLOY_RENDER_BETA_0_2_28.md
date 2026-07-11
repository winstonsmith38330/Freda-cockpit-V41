# Deploy Freda Ops Cockpit Beta 0.2.28 on Render

## Service settings

- Root Directory: `server`
- Build Command: `npm install && npx playwright install chromium`
- Start Command: `node server.js`
- Health Check Path: `/health`

## Required browser-sync env vars

```env
ENABLE_BROWSER_SYNC=true
REPORTING_FORCE_BROWSER_SYNC=true
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_BROWSERS_PATH=0
BROWSER_SYNC_TIMEOUT_MS=45000
REPORTING_REQUEST_DELAY_MS=2500
REPORTING_BROWSER_VIEWS=busy_hours.php,product_sales_summary.php,product_sales.php,dashboard.php,eod_summary.php,daily_sales.php
```

Keep the existing reporting.site credentials/session vars:

```env
REPORTING_COOKIE=...
REPORTING_PHPSESSID=...
REPORTING_EMAIL=...
REPORTING_PASSWORD=...
```

## Validation

1. Open `/health`; expected version is `0.2.28`.
2. Open `/api/diagnostics/browser-sync`; confirm Playwright package and Chromium executable are available.
3. Run browser-only POS sync:

```js
fetch('/api/sync/pos/day-browser', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ reportingDate: '2026-06-22' })
})
.then(async r => {
  const text = await r.text();
  console.log('STATUS:', r.status);
  console.log(text.slice(0, 8000));
});
```

V28 should no longer fail solely because `page.content()` was called while reporting.site was still navigating.
