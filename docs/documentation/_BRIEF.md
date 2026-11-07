# MEGO documentation — writer brief (verified facts, conventions, Drive targets)

Read this whole file before writing. Every statement in a document must be verifiable in the repository
(`/home/user/Mego`, branch `claude/nutrition-tracking-app-989rku`) or in the facts below. When something cannot be
verified, write it as "Not verified" / «غير مُتحقَّق منه» — never invent features, numbers, guarantees or test results.
NEVER include secrets: no API keys (not even the Firebase web apiKey), no Apps Script /exec URL, no APP_TOKEN, no
connection codes (MEGO1|…), no passwords. Refer to them by name (e.g. "the Gemini key stored in Script Properties").

## 1. Status facts (as of 7 Nov 2026) — verified live
| Item | Status | Evidence |
| --- | --- | --- |
| Public app | LIVE at https://mego2012.github.io/Mego/ (GitHub Pages, branch claude/nutrition-tracking-app-989rku, workflow .github/workflows/deploy.yml) | deploy runs green; live browser suite 44/44 and touch suite 103/103 run against the live URL |
| Firebase (Spark, no billing) | LIVE — project id `mego-473920`, Firestore `(default)` in `me-central2` (Dammam), rules from firebase/firestore.rules deployed, Email/Password sign-in enabled, public config served at /firebase-config.json | `scripts/live-verify.mjs` 14/14 against production (registration ×2, own profile 200 / other 403, food logging persisted under owner, B→A 403 and anonymous 403, second-device live sync, weekly + monthly report, regular account cannot list profiles / self-promote to admin / suspend others (403), password-reset request accepted (HTTP 200; inbox delivery not checked), sign-out/in, deletion of both test accounts) |
| Google Sheets Hub + Apps Script backend | LIVE — Excel source file kept untouched; converted to a native Google Sheet "MEGO Nutrition Hub" (160 foods, 0 numeric problems); backup "BACKUP MEGO Nutrition Hub — before migrateHub — 2026-11-07 1425" created; web app deployed (Execute as owner, access anyone + secret token) | laptop-setup live tests all ✅: token accepted, wrong token refused, Hub identity, native+writable, Food_Database 160/0 unreadable, write phone→Hub, read Hub→phone, older copy never overwrites newer, soft delete into Deleted_Records |
| Gemini meal scanner (free tier, model gemini-3.8-flash) | LIVE — key stored only in Apps Script Script Properties | one real photo analysis succeeded (6 items, ~72 s); a later run returned AI_BUSY (Google overload, transient). Key format: classic `AIza…` and newer `AQ.…` both accepted; Google validates the key |
| Admin account | WAITING FOR OWNER — the owner must register in the app with their e-mail, then run `node scripts/laptop-setup.mjs --cloud <email>` again (writes admins/{uid} with owner credentials). No admin exists yet. |
| Real Android device test | NOT DONE — only emulated devices (Playwright Pixel 7 / Galaxy viewports, touch events). Checklist: docs/ANDROID-TEST.md |
| Legal pages | DRAFTS in the app (#/privacy, #/terms) — need legal review; open items in docs/LEGAL-REVIEW.md |
| Old public commits a7b5bbb, 3fb3c82 | still expose tests/fixtures/foods-160.csv; support request prepared in docs/GITHUB-SUPPORT-REQUEST.md (owner must send) |
| Known operational notes | the owner's Gemini key and backend connection link were shown in a chat during setup → rotating both is recommended; Gemini free tier can return busy/quota errors; Firebase Spark limits apply |

Test suites (all passing on the final code): unit 109 (vitest, tests/), Firestore rules + cloud 14 (emulators,
tests-rules/), guest browser e2e 44 (e2e/run-e2e.mjs), touch/scroll 103 (e2e/scroll-test.mjs), multi-user 8
(e2e/multiuser-test.mjs on emulators), laptop-setup 10 (e2e/laptop-setup-test.mjs), live verification 14
(scripts/live-verify.mjs, production). Existing docs to mine: README.md, docs/*.md (ARCHITECTURE, FEATURES, HUB,
PHONE-SETUP, TEST-REPORT, PRODUCTION-STATUS, RELEASE-STATUS, PROGRESS-LOG, ANDROID-TEST, LEGAL-REVIEW,
GITHUB-SUPPORT-REQUEST), public/food-img/CREDITS.md.

## 2. Code map (verify details in the code)
* Frontend PWA: Vite + React 18 + TypeScript, HashRouter routes in src/App.tsx; pages in src/pages; components in
  src/components; i18n in src/lib/i18n*.ts (Arabic RTL + English LTR); design tokens in src/styles.css + src/screens.css.
* Local database: Dexie/IndexedDB (src/lib/db.ts); guest DB `mego-nutrition`, per-account DB `mego-u-<uid>`.
* Nutrition engine: src/lib/nutrition.ts (units, macrosFor, Atwater checks), src/lib/goals.ts (BMR/TDEE/recommend:
  kcal = max(BMR, round(TDEE×(1+adjust)/10)×10); protein = weight × proteinPerKg; fat = max(0.8 g/kg, 25% kcal/9);
  carbs = remainder/4; weekly change = (kcal−TDEE)×7/7700), src/lib/targets.ts, src/lib/reports.ts, src/lib/insights.ts.
* Foods: user foods table; USDA FoodData Central reference DB public/fooddb/usda.json (12,879 foods, SR Legacy +
  FNDDS, built by scripts/build-food-db.mjs) + usda-extra.json; bilingual search src/lib/foodSearch.ts, refFoods.ts;
  Open Food Facts (barcode + text search) src/lib/barcode.ts; custom foods + import/export src/lib/customFoods.ts,
  sheetImport.ts; food photos src/lib/foodPhotos.ts (74 Wikimedia Commons photos, public/food-img/).
* Food Intelligence & Coach: src/lib/foodIntel.ts (amino-acid score vs FAO/WHO 2007, NRF9.3, goal-dependent weights,
  partial-data foods ranked after fully measured ones), src/lib/intelCatalog.ts (83 foods), src/lib/coach.ts,
  src/lib/education.ts (13 articles, sources).
* Recipes: src/lib/recipeLibraryData*.ts (101 recipes), recipeEngine.ts; Planner src/pages/Planner.tsx; Habits/water/fasting src/pages/Habits.tsx.
* Accounts: src/lib/firebase.ts, account.ts, cloudSync.ts; pages src/pages/Account.tsx (welcome, login, reset,
  3-step registration, account card, admin dashboard, suspended screen, legal pages).
* Security rules: firebase/firestore.rules; indexes firebase/firestore.indexes.json.
* Owner Hub sync (guest/owner device): src/lib/sync.ts ↔ apps-script/Code.gs (actions: ping, pull, push, bootstrap,
  analyzeMeal, setAiKey, setCloudConfig, aiStats, …; verify the exact list in Code.gs doPost).
* AI scanner client: src/lib/mealScanner.ts, src/components/MealScanner.tsx (never auto-saves; DB values primary).
* Backups: src/lib/localBackup.ts, backup.ts, exporters.ts (CSV/XLSX/JSON).
* Setup & verification scripts: scripts/laptop-setup.mjs (flags --test, --cloud <email>, --verify, --ai-key-from-clipboard,
  --photo), scripts/live-verify.mjs, scripts/screenshots.mjs, scripts/build-food-db.mjs, scripts/food-photos/*.

## 3. Screenshots (use as <img>, width 280–320)
Base URL: https://raw.githubusercontent.com/Mego2012/Mego/claude/nutrition-tracking-app-989rku/docs/screenshots/
Files: {screen}-{ar|en}-{light|dark}.png for screens: home, diary, add-food, foods, food-editor, coach, coach-week,
coach-month, rankings, rank-carbs, rank-fats, food-detail, compare, learn, article, recipes, recipe, cook, planner,
habits, progress, week, month, settings, privacy; Arabic only: welcome-ar-*, register-ar-*, account-ar-*, admin-ar-*.
Use -ar- images in Arabic documents and -en- images in English documents (account/admin/welcome/register exist only in Arabic).

## 4. Document format (HTML uploaded to Google Drive → converted to Google Docs)
Create each document with the Google Drive tool `mcp__Google_Drive__create_file`:
title = file name (e.g. `MEGO_User_Manual_EN`), parentId = the folder id below, contentMimeType = `text/html`,
textContent = a full HTML document. Load the tool first with ToolSearch query `select:mcp__Google_Drive__create_file`.
Also save the identical HTML locally to `/home/user/Mego/docs/documentation/<folder-number>/<file name>.html`.

Required structure of every document (both languages):
1. Title block: "MEGO" + document title; a metadata table: Document ID (e.g. MEGO-DOC-07), Version 1.0,
   Created 2026-11-07, Last updated 2026-11-07, Owner: MEGO Project Owner, Status (Approved for internal use / Draft –
   requires owner approval / Draft – requires legal review), Audience, Related documents (by file name).
2. Purpose and scope.
3. Table of contents (for documents with 4+ sections) — a numbered list of section titles.
4. Numbered sections (1., 1.1 …) with real content: steps, tables, formulas, examples, diagrams (use simple
   ASCII/Unicode box diagrams inside <pre> or HTML tables), screenshots where useful.
5. "Verification status" section: what in this document is verified live / tested only on emulators / not verified.
6. Revision history table (1.0 · 2026-11-07 · Initial release · Claude for MEGO Project Owner).

Arabic documents: `<html dir="rtl" lang="ar">`, `<body dir="rtl" style="direction:rtl;text-align:right;font-family:Arial">`
and `dir="rtl"` on every <h1–h4>, <p>, <li>, <table>. Natural, professional Arabic (not word-for-word); keep technical
terms in English in parentheses on first use, e.g. «قاعدة البيانات السحابية (Cloud Firestore)». Code, file paths and
commands stay LTR: wrap them in `<code dir="ltr">` / `<pre dir="ltr">`.
English documents: `<html lang="en">`, `<body style="font-family:Arial">`.
Style: h1 for the title, h2 for numbered sections, h3 for subsections; tables with border="1" and
style="border-collapse:collapse"; header row background #e8f3ef. Keep each document self-contained (≈ 900–2500 words
depending on topic). The EN and AR versions must contain the same information.

## 5. Drive folder ids (parent of "MEGO – Official Documentation" = MyFitnessOs folder)
| Folder | id |
| --- | --- |
| 00 – Project Overview | 1CeY_YfcXn-wHaCG07Q1_fz4Ulc7jttuX |
| 01 – Product Documentation | 158vDO6mPZLIv_pA8-YO05ezkmiQVYwav |
| 02 – User Guides | 1dh1xBHH6T66Bmj9psSI1F-JqZ449k5gp |
| 03 – Nutrition & Food Database | 105SgAWJ77ypyICgoNrAnn5RXyZLcnCCq |
| 04 – Technical Documentation | 1M7Ps1KjN6KFKaaL0J_yPtfSTM_WsWRQS |
| 05 – Database & Architecture | 1Oql-GoFIYtcM3vVQWCh10n2UwRtybH0x |
| 06 – Security & Privacy | 12suWojIAkayTs5HLNnQP533WlH47R81S |
| 07 – Installation & Deployment | 1bz5nSYVVnVsVi11UUwQP-_TUyuAKOU0A |
| 08 – Testing & Quality Assurance | 1W0AWAzkspAoBoDF0GK8aHyOpiThNAMeT |
| 09 – Administration & User Management | 1G64LuhLwmOwAfq3KbwBcDwq7gx1rGtQR |
| 10 – Troubleshooting & FAQs | 111KOSh9clurGO5IvSrPo4DHnTMSsQynT |
| 11 – Maintenance & Future Development | 12UvnckoQLOUwqUcnD42bi-TU_Ph5in_0 |
| 12 – Legal & Policies | 1zwXkpsSWpfDcsOkx-i-B7HgU7AEEFwjb |

## 6. Full document register (use these exact file names for cross-references; each has _EN and _AR)
| ID | File base name | Folder |
| --- | --- | --- |
| 01 | MEGO_Product_Overview | 00 |
| 02 | MEGO_Documentation_Index | 00 |
| 03 | MEGO_Product_Requirements_PRD | 01 |
| 04 | MEGO_Features_and_Capabilities | 01 |
| 05 | MEGO_Product_Roadmap | 01 |
| 06 | MEGO_Platforms_and_System_Requirements | 01 |
| 07 | MEGO_Workflow_and_User_Journey | 01 |
| 08 | MEGO_User_Manual | 02 |
| 09 | MEGO_Getting_Started | 02 |
| 10 | MEGO_Registration_and_Login_Guide | 02 |
| 11 | MEGO_Profile_and_Goals_Guide | 02 |
| 12 | MEGO_Food_Tracking_Guide | 02 |
| 13 | MEGO_Meal_Planning_Guide | 02 |
| 14 | MEGO_Food_Search_and_Database_Guide | 02 |
| 15 | MEGO_Recipes_and_Custom_Foods_Guide | 02 |
| 16 | MEGO_Reports_Guide | 02 |
| 17 | MEGO_Progress_and_Insights_Guide | 02 |
| 18 | MEGO_Backup_and_Export_Guide | 02 |
| 19 | MEGO_FAQ | 10 |
| 20 | MEGO_Troubleshooting_Manual | 10 |
| 21 | MEGO_Food_Database_Documentation | 03 |
| 22 | MEGO_Food_Categories_and_Classification | 03 |
| 23 | MEGO_Nutritional_Values_and_Units_Reference | 03 |
| 24 | MEGO_Calorie_and_Macronutrient_Calculation_Methodology | 03 (covers protein/carbohydrate/fat calculation) |
| 25 | MEGO_Daily_Calorie_Target_Calculation | 03 |
| 26 | MEGO_Portion_and_Measurement_Conversion_Rules | 03 |
| 27 | MEGO_Food_Database_Import_and_Update_Procedures | 03 |
| 28 | MEGO_Food_Data_Validation_and_Quality_Control | 03 |
| 29 | MEGO_Missing_and_Duplicate_Foods_Management | 03 |
| 30 | MEGO_Food_Rankings_and_Coach_Methodology | 03 |
| 31 | MEGO_Technical_Architecture | 04 |
| 32 | MEGO_Frontend_Architecture | 04 |
| 33 | MEGO_Backend_Architecture | 04 |
| 34 | MEGO_Firebase_Integration | 04 |
| 35 | MEGO_Google_Sheets_Integration_and_Sync | 04 |
| 36 | MEGO_Gemini_AI_Integration | 04 |
| 37 | MEGO_API_Documentation | 04 |
| 38 | MEGO_Configuration_and_Environment | 04 |
| 39 | MEGO_State_Management | 04 |
| 40 | MEGO_Error_Handling_and_Logging | 04 |
| 41 | MEGO_Database_Schema_and_Relationships | 05 |
| 42 | MEGO_Authentication_and_Authorization_Architecture | 05 |
| 43 | MEGO_Security_Architecture | 06 |
| 44 | MEGO_User_Data_Protection | 06 |
| 45 | MEGO_Access_Control_and_Permissions | 06 |
| 46 | MEGO_Authentication_and_Session_Management | 06 |
| 47 | MEGO_Data_Backup_and_Recovery | 06 (also the operational backup & recovery procedures) |
| 48 | MEGO_Data_Retention_and_Deletion | 06 |
| 49 | MEGO_Security_Audit_and_Known_Risks | 06 |
| 50 | MEGO_Developer_Setup_and_Local_Installation | 07 |
| 51 | MEGO_Production_Deployment_Guide | 07 |
| 52 | MEGO_Firebase_Setup_Guide | 07 |
| 53 | MEGO_Apps_Script_Setup_Guide | 07 |
| 54 | MEGO_Gemini_API_Setup_Guide | 07 |
| 55 | MEGO_Build_and_Release_Procedures | 07 |
| 56 | MEGO_Update_and_Rollback_Procedures | 07 |
| 57 | MEGO_Production_Verification_Checklist | 07 |
| 58 | MEGO_Testing_Strategy | 08 |
| 59 | MEGO_Unit_Testing | 08 |
| 60 | MEGO_Integration_Testing | 08 |
| 61 | MEGO_Acceptance_Testing | 08 |
| 62 | MEGO_Nutrition_Calculation_Accuracy_Tests | 08 |
| 63 | MEGO_Multi_User_Testing | 08 |
| 64 | MEGO_Android_Device_Testing | 08 |
| 65 | MEGO_Known_Bugs_and_Limitations | 08 |
| 66 | MEGO_Release_Readiness_Checklist | 08 |
| 67 | MEGO_Admin_User_Manual | 09 |
| 68 | MEGO_User_Management_Procedures | 09 |
| 69 | MEGO_Food_Database_Administration | 09 |
| 70 | MEGO_Monitoring_and_Maintenance | 09 |
| 71 | MEGO_Support_and_Incident_Management | 09 |
| 72 | MEGO_Future_Development_Recommendations | 11 |
| 73 | MEGO_Terms_of_Service_Draft | 12 |
| 74 | MEGO_Privacy_Policy_Draft | 12 |
| 75 | MEGO_Nutrition_Disclaimer | 12 |
| 76 | MEGO_Medical_Disclaimer | 12 |
| 77 | MEGO_Acceptable_Use_Policy | 12 |

Merged on purpose (no duplicate documents): "Protein, Carbohydrates and Fat Calculation" is part of 24; "Local
Installation" is part of 50; "Privacy Policy Draft" exists once (74, folder 12) and is referenced from folder 06;
"Data Backup and Recovery" and "Backup and Recovery Procedures" are one document (47).
Legal documents (73–77) must say on top, in bold: "DRAFT — requires review by a qualified legal professional before
publication" / «مسودة — تتطلب مراجعة مختص قانوني مؤهل قبل النشر», must not invent operator identity, governing law or
liability terms (leave the bracketed placeholders used in the app, see src/lib/i18n2.ts / i18n3.ts pp_*/tos_*), and must
match what the app really does.
