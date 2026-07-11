# Deploy Beta 0.2.39 on Render

Use the same POS-stable Render settings:

```text
Root Directory: server
Build Command: npm install --no-audit --no-fund && npx playwright install chromium
Start Command: node server.js
Health Check Path: /health
```

Recommended environment:

```env
NODE_VERSION=20.19.0
UPLOAD_MAX_BYTES=209715200
AUTO_LOAD_IMPORTS_ON_SUMMARY=true
EXTERNAL_THEORETICAL_FALLBACK_ENABLED=true
UBER_THEORETICAL_UPLIFT_FACTOR=1.35
UBER_THEORETICAL_AVG_RSP=5.50
FRIEDA_THEORETICAL_AVG_RSP=8.50
```

After deploy, check:

```text
/health
```

Expected:

```json
"version": "0.2.39"
```

Then test POS first, then verify Uber/Frieda theoretical fallback appears on Today and Live Sales / Ops when actual online/uploaded values are missing.
