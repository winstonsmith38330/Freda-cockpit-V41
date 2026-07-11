# Deploy Beta 0.2.39 on Render

Root Directory:
server

Build Command:
npm install && npx playwright install chromium

Start Command:
node server.js

Health Check Path:
/health

Expected health version:
0.2.39

Notes:
- POS sync parameters are unchanged from V31/V32.
- This patch focuses on product aliasing, shape map reliability, and priority-message guardrails.
