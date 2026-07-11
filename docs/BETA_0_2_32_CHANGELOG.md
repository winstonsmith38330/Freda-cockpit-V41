# Beta 0.2.39 changelog - Uber online + action-oriented priority briefing

## Scope

V32 keeps all V31 POS sync parameters and endpoints unchanged. The POS/browser reporting.site path remains the source of truth for POS daily/hourly/product data.

## Added

- Uber Manager online sync focus:
  - `/api/sync/uber/online` for selected-day Uber sync.
  - `/api/sync/uber/current-plus-last-days` for selected date + WTD previous days + same weekday last week + 4-week benchmark dates.
  - Browser-based Uber Manager capture with cookie injection, selected restaurant cookie, selected-date URL parameters, JSON/XHR capture, runtime storage parsing and text fallback.
  - Per-date Uber online values are persisted into `uberSyncByStoreDate` so WTD can use online Uber sales instead of workbook data.

- Uber workbook dependency removed by default:
  - `UBER_FILE_IMPORT_ENABLED=false` is the default V32 policy.
  - Uploaded Uber workbooks are ignored unless explicitly enabled as emergency fallback.

- Priority briefing improvements:
  - More precise/action-oriented messages.
  - Flags missing POS/Uber sync by store.
  - Uses POS product/category mix trends.
  - Compares production shape plan vs sold/mapped shape demand.
  - Creates concrete owner/action rows for Nicolas/Ops, managers and production.

## Unchanged

- V31 POS browser sync path and parameters.
- POS current + last days benchmark sync behavior.
- Square/Frieda remains pending Square access or item exports.
