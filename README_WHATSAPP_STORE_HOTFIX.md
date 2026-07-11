# V39 WhatsApp store-detection hotfix patch

This is a targeted patch, not a full V40 package.

Replace only these files in the existing V39 repo:

```text
server/server.js
server/src/whatsappParser.js
web/app.js
```

Then commit and redeploy the same Render service.

## What it fixes

- Detects the store from the TXT filename inside each WhatsApp ZIP.
- Supports filenames containing BH, PN, TP, Beverly, Penrith, Taren Point.
- Applies the detected store to all parsed WhatsApp actions when individual messages do not mention the store.
- Adds a `Clear WhatsApp import` button so the imported actions can be reset before re-uploading.
- Clears the file picker after a successful upload so the same file can be re-selected cleanly.

## What it does not change

- POS sync logic.
- Uber/Frieda fallback logic.
- Render build settings.
- Version number in /health. It remains Beta 0.2.39.

## Deploy

Use the existing V39 Render settings.

```text
Root Directory: server
Build Command: npm install --no-audit --no-fund && npx playwright install chromium
Start Command: node server.js
Health Check Path: /health
NODE_VERSION=20.19.0
```
