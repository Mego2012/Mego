# Mego Nutrition — personal nutrition & diet tracker (PWA)

A mobile-first, installable, offline-capable nutrition tracker built around **your own Google Sheets food database**.
Arabic (full RTL) and English, light and dark mode. No workouts — nutrition, body weight and progress only.

* **Setup / Android install / backups / maintenance:** [docs/SETUP.md](docs/SETUP.md)
* **Audit of your food database:** [docs/AUDIT.md](docs/AUDIT.md)
* **Test report (15 scenarios):** [docs/TEST-REPORT.md](docs/TEST-REPORT.md)

## Features

| Area | What you get |
| --- | --- |
| Dashboard | Calorie ring (target / consumed / remaining / %), protein-carb-fat bars, per-meal summaries, meals logged, daily goal score, current weight, weekly calorie average, weekly weight trend, 7-day chart, insights |
| Food diary | Breakfast / lunch / dinner / snacks; g, kg, ml, piece, slice, tbsp, tsp and custom servings; edit, move, duplicate, delete; copy meal / day / yesterday; saved meals; any past date; day marked fully / partially logged; training vs rest day; per-day target override |
| Food database | Search Arabic + English (forgiving of أ/ا, ة/ه…), filters (category, raw/cooked, kcal, protein, carbs, fat), favorites, recent, custom foods, edit with version history, delete = archive with confirmation, CSV/Excel import with audit preview, CSV/Excel export in the sheet's own column layout |
| Recipes & saved meals | Multi-ingredient recipes with raw/cooked status, totals and per-serving values, log servings; saved meals log in one tap |
| Meal planner | Week view, reusable day plans (training / rest / any), apply to days, copy between days, adjust quantities, planned-vs-actual table, log the plan |
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
