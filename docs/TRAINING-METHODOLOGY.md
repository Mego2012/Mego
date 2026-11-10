# MEGO 1.3 — Workouts, strength analytics and the training coach

Version 1.0 · 10 November 2026 · Code: `src/lib/exercises.ts`, `src/lib/workouts.ts`, `src/lib/trainingCoach.ts`,
`src/lib/energy.ts`, `src/pages/Workouts.tsx` · Tests: `tests/workouts.test.ts` (32) · e2e: WORKOUT, PROGRAM-GEN,
EX-LIB, COACH-TRAIN, TRAIN-EN · live: "Workouts (account A)…" in `scripts/live-verify.mjs`.

## 1. Data protection

* **No schema change** (database version 2). Training data is stored as new records in the existing synced key/value
  table:

  | Record key | Contents |
  | --- | --- |
  | `program:<id>` | a training program |
  | `activeProgram` | which program is active |
  | `workout:<id>` | one per session |
  | `exercise:<id>` | a custom exercise |
  | `recovery:<date>` | a daily recovery log |
  | `preferredExercises` | exercises you marked as preferred |

  The live server rules already restrict these records to their owner. Tests confirm that account B gets 403 and sees
  an empty history.
* **Pre-update backup.** The first start of release `1.3-training` saves a full snapshot first, once per release.
  Rotation never removes it.
* **The backup is restorable.** A test restores a pre-update backup into an empty database and gets identical diary
  entries, foods and body records.
* Deleting a workout removes only that session. Deleting a program never touches workout history, and the active
  program cannot be deleted. Editing a program never changes logged sessions.

## 2. Exercise library

* 54 built-in exercises.
* Each has an Arabic and English name, primary and secondary muscles, equipment, a category (compound or isolation),
  a recommended sets × reps and rest, instructions in both languages, and alternatives.
* Alternatives are always filtered to the equipment you have.
* You can add custom exercises.
* No exercise photos: no freely licensed set of these movements was available. A drawn diagram highlights the
  target muscles instead.

## 3. Program generator (keeps your split)

The input is your split (default: the owner's 6 days plus rest, mapped to the training weekdays already in Settings:
Saturday … Thursday, with Friday as rest), plus:

* experience
* available equipment
* weekly sets per muscle (beginner 10 / intermediate 14 / advanced 16)
* pull-ups and dips per week
* preferred exercises
* exercises logged in the last 6 weeks

Rules:

* **The split is never changed.** "Keep my current split" is the default.
* **Volume.** Per muscle: sets per session = weekly target ÷ times trained per week, capped at 10 per session for a big
  muscle (8 when the day trains 3 or more muscles) and 6 for a small one. Each day is capped at 24 sets, trimming
  isolation sets first. The aim is roughly 10–20 hard sets per muscle per week.
* **Exercise choice.** One compound first, chosen for strength retention in a deficit. Then a second compound angle
  or an isolation exercise. Near-duplicates of the same type are never put on the same day (for example two squat
  variants). A muscle's second day of the week prefers variations not yet used. Exercises you already train or marked
  as preferred are kept.
* **Pull-ups and dips** go first on back and triceps days. Any extra weekly frequency goes on biceps days (pull-ups)
  and chest days (dips), at most once per day. With the owner's split, up to 3 dips per week fit.
* **Rep ranges and effort.** Each exercise's recommended range (heavy compounds 5–10, isolation 10–20). Target RIR is
  2 for heavy compounds and 1 for isolation. Rest is 60–180 s.
* Every exercise shows why it was chosen. The result is saved only as a new program, and only if you choose to.

## 4. Session logging

Each set records weight, reps, RIR (0–5+), RPE (optional) and done. Each exercise can be marked skipped and have
notes. Ticking a set starts its rest timer. Each exercise shows its last performance next to the current one. Weights
are prefilled from the progression advice, and you can change everything.

## 5. Strength analytics

* **e1RM (Epley):** w × (1 + reps/30), using sets of 12 reps or fewer. For body-weight exercises the load is body
  weight plus added weight.
* **Volume:** Σ load × reps.
* **Personal records:** best e1RM, heaviest weight, most reps in a set, best session volume.
* **Trend:** the mean e1RM of the last 3 sessions compared with the 3 before it.
  * more than +2 % → improving
  * less than −2 % → declining
  * otherwise stable
  * fewer than 4 sessions → insufficient data
* **Weekly sets per muscle:** primary 1 set, secondary ½. The warning line is above max(20, goal + 6).

## 6. Progression (double progression)

All prescribed sets reach the top of the rep range:

* **RIR ≥ 1 on every set (or RPE ≤ 9):** increase weight, high confidence. Step: +2.5 kg; +5 kg for lower-body
  compounds at 100 kg or more; +1 kg under 20 kg.
* **RIR/RPE not recorded:** increase weight, medium confidence, and the app says why.
* **Reached at failure (RIR 0 / RPE 10):** keep the weight.

Otherwise:

* **All sets within the range:** add reps at the same weight. Completing a workout alone never raises the weight.
* **Below the range once:** keep the weight.
* **Below the range twice in a row:** reduce by about 5 %.
* **Declining trend with poor recovery, or a drop of more than 5 %:** reduce by about 10 %.
* **No new best in the last 3 of 6 or more sessions:** consider replacing the exercise; alternatives are listed.

Nothing changes the program automatically.

## 7. Recovery

The daily log is optional: sleep hours, plus soreness, energy and fatigue on a 1–5 scale. Warnings cover:

* average sleep under 6.5 h
* soreness of 4 or more
* energy of 2 or less
* fatigue of 4 or more
* 7 or more training days in a row
* very high weekly volume
* 2 or more exercises declining
* cardio above twice the plan while leg performance declines

These are not a medical assessment, and nothing is diagnosed.

## 8. Calories (no double counting, no surplus on fat loss)

* Saved targets (for example the owner's 2,110 kcal) are never changed. A test confirms this.
* Your planned resistance days per week are inside the TDEE through the activity level, so planned workouts add
  nothing.
* Only sessions beyond the plan in the last 7 days count: net energy (3.5 − 1 MET) × kg × duration. They are added
  back with the same goal-based share and the same 400 kcal/day cap as cardio, and each step is explained on Home.
* For fat-loss goals:
  * Any **suggested** calorie increase (Goals recommendations) is limited so the target stays at or below 90 % of
    TDEE, so the app never suggests a surplus. If there is no room, it recommends recovery and protein instead.
  * The **daily adjusted** target is limited to 90 % of that day's expenditure (TDEE + extra exercise), so exercise
    never turns a day into maintenance or surplus.

## 9. Coach (rule-based, on the phone, free)

The coach answers these questions from logged data only, each with a confidence level and the data it is based on:

* What should I train today?
* What weight should I use today?
* Am I progressing?
* Should I increase my weight?
* Why has my performance declined? It lists only factors present in the data.
* Am I doing too many sets?
* Is my weekly volume sufficient?
* Which muscles need more attention?
* Should I take an extra rest day?

When data is missing, it says so. It uses no external AI service and has no cost.

**Nutrition × training checks:**

* the deficit vs TDEE (10–25 % is appropriate)
* the loss rate (0.25–1 % per week)
* protein (1.8 g/kg or more)
* carbohydrates (under 2 g/kg → place carbohydrates around training, same calories)

## 10. Weekly review

The review covers last week, or this week so far. It has 8 **observations**:

1. nutrition adherence
2. weight trend
3. waist
4. strength (PRs, trends)
5. workout consistency
6. cardio
7. recovery
8. goal progress

**Recommendations** are listed separately, as suggestions only.

## 11. Reports and dashboards

* **Weekly and monthly reports** add a Workouts card: sessions vs planned, consistency, hard sets, volume, new PRs,
  strength trends and sets per muscle.
* **Home** shows today's workout.
* **Workouts → Overview** is the unified dashboard: body, today's nutrition, week, strength, muscle volume, recovery
  and what to focus on.
