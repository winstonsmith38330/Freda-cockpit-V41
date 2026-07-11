# Beta 0.2.39 changelog - POS-stable external fallback display

Beta 0.2.39 keeps the V36/V34 POS sync path stable and adds a safe external-sales fallback layer for Uber and Frieda/Square.

## Non-regression guardrails

- POS reporting.site browser sync is unchanged from the stable V36 path.
- `Sync selected POS day only` remains the selected-date browser POS sync.
- `Sync current + last days` remains the selected date, WTD previous days, same weekday last week, and last 4 same-weekday benchmark dates.
- POS uploaded files remain backup only for POS.

## Uber / Frieda external sales logic

For Uber and Frieda/Square, display priority is now:

1. Online actual value if synced.
2. Uploaded backup/history value if available.
3. Theoretical fallback when actual data is missing.

Theoretical fallback is labelled and does not overwrite actual data.

## Uber theoretical fallback

Uber theoretical sales use:

- average same weekday over the last 4 weeks;
- average equivalent WTD daily pattern over the last 4 weeks;
- the average of those two values when both exist.

Uber fallback is allocated proportionally to POS hourly sales. Estimated units use the Uber uplift rule:

```text
Uber estimated units = theoretical Uber sales / 1.35 / average in-store RSP
```

## Frieda/Square theoretical fallback

Frieda/Square WTD, MTD and last-month comparison are displayed when uploaded Square item history exists. If selected-day or WTD day actuals are missing, theoretical fallback is computed using the same same-weekday/WTD logic.

## File import behavior

- Uber workbook is parsed as backup/history even when `UBER_FILE_IMPORT_ENABLED=false`.
- It is not promoted as the live/actual selected-day source unless `UBER_FILE_IMPORT_ENABLED=true`.
- The imported Uber history can support theoretical fallback.
- Square/Frieda item exports are used for WTD, MTD and last-month comparison.

## Fresh-deploy behavior

If the live import cache is empty after a fresh Render deploy, `/api/live/summary` lazily loads uploaded import files once so external fallback values do not remain at zero.
