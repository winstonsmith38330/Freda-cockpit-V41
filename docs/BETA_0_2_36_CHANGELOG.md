# Beta 0.2.39 - POS stable hotfix

Purpose: restore the proven V34/V31 POS sync behavior after V35 regression.

Changes:
- Reverted POS sync code path to the stable V34 implementation.
- Kept browser/Playwright POS sync as the primary path.
- Kept selected-date and current-plus-last-days UI workflow.
- Increased upload limit default to 200 MB for WhatsApp exports.
- Removed experimental theoretical Uber/Frieda fallback from the deployed runtime to avoid interfering with POS.

Notes:
- Uber/Frieda theoretical fallback should be reintroduced only after POS smoke tests pass.
- POS sync must remain reporting.site first, uploaded POS files as fallback only.
