# Test report — v3 (2026-11-06)

Re-run everything with:

```bash
npx tsc -b                 # TypeScript: 0 errors
npm test                   # unit tests (48 with the private real-food file present; 38 + 10 skipped without it)
npm run build
npm run e2e                # 39 browser checks, emulated Samsung Galaxy S9+, Arabic locale
npm run e2e:scroll         # 103 touch-swipe scroll checks (3 Samsung viewports × AR/EN × 13 screens + 4 sheet flows + control)
node e2e/migration-test.mjs <dir>   # v1 → v2 upgrade (see file header)
```

Legend: **Verified** = executed here against the real code · **Simulated** = executed against an emulation of an external service ·
**Unverified** = needs your device/account.

## Mobile scrolling (highest priority)

| | |
| --- | --- |
| Reproduced on the **live v2 site** | ✅ Verified: with real touch events (control page scrolls 431 px) no screen scrolled at all (scrollY stayed 0 on every page) |
| Root cause | `html, body { overflow-x: hidden }` (added in v2) made `<body>` its own scroll container → touch swipes stopped scrolling the page in Chrome mobile. Secondary bug: sheets saved/restored `body.style.overflow`; when a parent and child sheet closed together the page stayed locked (reproduced: "Escape closes nested sheets" left the page locked). |
| Fix | Removed overflow from html/body (`overflow-x: clip` on `.app`), reference-counted scroll lock, Escape/Back close only the top sheet, no nested scroll boxes (one was found and removed on the Cook tab — the test caught it on the 320 px screen) |
| Regression suite | ✅ **103/103** — every screen reaches its real bottom, last content above the bottom nav, no horizontal overflow, never left locked; Galaxy S23 (360×780), A54 (412×915), S9+ (320×658); Arabic RTL + English LTR |
| Physical Samsung phone | ⏳ Unverified — please confirm on your phone (emulated touch input is the closest test possible here) |

## Unit tests — 48/48 (Verified)

Nutrition engine, raw vs cooked (200 g raw rice 720 kcal vs cooked 260), all 160 foods imported unchanged, energy explanations,
precision/rounding, remaining macros, units, undo, recipe grams, import validation (blank cells, decimal comma), **101 library recipes all
calculable from your food database**, suggestions (350 kcal / 25 g protein case), week plan near 2000/160/200/62, shopping list, goals and
recommendations (never auto-applied), progress estimate, water/habits/fasting, backups & validated restore, barcode (mocked network),
**MEGO Nutrition Hub backend v3** (see below), stable-ID switch-over without duplicates.

## Browser checks — 39/39 (Verified, Google/Open-Food-Facts simulated)

Original 15 scenarios + SETUP, IMPORT, DASH, BODY, REMAIN, UNDO, COPYGUARD, LIBRARY, SUGGEST, GOAL, PLAN, HABITS, BARCODE, PHOTO, BACKUP,
SYNC2, **HUBINFO, LIB100, COOK, BACKBTN, STREAK, REPLACE**, LAYOUT, DARK.

## MEGO Nutrition Hub (Simulated — real file needs your authorization)

The real `apps-script/Code.gs` runs inside an emulation of Apps Script/Drive/Sheets (`e2e/gas-mock.mjs`) in both modes:

| Check | Result |
| --- | --- |
| Unauthorized requests rejected | ✅ |
| Backend reports exactly `1mxqBI9_oiXCVpta2aRCDutYh9as_2NuI`; app refuses any other ID (e.g. the TEST COPY) | ✅ |
| Excel Hub: read-only, foods read via temporary copy that is deleted, writes refused, original untouched | ✅ |
| Native Hub: `migrateHub` backs up first, renames, creates 17 tabs, 160 foods → Food_Database with IDs F0001…, original food tab byte-identical, re-run adds no duplicates, report counts 4 placeholder rows | ✅ |
| Push/pull, incremental pull, Weight_Log / Recipe_Ingredients / Shopping_List views | ✅ |
| Conflict: older offline copy rejected and reported; newer kept | ✅ |
| Soft delete to Deleted_Records; data version increments | ✅ |
| Validation: unknown table, bad date, impossible weight, oversized payload | ✅ rejected |
| Food write-back goes to Food_Database only, after a daily Drive backup | ✅ |

Real-file checks done here: rename to «MEGO Nutrition Hub» with the same ID (✅ via Google Drive), read-only audit of the real file
(✅ 160 foods identical). **Not done:** running the script against the real file (needs your Google authorization).

## Not verifiable here

Physical Samsung touch scrolling, PWA install, camera barcode, notifications, the real Apps Script deployment.
