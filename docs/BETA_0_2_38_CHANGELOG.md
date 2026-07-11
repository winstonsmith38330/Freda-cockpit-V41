# Beta 0.2.39 changelog - POS split-sync + external fallback

V38 fixes the V37 issue where POS sync could still return a Render 502 because the UI called a long all-dates/all-stores POS endpoint.

## Changes

- Keeps V37 Uber/Frieda theoretical fallback display.
- Keeps reporting.site POS as primary source.
- Keeps Playwright browser POS sync.
- Changes POS UI buttons to split work into small `/api/sync/pos/day-browser-store` requests.
- Saves partial progress after every store/date.
- Shows progress such as `Syncing POS 4/21: Penrith 2026-07-01`.
- If one store/date fails, successful prior runs remain saved and the UI reports a partial completion.

## Guardrail

Uber/Frieda fallback is display-only and must not interfere with POS sync.
