# Deploy Beta 0.2.39 on Render

Use this package as a full repo replacement.

```text
Root Directory: server
Build Command: npm install --no-audit --no-fund && npx playwright install chromium
Start Command: node server.js
Health Check Path: /health
```

Required env:

```env
NODE_VERSION=20.19.0
ENABLE_BROWSER_SYNC=true
REPORTING_FORCE_BROWSER_SYNC=true
UPLOAD_MAX_BYTES=209715200
AUTO_LOAD_IMPORTS_ON_SUMMARY=true
EXTERNAL_THEORETICAL_FALLBACK_ENABLED=true
UBER_THEORETICAL_UPLIFT_FACTOR=1.35
```

After deploy, check `/health` and expect:

```json
"version": "0.2.39"
```
