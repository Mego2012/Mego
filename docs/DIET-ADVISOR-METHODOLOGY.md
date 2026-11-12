# Diet Strategies & Diet Advisor — methodology and safety limits

Code: `src/lib/dietStrategy.ts` (targets per strategy), `src/lib/dietAdvisor.ts` (recommendation and progress review),
`src/lib/dietHistory.ts` (strategy history, results, trial). The advisor is transparent rule-based logic on the
device — not an external AI service. Every reason is labelled **your data** or **guideline**. Nothing is applied
without the user's confirmation; applying saves a local backup and changes settings only (targets, strategy, goal).

## Energy and macronutrients

| Item | Rule | Basis |
| --- | --- | --- |
| Energy per gram | protein 4, carbohydrate 4, fat 9 kcal | Atwater factors |
| Macro sum | 4P + 4C + 9F matches the calorie target within one gram of the balancing macro (≤ ±5 kcal); custom = exact sum | arithmetic |
| Maintenance (formula) | Mifflin-St Jeor BMR × activity factor (1.2 / 1.375 / 1.55 / 1.725 / 1.9) | widely recommended estimate, ±~10 % individually |
| Maintenance (your data) | 28-day average intake − weekly weight trend × 7,700 kcal/kg ÷ 7; used only with ≥ 14 complete days and ≥ 3 weekly averages, and only within ±25 % of the formula | energy balance |
| Protein | ≥ 1.6 g/kg in every strategy (loss 2.0, gain 1.8, maintain 1.6 g/kg; high-protein ≈ 2.4 g/kg or ≤ 35 % of kcal); BMI ≥ 30 → from goal weight | ISSN position stand (1.6–2.2 g/kg) |
| Fat | ≥ 0.6 g/kg warning; automatic splits 20–35 % of calories, flexible ≥ 0.8 g/kg or 25 % | general guidance |
| Keto / low carb | keto ≤ 50 g carbohydrate (default 25 g), low carb 50–150 g (default 100 g); fat balances | common definitions |

## Safety limits (never crossed by a recommendation)

* Daily target ≥ max(resting rate, 1,500 kcal men / 1,200 kcal women).
* Fat-loss deficit between 10 % and 25 % of maintenance (target ≤ 90 % and ≥ 75 % of maintenance).
* Fat-loss pace: > 1 % of body weight per week → suggest +150 kcal (muscle preservation).
* Gain pace: > 0.5 % of body weight per week → suggest −100 kcal.
* Any suggested calorie change that would cross the floor or the 90 % fat-loss ceiling is not offered.
* Carb cycling: no day below 70 % of the base target; the week equals 7 × the base target (hand-set days are kept and
  the automatic days absorb the difference, otherwise the screen says the week is not aligned).

## Evaluating progress (never from a single weigh-in)

* Weight trend = least-squares slope through 7-day average weights of up to 4 consecutive weeks, each week with
  ≥ 2 weigh-ins (`weeklyTrend`).
* Any calorie suggestion needs ≥ 3 weekly averages (2+ weeks); lowering calories needs ≥ 4 (3+ weeks) and ≥ 70 %
  adherence over ≥ 14 complete logged days.
* Stall on fat loss: trend > −0.1 kg/week → −150 kcal (if above the floor). On maintenance: drift > 0.25 kg/week → ±100.

## Strategy trial and results

* Each applied strategy starts a period in the strategy history (`dietHistory`, synced). A strategy is followed for
  14–21 days before it is judged; during the first 14 days only safety suggestions are made and the current strategy
  is favoured.
* After 14 days: **effective** when the 7-day-average trend matches the goal at a safe pace with ≥ 70 % adherence;
  **not effective** when adherence was good but the trend did not move; **inconclusive** otherwise.
* Results per period (shown as previous vs current): weight trend (first vs last 7-day average of the period), waist
  change, lifts improved/declined (best e1RM, first vs second half), check-in hunger and recovery, days within the
  calorie range and days meeting protein.

## Personalisation

Scores start from general suitability and are changed only by the user's own data: adherence, hunger, protein intake,
waist-to-height ratio, training frequency, lift trends, habitual carbohydrate intake, and the results of strategies
the user followed before (worked → +10, adherence < 60 % → −10). Restrictive strategies (keto, low carb) only rank
high when the user's own logs show they already eat that way and keep to it.

## Not verified

Individual accuracy of any estimate (formula and data-based maintenance), effects of a strategy for a specific person,
and medical suitability (pregnancy, diabetes, kidney disease, eating disorders — the app tells users to consult a
professional).
