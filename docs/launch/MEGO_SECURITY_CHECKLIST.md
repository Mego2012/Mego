# MEGO — Security checklist (owner actions)

Prepared 18 November 2026 for production commit `aeb578f` and later. Every item below is a change in **your**
Google, Firebase or GitHub accounts. This environment has no access to them (`gcloud auth list` → no credentials),
so nothing here has been changed for you. Tick each item when done.

---

## 0. Status on 19 November 2026 (re-checked by the engineer)

| Item | Verified state | Done here? |
| --- | --- | --- |
| Live backend (Apps Script) | answers, reports **version 9**; rejects a forged sign-in token | Update to v10 **not possible from this environment**: no Google Cloud / Apps Script credentials; the Drive connector lists script projects read-only, and the MEGO project is not in the account the connector uses (the Hub belongs to `ahmedmego967`) |
| Web API key `AIzaSy…tTdA` | **no website restriction**: accepted with a foreign referrer and with none (HTTP 200); refused by the Gemini API (403) | Restriction needs the Cloud console (no access) |
| Repository secrets | full history (99 commits) scanned: only the public Firebase web key and fake test keys; no Gemini / GitHub / private keys | ✅ verified |
| GitHub collaborators | only `Mego2012` (admin); 1 branch, unprotected | ✅ reviewed, nothing to remove |
| Deploy workflow | permissions `contents: read`, `pages: write`, `id-token: write`; official actions only; uses no secrets | ✅ verified |
| Nutrition Hub spreadsheets (personal data) | all **private** | ✅ verified |
| Public documentation folder | user guides, quick starts, brand assets, methodology PDFs are link-viewable (intended) | ✅ reviewed |
| **Arabic tutorial video** | **link-viewable** (inherits the public "01 – Video Tutorials" folder) although its voice is not licence-cleared | Cannot change: owned by `ahmedmego967`, no edit right through the connector → **your action** |
| Leftover test account `mego-audit-k-…` | its email/password were never printed and cannot be recovered | Deletion needs the Firebase console → **your action** |
| Firestore location | `me-central2` (Dammam), from the 7 Nov setup record; now stated in the privacy policy | ✅ documented (console confirmation optional) |
| Google / GitHub 2-step verification, sessions, connected apps | not visible to this environment | **your action** |

 (HTTP referrer + API restrictions)

### Verified facts (17–18 Nov 2026)

| Item | Value | How it was verified |
| --- | --- | --- |
| Key used by the app | `AIzaSy…tTdA` (public by design; full value in `public/firebase-config.json` and the Firebase console) | `public/firebase-config.json` |
| Firebase project ID | `mego-473920` | config `projectId` |
| Google Cloud project number | `1000416380450` | config `appId` prefix |
| Auth domain | `mego-473920.firebaseapp.com` | config `authDomain` |
| Current restriction | **none**: requests with a foreign referrer and with no referrer both returned HTTP 200 | `curl` to `identitytoolkit … accounts:createAuthUri` with `Referer: https://evil.example.org/` and with no referrer |
| APIs that receive the key from the app | **Identity Toolkit only**: `accounts:signUp`, `accounts:lookup`, `accounts:update`, `accounts:sendOobCode` (plus `signInWithPassword` at sign-in) | live session recorded on 18 Nov 2026 with a throw-away account (deleted); Firestore traffic did **not** carry the key |
| Token refresh | `securetoken.googleapis.com` (Token Service API), used by Firebase Auth every hour | Firebase Auth SDK behaviour |
| Server use of the same key | **Yes**: `apps-script/Code.gs → verifyFirebaseUser_` calls `accounts:lookup` from Google's servers, **without a browser referrer** | code review |

### Why the order matters

If the key were restricted to `https://mego2012.github.io/*` today, the AI photo scanner would refuse every scan
("unauthorized"), because its backend's token check sends no referrer. Password-reset and email-verification
links would also fail, because they open Firebase's page on `mego-473920.firebaseapp.com`, which uses the same key
from that address. Backend **v10** (this release) fixes the first problem; the referrer list below covers the second.

### Step A: update the backend to v10 (before restricting)

1. In MEGO: **Settings → Backend setup → copy `Code.gs`** (this is version 10).
2. Open your Apps Script project → replace `Code.gs` with it → **Deploy → Manage deployments → Edit → New version → Deploy**.
3. In MEGO, run one photo scan → it must work (still on the unrestricted key).

### Step B (recommended): give the backend its own server key

1. Google Cloud console → project **mego-473920** → **APIs & Services → Credentials → Create credentials → API key**.
2. Name it `MEGO server (Apps Script)`. **Application restrictions: None** (Apps Script has no fixed IP or referrer).
   **API restrictions: Restrict key → Identity Toolkit API** only.
3. Apps Script → **Project settings → Script properties → Add** `FIREBASE_SERVER_KEY` = that new key.
   This key stays secret (Script Properties are never sent to the app).
4. Run one photo scan → it must work. Backend v10 now uses the server key; the web key is no longer used by the server.

Without Step B, backend v10 sends `Referer: https://mego2012.github.io/Mego/` with the web key. That works with the
restriction below if Google's `UrlFetchApp` forwards the header. This is the reason Step B is recommended: it does not
depend on that.

### Step C: restrict the web key

Google Cloud console → **APIs & Services → Credentials** → the key ending in `…tTdA` (shown as "Browser key
(auto created by Firebase)") → **Edit**:

* **Application restrictions → Websites**, add exactly:
  * `https://mego2012.github.io/*` (the app)
  * `https://mego-473920.firebaseapp.com/*` (Firebase's password-reset / email-verification page; required)
  * `https://mego-473920.web.app/*` (Firebase's second default domain; optional but harmless)
* **API restrictions → Restrict key** → tick **Identity Toolkit API** and **Token Service API**.
* **Save** (changes can take up to 5 minutes).

### Step D: verify (5 minutes after saving)

| Check | Expected |
| --- | --- |
| Open https://mego2012.github.io/Mego/, sign in, log a food, reload | works |
| Settings → request a password reset, open the email link, set a password | works |
| One photo scan | works |
| From a terminal: `curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=<KEY>" -H "Referer: https://evil.example.org/" -H "Content-Type: application/json" -d '{"identifier":"x@example.com","continueUri":"https://mego2012.github.io/Mego/"}'` | HTTP **403** (blocked) |

The repository test `e2e/live-account-test.mjs` (`node e2e/live-account-test.mjs`) re-checks sign-up, sign-in,
offline, password reset and deletion against the live site with throw-away accounts that it deletes at the end.

**Rollback:** if anything fails, edit the key → Application restrictions **None** → Save. The app returns to today's state.

---

## 2. Google account that owns Firebase, Apps Script and Drive

- [ ] **2-Step Verification** on (myaccount.google.com → Security → 2-Step Verification); prefer a passkey or authenticator app over SMS.
- [ ] **Recovery email and phone** current (Security → "How you sign in to Google"). *Review only; I did not and will not change them.*
- [ ] **Active sessions / devices** reviewed (Security → Your devices); sign out unknown devices **yourself**.
- [ ] **Third-party access** reviewed (Security → Your connections to third-party apps); remove apps you do not use.
- [ ] Apps Script **Script Properties** contain only: `GEMINI_API_KEY`, `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, AI limits, and (after Step B) `FIREBASE_SERVER_KEY`. Never paste them into chats, documents or screenshots.
- [ ] Gemini API key in Google AI Studio: restricted to **Generative Language API** only (AI Studio → API keys → the key → API restrictions).

## 3. Firebase project `mego-473920`

- [ ] **Project members** (Firebase console → ⚙ Project settings → Users and permissions): only you, with Owner. Remove anyone else.
- [ ] **Firestore rules** published in the console are identical to `firebase/firestore.rules` in the repository (Firestore → Rules). The live security tests (20/20, 18 Nov 2026) match the repository rules, but the published text was not read directly.
- [ ] **Firestore location** noted (Firestore → Database → Location) and written into the privacy policy item "Where data is stored".
- [ ] **Authentication → Users**: delete the leftover test account **`mego-audit-k-…@example.com`** created on 18 Nov 2026 by an audit script that stopped before its clean-up. Then Firestore → delete `users/<its uid>` and `profiles/<its uid>`. It holds one fake diary entry ("Audit item"), no real data.
- [ ] **Authentication → Settings → Authorized domains**: `mego2012.github.io`, `mego-473920.firebaseapp.com`, `mego-473920.web.app`; remove `localhost` before public launch if you do not develop locally.
- [ ] **Usage and billing**: still on the **Spark (no-cost)** plan with **no billing account**. Set budget alerts only if you ever enable billing.
- [ ] **Admins**: `admins/{uid}` documents exist only for you.

## 4. GitHub (account `Mego2012`, repository `Mego2012/Mego`)

- [ ] **Two-factor authentication** on (github.com → Settings → Password and authentication); save the recovery codes offline.
- [ ] **Collaborators** (repository → Settings → Collaborators): only accounts you trust; none should have Admin unless needed.
- [ ] **Actions secrets** (repository → Settings → Secrets and variables → Actions): **none are needed**. The deploy workflow uses no secrets (verified in `.github/workflows/deploy.yml`). Delete any you find that you did not add.
- [ ] **Actions permissions**: allow only GitHub-owned and verified actions (the workflow uses `actions/checkout`, `actions/setup-node`, `actions/upload-pages-artifact`, `actions/deploy-pages`).
- [ ] **Branch protection**: production deploys from `claude/nutrition-tracking-app-989rku`. Consider creating `main`, deploying from it, and protecting it (require the test workflow to pass).
- [ ] **Installed GitHub Apps** (Settings → Applications): review; keep the Claude app only if you still use it.
- [ ] **Repository visibility**: public. It contains no secrets (all commits scanned on 17 Nov 2026), only the public Firebase web key and 4 fake test keys.

## 5. Ongoing

- [ ] Monthly: download a MEGO backup file (Settings → Data & backups) and keep it in Drive.
- [ ] Quarterly: re-run `node e2e/live-account-test.mjs` and review this checklist.
- [ ] Before publishing new legal texts: lawyer review (see the privacy and terms drafts).
