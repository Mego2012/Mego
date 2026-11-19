# MEGO — Final production launch audit

Date: 18 November 2026 · Live app: https://mego2012.github.io/Mego/ · Repository branch:
`claude/nutrition-tracking-app-989rku` (production deploys from this branch).

Status legend: **Done** = completed and verified here · **Needs your action** = prepared, requires your account or
decision · **Blocked** = not possible with the access available here.

## Summary

| # | Area | Status | Evidence / document |
| --- | --- | --- | --- |
| 1 | Firebase web API key: HTTP-referrer + API restriction | **Prepared · needs your action** (console only) | `MEGO_SECURITY_CHECKLIST.md` §1, steps A–D; backend v10 deployed in the app's setup page |
| 2 | Account security (Google, Firebase, GitHub) | **Checklist ready · needs your action** | `MEGO_SECURITY_CHECKLIST.md` §2–5 |
| 3 | Privacy policy and terms (AR + EN) | **Drafts done, in the app and as files · 4 owner facts + lawyer review needed (see `MEGO_LEGAL_REVIEW_PACK.md`)** | `MEGO_PRIVACY_POLICY_AR/EN.md`, `MEGO_TERMS_AR/EN.md`; app → Settings → About → links |
| 4 | Arabic narration licence | **Replacement v2 (MIT voice) prepared, NOT published · original backed up privately · awaits your listening approval** | `MEGO_AUDIO_LICENSE_AUDIT.md` §4 |
| 5 | Real dish photographs | **Done: 37 recipes** (licensed, documented, labelled, fallback, offline) | `MEGO_IMAGE_LICENSES.md`; app → Settings → Photo credits |
| 6 | Full regression | **Done: all baselines met or exceeded** | `MEGO_FINAL_TEST_RESULTS.md` |
| 7 | Deployment | **Done and verified** (Actions green, live bundle = commit, live tests) | §7 below |

## 1. Firebase API key restriction

* Verified facts: project `mego-473920` (number `1000416380450`); the key is currently **unrestricted** (a foreign
  referrer got HTTP 200); the app uses it only for Identity Toolkit (sign-up / sign-in / lookup / update / reset) and the
  Token Service; Firestore traffic does not carry it.
* Risk found and solved before restricting: the AI scanner's backend checked sign-ins from Google's servers **without**
  a referrer, so a referrer restriction would have broken every scan. **Backend v10** prefers a separate server key
  (`FIREBASE_SERVER_KEY`) and otherwise sends the app's address as referrer. Tested with an emulated restricted key
  (3 new unit tests).
* Password-reset and verification links open Firebase's page on `mego-473920.firebaseapp.com`, so that address must be
  in the referrer list. The checklist includes it.
* **Not changed in production.** This environment has no Google Cloud credentials, and you asked to approve first. Exact
  console steps, order, verification (`curl` → 403) and rollback are in the checklist.

## 2. Account security

Checklist for 2-step verification, recovery (review only), sessions, third-party access, Firebase members, rules,
authorized domains, billing (Spark, no billing account), GitHub 2FA, collaborators, Actions secrets (none needed; the
workflow uses no secrets), Actions permissions and installed apps. Nothing was changed for you, as instructed.

**Leftover test account:** an audit script on 18 Nov stopped before cleaning up one throw-away account
(`mego-audit-k-…@example.com`, one fake entry "Audit item", no real data). Its email was not printed, so it cannot be
deleted from here. Delete it in Firebase console → Authentication (search "mego-audit-k"), then its `users/<uid>` and
`profiles/<uid>` documents. The script was fixed (always deletes, prints the email first). Every later run deleted its
own accounts, including today's live run.

## 3. Legal texts

* Rewritten against what the app actually does: what is stored (foods, recipes, targets incl. fiber and
  vitamins/minerals, workouts, cardio, fasting, plans, preferences), what stays on the device (progress photos,
  automatic backups: up to 13 copies), what goes to Google (Firebase sign-in + Firestore; Gemini only for a scanned
  meal photo, with EXIF removed), shared vs private data, retention, deletion, rights, no tracking cookies, health
  disclaimer ("unknown" is never shown as zero; vitamin reference values exclude pregnancy, breastfeeding and medical
  conditions).
* An unverifiable claim was removed (storage region "Middle East"). It is now a bracketed placeholder.
* Clearly marked **DRAFT, lawyer review required**; no claim of legal compliance.
* **You must fill in:** (1) operator name, country and contact email; (2) Firestore location (console → Firestore →
  Database → Location); (3) rights / response times / authority under the applicable law (after legal review).
* In the app: Settings → About → "Privacy policy" / "Terms of use" (mobile-friendly, headings as real `h2`,
  axe 0 violations). The repository files are generated from the same text (`scripts/export-legal.ts`), so the files and
  the app cannot drift apart.

## 4. Narration licence

English video: public-domain voice (LJ Speech), OK. **Arabic video: not cleared:** the `ar_JO-kareem-medium` voice
was trained on a dataset with no licence and fine-tuned from a research-only base voice. Recommendation: keep the
Arabic video private now; for launch, re-record with a human narrator (option A) or use Azure neural Arabic voices on the
free tier (option B). **Update 19 Nov 2026:** a free, MIT-licensed replacement (Chatterbox Multilingual, built-in voice,
no cloning) was generated and a full draft video built and checked (pronunciation error rate 5.4 % vs. 2.6 % for the old
voice; all numbers verified). It is **not published**; the current video was not touched. Details: audit §4.

## 5. Dish photographs

* 47 named dishes were prioritized (the library's best-known Arab, Mediterranean and international dishes, where a
  genuine example photo of the same dish exists). Candidates came only from Wikimedia Commons with CC0 / public domain /
  CC BY / CC BY-SA. Every photo was checked by eye and against its title and the recipe's ingredients.
* **37 shipped**, 10 deliberately left without a photo. For example, the "fish tacos" candidates were all meat tacos,
  the yogurt-bowl photo was blueberry rather than strawberry-banana, and the creamy pasta was a mushroom dish. Kabsa
  could not be searched (Wikimedia rate limit). Reasons per recipe are in `MEGO_IMAGE_LICENSES.md`.
* Honest labelling: "Example photo of this kind of dish, not of this exact recipe…" under the cover, with author +
  licence linked to the source; alt text "Example photo of {dish}" / "صورة توضيحية لطبق {dish}". Ingredient mosaics are
  never presented as dish photos.
* 400×400 WebP, 855 KB in total, cached for offline use; automatic fallback to the ingredient mosaic if a photo
  cannot load. All 37 listed in Settings → Photo credits.

## 6. Regression

All required baselines met or exceeded (unit 328/328, main 57/57, nutrition 29/29, fiber 26/26, budget 25/25,
cooking 24/24, live account & security 20/20, multi-user 8/8, rules 14/14, axe 0, overflow 0, i18n 0). Two
**pre-existing** flaky browser checks were traced to test timing (same failures on the previous release) and fixed
without weakening any assertion. Details: `MEGO_FINAL_TEST_RESULTS.md`.

## 7. Deployment

| Commit | Content | Actions | Live check |
| --- | --- | --- | --- |
| `9d96fbd` … `41fef73` | backend v10, legal texts + links, dish photos, offline caching, localization fixes, test fixes | run #88 **success** | live bundle `index-CZSulEww.js` = local build of `41fef73`; live main 57/57, live account 20/20, live dish 21/21 |
| `af5a30a` | About-card legal links (bug found on live screenshots) | run #89 **success** | live bundle `index-BuehgRzr.js` = local build; live dish 23/23; screenshots re-taken |
| final docs commit | this document set + dish-note spacing | see the final report | verified the same way |

**Data safety:** this release changes no database schema, no stored record, no target, no food value and no recipe
nutrition. Your targets (2,110 kcal, 160 g protein), food database, recipes, accounts and diary history are untouched.
No paid service was added.

## 7b. Re-check on 19 November 2026

Re-verified from here: backend live at **v9** (v10 is in the repo but not deployed; this session has no Apps Script or
Google Cloud access), web key still **unrestricted** (accepted with a foreign or no referrer), Gemini not reachable with
that key (403), git history free of secrets, only one GitHub collaborator, Firestore region **me-central2 (Dammam)**
now stated in the privacy policy (AR/EN, live). Full table: `MEGO_SECURITY_CHECKLIST.md` §0.

## 8. What needs you (in order)

1. **Apps Script:** update to backend v10 (Settings → Backend setup → copy Code.gs → new deployment version).
2. **Google Cloud:** create the server key, set `FIREBASE_SERVER_KEY`, restrict the web key (checklist steps B–D).
3. **Firebase:** delete the leftover `mego-audit-k-…@example.com` test account; note the Firestore location.
4. **Legal:** fill in the operator and contact details and the region, then have a lawyer review the drafts.
5. **Narration:** listen to the Chatterbox draft and approve or reject it (or choose A / B); make the current public Arabic
   video private (owned by the other Google account).
6. **Account security:** work through the checklist (2FA, sessions, collaborators, apps).

## 9. Remaining risks

* Until step 2 is done, the web API key is unrestricted (it is public by design; abuse is limited to the Identity
  Toolkit APIs and Firebase's own quotas, but restriction is recommended before a public launch).
* Legal drafts are not legal advice; publishing them without review is your decision.
* Arabic video narration licence (above).
* 111 recipes still show ingredient mosaics, not dish photos (truthful, but less attractive). The pipeline
  (`scripts/dish-photos/`) can add more.
* Main browser suite: one unexplained single timeout (TEST 5) in 8 runs after the fixes (7 local, 1 live); failure screenshots are now
  captured automatically.
