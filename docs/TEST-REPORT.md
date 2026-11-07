# Test report — 1.1 release audit (2026-11-07)

Re-run everything with:

```bash
npx tsc -b                 # TypeScript: 0 errors
npm test                   # unit tests (68 with the private real-food file present; some value tests skip without it)
npm run build
npm run e2e                # 41 browser checks, emulated Samsung Galaxy S9+, Arabic locale
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

## Summary of suites (all executed here)

| Suite | Result | What it covers |
| --- | --- | --- |
| `npm test` | 109/109 | food-photo matching + attribution, ranking data-completeness rules, traceable education sources, nutrition engine, real 160 foods, USDA database integrity + exact spot values, bilingual search, custom foods, coach, rankings, scanner, Code.gs (owner + public AI paths), i18n coverage |
| `npm run test:rules` | 14/14 | Firestore rules on Google's official emulator: 3 users isolated, admin without private access, suspension, older-copy rule; real Firebase SDK sync incl. live second device |
| `npm run e2e` | 44/44 | guest-mode browser checks (Samsung-size) on the redesigned screens, incl. FOODDB, COACH, SCAN, DEEPLINK, LAYOUT (no horizontal overflow on any screen), DARK |
| `npm run e2e:multi` | 8/8 | real browsers vs Firebase emulators: 3 registrations, isolation (server 403), two devices live, AI per-user limit, password reset, food submission review, admin suspend, sign-out, account deletion |
| `npm run e2e:scroll` | 103/103 | touch scrolling on 3 Samsung viewports × AR/EN |
| `npm run e2e:laptop` | 10/10 | laptop setup script against the real Code.gs over HTTP |

Visual audit: `VITE_DEMO=1 npx vite build && node scripts/screenshots.mjs <profile>` captures 25 screens × Arabic/English ×
light/dark (`docs/screenshots/`); `SHOTS=1 npm run e2e:multi` adds welcome, registration, account and admin screens.
Every screenshot was inspected; issues found and fixed are listed in `docs/PROGRESS-LOG.md`.

**Not yet verified on real services** (needs the owner's laptop / accounts): real Firebase project, real Google Sheet
conversion, real Gemini calls, real Android device camera and install.

## Zero-cost check (Verified by code search + tests)

* No Anthropic/Claude, OpenAI, Stripe or other paid endpoint remains in the app, the backend or the tests' expectations (`grep` clean;
  the scanner test asserts the request contains no `fallback`/`anthropic`/`claude`).
* The only AI endpoint is `generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent` (Gemini API free tier).
  `AI_MODEL` can only select free-tier Flash models (`gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`); a paid model
  name (e.g. `gemini-4-argon`) is ignored — tested. One request per scan: no retry on another model, no fallback — tested.
* Free quota exhausted (429 per-day) → "resets at HH:MM (your time)"; per-minute → "wait N s" — tested; reset time = midnight Pacific, DST-aware — tested.
* Google's terms (checked 2026-11-06): the free tier needs no billing account; moving to paid requires linking billing **and** prepaying;
  free-tier content may be used to improve Google products and seen by human reviewers → only the meal photo (EXIF removed) and food names are sent.

## Hub conversion (Simulated Drive/Sheets, real Code.gs, all 160 real foods)

| Check | Result |
| --- | --- |
| `installMego()` converts the Excel Hub once, same folder, native type, description pointing to the original | ✅ |
| Original .xlsx: not renamed, no tab/cell changed, not trashed (before and after writes) | ✅ |
| Verification (food tab, 160 foods, numbers readable) before switching; failed verification → no switch, Hub stays on the original | ✅ |
| All **160 foods value-by-value** (kcal, protein, carbs, fat, piece weight) identical between the original tab and Food_Database | ✅ |
| Running again: no second conversion, no duplicates | ✅ |
| Connection code `MEGO1|url|token` printed; app parses it, rejects non-Google URLs | ✅ |
| App pins the native ID; another source or a later different sheet is refused | ✅ |
| Phone-vs-Hub food check: 160/160 identical, read-only; a changed value is reported, not applied | ✅ |
| File import after Hub IDs: **bug found and fixed** (20 duplicates in the browser run) → now 0 duplicates, values unchanged | ✅ |
| Browser SETUP: one-line code → verified → foods imported → records uploaded; SYNC2: everything in the converted Hub, Excel untouched | ✅ |

## AI meal scanner (Verified app + backend code; Gemini API Simulated)

The REAL `apps-script/Code.gs` runs in the emulator; only the HTTPS call to Google is replaced by a stand-in that uses Gemini's request,
response and error formats and reads the food catalog the backend actually sent. **No real Gemini call has been made yet — it needs your free key.**

| Scenario | Result |
| --- | --- |
| Rice & chicken (+ oil) | ✅ 3 DB matches; values = `macrosFor` = manual logging of the same grams; oil flagged, must be confirmed |
| Eggs (AI matched the RAW egg row to boiled eggs) | ✅ match refused, shown as estimate, cannot be logged without your choice |
| Sandwich (hidden filling not in DB) | ✅ estimate labelled; added as new unverified food only after explicit approval |
| Salad (+ dressing) | ✅ dressing flagged as hidden fat; totals = sum of items |
| Restaurant burger & fries | ✅ all estimates, low confidence; replacing with a DB food logs exact DB values |
| Homemade kabsa | ✅ grams edit recalculates instantly; dashboard total & remaining updated after save |
| Mixed meal (same bread twice) | ✅ merged into one entry (90 g) |
| Not food | ✅ no items, save blocked |
| Errors | ✅ no key, invalid key, region, model unavailable, busy (503), network failure, blocked (SAFETY), truncated, own daily limit, wrong token, bad image, offline phone, no backend |
| Key handling | ✅ checked with Google (metadata call) before saving; stored only in Script Properties; never returned, never in the URL, never on the phone (browser check reads IndexedDB) |
| Browser (SCAN) | ✅ camera input → offline message → analyse → 3 DB items → save disabled until oil confirmed → 200→180 g recalculates (578→552 kcal) → nothing saved before confirm → dashboard +552; image sent was a re-encoded JPEG without EXIF |

## Unit tests — 68/68 (Verified)

Nutrition engine, raw vs cooked (200 g raw rice 720 kcal vs cooked 260), all 160 foods imported unchanged, energy explanations,
precision/rounding, remaining macros, units, undo, recipe grams, import validation (blank cells, decimal comma), **101 library recipes all
calculable from your food database**, suggestions (350 kcal / 25 g protein case), week plan near 2000/160/200/62, shopping list, goals and
recommendations (never auto-applied), progress estimate, water/habits/fasting, backups & validated restore, barcode (mocked network),
**MEGO Nutrition Hub backend v3** (see below), stable-ID switch-over without duplicates.

## Browser checks — 41/41 (Verified, Google/Open-Food-Facts/Gemini simulated)

Original 15 scenarios + SETUP, IMPORT, DASH, BODY, REMAIN, UNDO, COPYGUARD, LIBRARY, SUGGEST, GOAL, PLAN, HABITS, BARCODE, PHOTO, BACKUP,
SYNC2, **HUBINFO, AIKEY, SCAN, LIB100, COOK, BACKBTN, STREAK, REPLACE**, LAYOUT, DARK.

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

Physical Samsung touch scrolling, PWA install, camera barcode, the phone camera opening from «Take a photo», notifications, the real Apps Script deployment and conversion of your real file (needs your Google authorization), and real Gemini photo analysis (needs your free key; accuracy on your meals).
