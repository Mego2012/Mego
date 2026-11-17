# Vitamins, minerals and nutrition details

Code: `src/lib/micros.ts` (keys, units, sums, daily status), `src/lib/dri.ts` (reference intakes),
`src/lib/microMigration.ts`, `src/pages/Nutrients.tsx`; data: `public/fooddb/micros.json`, built by
`scripts/build-food-micros.mjs` from the official USDA FoodData Central CSV releases (SR Legacy 2018-04, FNDDS
2024-10-31, the same releases as `usda.json`). Tests: `tests/micros.test.ts`, `e2e/nutrition-expansion-test.cjs`.

## Data

Values are per 100 g edible portion, stored in `Macros.micro`. An absent key means unknown and is never treated as 0.

| Group | Nutrients (unit) |
| --- | --- |
| Carbohydrate details | starch (g), added sugars (g), sugar alcohols (g) |
| Fat details | trans, monounsaturated, polyunsaturated, omega-3, omega-6 (g), cholesterol (mg) |
| Minerals | potassium, calcium, magnesium, iron, zinc, phosphorus, copper, manganese (mg); selenium, iodine (µg) |
| Vitamins | A (µg RAE), C (mg), D (µg), E (mg α-tocopherol), K (µg phylloquinone), B1, B2, B3 (preformed niacin), B5, B6 (mg), B7 (µg), folate (µg DFE), B12 (µg) |

Fiber, total sugars, saturated fat and sodium were already tracked (see FIBER.md).

**Coverage of the 12,879 reference foods:**

| Nutrient | Foods with data |
| --- | --- |
| Iron | 12,799 |
| Calcium | 12,794 |
| Potassium | 12,602 |
| Zinc | 12,492 |
| Vitamin C | 12,422 |
| B12 | 12,199 |
| Vitamin A | 12,009 |
| Selenium | 11,963 |
| Folate | 11,570 |
| Omega-6 | 11,413 |
| Omega-3 | 10,857 |
| Vitamin E | 10,696 |
| Vitamin D | 10,309 |
| Vitamin K | 10,178 |
| Manganese | 6,323 (SR Legacy only) |
| B5 | 6,121 (SR Legacy only) |
| Trans fat | 4,158 |
| Starch | 1,142 |
| Added sugars, sugar alcohols, iodine, biotin | 0 — USDA does not report them for these foods |

The last four are shown only when the user enters them from a product label, and "no data in source" is never
displayed as 0.

**Derived values:**
* Omega-3 = ALA + EPA + DPA + DHA, written only when ALA, EPA and DHA are all reported.
* Omega-6 = LA + arachidonic acid, written only when both are reported.

**FNDDS note:** FNDDS's `food_nutrient` file uses legacy nutrient numbers. They are mapped with FNDDS's own
`nutrient.csv`, restricted to the IDs used, because one number can belong to two IDs (e.g. 323).

## Calculations

* Entries scale like calories: amount per 100 g × grams ÷ 100.
* Day totals add what is known and count coverage per nutrient ("based on k of n entries").
* Recipes use a strict sum: a nutrient is shown only when every ingredient has it. The whole recipe is computed first,
  then divided into servings.
* Values keep 3 decimals so small amounts (e.g. 0.21 mg B6) are not lost.
* Core macros are unaffected.

## Reference intakes (`dri.ts`)

* Source: U.S. National Academies' DRIs (NIH Office of Dietary Supplements fact sheets), adults 19+, by sex and age.
  The RDA is used where one exists, otherwise the AI. Pregnancy and lactation are not covered.
* Users can set their own target per nutrient (Settings `microTargets`) or go back to the reference value.
* Upper limits (UL) are shown where they exist. Food intake is compared only with ULs that apply to total intake
  (e.g. vitamin D 100 µg, iron 45 mg, zinc 40 mg, calcium, selenium, copper, manganese, B6). For ULs that apply only to
  supplements, fortified foods or preformed forms (magnesium, niacin, folate, vitamin E, vitamin A as retinol), the UL
  is shown as information only.
* The page says plainly that more is not always better.

## Migration

The migration runs after the fiber migration, with the same rules:
* missing values are filled only from the linked USDA row (or the recipe for library ready meals);
* values typed from labels are never overwritten;
* a backup is taken first;
* diary history is unchanged;
* the "done" marker is device-local.

## Food preferences (recommendations and plans only)

`Settings.foodPrefs`:
* excluded ingredients (whey, oats, fish, shellfish, beef, liver, nuts, eggs, dairy, wheat);
* yogurt containers per day (170 g each), counting what was logged today;
* 3 or 4 meals in generated plans.

Recipes are never deleted. Excluded ones are marked in the library and not suggested or planned. Suggestions still
require the portion to fit the calories and to bring real protein; fiber gives a small bonus only.
