# Test report — v3.1 (2026-11-06)

Re-run everything with:

```bash
npx tsc -b                 # TypeScript: 0 errors
npm test                   # unit tests (59 with the private real-food file present; 49 + 10 skipped without it)
npm run build
npm run e2e                # 40 browser checks, emulated Samsung Galaxy S9+, Arabic locale
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

## AI meal scanner (Verified app + backend code; Claude API Simulated)

The REAL `apps-script/Code.gs` runs in the emulator; only the HTTPS call to the Claude Messages API is replaced by a scripted stand-in that reads
the food catalog the backend actually sent. **A real call to Claude has not been made yet — it needs your API key (Step 2b of PHONE-SETUP).**

| Scenario | Result |
| --- | --- |
| Rice & chicken (+ oil) | ✅ 3 DB matches; values = `macrosFor` = manual logging of the same grams; oil flagged, must be confirmed |
| Eggs (AI matched the RAW egg row to boiled eggs) | ✅ match refused (`stateMismatch`), shown as estimate, cannot be logged without your choice |
| Sandwich (hidden filling not in DB) | ✅ estimate labelled; added as new unverified food only after explicit approval |
| Salad (+ dressing) | ✅ dressing flagged as hidden fat; totals = sum of items |
| Restaurant burger & fries | ✅ all estimates, low confidence; replacing with a DB food logs exact DB values |
| Homemade kabsa | ✅ grams edit recalculates instantly; dashboard total & remaining updated after save |
| Mixed meal (same bread twice) | ✅ merged into one entry (90 g) |
| Not food | ✅ no items, save blocked |
| Errors | ✅ no key, invalid key (401), busy (529), network failure, refusal, daily limit, wrong token, bad image, offline phone, no backend |
| Request content | ✅ model `claude-opus-5-5`, image block first, JSON schema output; no token/weight/targets/profile; API key never returned |
| Browser (SCAN) | ✅ camera input → offline message → analyse → 3 DB items → save disabled until oil confirmed → 200→180 g recalculates (578→552 kcal) → nothing saved before confirm → dashboard +552; image sent was a re-encoded JPEG without EXIF |

## Unit tests — 59/59 (Verified)

Nutrition engine, raw vs cooked (200 g raw rice 720 kcal vs cooked 260), all 160 foods imported unchanged, energy explanations,
precision/rounding, remaining macros, units, undo, recipe grams, import validation (blank cells, decimal comma), **101 library recipes all
calculable from your food database**, suggestions (350 kcal / 25 g protein case), week plan near 2000/160/200/62, shopping list, goals and
recommendations (never auto-applied), progress estimate, water/habits/fasting, backups & validated restore, barcode (mocked network),
**MEGO Nutrition Hub backend v3** (see below), stable-ID switch-over without duplicates.

## Browser checks — 40/40 (Verified, Google/Open-Food-Facts/Claude simulated)

Original 15 scenarios + SETUP, IMPORT, DASH, BODY, REMAIN, UNDO, COPYGUARD, LIBRARY, SUGGEST, GOAL, PLAN, HABITS, BARCODE, PHOTO, BACKUP,
SYNC2, **HUBINFO, SCAN, LIB100, COOK, BACKBTN, STREAK, REPLACE**, LAYOUT, DARK.

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

Physical Samsung touch scrolling, PWA install, camera barcode, the phone camera opening from «Take a photo», notifications, the real Apps Script deployment, and real Claude photo analysis (accuracy of identification/portion estimates on your meals).
