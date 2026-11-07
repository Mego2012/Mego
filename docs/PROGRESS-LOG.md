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
* Coach redesigned: icon tabs, remaining-macro brief, message cards (level icon, data vs guidance badge), "complete my macros" plates, tip card.
* Rankings redesigned: kind chips with icons, goal control, method note, ranked cards with photos, score bars, coverage chips, partial-data divider, compare toggle; compare table highlights the best value per row; detail sheet with score ring, breakdown bars and an amino-acid chart against the FAO/WHO reference line.
* Education: article cards with covers (food photo or icon) and source counts; reader with level tags and citation chips.
* Progress: weight instrument (current, change, start→target track, ETA, rate), mini stats, history rows with date badges and deltas.
* Reports: day ledger (one cell per day, coloured by status, over-target dot, future days outlined), macro target gauges, adherence list.
  Bug found while checking: the status class "empty" collided with the app-wide empty-state style; renamed.
* Settings: profile header with targets, sticky section index, icons on every section, photo credits section.
* Account card and Admin dashboard redesigned (KPI tiles, privacy notice, avatars). Planner: one card per day with planned vs actual bars.
* Food photos: 58 hand-picked Wikimedia Commons photos (CC0/CC BY/CC BY-SA/PD), each checked by eye; rejected look-alikes
  (milk-glass ornaments for "milk", branded whey/canola, cashew fruit on the tree, pumpkin seeds in shells for kernels, unclear tahini).
  320 px WebP, ~980 KB total, cached offline after first view (CacheFirst), never precached. Credits in Settings and public/food-img/CREDITS.md.
* AUDIT — photo matching: tests found أبيض ("white") matched بيض ("egg") → Arabic now matches whole words only; peanuts (فول سوداني) no
  longer match fava beans; "milk chocolate", "almond milk/oil", "rice cakes" no longer get single-food photos. 20 positive and 19 negative cases tested.
* Wikimedia's API started answering 429 (rate limit) during the second search round; 28 of the 86 photo keys (e.g. tomatoes, strawberries, brown rice,
  milk, eggs) therefore have no photo yet and show the drawn placeholder. Re-run `scripts/food-photos/candidates.py` later to extend.
