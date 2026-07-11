# Freda Ops Cockpit Beta 0.2.39 — Protected SKU and product-map fix

Focus: fix false product/mix warnings around Penrith Vanilla Slice, Penrith Strawberry Nutella, and Caramel/Caramel Iced across stores.

## Fixed
- Product matching now uses canonical aliases, so `CARAMEL`, `CARAMEL ICED`, `STRAWBERRY NUTELLA`, and `STRAWBERRY NUTELLA CREAM` are treated as the same operational SKU where appropriate.
- Shape matching now sorts specific names before generic names, so `STRAWBERRY NUTELLA CREAM` no longer gets swallowed by the generic `Nutella` rule.
- Imported `SHAPE_CHECK` rows now override stale default shape rules where present.
- `Vanilla Slice` is mapped as `LONG` from the cook sheet instead of the older default ball assumption.
- Added protected SKU coverage checks for Vanilla Slice, Strawberry Nutella and Caramel by store.
- The priority message no longer infers that a product is absent when no product-level production plan is loaded.

## Kept unchanged
- POS browser sync settings from V31/V32 remain unchanged.
- Uber online sync experiment from V32 remains unchanged.
