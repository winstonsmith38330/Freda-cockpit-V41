# Beta 0.2.40 changelog

## Focus

Production page, shape totals and shortage-risk model.

## Added

- Four production import files: `cook.xlsx`, `prod.xlsx`, `last_cook.xlsx`, `last_prod.xlsx`.
- Normalized production/cook rows with date, week, store, product/family, shape, quantity and source metadata.
- Daily and weekly shape totals for RING, BALL, LONG, SCROLL, APPLE and OTHER.
- Product-family detail under each shape.
- Current week vs last week and selected weekday vs same weekday last week comparison.
- Remaining-stock and shortage-risk table by store and shape.
- Priority briefing messages based on stock-risk evidence.

## Guardrails

- POS split sync path unchanged.
- Uber/Frieda fallback rules unchanged.
- WhatsApp import-folder workflow unchanged.
- Protected SKU mapping updated so Strawberry Nutella and Vanilla Slice are RING, Caramel is BALL, Cream Finger Bun/Eclairs are LONG, and Specials Total defaults to RING.
- BALL share above 35% warns that mapping should be checked before volume changes.
