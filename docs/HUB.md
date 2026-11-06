# MEGO Nutrition Hub — the app's single Google Sheets source of truth

| | |
| --- | --- |
| Name | **MEGO Nutrition Hub** (renamed on 2026-11-06 from «نظام_التنشيف_والتضخيم.xlsx»; ID unchanged) |
| ID | `1mxqBI9_oiXCVpta2aRCDutYh9as_2NuI` |
| Owner | ahmedmego967@gmail.com |
| Format | **Excel (.xlsx) stored in Google Drive**, opened by Google Sheets in Office-compatibility mode |
| Hard-coded in | `apps-script/Code.gs` (`HUB_ID`) and the app (`src/lib/sync.ts`, `HUB_ID`) — the app refuses any backend that reports another ID |

## 1. Audit (read-only, 2026-11-06)

* The whole file was read through the Google Drive connector; **nothing was written** except the rename you asked for.
* Food tab «قاعدة بيانات الأطعمة»: **160 foods**, columns الاسم · الفئة · سعرات/100غ · بروتين · كارب · دهون · وزن الحبة/الحصة · الحالة · طريقة التحضير · ملاحظات.
  All 160 rows were compared with the copy used to build and test the app: **0 differences** in name, calories, protein, carbs, fat, piece weight or raw/cooked status.
* Other tabs (from the 2026-11-02 copy of this file): لوحة التحكم، اليوم، الإعدادات، سجل التغذية، بناء الوجبات، مكتبة خطط الوجبات، المخطط اليومي للوجبات، التحضير الأسبوعي، البدائل الغذائية، سجل التمارين، المتابعة الأسبوعية، التقدم، التعافي، التضخيم، التنشيف، إرشادات ونصائح، الملخص والمقارنة، دليل الاستخدام، معايرة خطط الوجبات، Food DB Audit Log, and several test-result tabs (RESULT_*).
* In its Excel form the file shows **2,579 cells with `#NAME?`** (formulas that use Google-Sheets-only functions/named ranges cannot be evaluated inside an .xlsx). They are not data loss, but they confirm the file is being used outside its native format.
* Data-quality findings for the food values are unchanged from the earlier audit (4 placeholder rows with 0/0/0/0, a few estimated/unverified rows flagged in their notes). **No food value was changed.**

## 2. The format question (needs your decision)

Google Apps Script — the only way to give the app a private backend inside your Google account — **cannot open or write an .xlsx file as a spreadsheet**.
Converting a file to native Google Sheets **always creates a new file with a new ID**; Google offers no in-place conversion. So the two requirements "use exactly this ID" and "write the app's records into it" cannot both be met while the file stays .xlsx.

| Option | What happens | Result |
| --- | --- | --- |
| **A. Convert (recommended)** | Run `convertHubToGoogleSheets()` once. It creates a native «MEGO Nutrition Hub», renames the .xlsx to «MEGO Nutrition Hub (original .xlsx archive)» and leaves it untouched. Then `HUB_ID` is set to the new ID in both the script and the app (one line each). | Full two-way sync, dashboard, structured tabs, formulas work again. The .xlsx stays as a frozen archive. |
| **B. Keep the .xlsx** | Nothing to do. | The backend runs **read-only** on the exact ID: foods are imported through a temporary converted copy that is deleted immediately. Diary, weight, water etc. stay on the phone (and in local/Drive JSON backups) but are **not** written to the sheet. |

The backend already supports both; it reports its mode to the app (Settings shows "full sync" or "read-only").

## 3. Structure after migration (native Hub)

`migrateHub()` (run once, re-runnable) — backs up first, renames, keeps every existing tab untouched, and adds:

| Tab | Owner | Contents |
| --- | --- | --- |
| Hub_Dashboard | — | Today's calories/macros vs target, water, latest & 7-day weight, food count, last sync, data version, conflicts, last backup, 14-day calorie chart, weight chart (formulas only) |
| Food_Database | **Sheet** | The 160 foods with stable IDs `F0001…`, Arabic/English name, category, kcal/protein/carbs/fat/fiber/sugar/sodium per 100 g, piece weight, raw/cooked, source, verification (verified-usda / estimated / unverified / user), notes, active |
| Food_Aliases | Sheet | Search terms per food ID |
| Food_Log | App | One row per diary entry: record ID, date, meal, food/recipe ID, quantity, unit, grams, kcal, protein, carbs, fat, fiber + full record |
| Body_Measurements · Weight_Log | App | Weight, waist and other measurements (Weight_Log is a derived readable view) |
| Daily_Log · Water_Log · Habits_Log | App | Water, day status, habits (Water/Habits logs are derived views) |
| Recipes · Saved_Meals · Meal_Plan_Templates · Meal_Plans | App | Your recipes, saved meals, reusable plans and planned days |
| Fasting_Log · App_KeyValue | App | Fasting sessions; ratings, favorites, shopping-list checks, pantry |
| Settings_App | Both | Profile, goal, targets — newest `updated_at` wins |
| Sync_Metadata | Backend | schemaVersion, dataVersion, lastSyncAt, lastWriteAt, lastConflicts, appSchemaVersion |
| Deleted_Records | Backend | Every deleted row (soft delete) for recovery |
| Backup_Log | Backend | Every Drive backup |
| Migration_Report | Backend | What the migration did, counts, rollback instructions |

Every data tab is a plain table (row 1 = headers, no merged cells). The last two columns of app tables are `updated_at` and `json` (the full record, so nothing is lost in a round trip).

**Data ownership:** food values come from Food_Database (the app never overwrites them unless you turn on write-back, which updates Food_Database — never the original tab — after a daily Drive backup). Personal records originate in the app. Settings are two-way.

**Sync rules:** every upsert carries `updated_at`; an older copy (e.g. from a phone that was offline) is rejected and reported as a conflict, and the app then pulls the newer record. Deletes move the row to Deleted_Records. Each write bumps `dataVersion`. Requests are validated (table whitelist, record shape, size limits); invalid requests are rejected whole.

## 4. Security model

* The script runs **as you** and is the only thing with access to the Hub. The web-app URL is public by necessity (a PWA cannot send Google login cookies), so every request must carry a **256-bit token** that exists only in the script's properties and on your phone. It is never in the app's source code or the repository.
* Run `rotateToken()` if the token is ever exposed.
* The app accepts the backend only if it reports `spreadsheetId = 1mxqBI9_oiXCVpta2aRCDutYh9as_2NuI` (or the converted ID after option A).
* Progress photos are never uploaded.

## 5. Migration plan & rollback

1. Full Drive copy of the Hub (`BACKUP MEGO Nutrition Hub — before migrateHub — <date>`).
2. Record tab names (Migration_Report) and food count (160).
3. Add the new tabs; copy foods into Food_Database with IDs; values are copied, never edited; flagged rows are counted, not changed.
4. Build Hub_Dashboard.
5. Rollback: delete the added tabs, or open the backup copy. The original tabs are never modified by the migration.

## 6. Status (honest)

| Item | Status |
| --- | --- |
| Rename to «MEGO Nutrition Hub», same ID | ✅ done and verified through Google Drive |
| Read-only audit of the real file (160 foods identical) | ✅ done |
| Backend v3 (fixed HUB_ID, both modes, migration, dashboard, validation, conflicts, soft delete, versioning) | ✅ written; tested against an emulated Hub in both modes |
| App: exclusive Hub ID, stable food IDs, read-only mode handling | ✅ implemented and tested |
| Running the backend against the **real** Hub | ⏳ needs your Google authorization (I cannot authorize Apps Script on your behalf) |
| Converting the .xlsx (option A) | ⏳ needs your explicit approval |
