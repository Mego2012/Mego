# Dietary fiber

Code: `src/lib/fiber.ts` (target, progress, recipe fiber, migration), `src/lib/fiberMigration.ts` (start-up run),
`src/lib/nutrition.ts` (`sumMacrosStrict`). Tests: `tests/fiber.test.ts` (16), `e2e/fiber-test.cjs` (26).

## Data

* Stored like every other nutrient: grams per 100 g in `Food.per100.fiber`; each diary entry stores the fiber of the
  amount eaten (`macros.fiber`), scaled exactly like calories: 5 g/100 g → 50 g = 2.5 g, 150 g = 7.5 g, 200 g = 10 g.
  Pieces and named servings use their gram weight.
* `undefined` = unknown, `0` = the source reports zero. Unknown is never shown or summed as zero.
* USDA reference database (12,879 foods): 12,347 have a USDA fiber value (4,473 of them 0, e.g. meat and oils), 532
  have no fiber value in USDA and stay unknown. Source: USDA FoodData Central (SR Legacy, FNDDS), nutrient 1079.
* Open Food Facts barcode products and manual foods keep the fiber printed on the label when it is entered.

## Recipes

* Total fiber = sum of the ingredients (each already scaled to its grams); per serving = total ÷ servings; per 100 g =
  total ÷ weight × 100. The weight is the cooked weight when the user entered it, otherwise the ingredient weight
  before cooking, and the label says which. Cooking changes the weight, not the amount of fiber.
* If any ingredient has no fiber data, the recipe's fiber is **unknown**: the app names the ingredient and shows the
  known part as a lower bound, instead of an under-count. Calories and macros are unaffected (`sumMacrosStrict`).
* Built-in library: 116 of 121 recipes have complete fiber data. 5 recipes are unknown because USDA reports no fiber
  for raw shrimp (S175179, 4 recipes) and balsamic vinegar (S172241, 1 recipe).

## Daily target and progress

* `Settings.fiberTarget`, default 25 g/day (WHO 2023: adults at least 25 g/day), range 5–100 g, set in Goals. One
  value for every day. Fiber is not part of the calorie budget and is not a fourth macronutrient.
* The dashboard and diary show target, consumed, remaining and % of target. When some entries have no fiber data, the
  bar says "based on k of n entries"; with none, "no fiber data".

## Reports and recommendations

* Weekly and monthly reports: average fiber over **measured** days only (complete days whose entries all have fiber
  data), % of target, days that reached it, lower-fiber days (neutral wording) and the number of days not measured.
* Coach: when today's fiber data is complete and below target, it suggests fiber-rich foods that also fit the rest of the
  day. A portion gives up to 8 g fiber within 35 % of the calories left (≤ 250 kcal), and nothing high in sugar
  (> 15 g/100 g) or saturated fat (> 5 g/100 g) is suggested. The food ranking "High-Fiber Foods" uses fiber per
  100 g and per 100 kcal.

## Migration (once per device database)

After start-up the app fills **missing** fiber only:
* foods taken from USDA get the fiber of their USDA row;
* library ready meals get the recipe's fiber when every ingredient has data.

Rules:
* A local backup is taken first.
* Values are never overwritten, and unknown is never written as 0.
* Every change goes through the normal food update (version, change log, sync).
* Diary history is never changed: old entries keep the values they were logged with.

The result is shown in Goals ("k of n foods have fiber data · filled from verified sources").
