# Deploy Render Beta 0.2.31

Render settings:

- Root Directory: `server`
- Build Command: `npm install && npx playwright install chromium`
- Start Command: `node server.js`
- Health Check Path: `/health`

After deploy check `/health` returns version `0.2.31`.

Use **Sync current + last days** in the UI to populate WTD and hourly benchmark dates. Use **Sync selected day only** for a quick refresh of the visible reporting date.
