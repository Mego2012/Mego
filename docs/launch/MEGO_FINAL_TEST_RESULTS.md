# MEGO — Final test results

Run on 18 November 2026 in the build environment (Chromium via Playwright, Node 22) and against the live site
https://mego2012.github.io/Mego/. Every number below was produced by running the test, not estimated. Logs were kept
in the build workspace.

## 1. Results against your required baselines

| Suite | Command | Required | Result | Notes |
| --- | --- | --- | --- | --- |
| TypeScript | `npx tsc -b` | 0 errors | **0 errors** | |
| Unit tests | `npx vitest run` | 323/323 | **328/328** | +5 new tests: dish-photo licence/attribution checks (2), backend v10 API-key restriction (3) |
| Main browser suite | `node e2e/run-e2e.mjs` | 57/57 | **57/57** (local, final build) · **57/57 live** | see §3 for two pre-existing flaky checks that were found and fixed |
| Nutrition | `node e2e/nutrition-expansion-test.cjs` | 29/29 | **29/29** | |
| Fiber | `node e2e/fiber-test.cjs` | 26/26 | **26/26** | |
| Calorie budget | `node e2e/budget-test.cjs` | 25/25 | **25/25** | |
| Cooking guide | `node e2e/cooking-guide-test.cjs` | 24/24 | **24/24** | |
| Account & security (live Firebase) | `node e2e/live-account-test.mjs` | 20/20 | **20/20 live** | throw-away `@example.com` accounts, both deleted through the app at the end |
| Multi-user (Firebase emulators) | `npm run e2e:multi` | 8/8 | **8/8** | |
| Firestore security rules (emulator) | `npm run test:rules` | all | **14/14** | |
| Accessibility (axe-core, WCAG 2.1 A/AA) | 64 scans: AR/EN × light/dark × phone/desktop | 0 violations | **0 violations** | |
| Horizontal overflow | same 64 scans | 0 | **0** | |
| Touch scrolling | `node e2e/scroll-test.mjs` | — | **103/103** | 3 Samsung viewports × AR/EN |
| Localization crawl | `npm run i18n:crawl` | 0 | **168 screens, 0 wrong-language texts, 0 direction notes** | |
| **New:** dish photos | `node e2e/dish-photo-test.cjs` | — | **23/23 local · 23/23 live** | AR/EN alt text, "example photo" note, credits, 37 photos load, no broken image, offline, two fallback cases, legal links |

## 2. What the suites cover for your required areas

| Area | Covered by |
| --- | --- |
| AR/EN localization, RTL/LTR | i18n crawl (168 screens), every e2e suite runs both languages, dish test checks Arabic alt text and note |
| Offline | live account test (signed-in user reopens THEIR account offline), dish test (photo seen before loads offline), main suite |
| Security rules | rules 14/14 (emulator), live 403 probes in the account test (user B cannot read, write or delete A's records) |
| Account registration and deletion | live account test (register, verify target, log/edit/delete entries, second device, password reset request, delete account → records and sign-in gone) |
| Recipe calculations | main suite TEST 5 (500 g chicken + 300 g rice → 1,680 kcal / 420 per serving), cooking guide 24/24, nutrition 29/29 |
| Planner calculations | nutrition expansion suite (3-meal planner, preferences), main suite planner checks |
| Your targets (2,110 kcal / 160 g protein) | budget suite uses 2,110 / 160 and checks daily/weekly/monthly numbers; no code in this release touches targets |

## 3. Problems found during the regression and how they were handled

| Finding | Cause | Action |
| --- | --- | --- |
| Main suite occasionally 55–56/57 (PROGRAM-GEN, EX-GUIDE) | **Pre-existing, not caused by this release:** the same failures occurred on the previous production commit `aeb578f` (run there: 55/57, then 57/57). The test edited the new program before the app had switched to it, and read an exercise page while the previous exercise was still on screen | Tests now wait for the correct screen (`data-id` of the requested exercise; the new program marked active). No assertion removed or loosened. Afterwards: 57/57 in 5 of 6 runs; see next row |
| One run: TEST 5 timed out once | Not reproduced in the following 5 runs (local) or the live run | Recorded here honestly. The harness now saves a screenshot and the address of any failing check (`e2e/failures/`) so a recurrence can be diagnosed |
| i18n crawl: 2 wrong-language texts | New photo credit (photographer name inside Arabic text) and licence codes (CC0, ODbL) in the Arabic terms | Photographer name + licence code are now marked as untranslatable proper names (same mechanism as USDA reference names); CC0/ODbL added to the list of allowed technical identifiers |
| Terms said photos come from "Wikimedia Commons **and other sources**" | Inaccurate: every photo is from Wikimedia Commons | Corrected in Arabic and English |
| Arabic About card: "Privacy" and "Terms" links ran together | Styles for the new links were missing | Fixed (separate 44 px targets) and covered by a new check; found on the live evidence screenshots |
| Dish photo service-worker caching broke two fallback tests | Playwright cannot intercept requests answered by a service worker | Fallback scenarios run with the service worker disabled (the offline scenario runs with it) |

## 4. Deployment verification

| Check | Result |
| --- | --- |
| GitHub Actions "Test & deploy to GitHub Pages" | run #88 (`41fef73`) success · run #89 (`af5a30a`) success · see the production audit for the final run |
| Live bundle = commit | live `assets/index-*.js` identical to `BASE_PATH=/Mego/ npx vite build` of the same commit (hash compared after each deploy) |
| Live dish photos | manifest lists 37; `lib-shakshuka.webp` served as `image/webp` |
| Phone + desktop, AR + EN | live screenshots (library, recipe detail, About links, privacy page) in the documentation package |
| Existing data | no migration, no change to database schemas, targets, foods, recipes' nutrition or diary code paths in this release |

## 5. Not testable here (needs you)

* Your own account on your phone after the update (open MEGO, check today's diary and targets 2,110 kcal / 160 g).
* The API-key restriction itself (Google Cloud console) and the backend v10 update in Apps Script; see
  `MEGO_SECURITY_CHECKLIST.md`, steps A–D, which include the exact checks to run afterwards.
