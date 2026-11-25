# For Aya

An interactive, cinematic love letter that runs entirely in the browser: a code editor that compiles a small universe, a lit 3D heart that draws itself in neon and beats, personal messages, a heart that opens, an "AYA" constellation, an envelope with a folding letter, and a final proposal scene.

It is a plain static website: HTML, CSS and JavaScript, with no framework, no build step, no backend and no third-party requests. Fonts are bundled with it, and the music and sound effects are generated live with the Web Audio API, so there are no audio files and no licensing questions.

Live address once deployed: `https://USERNAME.github.io/REPOSITORY-NAME/`

## Project structure

```
.
├── index.html                  Entry point (all text and scene markup)
├── 404.html                    Sends any unknown address back to the start
├── site.webmanifest            Name, colours and icon for "Add to Home Screen"
├── .nojekyll                   Tells GitHub Pages to serve files as they are
├── css/
│   ├── fonts.css               Self-hosted font faces
│   └── styles.css              All styling and layout
├── js/
│   └── main.js                 Scenes, heart renderer, starfield, particles, sound
├── assets/
│   ├── fonts/                  Cinzel, Cormorant Garamond, JetBrains Mono, Jost, Pinyon Script (woff2, SIL Open Font License)
│   └── icons/                  favicon.svg, apple-touch-icon.png, icon-512.png
└── .github/workflows/
    └── deploy.yml              Publishes to GitHub Pages on every push to main
```

Every path is relative (`css/styles.css`, `assets/...`), so the site works at `/REPOSITORY-NAME/`, at a domain root and from a local folder alike. It is a single page with no client-side routes; any mistyped address returns to the start through `404.html`.

## Run it locally

Any static server works. From this folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly from the file system also works.

Useful while editing:

* `?speed=4` at the end of the address runs the timeline four times faster.
* Tapping the screen skips the current pause; tapping the code window finishes the typing.
* "Skip intro" (top left, during the code scene) jumps straight to the heart.

## Put it on GitHub

### Option A: in the browser (no tools needed)

1. Sign in at https://github.com and click **New** (or go to https://github.com/new).
2. Repository name: for example `for-aya`. Choose **Public** (GitHub Pages is free for public repositories; private repositories need a paid plan). Leave "Add a README" unticked. Click **Create repository**.
3. On the new, empty repository page click **uploading an existing file**.
4. Unzip `aya-universe.zip` on your computer, open the `aya-universe` folder, select **everything inside it** (not the folder itself) and drag it into the upload area. `index.html` must end up at the top level of the repository.
5. Click **Commit changes**.
6. Hidden folders are often skipped by drag and drop, so add the workflow file by hand:
   **Add file → Create new file**, type the name `.github/workflows/deploy.yml` (typing the slashes creates the folders), paste the contents of `.github/workflows/deploy.yml` from this project, then **Commit changes**.
   Also check that `.nojekyll` is listed; if not, create an empty file with that name the same way.

### Option B: with Git

```bash
cd aya-universe
git init -b main
git add .
git commit -m "For Aya"
git remote add origin https://github.com/USERNAME/REPOSITORY-NAME.git
git push -u origin main
```

## Turn on GitHub Pages

1. In the repository, open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Open the **Actions** tab. If the "Deploy to GitHub Pages" run has not started (or failed because Pages was not on yet), click it, then **Run workflow** (or **Re-run all jobs**).
4. When the run shows a green tick (about a minute), the address appears on the run's **deploy** step and back in **Settings → Pages**:
   `https://USERNAME.github.io/REPOSITORY-NAME/`
   Example: user `mego2012`, repository `for-aya` → `https://mego2012.github.io/for-aya/`
5. Open it on your phone and play it through once, with sound on, before you send it.

From then on, every push to `main` republishes the site automatically.

**No Actions?** Pages can also serve the files straight from the branch: **Settings → Pages → Source: Deploy from a branch → Branch: `main`, folder `/ (root)` → Save**. The site is the same; the workflow simply adds a missing-file check before publishing.

## Troubleshooting

| What you see | Fix |
| --- | --- |
| 404 at the address | `index.html` must be at the repository root, not inside a sub-folder. Pages can take a few minutes after the first deploy. |
| Workflow fails at "Deploy" with a Pages error | Settings → Pages → Source must be **GitHub Actions**, then re-run the workflow. |
| Workflow fails at "Check that every local file the site references exists" | A file was not uploaded; the log names it. Upload it and push again. |
| Page loads without styles | The `css`, `js` and `assets` folders were not uploaded alongside `index.html`. |
| No sound | Sound only starts after a tap on "Begin with music" or the Music button, and the phone's silent switch must be off. |

## Changing the words

All visible text is in `index.html` (envelope, letter, buttons, the message inside the heart) except the timed scene lines, which are near the bottom of `js/main.js` in `CODE`, `chapterCode`, `chapterMessages`, `chapterUniverse` and `chapterFinal`.

## Accessibility and performance

* Respects "reduce motion": fewer particles, no blur or parallax, gentler heartbeat.
* No sound ever plays without a tap; a Music button is always available.
* Everything loads from this repository (about 450 KB in total, fonts included); canvases are capped at 1.5–2× pixel density for smooth phones.
