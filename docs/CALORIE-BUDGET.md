# Flexible calorie budget — daily, weekly and monthly

Code: `src/lib/budget.ts` (calculations), `src/components/BudgetCard.tsx` (Dashboard card, report section, Goals settings),
`src/lib/repo.ts` (`saveSettings` records the target history). Tests: `tests/budget.test.ts`, `e2e/budget-test.cjs`.

## How the three levels fit together

| Level | Target | How it is calculated |
| --- | --- | --- |
| Day | Daily target | `targetsFor(date)` — the same target the diary uses: a per-day override, carb-cycling level or training / rest-day target |
| Week | Weekly budget | Sum of the daily targets of the 7 days of the week (fixed 2,110 kcal → 14,770). A custom number can be set |
| Month | Monthly budget | Sum of the daily targets of every calendar day of the month (28, 29, 30 or 31 days → 59,080 / 61,190 / 63,300 / 65,410 at 2,110). A custom number can be set |

* **Consumed** = the sum of the diary entries of the period's dates. Every entry has exactly one date, so the
  day, week and month totals all use the same entries — nothing is counted twice, and the weeks of a month add
  up to the month.
* **Remaining** = budget of the tracked days − consumed. Going above a day's target is not a failure: the
  difference simply comes off the weekly and monthly remaining budget. No target is ever changed.
* **Days with nothing logged** are not zero-calorie days. A past day without any entry is listed as "not logged"
  and its target is left out of the tracked budget, so unknown intake never looks like a large saving. Averages
  use logged days only. Partially logged days count with what was logged.
* **Exercise calories** are not added to budgets. The cardio setting (Goals) only affects the daily dial.

## Optional suggestion (never a target)

For the remaining days of the week or month (today included) the card can show an optional daily amount:

* exact = (remaining budget + what is already logged today) ÷ remaining days;
* the suggestion never goes below the safe floor — the resting rate, and at least 1,500 kcal (men) or 1,200 kcal (women) —
  and never more than the flexibility limit (default 300 kcal) below the normal target;
* when exact compensation would need less than that, the card says so neutrally and suggests continuing with the
  normal target: ending the week a little over is fine;
* when you are under budget the suggestion is simply the normal target — the spare budget is shown, never pushed to
  be eaten.

Suggestions can be switched off (Goals → Calorie budget).

## Daily flexibility

The daily flexibility (default 300 kcal above the target) is a soft guideline: a day within it is labelled "Above
daily target", a day beyond it "Above daily flexibility". It never blocks anything and can be changed or turned off.

## Protein stays daily

Protein is not a weekly budget. The card shows daily protein progress, and the weekly and monthly views show the
average protein and the number of days the protein target was reached. Nothing suggests eating less protein to make
up for calories.

## Target changes and history

From now on every change of the targets (Goals, diet strategy, advisor actions) also stores the previous targets in
`kv 'targetHistory'` (synced like other records). Each day uses the targets that applied on that date, so earlier
weeks and months keep their own budget after a change, and a new target applies from the day it is set. Before the
first change there is no history, so earlier periods use the current targets.

## Reports

The weekly and monthly reports have a Calorie budget section showing:

* the budget, the calories consumed and what remains;
* how much of the budget was used and the average per logged day;
* the days above and below the daily target;
* average protein and the days the protein target was reached.

Weight and waist trends stay in their own sections.
