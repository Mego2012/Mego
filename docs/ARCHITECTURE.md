# MEGO — architecture, security model and free-tier limits

## Components (all free, no billing account anywhere)

| Part | Service | Free limit that applies |
| --- | --- | --- |
| App (PWA) | GitHub Pages | public repo; static files |
| Accounts | Firebase Authentication (Spark) | 3,000 daily active users; 150 password-reset emails/day; 100 sign-ups/hour per IP |
| Private data + shared foods | Cloud Firestore (Spark) | 1 GiB stored; 50,000 reads, 20,000 writes, 20,000 deletes per day |
| AI meal scanner | Google Apps Script (owner's account) → Gemini API free tier (`gemini-3.8-flash`) | per-user 10 scans/day, global 200/day (configurable); Google's free quota; no paid model, no fallback |
| Owner's Google-Sheet Hub | Apps Script + Sheets | for the owner's own device (guest/owner mode) |
| Food reference data | USDA FoodData Central (public domain), shipped with the app | none (static file, cached offline) |
| Packaged products | Open Food Facts (free API) | community data, labelled as external |

When a free limit is reached the service stops for the day (Firebase Spark and the Gemini free tier cannot bill);
the app shows a clear message. MEGO does not promise unlimited free usage.

Google Sheets was evaluated as the multi-user database and rejected: no row-level security (isolation would depend
only on custom code), every request runs as the owner's account (30 simultaneous executions, 100 emails/day), and the
sheet owner can read every row. It remains the owner's personal Hub.

## Data model (Firestore)

```
profiles/{uid}            displayName, email, status (active|suspended), country, ageConfirmed, createdAt, lastActiveAt
users/{uid}/{table}/{key} { data: JSON string of the record, updatedAt: int, deleted?: bool }
                          tables: entries, body, days, recipes, templates, plans, plannedDays, fasts, kv, settings, foodChanges, foods
admins/{uid}              written only with owner credentials (setup script / console)
foods/{id}                shared verified foods (admins write)
foodSubmissions/{id}      ownerUid, status (pending|approved|rejected), at, food
errorReports/{id}         at, kind, message, app (no personal data)
```

On each device every account has its own local database (`mego-u-<uid>`); guest mode keeps `mego-nutrition`.

## Security model (enforced by `firebase/firestore.rules` on Google's servers)

* A user can read/write only `users/{their uid}/**`, only while their profile is `active`.
* Changing the user id in a request does not help: the rule compares it with the signed-in identity.
* An older copy never overwrites a newer one (`updatedAt` may not go back); record shape and size are validated.
* Administrators can list profiles, count users and change **only** the `status` field. They have **no** read access to
  any `users/**` record. Nobody can create an admin from the app.
* Passwords are handled entirely by Firebase Authentication (never stored or seen by MEGO).
* The Gemini key lives only in Apps Script properties. Public users call the AI proxy with their Firebase ID token;
  the proxy verifies it with Google, reads the user's profile **with that same token** (rules apply), enforces
  per-user and global limits and refuses EU/EEA/UK/Swiss accounts (Gemini free-tier terms). Photos are not stored.
* The Firebase web config in `public/firebase-config.json` is a public identifier, not a secret.

## Verification

* `npm run test:rules` — 14 tests on the official Firestore/Auth emulators (3 users, admin, suspension, conflicts, live second device).
* `npm run e2e:multi` — 8 browser checks: 3 registrations, isolation incl. server 403, two devices live, AI limit,
  password reset, food submission review, admin suspend/reactivate, sign-out, account deletion.
* Real-project verification needs `node scripts/laptop-setup.mjs --cloud you@example.com` on the owner's laptop.
