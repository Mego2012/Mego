# MEGO — real Android device test (≈ 20 minutes)

**Status: NOT YET RUN on a physical device.** No Android phone is reachable from the cloud session. Everything below
was covered only by emulated Samsung/Pixel viewports with real touch events (Chromium). Please run this on your
Samsung phone (Chrome) and fill in the last column. Anything marked ❌ → send a screenshot.

Prerequisite for sections C–E: the laptop setup has been run (`node scripts/laptop-setup.mjs --cloud you@…`) and
reported ✅ for Firebase. Sections A–B work today.

| # | Step | Expected | ✅/❌ |
| --- | --- | --- | --- |
| **A** | **Install & basics** | | |
| A1 | Chrome → https://mego2012.github.io/Mego/ → ⋮ → *Add to Home screen* → open from the icon | full-screen app, MEGO splash, no browser bar | |
| A2 | Settings → Language: العربية | everything right-to-left, numbers readable | |
| A3 | Settings → Language: English | everything left-to-right | |
| A4 | Settings → Theme: Light, then Dark, then System | all screens readable in both | |
| A5 | Rotate / use a small and large font size (Android display settings) | no text cut off, nothing wider than the screen | |
| A6 | Swipe through: Home, Diary, Recipes, Progress, More → Coach, Reports, Settings | every screen scrolls to its bottom, bottom bar never covers buttons, Back button closes sheets | |
| **B** | **Food logging (guest or signed in)** | | |
| B1 | Diary → + Add → type `صدور فراخ` | chicken breast appears (with photo) | |
| B2 | Pick it → 150 g → Log | entry appears, calories ring updates | |
| B3 | Diary → + Add → barcode icon → scan any packaged product | camera opens (allow permission); product found or "create it" offered | |
| B4 | Home → *Take a photo* of a meal (needs the Gemini key from the laptop setup) | review screen with items; nothing saved until you confirm | |
| B5 | Airplane mode → reopen the app → log a food | app opens and logging works offline | |
| B6 | Airplane mode off | sync chip returns to "synced" (account) / Hub sync (owner device) | |
| **C** | **Accounts (after `--cloud`)** | | |
| C1 | Welcome → Create account with your email | lands on Home with the targets you chose | |
| C2 | Sign out → Sign in | data still there | |
| C3 | Forgot password | reset email arrives (check spam) | |
| **D** | **Two devices / sync** | | |
| D1 | Sign in to the same account on the laptop browser | diary from the phone appears within seconds | |
| D2 | Add water on the phone | appears on the laptop without reloading | |
| **E** | **Multiple accounts / isolation** | | |
| E1 | On a second phone (or Chrome incognito) create another account | its diary is empty — nothing from account 1 | |
| E2 | Run `node scripts/live-verify.mjs` on the laptop | all checks ✅ (two disposable accounts, isolation 403, sync, reports, deletion) | |
| **F** | **Reports** | | |
| F1 | Mark a day complete → More → Weekly report | the day is green in the ledger, averages include it | |

Optional: to capture console errors, connect the phone by USB, enable *Developer options → USB debugging*, open
`chrome://inspect` on the laptop and inspect the MEGO tab.
