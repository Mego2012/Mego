# MEGO 1.2 — Cardio, smart calorie target, goals and recipe nutrition

Version 1.0 · 10 November 2026 · Code: `src/lib/cardio.ts`, `src/lib/energy.ts`, `src/lib/goalAdvisor.ts`,
`src/lib/recipeEngine.ts`, `src/lib/recipeRefMap.ts` · Tests: `tests/cardio-goals.test.ts` (33), e2e checks CARDIO, ENERGY,
GOALS, RECIPE-NUTRITION, REPORT-CARDIO, CARDIO-EN, plus a live check in `scripts/live-verify.mjs`.

## 1. Data safety (how existing records are protected)

* **No schema change.** The device database stays at version 2. Nothing is migrated, recreated or rewritten.
* Cardio sessions are new records in the existing, already-synced key/value table: `kv` key `cardio:<id>`. The saved
  routine is `cardioRoutine`, and weekly check-ins are `checkin:<week>`. The live Firestore rules
  (`users/{uid}/kv/...`, owner only) and the Apps Script backend (`App_KeyValue`) already accept these. No backend
  redeploy is needed, and each account's data stays isolated.
* New settings fields are optional and merged with the old ones (`cardioCalorieMode`, `cardioReplenishPct`,
  `fitness`). Saved calorie and macro targets are never changed automatically.
* **Pre-update backup.** On the first start of release `1.2-cardio`, before anything else writes, a full snapshot of the
  device database is saved as a local backup (reason "Before app update"). It is taken once per release. Rotation never
  removes the 3 newest pre-update backups. This is in addition to the existing daily backups.
* **Settings → Data check** (read-only) shows your record counts and compares them with the newest pre-update backup.
* Tests confirm that record counts and contents of entries, foods, weights and days are identical before and after
  using cardio, goals and recipe approval. The only addition is one food per approved recipe match.

## 2. Cardio logging

Activities: treadmill, walking, running, cycling, stationary bike, elliptical, stair climber, swimming, rowing, other
(named). Every session has a date, time, duration and intensity, plus optional notes. Only the relevant fields are
shown:

| Activity | Extra fields |
| --- | --- |
| Treadmill | speed (km/h), incline (%), distance (km) |
| Walking, running, cycling | distance (km), speed (km/h); speed is derived from distance ÷ time if not entered |
| Swimming, rowing | distance (m) |
| Stationary bike, elliptical, stair climber, other | none |

**Calories burned (optional).** A value from a watch or machine replaces the estimate. Such sessions are marked "entered
by you".

**Routine.** Saved once, edited any time, logged with one tap. The default is the owner's routine: treadmill, 10 min,
3.5 km/h, 13 % incline.

## 3. Calorie estimate (always shown as an estimate)

`kcal = MET × body weight (kg) × hours` (1 MET ≈ 1 kcal/kg/h ≈ 3.5 ml O₂/kg/min).
Net (above rest) `= (MET − 1) × kg × h`. Body weight = the latest weigh-in on or before the session date, else the
profile weight.

MET source, in order:

1. Walking and treadmill below 7 km/h use the **ACSM walking equation**: VO₂ = 0.1·S + 1.8·S·G + 3.5 (S in m/min,
   G = grade).
2. Running, and treadmill from 7 km/h, use the **ACSM running equation**: VO₂ = 0.2·S + 0.9·S·G + 3.5.
3. Outdoor cycling with a speed uses **Compendium** speed bands (<16 km/h 4.0 · 16–19 6.8 · 19–22.5 8.0 · 22.5–25.7 10.0 ·
   25.7–30.6 12.0 · faster 15.8).
4. Everything else uses the **Compendium of Physical Activities** (Ainsworth 2011; Herrmann 2024) at the chosen
   intensity:

| Activity | light | moderate | vigorous |
| --- | --- | --- | --- |
| Walking / treadmill (no speed) | 2.8 | 3.5 | 5.0 |
| Running (no speed) | 8.3 | 9.8 | 11.8 |
| Cycling (no speed) | 4.0 | 6.8 | 10.0 |
| Stationary bike | 3.5 | 6.8 | 8.8 |
| Elliptical | 4.0* | 5.0 | 6.8* |
| Stair climber | 6.8* | 9.0 | 11.0* |
| Swimming | 5.8 | 7.0 | 9.8 |
| Rowing machine | 4.8 | 7.0 | 8.5 |
| Other | 3.0 | 5.0 | 8.0 (generic light/moderate/vigorous bands) |

\* No separate Compendium entry exists, so the neighbouring value is used.

**Example (owner routine).** S = 58.3 m/min, G = 0.13 → VO₂ 23.0 → 6.57 MET → 72 kg × 10 min ≈ 79 kcal (67 kcal net).

**Limitations.**
* Individual error is typically ±20–30 %. The estimate ignores fitness, efficiency, handrail use, terrain and wind.
* The ACSM equations are validated for steady-state walking (about 3–6 km/h) and running (above 8 km/h).
* Values are never presented as measurements.

## 4. Smart cardio → calorie target

The base target (Settings or Goals) is never modified. The app shows these lines on Home:

* Base target
* Cardio (estimate)
* Extra allowed
* Adjusted target
* Eaten
* Remaining

The "Why?" button lists the reasons behind each step.

1. **No double counting.** For any activity level above *sedentary*, the TDEE behind the target already includes the
   user's **planned weekly cardio** (Goals: sessions × minutes). The default plan matches the owner's routine: one
   10-minute session after each training day, so 6 × 10 = 60 min per week. A value saved in Goals always takes
   precedence; Goals shows whether the value is the default or saved. Minutes of the last 7 days count against the
   plan first, in date order. Only minutes beyond it are "extra".
2. **Resting energy removed.** Only the NET part ((MET − 1) × kg × h) of the extra minutes counts.
3. **Partial add-back.** Estimates run high, and a fat-loss goal needs its deficit. The share added back is:
   * 50 % for fat loss, fat loss preserving muscle, recomposition or a custom goal
   * 75 % for maintenance or healthy eating
   * 100 % for lean bulk, bulk or performance

   The share can be set to 0/25/50/75/100 % in Goals.
4. **Caps.** At most 400 kcal is added per day. The result is rounded to 10 kcal.
   **Fat-loss safeguard:** for fat-loss and recomposition goals, the adjusted target is limited to 90 % of that day's
   estimated expenditure (TDEE + the extra exercise). Exercise can therefore never move the day to maintenance or
   surplus, and the saved target is never lowered either.
5. **Mode Off** never adjusts. With no cardio, or cardio within the plan, the target is unchanged. Logging a session alone
   never raises calories.

Reports, day status and adherence keep using the base target, so the nutrition calculations themselves are unchanged.

**Example (owner: fat loss, active, 2,110 kcal, plan 6 × 10 min).**
* The six 10-min routine sessions use up the plan: +0 kcal on every routine day.
* An additional 30-min run that week has ≈ 300 kcal net, all of it extra.
* Extra allowed: +150 kcal (50 %). Adjusted target: 2,260, well below the ceiling.

## 5. Goals

* **Nutrition.** Training-day and rest-day kcal, protein, carbohydrate and fat targets, weekly change target, target
  weight.
* **Fitness.** Resistance days per week, cardio sessions per week, minutes per session, and the resulting weekly cardio
  minutes. Daily step goals are not supported, because MEGO has no step counter.
* **Body.** Current weight (7-day average), target, waist and its change since the start, weight history chart with
  average, progress toward the target, and the estimated rate (28-day regression; needs ≥ 6 weigh-ins over ≥ 14 days).
  This is a weight trend, not a body-composition measurement.
* **This week.** Progress bars for:
  * calories-in-range days
  * protein days
  * cardio minutes and sessions against the goal
  * progress toward the target weight

### Recommendations (`goalAdvisor.ts`) — suggestions only

Nothing changes until the user taps **Apply** and confirms. The confirmation shows current → new values.

| Signal | Rule | Suggestion |
| --- | --- | --- |
| < 6 weigh-ins / 2 weeks | — | wait, no calorie advice |
| < 8 complete days in 14 | — | log complete days first |
| calories in range < 70 % | — | improve adherence before changing targets |
| protein target < 1.8 g/kg (loss) / 1.6 g/kg | — | raise to 2.0 / 1.8 g/kg; carbohydrates absorb the change (kcal unchanged) |
| loss faster than 1 %/week or 1.5 × target, or strength ↓ with hunger ≥ 4, or recovery ≤ 2 | trend + check-in | +150 kcal/day |
| loss slower than ½ target, good adherence, waist not down | trend + waist | −150 kcal/day (or more cardio) |
| weight steady, waist ↓ > 0.5 cm | waist | keep targets (recomposition) |
| gain goals: too slow / too fast | trend | +150 / −100 kcal/day |
| maintenance drifting > 0.25 kg/week | trend | ±100 kcal/day |
| cardio below goal / met; poor recovery with high cardio; resistance sessions below plan | cardio + check-in | informational |

Calorie changes keep protein and fat. Carbohydrates take ±kcal/4 g. The weekly check-in records strength (down / same
/ up), hunger 1–5, recovery 1–5 and resistance sessions done.

## 6. Recipe nutrition

**Cause of the missing values.** Library recipes looked up each ingredient only by its exact Arabic name in the user's
own food list. On a cloud account whose list does not contain those names, every recipe showed "missing" and no
calories.

**Fix.** Each ingredient is resolved in this order:

1. **The user's own food** with that name. The owner's 160-food table contains all 68 names.
2. **A hand-checked USDA FoodData Central reference** (`recipeRefMap.ts`, 69 entries). The state is matched to the
   recipe weights: "أرز أبيض" is dry rice, as in the owner's table, while "…مطبوخ" and "…مسلوق" are cooked. The values
   are marked "USDA" and must be approved to be stored. Approval adds the food under the same Arabic name and never
   changes existing foods.
3. **Missing.** If no reliable reference exists (labneh), the ingredient is flagged, left out of the totals (never
   estimated) and offered as "Add this food".

The totals are the sum of the ingredients. Per serving = total ÷ servings, and the "≈ g of ingredients per serving" is
shown. Cooking oil and added fats are counted. Seasonings without data are listed separately. Values recalculate live
when foods change, and user recipes recalculate when ingredients or quantities change. Every card shows kcal, protein,
carbohydrates and fat per serving. The details page also shows the totals and fibre.

**Corrected.**
* The canned-tuna reference now matches the owner's table (116 kcal per 100 g).
* Both "egg fried rice" recipes weigh 200 g of *cooked & chilled* rice but referenced the *raw* rice record
(≈ 2.8× too many calories). They now use "أرز أبيض مطبوخ". The user's saved recipes were not changed.

**Needs the owner's approval (not changed).** In the owner's table, "واي بروتين (سكوب)" has 120 kcal / 24 g protein /
3 g carbs / 1.5 g fat **per 100 g**. These look like per-scoop (30 g) values; per 100 g, whey is ≈ 350–400 kcal and
≈ 75–80 g protein. Recipes and diary entries with whey are therefore under-counted until the owner corrects the food.
Five library recipes contain whey. **Settings → Data check** shows how many diary entries on the device are affected.
The full audit is in `docs/RECIPE-AUDIT.md`.

## 7. Reports

The weekly and monthly reports add a **Cardio · Goal progress** card:

* total minutes and the change vs the previous period
* sessions, average session, active days, estimated kcal
* cardio goal % (weekly goal × days ÷ 7)
* overall goal completion: the mean of calories-in-range %, protein-days % and cardio-goal %
* plain-language insights

The existing averages, weight and waist changes, adherence and goal completion are unchanged.
