# Setup, installation, backup & maintenance

## 1. Deploy the app (GitHub Pages — free, HTTPS, required for PWA install)

The workflow `.github/workflows/deploy.yml` runs the unit tests, builds the app and publishes it to GitHub Pages
on every push to `main` or `claude/nutrition-tracking-app-989rku`.

One-time action required from you (GitHub → repository **Settings → Pages**):

1. **Source:** choose **GitHub Actions**.
2. Re-run the workflow (Actions tab → "Test & deploy to GitHub Pages" → Run workflow).
3. The URL will be `https://mego2012.github.io/mego/` (shown in the workflow's *deploy* step).

> GitHub Pages on a **private** repository needs a paid GitHub plan. If the repo is private on a free plan,
> either make it public (the app contains no personal data — your data lives on your phone and in your own Google Sheet)
> or deploy the `dist/` folder to Netlify / Cloudflare Pages / Vercel (any static host works; set `BASE_PATH=/`).

## 2. Connect «MEGO Nutrition Hub» (your only Google Sheets database)

Read [HUB.md](HUB.md) first — it explains the one decision you need to make (the Hub is currently an .xlsx file).

1. Open https://script.google.com → **New project**, name it «MEGO Nutrition Hub backend».
2. Replace `Code.gs` with [`apps-script/Code.gs`](../apps-script/Code.gs).
   In **Project Settings** tick "Show appsscript.json", then replace it with [`apps-script/appsscript.json`](../apps-script/appsscript.json)
   (it enables the Drive service the script needs).
3. Select **setup** → **Run** → **Review permissions → Allow** (sign in as ahmedmego967@gmail.com, the Hub's owner).
   The log prints the **APP TOKEN** — keep it private.
4. *(Only if you choose option A in HUB.md)* run **convertHubToGoogleSheets** → it logs the new native ID → send it to me
   (or replace `HUB_ID` in Code.gs and in `src/lib/sync.ts`) → then run **migrateHub**.
5. **Deploy → New deployment → Web app** — Execute as **Me**, Who has access **Anyone** → copy the `/exec` URL.
6. In the app: **Settings → MEGO Nutrition Hub → paste URL and token → Save + test connection**. The app shows the Hub name, its ID and
   whether sync is full or read-only. Then tap **Import foods from sheet**.

Updating the script later: paste the new code, then **Deploy → Manage deployments → Edit → New version** (URL and token stay the same).

## 3. Install on your Samsung phone

1. Open the app URL in **Chrome** (or Samsung Internet) on the phone.
2. Chrome: menu ⋮ → **Add to Home screen / Install app**. Samsung Internet: menu → **Add page to → Home screen**.
3. Launch it from the home-screen icon — it opens full-screen without browser bars.
4. Open **Settings → Data & backups** and check "Persistent storage granted" (installed apps usually get it automatically).

## 4. How your data is stored

* **On the phone:** IndexedDB (a real database inside the browser, not localStorage). It survives closing the app, rebooting and app updates.
  Everything works offline.
* **In Google Sheets:** every change is queued and uploaded to the `APP_*` tabs automatically when online (immediately, on reconnect,
  when you open the app, and every minute). The header chip shows *Synced / Offline / pending count*.
* **Diary entries store a snapshot** of the nutrition values used at logging time. Editing or re-importing a food never changes past days.

## 5. Backups & recovery

| Action | Where |
| --- | --- |
| Automatic cloud copy | `APP_*` tabs in your spreadsheet (continuous) |
| Manual JSON backup file | Settings → *Download backup file* |
| Backup into Google Drive | Settings → *Backup to Google Drive* (folder "Mego Nutrition Backups") |
| Restore on a new phone / after clearing data | Configure sync → *Restore from sheet*, or *Restore from backup file* |
| Spreadsheet version history | Google Sheets → File → Version history |

Restores **merge** (newer record wins) — they never delete data.

Recommended routine: keep auto-sync on, and download a backup file once a month.

## 6. Maintenance

* **Add/edit foods in the sheet:** edit the tab as usual, then in the app tap *Import foods from sheet*. Changed rows are updated and
  recorded in each food's change history; new rows are added; nothing is deleted.
* **Add/edit foods in the app:** Foods → *New food* / tap a food. Every change is versioned (Foods → food → *Change history*).
* **Targets:** Settings → Nutrition targets (training-day and rest-day targets, training weekdays, tolerances). Per-day overrides: Diary → *Targets for this day*.
* **App updates:** pushing to the branch redeploys automatically; the installed app updates itself on next launch.
* **Development:** `npm install`, `npm run dev`, `npm test` (unit tests), `npm run build && npm run e2e` (browser acceptance tests).
