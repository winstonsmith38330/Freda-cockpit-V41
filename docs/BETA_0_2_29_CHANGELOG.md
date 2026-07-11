# Beta 0.2.30 Changelog — Browser Runtime Hourly Extraction

Beta 0.2.30 builds on 0.2.28 and targets the remaining Busy Hours issue seen in Render:

- Browser/Chromium sync reaches reporting.site and captures daily/product data.
- `busy_hours.php` is loaded, but `hourlyRows` can still be empty if the hourly chart data is not present in static HTML.

## Changes

1. **Browser runtime extraction for Busy Hours**
   - Reads JavaScript variables directly from the rendered browser context:
     - `RAW_HOURS`
     - `SERIES_REVENUE`
     - `SERIES_TX`
     - `HOUR_REVENUE_TOTALS`
     - `HOUR_TX_TOTALS`
     - `CROSS_BODY`
   - Also inspects ApexCharts runtime chart configs when available.

2. **Runtime diagnostics**
   - Browser period checks now report:
     - `runtimeHourlyRows`
     - `runtimeSource`
     - `BROWSER_POST_DATE_RANGE_RUNTIME`

3. **Faster browser sync**
   - Blocks heavy browser resources such as images/fonts/media.
   - Allows scripts/XHR needed by reporting.site charts.
   - Stops loading remaining pages early when daily sales, product rows, and hourly/runtime data are already captured.

4. **One-store browser diagnostic endpoint**
   - Added `/api/sync/pos/day-browser-store` so a single store can be tested without waiting for all stores.

## Recommended first test

```js
fetch('/api/sync/pos/day-browser-store?store=beverly_hills', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ reportingDate: '2026-06-22' })
})
.then(async r => {
  const text = await r.text();
  console.log('STATUS:', r.status);
  console.log(text.slice(0, 8000));
});
```

## Expected improvement

The response should still capture daily/product POS as in 0.2.28, and Busy Hours should show non-empty `hourlyRows` if reporting.site exposes the chart data in the browser runtime.
