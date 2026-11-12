# Cooking Guide — how recipe nutrition is calculated

Code: `src/lib/seasonings.ts` (exact seasoning amounts, household measures), `src/lib/recipeLibraryData3.ts` (flavour
recipes and sauces), `src/lib/cooking.ts` (timers, scaling, substitutions), `src/lib/recipeEngine.ts` (calculation),
`src/components/CookMode.tsx` and `src/pages/RecipeLibrary.tsx` (screens). Tests: `tests/cooking-guide.test.ts`,
`e2e/cooking-guide-test.cjs`.

## Library

121 recipes: the original 101 plus 14 flavour recipes and 6 healthy sauces. The flavour recipes are:

* chicken: lemon-garlic herb chicken, yogurt-garlic-lemon chicken, smoky paprika thighs;
* beef kofta and lemon-dill fish;
* sides: seasoned vegetable rice, crispy air-fryer potatoes, roasted sweet potatoes, mashed sweet potatoes, a roasted vegetable tray;
* pasta: tomato-basil chicken pasta, light creamy mushroom pasta;
* eggs: poached eggs on garlic yogurt, a herb omelette.

The sauces are garlic-mint yogurt, tahini-lemon, tomato salsa, honey-mustard yogurt, a green herb sauce and sriracha yogurt.

## Every line is counted, once

* Each ingredient, seasoning, oil, butter, sauce and marinade item has an exact weight, and each is counted like any
  other ingredient. A recipe uses the user's own food with the same Arabic name first. If there is none, it uses the
  hand-picked USDA FoodData Central row in `recipeRefMap.ts`. Nothing is estimated.
* The original 101 recipes used seasoning groups with a rough calorie guess, for example "spices (salt, pepper, cumin,
  paprika) ≈ 5 kcal". These groups are now exact per-serving weights multiplied by the number of servings (`GROUPS`).
  For example, 1 g salt, 0.3 g black pepper, 0.5 g cumin and 0.8 g paprika per serving; garlic is 3 g (one clove) per serving.
* Oil used in a marinade is listed once, and the steps say not to add more. A test checks that no food appears twice in a recipe.
* Salt is 0 kcal per USDA. It is shown with its weight but not stored as a food, because a food with all-zero values would be "incomplete".
* Water is 0 kcal and is listed with its volume. Cooking water that is poured away (pasta, poaching) is not eaten.
* Items with no USDA record are never estimated. They are shown as "not counted" with the reason: sumac (about 0.5 g per
  serving) and dried lime, which is removed before serving.
* Weights are the state of the food record: raw meat and vegetables, dry rice and pasta. The ingredient notes and
  chips say raw or cooked.

## Scaling and substitutions

* Changing the number of servings scales every amount, including spices and water. The per-serving values stay the same; the totals scale.
* A substitution replaces the food and multiplies its weight by a factor that keeps the dish equivalent. Examples:
  one egg (55 g) ≈ two whites (66 g), so ×1.2; butter at 81 % fat replacing oil, so ×1.2.
  Nutrition is then recalculated from the new food. Only alternatives with a real food record are offered.
* Logging or saving a substituted version creates a separate recipe called "… (معدّلة)". The original recipe, and any copy
  the user saved earlier, are never changed. If a copy saved before this update differs because the spices are now
  counted, the screen says so, and diary entries use the saved copy.

## Diet strategies

Recipes never change targets. The detail screen shows what one serving is as a share of today's target, from
`targetsFor`, including carb-cycling days. On keto, low-carb or low days it warns when one serving uses more than 40 % of the
day's carbohydrate. Sauces are never suggested or planned as a meal, and sides are not planned as a main meal.
`tests/cooking-guide.test.ts` checks a 7-day plan against the owner's targets of 2,110 kcal and 160 g protein. Every day is
within 85–105 % of calories and has at least 90 % of the protein target.

## Cooking mode

The cooking mode works through these steps:

1. Check off the ingredients, with amounts scaled to the chosen servings.
2. Follow one large step at a time.
3. Use the timers found in each step. A range uses the shorter time, and storage times such as "keeps 4 days" get no timer.
   Several timers can run at once and keep running between steps. When a timer finishes, the phone beeps and vibrates.
4. Read the serving step.

The screen stays awake where the browser allows it. Cooking mode reads nothing from the database and writes nothing to it.
