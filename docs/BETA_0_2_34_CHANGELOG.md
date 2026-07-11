# Beta 0.2.39 Changelog - clean full package, Uber/WhatsApp diagnostics

Beta 0.2.39 is a clean full package intended to replace the mixed V32/V33 deployment state.

## Included without regression

- V31 POS browser sync workflow remains the primary Freda-facing POS workflow.
- `Sync selected day only` remains wired to the browser POS selected-date path.
- `Sync current + last days` remains wired to selected date + WTD prior days + same weekday last week + 4-week same-weekday benchmark dates.
- POS sync remains reporting.site first, uploaded POS files backup only.
- Browser/Playwright sync remains enabled for reporting.site.
- V33 protected SKU rules remain included: Penrith Vanilla Slice, Penrith Strawberry Nutella / Strawberry Nutella Cream, and Caramel / Caramel Iced across stores.
- Shape mapping remains driven by the imported cook-sheet / `SHAPE_CHECK` rows and ball share guardrails.

## Fixes in 0.2.39

### Clean full package

- Server, web, docs, scripts, import folders, and README are all included in the package.
- Server and web version labels are aligned to `0.2.39`.
- Added immutable rules markdown files into `docs/` so future packages do not lose project guardrails.
- Added clearer deployment guidance to avoid partial repo replacement.

### Uber online sync

- Keeps Uber online sync as primary and keeps workbook fallback disabled by default.
- De-duplicates repeated Uber warning/error messages.
- Adds `/api/sync/uber/store` for per-store diagnostics.
- Adds more detailed browser diagnostics when Uber Manager loads but does not expose trusted selected-date values.
- Keeps conservative rejection of stale WTD/month values, repeated-store metrics, and zero-sales-with-orders.

### WhatsApp upload

- Improves WhatsApp `.zip` parsing for exports with nested chat text files or unusual filenames.
- Skips media entries and focuses on readable chat text.
- Handles UTF-8 and UTF-16 chat exports.
- Returns parse diagnostics instead of a generic `Upload failed` message.
- Improves frontend error display by showing parser details and ZIP entries seen.

## Still requiring live validation

- Uber Manager online capture still depends on a fresh valid `UBER_COOKIE` and correct store IDs/names in Render environment.
- Square/Frieda's Pies remains pending proper Square access.
- WhatsApp photo OCR remains staged; V34 parses text exports only.
