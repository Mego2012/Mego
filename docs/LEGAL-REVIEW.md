# Privacy policy & terms — legal review checklist

The in-app pages (`#/privacy`, `#/terms`, Arabic + English) are complete **drafts**: every statement in them was
checked against what the code actually does (data stored, services contacted, security rules, deletion). They are
marked "Draft" in the app. MEGO should not open public registration until the items below are settled. These are
legal decisions and agreements — only you (the owner) and a qualified lawyer can make them.

## Must be decided by you / your lawyer (placeholders shown in brackets in the app)

| # | Item | Where | Why it cannot be decided by Claude |
| --- | --- | --- | --- |
| 1 | Operator identity: name, country, contact email for data requests | Privacy → "Who operates MEGO" | your personal/business identity; publishing it is your decision |
| 2 | Applicable law and jurisdiction (e.g. Saudi Arabia's Personal Data Protection Law, others for foreign users) | Terms → "Governing law" | legal judgement |
| 3 | Data-subject rights, response times, competent authority | Privacy → "Your rights" | depends on item 2 |
| 4 | Limitation of liability wording | Terms → "Liability" | legal drafting |
| 5 | Whether weight/body measurements are "sensitive/health data" under item 2, and whether explicit consent wording is required at registration | Registration step 1 (currently: 18+ confirmation and acceptance of the terms) | legal judgement |
| 6 | Cross-border transfer wording (Google, GitHub and Open Food Facts are outside Saudi Arabia) | Privacy → "Services that receive data" | legal judgement |
| 7 | Data retention period for inactive accounts (currently: kept while the account exists) | Privacy → retention | business + legal decision |
| 8 | Acceptance of provider terms: Google Cloud/Firebase terms, Gemini API Additional Terms, Google Apps Script terms, GitHub terms | provider consoles during setup | binding agreements — only the account owner may accept |

## Facts already verified for the drafts (no action needed)

* Stored: account email, display name, country, diary, targets, body measurements, water, habits, recipes, plans, settings.
* Access: server-side Firestore rules — owner only; a suspended account can still read (export) and delete its own data but not write; admins see the account card only and can read/list/write/delete none of a user's private tables (emulator tests 14/14; live check 17/17 on 11 Nov 2026).
* Third parties actually contacted by the app: Firebase, Apps Script + Gemini (scanner only), GitHub Pages (hosting), Google Fonts, Open Food Facts (barcode number or typed search words only). No ads, no analytics.
* Gemini free tier: content may be used by Google to improve products and seen by human reviewers; users must be 18+; EU/EEA/UK/CH accounts are refused the scanner (free-tier terms).
* Users can export and delete everything in-app, also while suspended; deletion removes cloud records, own food proposals, profile, login and this device's copy of the account (tested on emulators and live, 11 Nov 2026).

## Gaps found in the 11 Nov 2026 review (add to the lawyer's agenda)

| # | Gap | Current state | Suggested decision |
| --- | --- | --- | --- |
| 9 | Explicit consent for health-related data | Registration asks only for 18+ and acceptance of the terms; weight, measurements and intake are health-related | lawyer: whether a separate explicit-consent checkbox is required (e.g. Saudi PDPL "sensitive data", GDPR art. 9) |
| 10 | Retention of inactive accounts | "kept while the account exists" — no period, no inactivity clean-up | owner: choose a period (e.g. delete after N months inactive, with notice) |
| 11 | Retention of error reports | `errorReports` have no expiry (they hold no diary content and no user id) | owner: period, e.g. 90 days; an admin can delete them today |
| 12 | Retention of AI usage counters | per-user daily counters (keyed by user id) in Script Properties; removed only if the optional `cleanupAiCounters` daily trigger is installed | owner: install the trigger, or disclose |
| 13 | Deletion request when the user cannot sign in | no contact address yet (item 1) | fill item 1; define how identity is verified |
| 14 | Device storage disclosure | the app keeps data in the browser (IndexedDB/localStorage) for offline use; no cookies for tracking | lawyer: whether a storage notice is needed |
| 15 | AI processing disclosure details | pp_4 covers Gemini free tier, human review, photos not stored, location data removed; the scanner is refused for EU/EEA/UK/CH country codes, and the country is self-declared | lawyer: confirm wording; owner: accept that the region check relies on the declared country |
| 16 | Security incident / breach notification | no written procedure | owner + lawyer: who is told, within what time (see doc 71 Support & Incident Management) |
| 17 | Provider data-processing terms | Firebase / Google Cloud data processing terms are accepted in the provider consoles | owner: review and accept there (Claude does not accept agreements) |
| 18 | E-mail ownership | sign-up sends a confirmation e-mail and the app reminds unconfirmed users, but confirmation is not required | owner: keep optional or require it before use |

## Public launch readiness (11 Nov 2026)

* Technical: ready — live checks 17/17, rules 14/14, multi-user 8/8, unit and browser suites green, real Android phone tested by the owner.
* Not ready until: items 1–4 filled and reviewed, items 5/9 decided, operator contact published, "Draft" label removed after review.
* MEGO makes no claim of legal compliance; the drafts must be reviewed by a qualified lawyer before publication.

When items 1–7 are filled in, replace the bracketed text in `src/lib/i18n3.ts` (`pp_0`, `pp_13`, `tos_10`, `tos_11`)
and remove "Draft" from `legal_draft` / `legal_version` in `src/lib/i18n2.ts` and `src/lib/i18n3.ts`.
