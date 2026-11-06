# Feature list (v4)

See also [ARCHITECTURE.md](ARCHITECTURE.md) for the public multi-user platform and its security model.

Status legend: ✅ implemented and tested here · 🔶 implemented, needs your device/account to fully verify · 🔌 needs an external service

## Nutrition engine
| Feature | Status |
| --- | --- |
| Per-100 g basis from your Google Sheet (160 foods, imported unchanged) | ✅ |
| Raw / cooked / ready-to-eat records kept separate; never converted | ✅ |
| Units: g, kg, ml, L, cup (240 ml), tbsp (15 ml), tsp (5 ml), piece, slice, custom servings — every unit shows its gram weight | ✅ |
| Density per food for ml/cup/tbsp (else 1 ml = 1 g, shown to the user) | ✅ |
| Entries store values at 0.01 precision; rounding only on screen (no drift) | ✅ |
| Each diary entry keeps a snapshot of the values used when logged | ✅ |
| Fiber / sugar / sodium per food (optional; unknown ≠ 0, coverage shown) | ✅ |
| Calories-vs-macros check that explains fiber, nut and animal-food factors instead of calling them errors | ✅ |
| Import validation: blank values block the food, decimal commas detected, duplicates flagged | ✅ |

## Logging
| Feature | Status |
| --- | --- |
| Breakfast / lunch / dinner / snacks, any date | ✅ |
| Search Arabic + English, raw/cooked filter, favorites, recent, **frequent**, **history** (re-log past items in one tap) | ✅ |
| Edit quantity / unit / meal / date, duplicate, **copy to another date**, delete with confirmation | ✅ |
| **Undo** for add, delete, edit, copy, saved-meal logging | ✅ |
| Copy yesterday / copy meal / copy day — **asks before adding into a day that already has entries** | ✅ |
| Saved meals (templates) and recipes | ✅ |
| Day marked fully / partially logged; auto-complete only when ≥ 60 % (configurable) of the calorie target | ✅ |
| Barcode: camera scan (Chrome on Android, BarcodeDetector) + manual entry; Open Food Facts lookup, labelled as external | 🔶 camera must be tried on the phone; lookup 🔌 Open Food Facts (free, no key) |

## v3 additions
| Feature | Status |
| --- | --- |
| **Mobile scrolling fixed** (root cause: `overflow-x: hidden` on html/body made the body a scroll container; plus a nested-sheet scroll-lock bug) | ✅ verified with real touch-event swipes on 3 Samsung viewports, AR/EN, every screen |
| Android Back button closes the open sheet; Escape closes only the top sheet | ✅ |
| Recipe library: **101 recipes** incl. 7 healthy desserts, more air-fryer/oven, chicken, eggs, rice, fish, meat, sandwiches, low-carb, high-fiber | ✅ all calculable from your 160 foods |
| «What can I cook today?»: pantry selection, match %, missing ingredients with substitutes, portions fitted to what is left today, method/time/meal filters | ✅ |
| Week planner: replace any suggested meal, copy last week's plan | ✅ |
| Habit streaks, 14-day water history | ✅ |
| Design: IBM Plex Sans Arabic (cached offline), hero dashboard with Goal − Food = Remaining, active-tab pill, skeleton loading, accessible focus/tap sizes, reduced-motion support, error screen instead of blank pages | ✅ |
| MEGO Nutrition Hub backend v5: automatic one-time Excel → native Google Sheet conversion (original kept untouched, switch only after verification), native ID pinned on the phone, Hub-vs-phone food check before import, one-line connection code, structured tabs, dashboard, data ownership, conflict detection, soft deletes, versioning, Drive backups, migration with report & rollback | ✅ emulated · 🔶 real Hub needs your authorization (see HUB.md) |
| Real food table removed from the public repo (synthetic fixture for public tests) | ✅ (still present in git history — see final report) |

## AI meal scanner (photo → diary) — free

- **📷 Take a photo / 🖼️ Upload from gallery** on the Dashboard, the Diary and the Add-food sheet (Samsung camera via `capture="environment"`).
- The photo is downscaled to ≤1024 px and re-encoded as JPEG on the phone (removes EXIF/GPS); only the pixels, your food names/states/categories
  and an optional note are sent — to **your private Apps Script backend**, which calls Google's **Gemini API free tier** (`gemini-3.8-flash`,
  JSON-schema output). The key is created in Google AI Studio **without billing** and stored only in Script Properties (set from the app,
  checked with Google first, never kept on the phone). Only free-tier Flash models can be selected; **no fallback, no paid model**.
  Free quota used up → clear message with the reset time (midnight Pacific); per-minute limit → "wait N seconds". Own daily cap `AI_DAILY_LIMIT` (default 40).
- The AI identifies items (incl. oil/sauces), estimates grams with a low–high range, raw/cooked state and cooking method, and picks the matching
  row of **your** database. **All nutrition is computed by the app's own engine from your database** (identical to manual logging).
  A raw row is never accepted for a cooked item (and vice versa) — no automatic conversion.
- Items not in your database show **⚠ AI estimate** values; they can be logged only after you choose a database food or explicitly tick
  “add as new food (estimated, unverified)”. AI estimates never replace database values.
- Review sheet: confidence chip per item, uncertain items (confidence < 60 %, hidden fat/sauce, not in DB) must be ticked “I checked this item”,
  edit name / grams / cooking method / state, change the matched food, add or remove ingredients, instant recalculation and meal total,
  choose meal and date. **Nothing is saved until you press Confirm**; the toast offers Undo. Same food twice is merged into one entry.
- Errors handled with clear AR/EN messages: offline (photo kept), timeout, backend unreachable, key missing/invalid, free quota (daily/minute),
  region, service busy, own daily limit, unreadable photo, blocked/incomplete answer, malformed output.

## Zero-cost architecture

| Part | Service | Cost |
| --- | --- | --- |
| App hosting | GitHub Pages (public repo) | free |
| Backend | Google Apps Script web app (your account) | free (Apps Script quotas) |
| Cloud data | Google Sheets «MEGO Nutrition Hub» in your Drive | free (your Drive storage) |
| Photo analysis (optional) | Gemini API free tier, key without billing | free; stops at the quota, never charges |
| Offline data / backups | phone storage (IndexedDB) + JSON backups in your Drive | free |

No paid database, hosting, image service, subscription or paid API is used. Food data lookup by barcode uses the free Open Food Facts API.

## Recipes — «وصفاتي | My Recipes»
| Feature | Status |
| --- | --- |
| 101 built-in recipes (breakfast, chicken, eggs, fish & seafood, meat, rice/grains/legumes, sandwiches & wraps, low-carb, high-fiber, snacks, desserts, meal-prep, air-fryer, oven) | ✅ |
| Arabic + English names and steps, prep/cook time, difficulty, servings, methods, gram quantities, tips & air-fryer/oven variations | ✅ |
| Nutrition computed **from your food database** at runtime; seasonings not in the DB are listed as "not counted"; estimated DB foods flagged | ✅ |
| Filters: high-protein, low-calorie, low-carb (computed), chicken, eggs, rice, fish, meat, sandwiches, quick, meal-prep, high-fiber, vegetarian, breakfast, favorites | ✅ |
| Ratings (1–5) and favorites | ✅ |
| Add to diary / add to plan / save as editable recipe / duplicate | ✅ |
| Smart suggestions from what is left today — must fit calories **and** help protein; filters for calories, protein, carbs, fat, time, meal type, available ingredients; serving size scaled 0.5–2× | ✅ |
| No oats used as a default ingredient | ✅ |
| Food photos | ❌ not included (no licensed image source); an emoji icon is used |

## Planning
| Feature | Status |
| --- | --- |
| Week planner, reusable day plans, copy plan, log the plan, planned vs actual | ✅ |
| **Suggest a week plan** from the library close to your targets (varied lunches/dinners) | ✅ |
| **Shopping list** from planned meals with check-off (saved) | ✅ |

## Goals & body
| Feature | Status |
| --- | --- |
| Goal dropdown (9 goals, Arabic + English), default "fat loss while preserving muscle" | ✅ |
| Recommendation (Mifflin-St Jeor × activity, goal adjustment, protein g/kg) — **never applied without your confirmation** | ✅ |
| Training / rest-day targets, per-day overrides, tolerances | ✅ |
| Weight, waist and other measurements (one record per date), photos (stored on the phone only) | ✅ |
| Weekly/monthly averages, trend chart with 7-day average, rate of change (trend line), estimated target date, pace warning (> 1 %/week) | ✅ |

## Water & habits
| Feature | Status |
| --- | --- |
| Water tracking with target and quick buttons (dashboard, diary, habits page) | ✅ |
| Custom daily habits with completion % | ✅ |
| Fasting timer with history | ✅ |
| Reminders (water/meals/weigh-in) with times | 🔶 fire while the app is open or in the background; reliable alerts when fully closed need a push service 🔌 |

## Reports
Daily (diary), weekly and monthly: averages, consistency, complete/partial/empty days, weight & waist, comparison with the previous period, charts, macro split, water, top foods, best & lowest days, fiber indicator (only when fiber data exists), CSV / Excel / print-to-PDF. ✅

## Data, sync & backup
| Feature | Status |
| --- | --- |
| On-phone database (IndexedDB) — offline first | ✅ |
| Automatic daily on-phone backups (last 10), backup before import / restore / sheet restore, **snapshot before every database upgrade** | ✅ |
| Download / restore backup file (validated before restore, merge-only) | ✅ |
| Google Sheets sync via your Apps Script: auto + manual, pending counter, last sync time, error + automatic retry (5 s → 5 min), duplicate-safe upserts, **conflict detection (older data never overwrites newer)**, soft delete to `APP_trash`, data version in `APP_meta` | ✅ tested against the real `Code.gs` in an emulated spreadsheet · 🔶 needs your Google authorization to run for real |
| Original food tab read-only unless you enable write-back (then backed up first + logged) | ✅ |
| Backup to Google Drive | 🔶 |
