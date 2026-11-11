# MEGO — master project completion checklist

Last updated: 11 Nov 2026. Statuses: **Completed** · **In progress** · **Waiting for Ahmed** · **Blocked** · **Requires external review**.
"Tested" names the check that proved it; "Deployed" means live on https://mego2012.github.io/Mego/ or on the
production Apps Script / Firebase project. Branch: `claude/nutrition-tracking-app-989rku` (every row is committed and pushed).

## A. Security and credentials

| Task | Status | What was done / remains | Tested | Deployed |
| --- | --- | --- | --- | --- |
| New Gemini API key active | Completed | Key replaced by Ahmed; a real meal photo was analysed on the live backend in 15.7 s on the first model (11 Nov) | live analysis, disposable account deleted | yes |
| Old Gemini key revoked | Waiting for Ahmed | Cannot be checked from here (the old key is not known to Claude and must not be). In Google AI Studio → API keys, confirm the old key is deleted | — | — |
| Backend secret (app token) rotation | Completed | Rotated by Ahmed on 11 Nov with `--rotate-token` (backend v9): new token accepted, old token refused; stored only on the laptop, never shown. A live meal analysis afterwards succeeded | v2 34/34, rotate e2e 7/7, live run + live analysis | yes |
| Dependent configuration | Completed (analysis) | Only the laptop state and a device using Google Sheets sync use the token; signed-in accounts and the AI scanner use the user's Firebase sign-in, not the token | code review | — |
| Firestore security rules | Completed | Deployed by Ahmed (`--deploy-rules`) | rules 14/14 (emulator), live 17/17 | yes |

## B. Admin system

| Task | Status | What was done / remains | Tested | Deployed |
| --- | --- | --- | --- | --- |
| Admin account `admins/{uid}` | Completed | Created by Ahmed in the Firebase console; dashboard verified by Ahmed on the live app | owner check | yes |
| Users cannot make themselves admin | Completed | Rule `admins/*: write false`; live refusals for self-promotion, status change to "admin", listing error reports | rules 14/14; live check 11 Nov | yes |
| Suspension / reactivation | Completed | Admin may change only `status`; suspended user sees the suspended screen, can export and delete own data, cannot write | multi-user 8/8 (emulator) | yes |
| Food submission review and publishing | Completed | Approve → shared `/foods`; proposals validated; stable Hub keys prevent duplicates across devices | multi-user 8/8, rules 14/14 | yes |
| Error reports and AI diagnostics | Completed | Reports only from active accounts, typed and size-limited, read by admins only; AI diagnostic and usage stats admin-only | rules 14/14; live: regular user refused (11 Nov) | yes (backend v8+) |
| Admins cannot see private data | Completed | Rules block read/list/write/delete of every private table for admins; progress photos never leave the device | rules 14/14 (all tables), multi-user 8/8 | yes |

## C. Documentation

| Task | Status | What was done / remains | Tested | Deployed |
| --- | --- | --- | --- | --- |
| 77 topics × EN/AR (154) + 4 extra | Completed | All written, verified in Drive 11 Nov: 158 Google Docs, no duplicates, none missing, none in a wrong folder; index v1.1 with links | Drive inventory `docs/documentation/_STATUS/DRIVE-INVENTORY.tsv` | in Drive |
| Earlier "15 not uploaded / 108 not written" | Completed | Superseded: the 15 were uploaded and the 108 written on 10–11 Nov | same inventory | in Drive |

## D. Food database and recipes

| Task | Status | What was done / remains | Tested | Deployed |
| --- | --- | --- | --- | --- |
| Recipe ingredients and 100 ready meals in the app | Completed | "Complete my food database" (adds only) | unit + browser check | yes |
| Hub: 101 ready meals + English names | Completed | `--hub-complete-foods` run by Ahmed | e2e 9/9 + live run | yes |
| Whey protein values | Waiting for Ahmed | Not changed. Needed: product name, serving size (g), kcal, protein, carbs, fat per serving (and per 100 g if printed) — photo of the label is enough | — | — |
| Labneh values | Waiting for Ahmed | Not invented. Needed: product/brand, kcal, protein, carbs, fat per 100 g (label photo), or approval to use your own Hub value | — | — |

## E. Google Drive cleanup

| Task | Status | What was done / remains | Tested | Deployed |
| --- | --- | --- | --- | --- |
| `TEST COPY T2 of live (2026-11-02) - solver v2 mobile testing` | Waiting for Ahmed | Still present (Google Sheet, modified 4 Nov). It belongs to the other Google account (ahmedmego967), which the connected account cannot edit. Not opened or changed. Action: sign in as that account and delete it if no longer needed | Drive search 11 Nov | — |

## F. Legal and public launch

| Task | Status | What was done / remains | Tested | Deployed |
| --- | --- | --- | --- | --- |
| Privacy policy / terms review | Requires external review | Texts checked against the code; two statements corrected (suspended users' rights, deletion scope); checklist in `docs/LEGAL-REVIEW.md` items 1–18 | text vs code review | in-app drafts |
| Operator identity, contact, governing law, liability | Waiting for Ahmed | Placeholders `pp_0`, `pp_13`, `tos_10`, `tos_11` | — | — |
| Public release | Blocked | Technically ready; blocked only by the legal items above | see G | — |

## G. Final quality assurance (11 Nov 2026)

| Check | Result |
| --- | --- |
| Unit tests (vitest) | 200/200 (14 files) |
| Firestore rules + cloud sync (emulator) | 14/14 |
| Browser end-to-end (guest, AR/EN) | 57/57 |
| Touch / scroll on phone sizes | 103/103 |
| Multi-user, admin, suspension, deletion (emulator) | 8/8 |
| Live production checks (accounts, sync, reports, deletion) | 17/17 (11 Nov, after deploy) |
| Storage-loss recovery scenario (emulator) | data recovered |
| AI meal analysis (live) | passed, 15.7 s |
| Admin-only actions refused to regular users (live) | passed |
| Laptop setup / Hub completion / token rotation (emulated Google) | 10/10, 9/9, 7/7 |
| Production build | passed |
| Real Android phone | passed (Ahmed) |
