# Freda Ops Cockpit - Immutable Project Knowledge

_Last updated: 2026-06-29_

This file captures the stable project knowledge that should not be forgotten or overwritten when generating future Freda Ops Cockpit packages, fixes, emails, or production sheets.

Use this as the baseline context for the LA Donuts / Freda Ops Cockpit project.

---

## 1. Project purpose

The Freda Ops Cockpit is a mobile-first operations cockpit for Freda / LA Donuts.

The goal is to give Freda and the stores a practical daily tool to monitor:

- POS sales by store.
- Week-to-date sales.
- Hourly sales pattern.
- Product and category mix.
- Production plan versus sales demand.
- Shape mix, especially BALL versus RING/LONG.
- Uber sales, eventually synced online rather than from Excel.
- Frieda's Pies / Square sales, once proper Square access is available.
- Priority operational messages that are precise and action-oriented.

The cockpit should support real operational decisions, not just display data.

Primary operating questions:

- Are we selling faster or slower than usual?
- Are we at risk of running out of key products?
- Are we overproducing weak sellers?
- Is the mix moving toward balls, rings, specials, boxes, drinks, or other categories?
- Is production aligned with actual demand?
- What should the stores or production team do now?

---

## 2. Stores and channels

Core LA Donuts stores:

- Beverly Hills, often abbreviated BH.
- Penrith, often abbreviated PN.
- Taren Point, often abbreviated TP.

Separate channel / entity:

- Frieda's Pies, which should be treated as Square-only once Square access is available.

Sales channels:

- In-store POS from reporting.site.
- Uber Eats, online sync targeted; Excel workbook should not be the long-term source.
- Square for Frieda's Pies, pending access.

Do not merge Frieda's Pies into the LA Donuts POS stores.

---

## 3. Render deployment constants

Render settings should remain:

```text
Root Directory: server
Build Command: npm install && npx playwright install chromium
Start Command: node server.js
Health Check Path: /health
```

Do not use `node server.js` as the build command. That causes dependency errors such as missing `express`.

Do not use `npm install --omit=optional` for Playwright/browser versions because Chromium must be installed.

Expected health response should include the current version, for example:

```json
"version": "0.2.33"
```

The app runs as a Node/Express service and serves the static web app from the `web` directory.

Persistent/runtime live state is stored in:

```text
server/data/live-snapshots.json
```

On a new Render service or clean deployment, live synced state may be empty until a sync has been run.

---

## 4. Required environment variables - no secret values

Never include real secret values in package documentation, README files, markdown files, or chat replies.

Important env variables:

```env
NODE_VERSION=20.18.0
APP_TIMEZONE=Australia/Sydney
ALLOWED_ORIGINS=<current Render URL>
APP_PUBLIC_URL=<current Render URL>

REPORTING_COOKIE=<full reporting.site cookie header>
REPORTING_PHPSESSID=<session id only>
REPORTING_EMAIL=<reporting.site email>
REPORTING_PASSWORD=<reporting.site password>

ENABLE_BROWSER_SYNC=true
REPORTING_FORCE_BROWSER_SYNC=true
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_BROWSERS_PATH=0
BROWSER_SYNC_TIMEOUT_MS=45000
REPORTING_REQUEST_DELAY_MS=2500
REPORTING_BROWSER_VIEWS=busy_hours.php,product_sales_summary.php,product_sales.php,dashboard.php,eod_summary.php,daily_sales.php

POS_SOURCE_POLICY=sync_first_file_backup
POS_EXCEL_BACKUP_ONLY=true
IMPORT_PARSE_TICKET_HISTORY=false
ENABLE_LIVE_FALLBACK=true
LIVE_FALLBACK_DAYS=10
LIVE_FALLBACK_SOURCES=pos
POS_DAY_TIMEOUT_MS=45000
REPORTING_SYNC_TIMEOUT_MS=45000
DEFAULT_REPORTING_DATE_MODE=today

UBER_COOKIE=<Uber cookie>
UBER_ONLINE_ONLY=true
UBER_FILE_IMPORT_ENABLED=false
UBER_BROWSER_SETTLE_MS=3500
UBER_SYNC_TIMEOUT_MS=25000

SQUARE_ACCESS_TOKEN=<pending>
SQUARE_LOCATION_ID=<pending>
SQUARE_ENVIRONMENT=production
```

If real keys, cookies, sessions, or passwords are pasted in chat, advise rotating them.

---

## 5. POS data source policy

The POS source policy is critical and must not regress.

Current POS policy:

- POS live sync from reporting.site is primary.
- POS Excel/CSV files are backup only.
- Do not rely on uploaded Excel for POS hourly or product sales if online sync is available.
- Ticket-history CSVs are large and should not be parsed by default.
- The app should use sync-first-file-backup behavior.

Important principle:

```text
Reporting.site sync first, uploaded files as fallback only.
```

This applies especially to:

- Hourly sales.
- Product sales.
- Store status.
- WTD sales.
- Hourly benchmarks.

---

## 6. reporting.site POS sync behavior

reporting.site can reject or reset normal server-side HTTP requests. Earlier versions failed with:

```text
ECONNRESET
```

The reliable workaround is the Playwright/Chromium browser sync path.

Browser sync must remain enabled.

Key reporting.site pages:

```text
busy_hours.php
product_sales_summary.php
product_sales.php
dashboard.php
eod_summary.php
daily_sales.php
```

Important discovery:

- `busy_hours.php` uses a POST form, not a simple GET date query.
- The form field is `filters[date_range]`.
- Date format example: `June 23, 2026 - June 23, 2026`.
- Busy Hours data can appear inside JavaScript runtime variables, not only static HTML.

Important runtime arrays / objects to capture when possible:

```text
RAW_HOURS
SERIES_REVENUE
SERIES_TX
HOUR_REVENUE_TOTALS
HOUR_TX_TOTALS
CROSS_BODY
ApexCharts runtime configs
```

The successful V29 proof for Beverly Hills on 2026-06-23 captured:

```text
runtimeHourlyRows: 12
runtimeSource: runtime-hour-totals
hourlySalesTotal: 4816.5
```

This proved the runtime-hourly extraction works when the correct page/date is loaded.

---

## 7. Sync endpoints and UI workflow

Important POS endpoints:

```text
/api/sync/pos/day
/api/sync/pos/day-browser
/api/sync/pos/day-browser-store
/api/sync/pos/backfill
/api/sync/pos/benchmarks
/api/live/summary?reportingDate=YYYY-MM-DD
/api/import/status
/api/config/status
/api/diagnostics/browser-sync
```

V31 UI workflow:

- `Sync selected day only`: refreshes the visible selected day.
- `Sync current + last days`: should refresh the selected day, WTD prior days, same day last week, and last 4 same-weekday benchmark dates.

The sync button must be usable by Freda without console commands.

It must:

- Use the visible selected date.
- Avoid stale localStorage date issues.
- Disable while running.
- Show store/date progress where possible.
- Sync stores sequentially.
- Save each store/date immediately after success.
- Refresh Store Status, Today, WTD, and Hourly Analysis after completion.

Freda should not need to call console fetch commands manually.

---

## 8. Benchmark date logic

For a selected day, the benchmark sync should include:

- The selected date.
- WTD previous dates from Monday to the day before selected date.
- Same weekday last week.
- The last 4 same-weekday benchmark dates.

Example if selected date is Wednesday 2026-06-24:

```text
Selected day:
2026-06-24

WTD previous days:
2026-06-22
2026-06-23

Same day last week:
2026-06-17

4-week same-weekday benchmark dates:
2026-06-17
2026-06-10
2026-06-03
2026-05-27
```

This is not the same as syncing every day in the last 4 calendar weeks. It is the correct logic for same-weekday hourly benchmarks.

---

## 9. Production and cook workbook policy

The app expects production/cook files in an app-ready structure.

Cook workbook should include:

```text
COOK_INPUTS
Date | Day | Store | Shape | Total Cook | Tray Text | Visual

SHAPE_CHECK
Product | Section | Cook Shape | Weekly Units
```

Use the app-ready cook file as:

```text
server/data/imports/production/cook.xlsx
```

The app-ready file should be value-only, with stable sheet names and stable columns.

Avoid relying on formulas, hidden calculations, visual formatting, or merged cells for app imports.

---

## 10. Shape mapping rules

This is one of the most important constraints.

Freda explicitly requires balls to remain around 30 to 35 percent of production, not excessive.

Recent corrected weekly example:

```text
Weekly total: 20,150
BALL total: 6,190
BALL share: 30.7%
```

Important shape rules:

- Do not map everything into BALL.
- Specials should not automatically be 100 percent BALL.
- Specials can be mixed shape where operationally appropriate, for example 50 percent BALL / 50 percent RING if required by the production mapping.
- Use `SHAPE_CHECK` rows from the imported cook sheet to override stale default shape assumptions.
- Priority logic must consider BALL/RING/LONG mix trend.
- Priority logic should highlight when production shape mix diverges from sales demand mix.

Specific product shape corrections:

- Vanilla Slice should be treated as LONG from the cook sheet, not as BALL.
- Strawberry Nutella Cream should not be swallowed by generic Nutella rules.
- Caramel / Caramel Iced must be protected across stores.

---

## 11. Product alias and protected SKU rules

The app must not incorrectly say key products are missing if they exist under a related alias.

Protected high-risk examples:

- Penrith Vanilla Slice.
- Penrith Strawberry Nutella / Strawberry Nutella Cream.
- Caramel / Caramel Iced across stores.

Alias rules:

```text
Strawberry Nutella = Strawberry Nutella Cream = same operational SKU family.
Caramel = Caramel Iced = same operational SKU family.
Nutella and Strawberry Nutella must not collapse into one generic Nutella bucket.
Vanilla Slice must remain distinct.
```

Known issue fixed in V33:

- Strawberry Nutella Cream could previously be swallowed by the generic Nutella rule.
- Caramel / Caramel Iced were not protected strongly enough.
- Vanilla Slice used stale default shape assumptions.
- Priority message inferred product gaps too aggressively when product-level production data was incomplete.

Priority logic must not say a product is missing unless product-level production data is loaded and checked.

---

## 12. Uber policy

Uber should not rely on the Excel workbook long term.

V32 introduced the intended direction:

- Uber workbook disabled by default.
- Uber online sync path using Uber Manager and browser capture.
- Uber selected-day sync button.
- Uber WTD sync button.
- Uber values stored by date for WTD.

Important env flags:

```env
UBER_ONLINE_ONLY=true
UBER_FILE_IMPORT_ENABLED=false
```

Uber still requires live testing against Uber Manager and a valid cookie/session.

Uber priorities:

- Selected-day sales online sync.
- WTD Uber sales online sync.
- Store-level mapping.
- Clear UI status when Uber sync is unavailable or cookie expired.

Uber should be presented to Freda as pending/improving until live sync is fully validated.

---

## 13. Square / Frieda's Pies policy

Square is pending proper access.

Frieda's Pies should be Square-only once connected.

Required Square access details:

```env
SQUARE_ACCESS_TOKEN
SQUARE_LOCATION_ID
SQUARE_ENVIRONMENT=production
SQUARE_TIMEZONE_OFFSET=+10:00
```

If Square access is not available, use exported Square CSVs only as temporary fallback.

Do not pretend Square is live if access is missing.

---

## 14. Priority message requirements

Priority messages must be precise, actionable, and grounded in data.

They should use:

- POS sync status and gaps.
- Uber sync status and gaps.
- Production plan versus POS sales.
- Product mix trend.
- Shape mix trend.
- Store-level product/category sales.
- Sell-out risk signals.
- Overproduction or weak-demand signals.

Priority messages should answer:

```text
What is happening?
Why does it matter?
Which store/product/shape is affected?
What should Freda or the store do now?
What data is missing or uncertain?
```

Avoid vague messages such as:

```text
Sales are low.
Check production.
Some products may be missing.
```

Prefer action-oriented messages such as:

```text
Penrith: Strawberry Nutella and Vanilla Slice are high-demand protected SKUs. Before reducing production, confirm they are present in the Penrith plan. POS mix shows filled/specials demand above plan, so do not cut these without checking sell-out timing.
```

Never infer missing products aggressively when product-level production data is unavailable.

---

## 15. Version milestones

Important recent versions:

- V23: Busy Hours POST fix; current-day hourly sync started working.
- V27: Forced browser diagnostics; proved Playwright package and Chromium availability.
- V28: Browser navigation stabilizer; daily/product POS capture worked but slow.
- V29: Browser runtime hourly extraction; proved hourly capture using runtime-hour-totals for BH.
- V30: Sync selected date wired to browser POS path; selected date visible in UI.
- V31: Added `Sync current + last days` button for selected date, WTD, last week, and 4-week same-weekday benchmarks.
- V32: Uber online sync direction and improved priority message logic.
- V33: Product alias and priority fix for Vanilla Slice, Strawberry Nutella, Caramel, and shape mapping from SHAPE_CHECK.

Do not regress POS sync behavior when improving Uber, Square, or priority messages.

---

## 16. Known limitations and pending work

Still pending or requiring validation:

- Uber Manager online sync must be tested with live valid Uber session/cookie.
- Square requires proper Square access and location ID.
- Full 28-day historical backfill is separate from same-weekday 4-week benchmark sync.
- Production versus sales comparisons depend on app-ready production/cook files being present.
- Render runtime state can be empty after new service deploy until sync runs.
- reporting.site sessions/cookies can expire; auto-login should be preferred where possible.
- Browser sync can be slower than server fetch and should run sequentially with progress.

---

## 17. Tests to run after each deploy

Minimum smoke tests:

```text
/health
/api/config/status
/api/import/status
```

Check version matches the intended release.

POS one-store test:

```javascript
fetch('/api/sync/pos/day-browser-store?store=beverly_hills', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ reportingDate: 'YYYY-MM-DD' })
})
.then(async r => {
  const text = await r.text();
  console.log('STATUS:', r.status);
  console.log(text.slice(0, 8000));
});
```

Look for:

```text
periodMatched: true
runtimeHourlyRows > 0 when sales exist
productRows > 0 when product sales exist
reportingPOS contains Beverly Hills / Penrith / Taren Point when full sync is used
```

UI tests:

- Select a date.
- Click `Sync selected day only`.
- Confirm selected date is the date sent to the backend.
- Click `Sync current + last days`.
- Confirm selected date, WTD days, last week, and 4-week same-weekday benchmark dates are synced.
- Revisit Today, WTD, Store Status, and Hourly Analysis.

Product/priority tests:

- Penrith Vanilla Slice must not be flagged missing if in plan.
- Penrith Strawberry Nutella / Strawberry Nutella Cream must not be lost under Nutella.
- Caramel / Caramel Iced must be protected across stores.
- Ball share should remain around 30 to 35 percent unless Freda explicitly changes the target.

---

## 18. Communication style with Freda

When updating Freda, keep the message practical and transparent.

Use these ideas:

- Explain what works now.
- Explain how to sync/refresh without technical commands.
- Explain what is still pending.
- Be clear about Uber and Square status.
- Avoid overstating live integration until tested.
- Ask for the exact inputs/access needed.
- Mention operational value: faster review, WTD, hourly benchmarks, production versus sales, mix trends, and action priorities.

Do not ask Freda to use browser console commands.

---

## 19. Non-negotiable guardrails

Do not regress these:

1. POS sync first, uploaded POS files fallback only.
2. Browser/Playwright sync must remain available for reporting.site.
3. Freda must be able to sync from app buttons, not console.
4. Selected date must be the visible selected date.
5. WTD starts Monday.
6. 4-week hourly benchmark means same weekday over last 4 weeks.
7. Ball share must remain around 30 to 35 percent unless explicitly changed.
8. Protect Penrith Vanilla Slice and Strawberry Nutella.
9. Protect Caramel / Caramel Iced across stores.
10. Do not imply products are missing without product-level production data.
11. Uber should move online and not rely on Excel workbook long term.
12. Square remains pending until access is provided.
13. Never include live secrets in generated files or replies.

