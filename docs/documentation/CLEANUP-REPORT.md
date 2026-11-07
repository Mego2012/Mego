# MEGO — Google Drive cleanup report (7 November 2026)

Drive account used by this session: `aabdelmegeed574@gmail.com` (the connector account). Files owned by
`ahmedmego967@gmail.com` can be moved but not trashed from this account. The connector has **no permanent
delete**, so nothing was permanently deleted: "trashed" files stay recoverable in Drive's Trash for 30 days.

## Counts

| | Count |
| --- | --- |
| MEGO-related items handled (moved + protected) | 30 |
| Moved to **MEGO – Cleanup Review** | 25 (21 files + 3 FitnessOS folders + 1 README) |
| Trashed (recoverable 30 days) — confirmed test copies only | 6 |
| Could not be trashed (owned by the other account) — left in Review | 1 (`TEST COPY T2` Google Sheet) |
| Permanently deleted | 0 |
| Protected and left in place | 5 |

## Protected (live — not touched)

| File | Why |
| --- | --- |
| MEGO Nutrition Hub (xlsx) `1mxqBI9_…` | Original Excel, `SOURCE_ID` in the backend code; the native Hub was converted from it |
| MEGO Nutrition Hub (Google Sheet) `1ZmntBGu…` | Live Hub used by the Apps Script backend |
| BACKUP MEGO Nutrition Hub — before migrateHub — 2026-11-07 1425 | Verified backup taken before the live migration |
| Untitled project (Apps Script) `1avdwnL4…` | Ambiguous — may be bound/used; kept |
| MEGO – Official Documentation folder | Documentation centre |

## Trashed (confirmed test artifacts, recoverable)

TEST COPY T1 (xlsx), TEST COPY T2 (xlsx), FRESH TEST COPY, PRISTINE copy, REHEARSAL xlsx copy, REHEARSAL 2.
All were throw-away copies made for rehearsals of backend migrations; none is referenced by code or configuration.

## Kept in "MEGO – Cleanup Review" for the owner's decision (not deleted — ambiguous)

* 13 historical backups (Backup 1–13, several in both xlsx and Google Sheet form) — older states of the Hub; may be
  wanted for history. Recommended: keep the newest one or two, delete the rest yourself after checking.
* `TEST COPY T2` (Google Sheet) — test copy, but owned by ahmedmego967, so only that account can trash it.
* Subfolder **FitnessOS – previous project (never deployed)**: `1-apps-script-deploy-these`, `2-source`, `3-tests`,
  `README.md` — the earlier project; nothing in MEGO references it.

## Integrations confirmed working after the cleanup

* Live site, `firebase-config.json` and the food photo manifest: HTTP 200.
* `scripts/live-verify.mjs` against production: **14/14** (registration, isolation, logging, second-device sync,
  reports, admin enforcement, password reset, sign-out/in, deletion).
* Hub files (original xlsx, native Sheet, pre-migration backup) present, not trashed, same parent folder.
* The Hub ping through Apps Script needs the backend token, which this session does not hold; it was not re-run
  here. Nothing it uses was moved.
