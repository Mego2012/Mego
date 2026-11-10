# Mego Nutrition — personal nutrition & diet tracker (PWA)

A mobile-first, installable, offline-capable nutrition tracker built around **your own Google Sheets food database**.
Arabic (full RTL) and English, light and dark mode. Nutrition, body weight and progress, plus cardio tracking, strength-training programs with a rule-based training coach, and an illustrated guide for 54 exercises.

* **Live app:** https://mego2012.github.io/Mego/
* **Architecture, security model, free-tier limits:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
* **Setup (laptop, one command) / phone-only:** [docs/PHONE-SETUP.md](docs/PHONE-SETUP.md)
* **Full feature list:** [docs/FEATURES.md](docs/FEATURES.md)
* **Setup / Android install / backups / maintenance:** [docs/SETUP.md](docs/SETUP.md)
* **Audit of your food database:** [docs/AUDIT.md](docs/AUDIT.md)
* **Test report (15 scenarios):** [docs/TEST-REPORT.md](docs/TEST-REPORT.md)

## Free to run — no billing anywhere

GitHub Pages (hosting) · Google Apps Script (private backend, your account) · Google Sheets «MEGO Nutrition Hub» (cloud data) ·
optional **Gemini API free tier** for the photo meal scanner (key without billing — it cannot be charged; no paid or fallback model;
stops with a clear message when the free quota is used up) · phone storage + Drive JSON backups. No paid API, database, hosting or subscription.

## Features

| Area | What you get |
| --- | --- |
| Dashboard | Calorie ring (target / consumed / remaining / %), protein-carb-fat bars, per-meal summaries, meals logged, daily goal score, current weight, weekly calorie average, weekly weight trend, 7-day chart, insights |
| Public accounts | Registration with onboarding, private data per account (server-enforced), sign-in on several devices with live sync, password reset, export, account deletion, admin dashboard without access to private data — free Firebase Spark plan |
| Food database | 12,879 USDA FoodData Central foods (public domain) + your verified 160, Arabic/English search with dialect words and typos, custom foods from nutrition labels, submissions reviewed by an admin |
| Coach & Food intelligence | Daily/weekly/monthly coaching from your own logs, transparent goal-dependent food rankings (amino-acid score, NRF9.3, omega-3…), education center with cited sources |
| AI meal scanner | Photo (camera or gallery) → foods, grams with ranges, raw/cooked, cooking method, matched to YOUR food database → editable review → saved only after you confirm. Nutrition always from your database; AI estimates clearly marked |
| Food diary | Breakfast / lunch / dinner / snacks; g, kg, ml, piece, slice, tbsp, tsp and custom servings; edit, move, duplicate, delete; copy meal / day / yesterday; saved meals; any past date; day marked fully / partially logged; training vs rest day; per-day target override |
| Food database | Search Arabic + English (forgiving of أ/ا, ة/ه…), filters (category, raw/cooked, kcal, protein, carbs, fat), favorites, recent, custom foods, edit with version history, delete = archive with confirmation, CSV/Excel import with audit preview, CSV/Excel export in the sheet's own column layout |
| Recipes «وصفاتي» | 101 built-in recipes computed from your own foods (USDA references where you have none; missing ingredients are never estimated), smart suggestions from what's left today, recipe builder, ratings, favorites, saved meals |
| Meal planner | Week view, reusable day plans, automatic week plan from the library, shopping list with check-off, planned-vs-actual |
| Water & habits | Water target and quick add, daily habits, fasting timer, optional reminders |
| Progress | Weight, waist and optional measurements (one record per date), daily + 7-day average chart, weekly/monthly averages, change from start, waist trend, editable history |
| Weekly & monthly reports | All 17 weekly metrics and the monthly list from the brief, previous-period comparison, any past week/month, CSV / Excel / print-to-PDF |
| Smart insights | Built only from saved data; needs ≥3 fully logged days; weight trends use weekly averages, single weigh-ins are labelled fluctuations; never suggests cutting calories/carbs from daily swings |
| Data safety | IndexedDB on the phone + automatic sync to `APP_*` tabs in your sheet, offline queue, JSON backups, Drive backups, merge-only restore |

## Architecture

```
 Phone (PWA, works offline)                       Your Google account
┌──────────────────────────────┐   HTTPS + token  ┌──────────────────────────────────────┐
│ React + TypeScript (Vite)    │ ───────────────▶ │ Apps Script web app (apps-script/)   │
│ IndexedDB (Dexie) = live DB  │   outbox queue,  │  • reads  قاعدة بيانات الأطعمة          │
│ Service worker (Workbox)     │   auto-retry     │  • writes APP_* tabs (app data copy) │
│ Reports/insights computed    │ ◀─────────────── │  • optional food write-back w/ backup │
│ locally from saved records   │   food import,   │  • Drive JSON backups                │
└──────────────────────────────┘   restore        └──────────────────────────────────────┘
```

**Why this instead of Supabase:** it keeps everything in your own Google account (the sheet you already maintain), needs no
extra service, account or monthly limits, and works fully offline. Google Sheets stays the place where you manage the food
database; the app's IndexedDB is the operational store; the `APP_*` tabs are a continuous cloud copy used for restore.
This is the "safer architecture" option from the brief — food rows flow sheet → app by default; writing back is opt-in and
always backed up first.

### Data model (IndexedDB)

| Table | Key | Notes |
| --- | --- | --- |
| `foods` | id | per-100 g values, raw/cooked/other state + original label, piece weight, density, custom servings, favorite, `sheetKey`/`sheetRow`, version |
| `foodChanges` | auto | before/after of every create/update/archive/import (change history) |
| `entries` | id | date, meal, quantity, unit, grams, **basis snapshot** (per-100 g values, piece weight…) and computed macros — never recalculated from the food table |
| `recipes`, `templates`, `plans`, `plannedDays` | id / date | recipes, saved meals, reusable day plans, plans applied to dates |
| `body` | id (unique date) | weight, waist, chest, hips, arm, thigh, neck, body fat, notes |
| `days` | date | fully/partially-logged override, training/rest override, per-day targets |
| `settings` | `main` | profile, training/rest targets, training weekdays, tolerances, language, theme, sync config (token stays on the device) |
| `outbox` | auto | pending changes for sync |
| `kv` | key | ratings, recipe favorites, shopping-list checks, reminder state |
| `fasts` | id | fasting sessions |
| `photos` | id | progress photos (device only, never synced) |
| `backups` | auto | automatic on-phone snapshots (last 10) |

### Key rules

* Targets are never hardcoded: they come from Settings (training/rest), optionally overridden per day. Starting values: 2000 kcal, 160 P, 200 C, 62 F.
* A day with no entries is **empty**, never a zero-calorie day. Averages and consistency use **fully logged** days only.
  Past days with entries count as fully logged unless you mark them partial (this can be turned off in Settings).
* Calorie target hit = within ±10 % (configurable); protein hit = ≥ 95 % of target (configurable).
* PDF export uses the browser's print → *Save as PDF*, so Arabic text and charts render correctly.

## Development

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest + fake-indexeddb)
npm run build        # production build to dist/
npm run e2e          # browser acceptance run (needs a build; uses Playwright + Chromium)
```
