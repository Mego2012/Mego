# MEGO — release 1.1 progress log

Autonomous work session (cloud container). Newest entries last.

## Constraints found at the start
* This session runs in a cloud container. No laptop folder is connected (`list_computer_folders` returned none), so the real
  Firebase / Apps Script / Gemini deployment and real Android-device testing cannot be done from here. They are prepared
  and scripted (`node scripts/laptop-setup.mjs` and `--cloud`), and listed in `docs/RELEASE-STATUS.md` as pending owner steps.
* No paid service, billing account or legal agreement was touched.

## Log
* Screenshot tooling: full-page audit mode, every screen incl. sheets; test-only demo data (`VITE_DEMO=1`, never in production builds).
* Global fix: decorative chips inherited a 44 px tap-target height (made every status/state pill oversized). Only buttons keep it now.
* Diary redesigned: week strip with per-day rings, day panel (ring + remaining + macro trio + water), action chips, meal timeline with glyphs, food photos, empty-meal add rows, meal actions moved to a footer.
* Food search redesigned: search field with icon, photo rows, calorie share bar (protein/carbs/fat), source tags (USDA / Hub / Open Food Facts / mine), kcal per 100 g column.
* Quantity step redesigned: food hero (photo, state, source), macro tiles.
* Foods page redesigned: search + filter + category chips, photo rows, data-quality tiles, import/export grid; editor shows a summary hero.
* Emoji used as icons replaced with the drawn icon set (camera, gallery, bulb, leaf, clipboard, flame, star, book, globe…).
* AUDIT — rankings: foods with missing indicators (no amino-acid data: whey, shrimp, Greek yogurt, whole-wheat bread) had that
  weight dropped and could outrank fully measured foods (shrimp was #1 for protein). Fixed: fully measured foods rank first,
  partial-data foods follow in a labelled group with their data coverage. Animal foods whose fibre is not reported count as
  0 g fibre (animal tissue has no dietary fibre); nothing else is filled in. Tests added.
* AUDIT — education: three sources pointed to generic landing pages. Replaced with the exact documents (WHO carbohydrate
  guideline 2023, WHO TRS 935 on IRIS, FAO paper 92 on FAO Open Knowledge), verified online. Guard test added.
