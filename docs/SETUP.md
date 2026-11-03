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

## 2. Connect your Google Sheet (food database + cloud backup)

The app talks to **your** spreadsheet through a small Google Apps Script you own. No third-party server, no extra account.

1. Open your nutrition spreadsheet (the one with the tab **قاعدة بيانات الأطعمة**).
2. **Extensions → Apps Script**. Create a new file, paste the contents of [`apps-script/Code.gs`](../apps-script/Code.gs), save.
3. Select the function **`setup`** and click **Run**. Approve the Google permission prompt.
   - It first makes a **full copy of the spreadsheet** in your Drive ("FULL BACKUP before Mego app sync — date").
   - It prints an **APP TOKEN** in the execution log — copy it.
4. **Deploy → New deployment → type: Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (requests are still rejected without your token)
   - Copy the **Web app URL** (ends in `/exec`).
5. In the app: **Settings → Google Sheets sync** → paste URL and token → **Save + test connection**.
6. Tap **Import foods from sheet**. All rows are imported; nothing in the sheet is changed.

What the script does with your spreadsheet:

| Tab | Access |
| --- | --- |
| `قاعدة بيانات الأطعمة` | **Read-only** by default. Written only if you enable *"Write food edits back to the Google Sheet"*; before the first write each day the tab is copied to `BACKUP_Foods_YYYYMMDD`, and every write is logged in `APP_FoodSheetLog` with the before/after row. Archiving a food in the app never deletes a sheet row. |
| `APP_entries`, `APP_body`, `APP_foods`, `APP_recipes`, `APP_templates`, `APP_plans`, `APP_plannedDays`, `APP_days`, `APP_settings`, `APP_foodChanges` | Created by the app; one JSON record per row (your cloud copy of all app data). |
| Every other tab | Never touched. |

If the token ever leaks, run `rotateToken()` in Apps Script and paste the new token in the app.
If you edit `Code.gs` later, use **Deploy → Manage deployments → Edit → New version** so the URL stays the same.

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
