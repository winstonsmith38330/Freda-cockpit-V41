# Deploy Freda Ops Cockpit Beta 0.2.40 on Render

## Render settings

```text
Root Directory: server
Build Command: npm install --no-audit --no-fund && npx playwright install chromium
Start Command: node server.js
Health Check Path: /health
```

## Required environment baseline

```env
NODE_VERSION=20.19.0
TIMEZONE=Australia/Sydney
ENABLE_BROWSER_SYNC=true
REPORTING_FORCE_BROWSER_SYNC=true
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_BROWSERS_PATH=0
BROWSER_SYNC_TIMEOUT_MS=45000
REPORTING_REQUEST_DELAY_MS=2500
UPLOAD_MAX_BYTES=209715200
AUTO_LOAD_IMPORTS_ON_SUMMARY=true
EXTERNAL_THEORETICAL_FALLBACK_ENABLED=true
UBER_THEORETICAL_UPLIFT_FACTOR=1.35
UBER_THEORETICAL_AVG_RSP=5.50
FRIEDA_THEORETICAL_AVG_RSP=8.50
```

Do not paste secrets into docs or source code. If any cookie or key was exposed, rotate it.

## Expected health response

`/health` should return version `0.2.40`.

## Post-deploy tests

1. `/api/config/status` shows browser sync available.
2. `Sync selected POS day only` saves BH, PN and TP one by one.
3. `Sync current + last days` populates selected date, WTD previous days and four same-weekday benchmark dates.
4. `Reload production files` loads the four production files.
5. Production tab shows daily/weekly shape totals and mapped product counts by shape.
6. Stock-risk table shows remaining quantity and shortage risk only when both production and POS product data are available.
7. WhatsApp GitHub import refresh still reads BH/PN/TP filenames.
