# MEGO — Cardio goals

Released 18 November 2026 · Code: `src/lib/cardioGoals.ts`, `src/components/CardioGoals.tsx`, `src/pages/Cardio.tsx`,
`src/lib/energy.ts` · Tests: `tests/cardio-targets.test.ts` (unit), `tests/cardio-goals.test.ts` (exercise vs. food
budget), `tests-rules/rules.test.ts` (other users), `e2e/cardio-goals-test.cjs` (52 browser checks).

## Where to find it

* **Cardio → Goals** (default tab): today, this week, weekly schedule, last 8 weeks.
* **Cardio → Log & history**: log, edit and delete sessions (unchanged screen, plus the routine).
* **Cardio → Reports**: weekly and monthly totals with the previous period.
* **Goals** page: "Cardio goals" card (today + week, edit, open the dashboard).
* **Workouts** overview and **Home**: a one-line link / compact card (the Home dashboard stays uncluttered).

## Goals (all editable at any time)

| Goal | Suggested start | Range |
| --- | --- | --- |
| Daily cardio | 20 min | 0–300 min |
| Weekly cardio | 120 min | 0–2,100 min |
| Sessions per week | 6 | 0–21 |
| Weekly distance | off (optional) | 0.1–500 km |
| Preferred cardio | treadmill walking | treadmill walking, incline walking, running, cycling, outdoor walking, other |
| Preferred days | none | any weekdays |

The suggested values are a starting point, not a medical recommendation (said in the editor). Someone who had already
set the older "sessions × minutes per session" fitness goal keeps it: e.g. 6 × 10 min becomes 10 min/day,
60 min/week, 6 sessions, until they edit it. Goals are stored in the user's settings record, which is per account,
works offline and syncs like the rest of the settings. Invalid or tampered values are clamped to safe ones.

## How progress is calculated

* Everything is recomputed from the saved sessions every time, so logging, editing or deleting a session updates the
  day, the week, the schedule and the reports immediately. Nothing derived is stored, so nothing can get out of sync.
* A session counts once (by its id). Saving the same new session twice within a minute (double tap) keeps one record.
* **Day:** minutes logged that date vs. the daily goal. With preferred days chosen, the daily goal applies on those
  days; an unplanned day has no target (rest), but cardio done on it still counts toward the week.
* **Week:** calendar week, starting on the day set in Settings (as for the calorie budget). Minutes, sessions and
  distance vs. their goals; remaining = goal − done (never below 0); percentage with one decimal (e.g. 75 of 120 min =
  62.5 %). Above 100 % is shown as such.
* **Schedule:** done (planned day with cardio), extra (unplanned day with cardio), missed (planned day in the past
  without cardio), planned today / ahead, rest (unplanned day without cardio — **never** counted as missed). Without
  preferred days nothing is planned and nothing can be missed. Remaining sessions = weekly sessions − sessions done.
* **Reports:** last 8 calendar weeks and last 6 months: total minutes, sessions, average minutes per session, distance,
  goal reached (month goal = weekly goal × days in the month ÷ 7) and the change versus the previous period.

## Sessions

Activity, duration, distance, speed, incline (treadmill), calories (optional, otherwise estimated), date and time, and
notes, as before. "Log cardio" on the dashboard pre-fills the preferred activity; for treadmill or incline walking it
uses the saved routine's speed and incline. Switching activity clears a speed that is impossible for the new activity.
Existing sessions are read as they are: no migration, no rewrite.

## Calories and the food budget

**Exercise never changes the food budget.** The day's calorie target is always the saved nutrition target, on cardio and
training days alike. Burned calories are shown in the Diary for information ("not added to your food budget"). The
earlier optional "smart" add-back mode was removed; a value stored by an older version is ignored
(`docs/CARDIO-METHODOLOGY.md` §4 is kept for reference). Nutrition calculations, foods, recipes, targets and diary
records are not touched.

## Security

Goals live in `users/{uid}/settings/main`, sessions in `users/{uid}/kv/cardio:<id>`. The existing Firestore rules
allow only the owner. The rules test checks that another user, the administrator and a signed-out request can neither
read, write nor delete them.
