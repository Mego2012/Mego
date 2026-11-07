# MEGO — verified production status (7 November 2026)

**Verdict: NOT ready for public launch.** The app itself is deployed and verified on the live site, but every
service that needs your Google account (Hub, Apps Script, Gemini, Firebase) is **not deployed and not connected**.
Reason: this work ran in a cloud container. It had no access to your laptop (no computer folder was shared with the
session) and no access to your Google account. Nothing below is reported as live unless it was tested against
the live service.

## Per-service status

| Service | Configured? | Deployed? | Connected to your real account? | Tested against the live service? | Remaining action from you |
| --- | --- | --- | --- | --- | --- |
| **App hosting** (GitHub Pages, https://mego2012.github.io/Mego/) | Yes | Yes (deploy #18 ✅) | Yes — repository Mego2012/Mego | **Yes**: 44/44 browser checks + 103/103 touch-scroll checks run against the live URL; photos and food database served live | None |
| **Google Sheets Hub** (convert Excel → Google Sheet, original untouched) | Code ready (`apps-script/Code.gs` v5, `installMego`) | **No** | **No** | **No** (only an emulated spreadsheet) | Run `node scripts/laptop-setup.mjs` on the laptop; click Google's *Allow* |
| **Google Apps Script API** | n/a | **No** | **No** | **No** | Turn it on once at script.google.com/home/usersettings (the script opens the page) |
| **Apps Script deployment & permissions** | Code + deploy steps scripted (clasp) | **No** | **No** | **No** | Approve the script's permission screen once (Advanced → Go to project → Allow) |
| **Gemini AI scanner** (free tier, no billing) | Code ready; only free Flash model allowed; no paid fallback | **No** | **No** | **No** (scripted stand-in only) | Create a key at aistudio.google.com/apikey — **never click "Set up billing"** — copy it when the script asks |
| **Firebase Authentication** (Spark, no billing) | Code + rules ready; setup scripted (`--cloud`) | **No** — live `firebase-config.json` is 404, so the live app runs in guest mode | **No** | **No** (official emulators only) | `node scripts/laptop-setup.mjs --cloud your@email`; sign in; accept the Firebase terms (legal agreement — yours only); enable Email/Password if the script asks |
| **Cloud Firestore + security rules** | Rules written and tested (14/14 on emulators) | **No** | **No** | **No** | Same command (creates the database, deploys the rules) |
| **Cloud sync between devices** | Code ready | **No** | **No** | **No** (emulators: two devices live ✅) | Same command |
| **Registration, login, independent accounts, isolation, food logging, reports** | Live verifier ready: `scripts/live-verify.mjs` (two disposable accounts, server-side 403 checks with their own tokens, second-device sync, weekly report, sign-out/in, deletion) | **No** (needs Firebase above) | **No** | **No** — the verifier itself was proven on the emulators (11/11) | Runs automatically at the end of `--cloud` (after GitHub Pages publishes the config); re-run any time with `--verify` |
| **Admin account** | Scripted | **No** | **No** | **No** | Register in the app with your email, then run `--cloud your@email` again |
| **Real Android device** | Test protocol ready: `docs/ANDROID-TEST.md` | n/a | n/a | **No** — emulated Samsung/Pixel viewports only; camera/barcode untested on hardware | Follow the checklist on your Samsung (≈ 20 min) |
| **Privacy policy & terms** | Drafts completed and checked against the code (AR/EN, `#/privacy`, `#/terms`) | Yes (marked *Draft*) | n/a | n/a | Decide items 1–8 in `docs/LEGAL-REVIEW.md` with a lawyer (operator identity, governing law, liability, consents, provider terms) |
| **Old GitHub commits with your food table** | Investigated | n/a | n/a | **Checked live**: `a7b5bbb` and `3fb3c82` still serve `tests/fixtures/foods-160.csv` (HTTP 200); current branch 404 | Send the prepared request in `docs/GITHUB-SUPPORT-REQUEST.md` while signed in as Mego2012 |

## Production tests run after this round

| Suite | Target | Result |
| --- | --- | --- |
| Browser checks (`npm run e2e`) | **live site** | 44/44 |
| Touch scrolling (`e2e/scroll-test.mjs`) | **live site** | 103/103 |
| Browser checks | local production build (after legal-page changes) | 44/44 |
| Unit tests | code | 109/109 |
| Laptop-setup script | real Code.gs over HTTP (emulated Google) | 10/10 |
| Live account verifier | Firebase emulators (proves the script, not the service) | 11/11 |
| Firestore rules | official emulators | 14/14 (previous round, rules unchanged) |
| Multi-user | official emulators | 8/8 (previous round, unchanged code paths) |

Secret scan: no real API key, token or bootstrap secret in the repository (only obviously fake test keys).
No billing was enabled, nothing was purchased, no legal agreement was accepted.

## The one session that closes the gaps (on your laptop, ≈ 15–25 min)

```bash
git clone -b claude/nutrition-tracking-app-989rku https://github.com/Mego2012/Mego.git && cd Mego
npm ci
node scripts/laptop-setup.mjs --cloud your@email     # Hub, Apps Script, Gemini, Firebase, then live verification
# register in the app with the same email, then once more for the admin role:
node scripts/laptop-setup.mjs --cloud your@email
```

The script stops only at Google's own screens (sign-in/Allow, Apps Script API switch, script permissions, Firebase
terms) and writes two reports to `~/.mego-backend/`: `report-*.md` (Hub, Apps Script, Gemini) and
`live-verify-*.md` (accounts, isolation, sync, logging, reports). A service counts as live only when its line there is ✅.
To do it with Claude instead of alone: open this project in the Claude Desktop app on the laptop (or run
`claude remote-control` inside the MEGO folder) so a session can work directly on the laptop.
