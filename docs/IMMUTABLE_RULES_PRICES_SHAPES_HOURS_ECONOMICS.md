# Freda Ops Cockpit — Immutable Rules: Prices, Shape Mix, Opening Hours, Unit Economics

_Last updated: 2026-06-30_  
_Project: L.A. Donuts / Freda Ops Cockpit_

This markdown file is the operational baseline for future production plans, cook sheets, app logic, and emails. It focuses on the rules that must not be overwritten by weekly sales noise: prices, unit economics, shape mix, shape mapping, opening-hour logic, Uber conversion, and lost-opportunity economics.

---

## 1. Scope and non-negotiable use

Use this file whenever generating or modifying:

- weekly production plans;
- baker/cook sheets;
- app-ready `cook.xlsx` files;
- product-mix diagnostics;
- priority messages in the Freda Ops Cockpit;
- Freda-facing emails explaining buffers, lost opportunities, or waste.

Do not silently replace these rules with assumptions from a single weekly workbook. If Freda sends a new price list, product list, store-hours list, or shape map, update this file first and then regenerate downstream files.

---

## 2. Store and channel constants

### 2.1 Store aliases

| Canonical store | Accepted aliases | Notes |
|---|---|---|
| Beverly Hills | BH, beverly_hills | Core L.A. Donuts store. Strongest sell-out/lost-opportunity protection. |
| Penrith | PN, penrith | Must be tighter than BH, but protected SKUs cannot be dropped. |
| Taren Point | TP, taren_point | Must be tighter and more conservative than BH. |
| Frieda's Pies | Frieda Pies, Pies | Separate entity. Treat as Square-only once Square access exists. Do not merge into L.A. Donuts POS stores. |

### 2.2 Channel rules

| Channel | Rule |
|---|---|
| POS | Primary source for in-store L.A. Donuts sales. Use reporting.site online sync first. |
| Uber Eats | Incremental to POS. Long-term target is online sync, not Excel workbook dependency. |
| Square | Source of truth for Frieda's Pies once access is available. CSVs are temporary fallback only. |

---

## 3. Price and unit-economics rules — L.A. Donuts

These are the current immutable donut category economics unless Freda provides a new approved price/cost list.

| Category | RSP | Product cost | Contribution per sold unit | One missed sale equals cost of approx. |
|---|---:|---:|---:|---:|
| Traditional | $4.50 | $0.29 | $4.21 | 14.5x |
| Gourmet | $6.50 | $0.69 | $5.81 | 8.4x |
| Filled | $6.00 | $0.69 | $5.31 | 7.7x |
| Beverage | $5.50 | $0.60 | $4.90 | 8.2x |
| Vegan | $5.50 | $0.54 | $4.96 | 9.2x |
| Scrolls | $6.50 | $0.50 | $6.00 | 12.0x |
| Default | $5.00 | $0.50 | $4.50 | 9.0x |

### 3.1 Donut economics formula

```text
Contribution per sold unit = RSP - product cost
Waste break-even multiple = contribution per sold unit / product cost
```

### 3.2 Donut planning implication

A missed sale is far more expensive than a small controlled leftover.

Examples:

- Missing 1 Gourmet sale loses $5.81 contribution, which equals about 8.4 unsold Gourmet donuts at product cost.
- Missing 1 Traditional sale loses $4.21 contribution, which equals about 14.5 unsold Traditional donuts at product cost.
- Missing 1 Scroll sale loses $6.00 contribution, which equals about 12.0 unsold Scrolls at product cost.

Therefore: **do not plan to zero buffer.** The right objective is controlled waste, not zero waste at the expense of empty shelves.

---

## 4. Price and unit-economics rules — Frieda's Pies

These are the current immutable pie economics unless Freda provides a new approved price/cost list.

| Product | RSP | Dough | Filling | Fry/Pkg | Total product cost | Contribution per sold unit | One missed sale equals cost of approx. |
|---|---:|---:|---:|---:|---:|---:|---:|
| Beef & Cheese | $8.50 | $0.25 | $1.40 | $0.20 | $1.85 | $6.65 | 3.6x |
| Beef Pie | $8.50 | $0.25 | $1.35 | $0.20 | $1.80 | $6.70 | 3.7x |
| Chunky Steak | $9.00 | $0.25 | $1.80 | $0.20 | $2.25 | $6.75 | 3.0x |
| Chunky Beef Cheese | $9.50 | $0.25 | $1.90 | $0.20 | $2.35 | $7.15 | 3.0x |
| Mushroom Beef | $8.50 | $0.25 | $1.30 | $0.20 | $1.75 | $6.75 | 3.9x |
| Curry Beef | $8.50 | $0.25 | $1.30 | $0.20 | $1.75 | $6.75 | 3.9x |
| Potato Beef | $8.50 | $0.25 | $1.10 | $0.20 | $1.55 | $6.95 | 4.5x |
| Butter Chicken | $9.00 | $0.25 | $1.60 | $0.20 | $2.05 | $6.95 | 3.4x |
| Chicken Leek | $8.50 | $0.25 | $1.40 | $0.20 | $1.85 | $6.65 | 3.6x |
| Chicken Satay | $8.50 | $0.25 | $1.45 | $0.20 | $1.90 | $6.60 | 3.5x |
| Chilli And Cheese | $8.00 | $0.25 | $1.10 | $0.20 | $1.55 | $6.45 | 4.2x |
| Spinach And Cheese | $8.00 | $0.25 | $1.00 | $0.20 | $1.45 | $6.55 | 4.5x |
| Sausage Roll | $7.50 | $0.30 | $1.10 | $0.15 | $1.55 | $5.95 | 3.8x |
| Default | $8.50 | $0.25 | $1.35 | $0.20 | $1.80 | $6.70 | 3.7x |

### 4.1 Pie economics formula

```text
Pie product cost = Dough + Filling + Fry/Pkg
Contribution per sold unit = RSP - product cost
Waste break-even multiple = contribution per sold unit / product cost
```

### 4.2 Pie planning implication

For pies, the cost of one missed sale usually equals the product cost of roughly 3.0 to 4.5 unsold pies. Lost opportunities are still materially worse than small controlled waste, but the buffer should be more conservative than donuts because pie product cost is higher as a percentage of RSP.

---

## 5. Uber 35% uplift rule

Uber sales dollars must not be converted into units at in-store price directly.

Freda confirmed Uber has a 35% price uplift. Therefore Uber dollar sales represent fewer physical units than the same POS dollar sales.

### 5.1 Mandatory Uber conversion

```text
Uber in-store-equivalent sales value = Uber gross sales / 1.35
Uber physical units = Uber gross sales / 1.35 / relevant in-store RSP
```

If using a category-weighted price instead of SKU-level Uber detail:

```text
Uber physical units = Uber gross sales / 1.35 / weighted average in-store RSP
```

### 5.2 Forbidden calculation

```text
Wrong: Uber units = Uber gross sales / in-store RSP
```

This overstates Uber units and inflates production.

---

## 6. Shape-mix rules

### 6.1 Shape target

Freda explicitly requires BALL production to remain around 30% to 35%, not excessive.

| Shape | Target / rule |
|---|---|
| BALL | Around 30% to 35%. Do not exceed 35% materially unless Freda explicitly approves. |
| RING | Main balancing shape. Usually absorbs most non-ball premium/filled/specials. |
| LONG | Cream Finger Bun and Eclairs unless a new cook-sheet mapping says otherwise. |
| SCROLL | Scroll only. |
| APPLE | Apple only. |

Latest corrected working example from v104:

| Shape | Units | Share |
|---|---:|---:|
| RING | 11,093 | 52.9% |
| BALL | 7,391 | 35.3% |
| LONG | 1,217 | 5.8% |
| SCROLL | 684 | 3.3% |
| APPLE | 575 | 2.7% |
| Total | 20,960 | 100.0% |

### 6.2 Shape mapping source of truth

Do not infer shape only from product name. Use the latest approved cook-sheet mapping tabs:

```text
SHAPE_MAPPING_V96
SHAPE_CHECK
COOK_INPUTS
```

### 6.3 Current approved product-to-shape map

| Product / family | Cook shape | Rule |
|---|---|---|
| Homer | BALL | Original shape map restored. |
| Glaze | BALL | Original shape map restored. |
| Choc | BALL | Original shape map restored. |
| Cinnamon | BALL | Original shape map restored. |
| Caramel / Caramel Iced | BALL | Protected across stores. |
| Fairy | BALL | Original shape map restored. |
| Passion | BALL | Original shape map restored. |
| Pineapple | BALL | Original shape map restored. |
| Banana | RING | Filled/custard family mapped to RING in current v104 shape lock. |
| Boston | RING | Filled/custard family mapped to RING in current v104 shape lock. |
| Lemon | RING | Filled/custard family mapped to RING in current v104 shape lock. |
| Raspberry | RING | Filled/custard family mapped to RING in current v104 shape lock. |
| Vanilla Slice | RING | Must not be treated as BALL. Protected SKU, especially Penrith. |
| Biscoff Cream | RING | Premium family mapped to RING. |
| Brulee | RING | Premium family mapped to RING. |
| Gaytime | RING | Premium family mapped to RING. |
| M&M | RING | Premium family mapped to RING. |
| Nutella | RING | Keep separate from Strawberry Nutella. |
| Nutella Biscoff | RING | Premium family mapped to RING. |
| Oreo | RING | Premium family mapped to RING. |
| Snickers | RING | Premium family mapped to RING. |
| Strawberry Nutella / Strawberry Nutella Cream | RING | Protected SKU, especially Penrith. Do not collapse into generic Nutella. |
| Specials Total | RING | Do not automatically map Specials to BALL. |
| Cream Finger Bun | LONG | Long product. |
| Eclairs | LONG | Long product. |
| Scroll | SCROLL | Scroll product. |
| Apple | APPLE | Apple product. |

### 6.4 Shape guardrails

- Do not map all high-demand products into BALL.
- Do not use generic Nutella matching that swallows Strawberry Nutella Cream.
- Do not allow Caramel / Caramel Iced to disappear from any store mix if it sold materially last week.
- Do not flag a protected SKU as missing unless product-level production data is actually loaded.
- If BALL exceeds 35%, first check whether shape mapping is wrong before changing volume.

---

## 7. Protected SKU and alias rules

### 7.1 Protected SKUs

These SKUs must be checked before any weekly plan is sent:

| Store / scope | Protected SKU |
|---|---|
| Penrith | Vanilla Slice |
| Penrith | Strawberry Nutella / Strawberry Nutella Cream |
| All stores | Caramel / Caramel Iced |
| All stores | Key high-volume premium / filled SKUs from last-week POS sales |

### 7.2 Alias rules

```text
Strawberry Nutella = Strawberry Nutella Cream = same operational SKU family
Caramel = Caramel Iced = same operational SKU family
Nutella != Strawberry Nutella
Vanilla Slice must remain distinct
```

### 7.3 Mix logic

The mix engine must use recent sales, but it must not create false zeroes when a SKU sold out or was unavailable. Use a blend of:

```text
recent last-week POS mix + longer-history signal + protected SKU override
```

When Freda says an item is a massive seller, treat that as an operational override until proven otherwise by product-level sales and availability data.

---

## 8. Opening-hour and lost-opportunity rules

### 8.1 Time zone

All operational timestamps, POS syncs, WTD logic, and opening-hour checks must use:

```text
Australia/Sydney
```

### 8.2 POS hourly reporting window

The uploaded POS hourly reports use hourly columns from:

```text
06:00 to 23:00
```

This is the reporting window, not automatically the confirmed customer opening window.

### 8.3 Store opening-hour rule

Do not infer official store opening hours only from sales zeros. Store hours must be stored explicitly in app configuration and reviewed with Freda/store operations when changed.

Until Freda confirms a different schedule, use these conservative rules in the app:

| Store | POS report window | Lost-opportunity watch rule |
|---|---|---|
| Beverly Hills | 06:00-23:00 | Count empty/sold-out hours only during confirmed trading hours. Late zeros after actual close are not lost opportunities. |
| Penrith | 06:00-23:00 | Count empty/sold-out hours only during confirmed trading hours. PN must be tighter than BH, but protected SKUs remain required. |
| Taren Point | 06:00-23:00 | Treat late-evening zeros cautiously. TP often has a shorter effective retail window; do not count 19:00-23:00 zeros as lost opportunities unless TP is confirmed open. |
| Frieda's Pies | Square-dependent | Use Square timestamps once connected. Do not merge with donut store POS hours. |

### 8.4 Lost-opportunity definition

Lost opportunities equal **empty hours when the store sold out while the store was still meant to be trading**.

Do not treat all zero-sales hours as lost opportunities. A zero hour can mean:

- store closed;
- no demand;
- reporting gap;
- product sold out;
- product unavailable;
- sync/import failure.

A lost-opportunity hour should be counted only when there is evidence such as:

```text
positive sales earlier in the day + abrupt zero sales + still inside confirmed opening hours + known sell-out feedback / stockout signal
```

### 8.5 Freshness rule

Freda does not want to solve demand by selling previous-day high-demand stock. Respect this quality constraint.

The operational answer must be:

```text
same-day demand reactivity + controlled fresh top-ups + better sell-out warnings
```

not:

```text
sell old product to cover today's high demand
```

---

## 9. Buffer, waste, and lost-opportunity rules

### 9.1 Commercial priority

Lost opportunities are worse than controlled waste.

The planning objective is:

```text
avoid early sell-out while keeping surplus controlled and realistic for production
```

not:

```text
minimize waste to zero at the expense of empty shelves
```

### 9.2 Donut buffer rule

Because donut product cost is very low versus RSP, one missed donut sale can cost as much as wasting approximately 8 to 15 products depending on category.

Therefore:

- never remove the buffer entirely;
- be tighter on PN and TP than BH;
- keep BH more protected when sell-out evidence is stronger;
- validate store-specific capacity before sending files.

### 9.3 Pie buffer rule

Pies have higher product cost as a percentage of RSP. Use a controlled buffer, but less aggressively than donuts.

For pies, one missed sale usually equals approximately 3 to 4.5 wasted units at product cost. This still supports a buffer, but with a more conservative cap.

---

## 10. Production and cook-sheet rules

### 10.1 Single-total rule

Cook sheets must show one clear total quantity.

Do not split staff-facing sheets into:

```text
Reserve / Make First / Top-Up
```

unless Freda explicitly asks for that operational split.

### 10.2 App-ready cook workbook structure

The app-ready cook file must include stable sheets/columns:

```text
COOK_INPUTS
Date | Day | Store | Shape | Total Cook | Tray Text | Visual

SHAPE_CHECK
Product | Section | Cook Shape | Weekly Units
```

### 10.3 Import safety

The app should not rely on formulas, hidden calculations, merged cells, or visual formatting. App-ready workbooks must be value-only and structurally stable.

---

## 11. Sales-source and sync rules

### 11.1 POS source priority

```text
reporting.site sync first; uploaded POS files as fallback only
```

This applies to:

- hourly sales;
- product sales;
- WTD sales;
- store status;
- hourly benchmarks.

### 11.2 Benchmark logic

WTD starts Monday.

For hourly benchmarks, use same weekday comparisons:

```text
selected date
WTD previous days
same weekday last week
last 4 same-weekday benchmark dates
```

Do not confuse this with every day in the last 4 calendar weeks.

---

## 12. Quality-control checklist before sending any file

Before sending production/cook files to Freda, check:

- Total weekly production reconciles across production file and cook sheet.
- Store totals reconcile to network total.
- Daily totals reconcile to weekly total.
- Product mix includes protected SKUs.
- PN has Vanilla Slice if sales/history/Freda feedback supports it.
- PN has Strawberry Nutella / Strawberry Nutella Cream if sales/history/Freda feedback supports it.
- Caramel / Caramel Iced is present across stores when recent sales support it.
- BALL share is around 30% to 35%.
- Shape map comes from `SHAPE_CHECK` / `SHAPE_MAPPING_V96`, not from generic name matching.
- Uber dollar sales are divided by 1.35 before converting to units.
- Opening-hour lost opportunities are counted only during confirmed trading hours.
- PN and TP are tighter than BH unless Freda explicitly asks for a stronger buffer.
- No spreadsheet formula errors are visible in validation sheets.

---

## 13. Machine-readable economics constants

### 13.1 Donuts

```python
UNIT_ECONOMICS = {'Traditional': {'RSP': 4.5, 'Cost': 0.29}, 'Gourmet': {'RSP': 6.5, 'Cost': 0.69}, 'Filled': {'RSP': 6.0, 'Cost': 0.69}, 'Beverage': {'RSP': 5.5, 'Cost': 0.6}, 'Vegan': {'RSP': 5.5, 'Cost': 0.54}, 'Scrolls': {'RSP': 6.5, 'Cost': 0.5}, 'Default': {'RSP': 5.0, 'Cost': 0.5}}
```

### 13.2 Pies

```python
PIE_ECONOMICS = {'Beef & Cheese': {'RSP': 8.5, 'Dough': 0.25, 'Filling': 1.4, 'Fry/Pkg': 0.2}, 'Beef Pie': {'RSP': 8.5, 'Dough': 0.25, 'Filling': 1.35, 'Fry/Pkg': 0.2}, 'Chunky Steak': {'RSP': 9.0, 'Dough': 0.25, 'Filling': 1.8, 'Fry/Pkg': 0.2}, 'Chunky Beef Cheese': {'RSP': 9.5, 'Dough': 0.25, 'Filling': 1.9, 'Fry/Pkg': 0.2}, 'Mushroom Beef': {'RSP': 8.5, 'Dough': 0.25, 'Filling': 1.3, 'Fry/Pkg': 0.2}, 'Curry Beef': {'RSP': 8.5, 'Dough': 0.25, 'Filling': 1.3, 'Fry/Pkg': 0.2}, 'Potato Beef': {'RSP': 8.5, 'Dough': 0.25, 'Filling': 1.1, 'Fry/Pkg': 0.2}, 'Butter Chicken': {'RSP': 9.0, 'Dough': 0.25, 'Filling': 1.6, 'Fry/Pkg': 0.2}, 'Chicken Leek': {'RSP': 8.5, 'Dough': 0.25, 'Filling': 1.4, 'Fry/Pkg': 0.2}, 'Chicken Satay': {'RSP': 8.5, 'Dough': 0.25, 'Filling': 1.45, 'Fry/Pkg': 0.2}, 'Chilli And Cheese': {'RSP': 8.0, 'Dough': 0.25, 'Filling': 1.1, 'Fry/Pkg': 0.2}, 'Spinach And Cheese': {'RSP': 8.0, 'Dough': 0.25, 'Filling': 1.0, 'Fry/Pkg': 0.2}, 'Sausage Roll': {'RSP': 7.5, 'Dough': 0.3, 'Filling': 1.1, 'Fry/Pkg': 0.15}, 'Default': {'RSP': 8.5, 'Dough': 0.25, 'Filling': 1.35, 'Fry/Pkg': 0.2}}
```

### 13.3 Uber conversion

```python
UBER_PRICE_UPLIFT = 0.35
UBER_UNIT_CONVERSION_FACTOR = 1 / (1 + UBER_PRICE_UPLIFT)  # 0.7407407407
```

### 13.4 Shape target

```python
SHAPE_TARGETS = {
    "BALL_MIN_SHARE": 0.30,
    "BALL_MAX_SHARE": 0.35,
    "BALL_SOFT_TOLERANCE": 0.005,
}
```

### 13.5 Current shape map

```python
PRODUCT_SHAPE_MAP = {
    "Homer": "BALL",
    "Glaze": "BALL",
    "Choc": "BALL",
    "Cinnamon": "BALL",
    "Caramel": "BALL",
    "Caramel Iced": "BALL",
    "Fairy": "BALL",
    "Passion": "BALL",
    "Pineapple": "BALL",
    "Banana": "RING",
    "Boston": "RING",
    "Lemon": "RING",
    "Raspberry": "RING",
    "Vanilla Slice": "RING",
    "Biscoff Cream": "RING",
    "Brulee": "RING",
    "Gaytime": "RING",
    "M&M": "RING",
    "Nutella": "RING",
    "Nutella Biscoff": "RING",
    "Oreo": "RING",
    "Snickers": "RING",
    "Strawberry Nutella": "RING",
    "Strawberry Nutella Cream": "RING",
    "Specials Total": "RING",
    "Cream Finger Bun": "LONG",
    "Eclairs": "LONG",
    "Scroll": "SCROLL",
    "Apple": "APPLE",
}
```

---

## 14. Known items that are not immutable

The following are not immutable and must be recalculated weekly:

- weekly volume forecast;
- daily plan;
- store split;
- event/weather uplift;
- lost-opportunity volume estimate;
- production feasibility cap;
- SKU quantities;
- fresh promotions and specials;
- temporary store staffing constraints.

---

## 15. Update protocol

When a rule changes:

1. Update this markdown first.
2. Regenerate production/cook files from the updated rule.
3. Validate totals, mix, shape, and economics.
4. Explain the change to Freda in simple operational terms.

Never silently change price, shape mapping, Uber conversion, opening-hour logic, or protected SKUs inside a workbook only.
