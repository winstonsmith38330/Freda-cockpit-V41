# Deploy Beta 0.2.39 on Render

Use as a full repo replacement, not a partial patch.

Render settings:

```text
Root Directory: server
Build Command: npm install --no-audit --no-fund && npx playwright install chromium
Start Command: node server.js
Health Check Path: /health
```

Environment:

```env
NODE_VERSION=20.19.0
UPLOAD_MAX_BYTES=209715200
ENABLE_BROWSER_SYNC=true
REPORTING_FORCE_BROWSER_SYNC=true
REPORTING_BROWSER_CONTEXT_POST_FIRST=true
REPORTING_FORCE_SELECTED_DATE_POST=true
POS_SOURCE_POLICY=sync_first_file_backup
POS_EXCEL_BACKUP_ONLY=true
IMPORT_PARSE_TICKET_HISTORY=false
LIVE_FALLBACK_SOURCES=pos
```

After deploy check:

```text
/health
/api/config/status
/api/import/status
```

Expected health version:

```json
"version": "0.2.39"
```

Then test in the UI:

1. Select a known completed date.
2. Click Sync selected day only.
3. Confirm Today / WTD / Hourly Analysis are populated.
4. Click Sync current + last days to populate benchmarks.
