# MEGO — release status (1.1)

> Superseded by **docs/PRODUCTION-STATUS.md** (verified per-service status).

Three columns are kept strictly apart: **Done & tested here**, **Done, needs your account to go live**, **Not done**.
"Tested here" means automated tests in this repository's cloud workspace (real code, real browser engine; Google,
Firebase and Gemini replaced by emulators or scripted stand-ins). Nothing below is claimed as live on a real
Google/Firebase/Gemini account or a real Android phone unless it says so.

## 1. Done & tested here

| Area | What | How it was tested |
| --- | --- | --- |
| Every screen | Individually redesigned: Home, Diary, Food search, Food details (quantity + editor), Foods, Coach today/week/month, Rankings (protein, carbs, fats, fibre, low calorie, protein per calorie, nutrient density, cutting, building), Food detail + amino-acid chart, Compare, Education + articles, Recipes library / suggestions / cook, Planner, Habits, Progress, Weekly + Monthly reports, Settings, Account, Admin | 44 browser checks, 103 touch-scroll checks, screenshots in `docs/screenshots/` (AR/EN × light/dark) inspected one by one |
| Food photography | 74 hand-picked, freely licensed photos (Wikimedia Commons: CC0 / CC BY / CC BY-SA / public domain), 320 px WebP (~17 KB each), lazy + async decoding, cached on the device after first view (works offline), drawn placeholders for every other food, recipe covers built from photos of the recipe's own ingredients, credits page in Settings | `tests/photos.test.ts` (matches, non-matches, attribution of every file); every photo checked by eye on a contact sheet |
| Nutrition intelligence audit | Rankings fixed (see `PROGRESS-LOG.md`): fully measured foods first, missing data never estimated and labelled; education sources point to the exact documents | `tests/intel.test.ts`, `tests/coach.test.ts` |
| Accounts / isolation / admin | Firebase Spark design, security rules | 14 rules tests + 8 multi-user browser checks on the official Firebase emulators |
| Free AI scanner | Gemini free tier only, key only in Apps Script properties | unit tests against the real `Code.gs` with a scripted Gemini stand-in |

## 2. Done, needs your Google authorization to go live (cannot be done from a cloud session)

This session runs in a cloud container. It has **no access to your laptop** (no computer folder was shared with it)
and no access to your Google account, so none of these were executed against the real services:

| Step | Command (on your laptop) | What you will be asked to approve |
| --- | --- | --- |
| Google Sheet Hub + Apps Script backend | `node scripts/laptop-setup.mjs` | Google sign-in "Allow" for clasp; turn on "Google Apps Script API" once; the script's own permission screen once |
| Free AI meal scanner | same command, when asked for the Gemini key (create it at aistudio.google.com/apikey — **never** "Set up billing") | Google AI Studio sign-in |
| Public multi-user platform (Firebase Spark, no billing) | `node scripts/laptop-setup.mjs --cloud you@example.com` | Firebase/Google sign-in; Firebase terms on first project creation (a legal agreement — only you can accept it) |
| Admin account | register in the app with that email, then run the `--cloud` command again | — |
| Real-device test | open https://mego2012.github.io/Mego/ on the Samsung phone, "Add to Home screen" | — |

The setup script runs its own live checks against the real services and prints ✅/❌ for each; only after those pass
should anything be called "live".

## 3. Not done / limitations (honest list)

* **Real Android device testing** — not possible from a cloud session; covered by Playwright's Android device
  emulation (Pixel 7 / Galaxy viewports, touch, RTL/LTR, both themes) only.
* **GitHub history** — commit `a7b5bbb` (old public data) can only be purged from GitHub's caches by GitHub Support.
* **Legal pages** (privacy policy, terms) are drafts and need review by a qualified person before public launch.
* **Photos** cover 74 of the most common foods; all other foods show a drawn placeholder (by design, never a
  look-alike photo). Recipes have no dish photos (no licensed photos of these exact recipes exist), they show
  their ingredients instead.
* Barcode scanning uses the browser's BarcodeDetector where the phone supports it (Chrome on Android does); camera
  access cannot be tested in a headless cloud browser.
