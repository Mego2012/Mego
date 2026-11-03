# Phase 1 — Audit of the existing Google Sheets food database

**Source inspected (read-only):** the sheet link in the brief was still a placeholder, so I searched your Google Drive.
I inspected:

* `TEST COPY T2 of live (2026-11-02)` — structure of all tabs of the current system (most recent copy of the live file).
* `NC_STAGE_context (read-only extract of food DB and tips)` — CSV export of the food tab (160 food rows).

**Nothing in Google Drive was modified.** No backup was needed because nothing was written; the Apps Script `setup()`
creates a full spreadsheet copy before the app is ever allowed to write anything.

> ⚠️ Please confirm which file is the live spreadsheet. The Apps Script must be attached to that file (see SETUP.md).

## Structure

Food tab **`قاعدة بيانات الأطعمة`** (range A1:J162 in the live copy: a title row, a header row, 160 food rows):

| Column | Header | Meaning | App field |
| --- | --- | --- | --- |
| A | الاسم | Food name (Arabic) | `nameAr` (sync key) |
| B | الفئة | Category: بروتين، كارب، دهون، ألبان، خضار، فاكهة، مكملات | `category` |
| C | سعرات/100غ | kcal per 100 g | `per100.kcal` |
| D | بروتين/100غ (غ) | protein g / 100 g | `per100.protein` |
| E | كارب/100غ (غ) | carbs g / 100 g | `per100.carbs` |
| F | دهون/100غ (غ) | fat g / 100 g | `per100.fat` |
| G | وزن الحبة/الحصة (غ) | weight of one piece / serving | `pieceGrams` (enables *piece* / *slice* units) |
| H | الحالة | raw / cooked status (free text) | `state` (normalized) + `stateLabel` (original kept) |
| I | طريقة التحضير | preparation method | `prep` |
| J | ملاحظات | notes / sources (USDA references, warnings) | `notes` |

All values are **per 100 g** — the app uses this as the single nutritional basis.

## Raw vs cooked

The status column uses these labels; the app maps them without guessing and keeps the original text:

| Sheet label | App state |
| --- | --- |
| نيء | raw |
| مطبوخ، مطهي، مقلي/مبرّد ومقرمش، مقلي بقليل زيت | cooked |
| مطبوخ/مصنّع، محضّر، مسحوق، — (blank) | ready / processed (neither raw nor cooked) |

Raw and cooked versions are **separate records** (e.g. صدر دجاج نيء 120 kcal vs صدر دجاج مشوي 165 kcal; أرز أبيض نيء 360 vs أرز أبيض مطبوخ 130).
The app never converts between them. The search screen has a raw/cooked filter and every logged entry shows its state.

Note: the Tips tab says "كل الأوزان في الجدول نيئة" (all weights are raw), but the database contains many cooked records. The app relies on each row's status column, not on that tip.

## Data-quality findings

| # | Finding | Examples | How the app handles it |
| --- | --- | --- | --- |
| 1 | **Placeholder rows with 0/0/0/0** marked "⚠️ بيانات غذائية مطلوبة" | فرخة متبلة كاملة — نيء / مطهي، نصف فرخة متبلة — نيء / مطهي | Imported and kept, flagged *incomplete*, **cannot be logged** until you enter values (no invented numbers). |
| 2 | **Values flagged in notes** as unverified / estimated / approximate | لبنة، صدر دجاج (قلاية هوائية)، خضار مشكلة، فلفل رومي، كوسا مشوية، مايونيز لايت، صدر دجاج بروستد | Imported unchanged; counted under *Data issues*. |
| 3 | **Calories inconsistent with macros** (>15% from 4P+4C+9F) | خضار مشكلة: 77 kcal vs 64.7 computed | Flagged in import preview and on the Foods screen; values unchanged. |
| 4 | **Name / value mismatch** | حليب قليل الدسم stores 50 kcal = 2% milk (1% would be 42) — already noted in the sheet | Unchanged; visible in notes. |
| 5 | **Near-duplicates** (same food, different fat level) | لحم بقري مفروم مطبوخ vs لحم بقري مفروم مطبوخ (80/20) | Kept as separate records. Exact duplicate names would be flagged and imported with a `#2` key — none were seen. |
| 6 | **Free-text status values** (8 variants) | see table above | Normalized to raw / cooked / ready, original label preserved. |

The import screen re-runs this audit automatically on every import and lists every affected row with its sheet row number.

## Values verified for the acceptance tests

Taken directly from your sheet (and used in `tests/fixtures/food-sheet-sample.csv`):

| Food | Status | kcal | P | C | F | Piece (g) |
| --- | --- | --- | --- | --- | --- | --- |
| صدر دجاج | نيء | 120 | 23 | 0 | 2.6 | 150 |
| صدر دجاج مشوي | مطبوخ | 165 | 31 | 0 | 3.6 | 140 |
| بيض كامل | نيء | 143 | 13 | 1.1 | 10 | 55 |
| توست بر (خبز أسمر) | محضّر | 247 | 13 | 41 | 3.4 | 28 |
