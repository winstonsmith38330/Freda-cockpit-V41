# Freda Ops Cockpit Beta 0.2.40

Full replacement package focused on the production page, shape totals and remaining-stock/shortage-risk model. POS split sync, Uber/Frieda fallback display and WhatsApp import-folder workflow are preserved from Beta 0.2.39.

## Core rule

POS sync is unchanged from the stable V39 path. Do not regress reporting.site browser POS sync while improving production, shape-risk, Uber, Frieda/Square, WhatsApp or priority messages.

## What changed in 0.2.40

- Adds the four-file production import model:
  - `server/data/imports/production/cook.xlsx`
  - `server/data/imports/production/prod.xlsx`
  - `server/data/imports/production/last_cook.xlsx`
  - `server/data/imports/production/last_prod.xlsx`
- Normalizes production/cook rows with date, store, product/family, shape, quantity, source file, sheet and row metadata.
- Shows selected-date and weekly shape totals for RING, BALL, LONG, SCROLL, APPLE and OTHER/UNMAPPED.
- Shows mapped product families and counts under each shape.
- Adds current-week vs last-week comparison, including selected weekday vs same weekday last week.
- Adds store/shape remaining-stock and shortage-risk table:
  - starting production/cook quantity;
  - sold-to-date estimated units from POS product rows;
  - remaining estimated units;
  - hourly run-rate;
  - projected sell-out time;
  - low/medium/high risk;
  - action recommendation.
- Protects Freda's shape rules:
  - Strawberry Nutella / Strawberry Nutella Cream = RING.
  - Vanilla Slice = RING.
  - Caramel / Caramel Iced = BALL.
  - Cream Finger Bun and Eclairs = LONG.
  - Specials Total = RING unless the latest cook sheet overrides it.
  - BALL share above 35% triggers a mapping warning before volume changes.
- Improves priority briefing to use stock-risk evidence rather than vague production warnings.

## Preserved from 0.2.39

- POS browser split sync by store/date.
- `Sync selected POS day only` and `Sync current + last days` button workflow.
- reporting.site runtime hourly extraction path.
- Uber actual/upload/theoretical fallback priority and 1.35 unit conversion rule.
- Frieda/Square actual/upload/theoretical fallback priority.
- WhatsApp manual upload and GitHub import-folder refresh.
- No real cookies, session IDs or API keys in the package.

## Render settings

```text
Root Directory: server
Build Command: npm install --no-audit --no-fund && npx playwright install chromium
Start Command: node server.js
Health Check Path: /health
```

Use Node 20.19.0.

Expected `/health` version:

```json
{"version":"0.2.40"}
```

## Production import instructions

Place the four files in:

```text
server/data/imports/production/
```

Then deploy or commit to GitHub and click `Reload production files` in the Production tab.

If last week files are missing, the app shows `last week files missing` rather than misleading zeros.

## Deployment checklist

1. Clear Render build cache when switching packages.
2. Confirm `/health` returns `0.2.40`.
3. Confirm `/api/config/status` shows browser sync env present.
4. Run `Sync selected POS day only` for BH, PN and TP.
5. Run `Sync current + last days` for WTD/hourly benchmarks.
6. Click `Reload production files`.
7. Open Production and confirm daily/weekly shape totals, mapped product counts and stock-risk rows.
8. Confirm BALL share is within 30-35%, or that the app warns to check mapping first.
9. Confirm WhatsApp import-folder refresh still reads BH/PN/TP filenames.
