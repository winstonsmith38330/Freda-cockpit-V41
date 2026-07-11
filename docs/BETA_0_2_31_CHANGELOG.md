# Beta 0.2.31 Changelog

- Added a clear Freda-facing **Sync current + last days** button to Today, WTD, Live Sales, Live Fallback, and Hourly Analysis screens.
- The button syncs the selected date, WTD previous days, same day last week, and 4-week comparison dates for all POS stores.
- Rewired the button to `/api/sync/pos/current-plus-last-days`, using the same browser/runtime-hourly path proven in 0.2.29/0.2.30.
- Saves every store/date immediately so one failure cannot erase successful synced dates.
- Keeps **Sync selected day only** for quick single-day refreshes.
- Keeps selected visible date protection.
