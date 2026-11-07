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
* Access: server-side Firestore rules — owner only, only while active; admins see the account card only (tested on the emulators; to be confirmed live by `scripts/live-verify.mjs`).
* Third parties actually contacted by the app: Firebase, Apps Script + Gemini (scanner only), GitHub Pages (hosting), Google Fonts, Open Food Facts (barcode number or typed search words only). No ads, no analytics.
* Gemini free tier: content may be used by Google to improve products and seen by human reviewers; users must be 18+; EU/EEA/UK/CH accounts are refused the scanner (free-tier terms).
* Users can export and delete everything in-app; deletion removes cloud records, profile and login (tested).

When items 1–7 are filled in, replace the bracketed text in `src/lib/i18n3.ts` (`pp_0`, `pp_13`, `tos_10`, `tos_11`)
and remove "Draft" from `legal_draft` / `legal_version` in `src/lib/i18n2.ts` and `src/lib/i18n3.ts`.
