# Deploy Render - Beta 0.2.39

Use the same Render service if possible, but replace the full repo contents with this full V34 package. Do not manually copy only selected folders.

## Render settings

```text
Root Directory: server
Build Command: npm install && npx playwright install chromium
Start Command: node server.js
Health Check Path: /health
```

## Important env variables

Keep existing secrets in Render. Do not paste them into GitHub.

```env
NODE_VERSION=20.18.0
TIMEZONE=Australia/Sydney
ENABLE_BROWSER_SYNC=true
REPORTING_FORCE_BROWSER_SYNC=true
REPORTING_BROWSER_CONTEXT_POST_FIRST=true
REPORTING_FORCE_SELECTED_DATE_POST=true
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_BROWSERS_PATH=0
BROWSER_SYNC_TIMEOUT_MS=45000
REPORTING_REQUEST_DELAY_MS=2500
REPORTING_BROWSER_VIEWS=busy_hours.php,product_sales_summary.php,product_sales.php,dashboard.php,eod_summary.php,daily_sales.php
POS_SOURCE_POLICY=sync_first_file_backup
POS_EXCEL_BACKUP_ONLY=true
UBER_ONLINE_ONLY=true
UBER_FILE_IMPORT_ENABLED=false
UBER_BROWSER_SETTLE_MS=3500
UBER_SYNC_TIMEOUT_MS=25000
```

## After deployment

Check:

```text
/health
/api/config/status
/api/import/status
```

Expected health version:

```json
"version": "0.2.39"
```

## Smoke tests

- Select a date in the app.
- Click `Sync selected day only`.
- Click `Sync current + last days`.
- Check Today, WTD, Hourly Analysis and Production.
- Test WhatsApp upload with a `.txt` export first; if using `.zip`, prefer export without media.
- Test Uber selected day. If it fails, open `/api/diagnostics/uber` and verify fresh cookie/store names.
