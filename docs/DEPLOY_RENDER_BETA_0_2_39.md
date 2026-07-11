# Deploy Beta 0.2.39 on Render

Preferred settings:

```text
Root Directory: server
Build Command: npm install --no-audit --no-fund && npx playwright install chromium
Start Command: node server.js
Health Check Path: /health
NODE_VERSION=20.19.0
```

Alternative if Root Directory is blank:

```text
Root Directory: <blank>
Build Command: npm run render-build
Start Command: npm start
Health Check Path: /health
NODE_VERSION=20.19.0
```

Use clear build cache after replacing the repo contents.
