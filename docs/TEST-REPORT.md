# Test report — v2

All results below come from runs in this repository on 2026-11-06. Re-run with:

```bash
npm test                      # 45 unit tests (Vitest + in-memory IndexedDB + the real Code.gs on an emulated spreadsheet)
npm run build && npm run e2e  # 33 browser checks, emulated Samsung Galaxy S9+, Arabic locale
node e2e/migration-test.mjs <dir>   # v1 → v2 upgrade on the same browser profile (see file header)
npx tsc -b                    # TypeScript: 0 errors
```

Test data: `tests/fixtures/foods-160.csv` = the 160 rows of your food tab (notes shortened); `food-sheet-sample.csv` = 10 of those rows.
Google Sheets is emulated (`e2e/gas-mock.mjs`) and runs the **actual** `apps-script/Code.gs`. Open Food Facts is mocked in tests.

## Brief checklist

| # | Requirement | Result |
| --- | --- | --- |
| 1 | Run all existing tests | ✅ 21 original unit tests + 20 original browser checks still pass |
| 2 | Tests for new functionality | ✅ 24 new unit tests, 13 new browser checks, 1 upgrade test |
| 3 | Nutrition calculations | ✅ 100 g raw chicken 120 kcal · cooked 165 · 3 eggs 236 · 3 toast slices 207 · exact sums, no rounding drift (10 × 2.7 g tomato = 5 kcal, was 0) · remaining = target − consumed |
| 4 | Raw vs cooked | ✅ 200 g raw rice 720 kcal vs cooked 260; 71 raw / 61 cooked / 28 ready records kept separate |
| 5 | Recipe calculations | ✅ builder totals/per-serving; library kabsa equals hand calculation from DB values; 60/60 library recipes computable from your 160 foods |
| 6 | Food imports | ✅ all 160 imported with 0 differences; blank cells block the food; "2,6" read as 2.6 and reported; re-import adds no duplicates |
| 7 | Data persistence | ✅ close/reopen browser profile keeps entries and targets |
| 8 | Backup & restore | ✅ file backup validated before restore; on-phone backup → delete → restore brings the entry back; pre-restore snapshot created |
| 9 | Google Sheets sync | ✅ against the real Code.gs (emulated): auth, food import, push/pull, **conflict: older offline copy rejected**, soft delete to APP_trash, data version, validation, food tab untouched unless write-back is enabled (then backup tab + log) · 🔶 not yet run against your real Google account |
| 10 | Offline | ✅ logging while offline → 0 uploads → reconnect → uploaded; app shell loads offline |
| 11 | Arabic & English | ✅ rtl/ltr switch, labels; goal dropdown works in both |
| 12 | Mobile responsiveness | ✅ new check: no element wider than the phone screen on 12 screens (found and fixed one real overflow) |
| 13 | Weekly & monthly reports | ✅ complete/partial/empty days, threshold rule, water, macro split, top foods, export CSV/XLSX |
| 14 | Error handling | ✅ invalid backups rejected, invalid sync payloads rejected by the server, unauthorized token, sync retry with backoff, invalid barcode check digit blocks lookup |
| 15 | Duplicate food entries | ✅ duplicate guard, idempotent import, copy-into-non-empty-day confirmation |
| 16 | Data loss / migration | ✅ v1 → v2 upgrade on the same profile: entry kept (240 kcal), DB version 1 → 2, pre-migration snapshot with all entries and foods |
| — | Production build + TypeScript | ✅ `vite build` ok, `tsc -b` 0 errors |

## Browser checks (33/33 passed)

SETUP, IMPORT, TEST 1–15 (original scenarios), DASH, BODY, REMAIN (remaining macros + water), UNDO, COPYGUARD, LIBRARY (60 recipes,
detail, rating, add to diary), SUGGEST (every suggestion ≤ remaining kcal), GOAL (9 options, default, recommendation applied only after
confirmation, persisted), PLAN (generated week + shopping list check-off), HABITS (water, habit, fasting), BARCODE (manual code →
Open Food Facts mock → save & log), PHOTO, BACKUP, SYNC2 (all tables synced through Code.gs, original food tab untouched), LAYOUT, DARK.

## Issues found and fixed during this round

1. Toast notifications blocked taps on buttons underneath for up to 6 s → toasts no longer intercept taps.
2. A long dashboard button made the page wider than the screen (sideways scroll) → wraps now; overflow check added.
3. Audit items: day auto-complete threshold, per-entry rounding drift, copy-day duplicates, missing remaining macros, unit gram labels,
   blank/decimal-comma import cells, recipe-entry grams, score tolerance, noisy energy warnings — all fixed and covered by tests.

## Needs you (cannot be verified from here)

* Install / camera barcode scanning / notifications on your Samsung phone.
* The Apps Script against your real spreadsheet (requires your Google login and the "Allow" click).
