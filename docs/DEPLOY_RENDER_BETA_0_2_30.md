# Deploy Freda Ops Cockpit Beta 0.2.31 on Render

## Render settings

Root Directory:

```text
server
```

Build Command:

```bash
npm install && npx playwright install chromium
```

Start Command:

```bash
node server.js
```

Health Check Path:

```text
/health
```

## Required browser sync env

```env
ENABLE_BROWSER_SYNC=true
REPORTING_FORCE_BROWSER_SYNC=true
REPORTING_BROWSER_CONTEXT_POST_FIRST=true
REPORTING_FORCE_SELECTED_DATE_POST=true
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_BROWSERS_PATH=0
BROWSER_SYNC_TIMEOUT_MS=45000
REPORTING_REQUEST_DELAY_MS=500
REPORTING_BROWSER_VIEWS=busy_hours.php,product_sales_summary.php,product_sales.php,daily_sales.php
```

## First checks

Open:

```text
/health
```

Expected version:

```json
"version": "0.2.31"
```

Then open:

```text
/api/diagnostics/browser-sync
```

Expected:

```json
"playwrightPackageAvailable": true,
"chromiumExecutableExists": true
```

## Functional test

One store:

```js
fetch('/api/sync/pos/day-browser-store?store=beverly_hills', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ reportingDate: '2026-06-23' })
})
.then(async r => {
  const text = await r.text();
  console.log('STATUS:', r.status);
  console.log(text.slice(0, 8000));
});
```

All stores:

```js
fetch('/api/sync/pos/day-browser', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ reportingDate: '2026-06-23' })
})
.then(async r => {
  const text = await r.text();
  console.log('STATUS:', r.status);
  console.log(text.slice(0, 12000));
});
```

Freda should use the in-app Sync POS now button, not the console.
