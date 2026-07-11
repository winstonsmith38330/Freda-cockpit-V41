# Deploy Beta 0.2.39 on Render

Render settings stay the same as V31:

- Root Directory: `server`
- Build Command: `npm install && npx playwright install chromium`
- Start Command: `node server.js`
- Health Check Path: `/health`

After deploy, check `/health` and confirm:

```json
"version": "0.2.39"
```

## Uber online variables

Keep a fresh `UBER_COOKIE` from Uber Manager.

V32 uses online Uber sync by default:

```env
UBER_ONLINE_ONLY=true
UBER_FILE_IMPORT_ENABLED=false
UBER_BROWSER_SETTLE_MS=3500
```

Use `Sync Uber online selected day` for one day, or `Sync Uber online WTD` to populate selected day, WTD prior days, same weekday last week and 4-week benchmark dates.
