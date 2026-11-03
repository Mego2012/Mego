# Test report

Every result below came from an actual run in this repository (2026-11-03). Re-run them with:

```bash
npm test                      # 21 unit tests (calculation & data-integrity logic, in-memory IndexedDB)
npm run build && npm run e2e  # 20 browser checks on an emulated Samsung Galaxy S9+ (Chromium), Arabic locale
```

The e2e run uses a **mock** Google Apps Script endpoint (no real Google account is reachable from the build machine).
The food values come from rows copied from your sheet (`tests/fixtures/food-sheet-sample.csv`).

| # | Scenario | Unit | Browser | Result |
| --- | --- | --- | --- | --- |
| 1 | 100 g raw chicken breast | ✅ 120 kcal, P 23, C 0, F 2.6 | ✅ | Pass |
| 2 | 100 g cooked chicken breast uses cooked record | ✅ 165 kcal, P 31, F 3.6 | ✅ | Pass |
| 3 | 3 eggs | ✅ 165 g → 236 kcal, P 21.5, C 1.8, F 16.5 | ✅ | Pass |
| 4 | 3 slices whole-wheat toast | ✅ 84 g → 207 kcal, P 10.9, C 34.4, F 2.9 | ✅ | Pass |
| 5 | Recipe with several ingredients | ✅ totals, per serving, 1.5 servings logged | ✅ 1680 kcal / 4 = 420, logged | Pass |
| 6 | Calories 2000 → 2200 | ✅ day summary, weekly & monthly targets | ✅ dashboard target, remaining (1052), % (52) | Pass |
| 7 | Protein 160 → 170 | ✅ | ✅ macro bars show /170, reports use 170 | Pass |
| 8 | Log on a previous date | ✅ | ✅ | Pass |
| 9 | Weekly report | ✅ averages from complete days only, partial/empty separated, weight & waist, comparison | ✅ | Pass |
| 10 | Monthly report | ✅ | ✅ + CSV and Excel downloads | Pass |
| 11 | Edit a food; history unchanged | ✅ old entry keeps 120 kcal (also after editing its quantity / copying), new entry uses 110, change logged | ✅ | Pass |
| 12 | Close & reopen | — | ✅ browser profile closed and relaunched; entries and targets present | Pass |
| 13 | Offline logging → reconnect → sync | — | ✅ 0 uploads while offline, pending counter shown, entry uploaded after reconnect | Pass |
| 14 | Install PWA on Android | — | ⚠️ Partially verified: manifest (standalone, 192/512 icons), active service worker, app loads offline | **Must be confirmed on your phone** |
| 15 | Arabic ⇄ English | — | ✅ `dir` switches rtl/ltr, labels change, charts mirror | Pass |

Additional checks that pass: idempotent re-import (no duplicates, nothing deleted), placeholder 0/0/0/0 foods blocked from logging,
double-tap duplicate guard, one body measurement per date, insights refuse to judge with insufficient data and treat a single weigh-in
as a fluctuation, backup → restore into an empty database, dark mode.

## Not verified here (needs you)

* **Test 14 on a real Samsung phone** — install from Chrome and run through the main screens.
* **The real Apps Script** against your live spreadsheet (the protocol is covered by the mock; Google's own behaviour is not).
* **GitHub Pages deployment** — needs Pages enabled in repository settings (see SETUP.md).
