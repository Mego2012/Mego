# MEGO Brand Guidelines

**MEGO | Nutrition & Fitness** · *Eat Smart. Train Hard. Live Better.*

## 1. Name

* Always **MEGO**: four capital letters, never translated, transliterated (not "ميقو") or written "Mego Nutrition".
* In Arabic text, keep the Latin "MEGO" inside the Arabic sentence: «MEGO هو رفيقك الشخصي…».
* Technical identifiers that existing installs depend on stay unchanged (`installMego`, the `MEGO1|…` connection
  code, database names `mego-nutrition` / `mego-u-…`).

## 2. Logo

**Symbol:** a geometric **M** whose two diagonals rise like raised arms; the dot above the centre is the head and the
energy point. One mark, three ideas: **M**EGO, a person, achievement.

**Wordmark:** custom geometric capitals, drawn as strokes in the same weight as the symbol, with no font dependency.
The files are SVG paths, so they look identical everywhere.

| Variation | File (`brand/svg/`) | Use |
| --- | --- | --- |
| Primary (symbol tile + wordmark), light | `mego-primary-light.svg` | default on white or light backgrounds |
| Primary, dark | `mego-primary-dark.svg` | on charcoal / dark backgrounds |
| Primary, monochrome | `mego-primary-mono-black.svg`, `mego-primary-mono-white.svg` | one-colour print, stamps, embossing |
| Secondary (wordmark only) | `mego-wordmark-light.svg`, `-dark`, `-mono-black` | narrow spaces, footers, after the symbol was already shown |
| Symbol | `mego-symbol-light.svg`, `-dark`, `-mono` | avatars, watermarks, small marks |
| App icon | `mego-app-icon.svg` (rounded), `mego-app-icon-maskable.svg`, `mego-apple-touch-icon.svg` (full bleed) | home screen, stores, PWA |
| Favicon | `mego-favicon.svg` | browser tab (= `public/icon.svg`) |

PNG exports (transparent backgrounds) are in `brand/png/`: logos at 1200 and 2400 px wide, and symbols and icons at
64, 192, 512 and 1024 px. To regenerate them, run `python3 brand/scripts/build_logos.py`, then
`node brand/scripts/export_png.cjs` (this also refreshes the icons in `public/`).

**Clear space:** keep at least the height of the dot × 2 empty around the logo.
**Minimum size:** symbol 16 px; primary logo 96 px wide; wordmark 56 px wide.

**Don't:**
* stretch it or change the proportions;
* re-letter "MEGO" in another font;
* recolour the dot outside the palette;
* add gradients, shadows, outlines or dumbbells;
* put the light logo on a dark photo without the dark variant;
* rotate it.

## 3. Colour

| Role | Name | HEX | Notes |
| --- | --- | --- | --- |
| Primary (brand ink) | Charcoal | `#121715` | logo, text on light, app-icon background |
| Secondary | Graphite | `#26302B` | dark surfaces, symbol tile on dark |
| Accent (on dark) | MEGO Lime | `#B8F23E` | dark-theme accent, the dot; **never as text on white (1.3:1)** |
| Accent (on light) | MEGO Green | `#117336` | light-theme accent, links and buttons on white |
| Background (light) | Mist | `#EEF1ED` | app background, light theme |
| Background (dark) | Night | `#0D1110` | app background, dark theme |
| Surface | White | `#FFFFFF` | cards (light) |
| Text (light) | Charcoal `#121715`, muted `#5F6B66` | | |
| Text (dark) | `#EEF2EE`, muted `#97A39D` | | |
| Success | `#13804A` light, `#6FE08A` dark | | |
| Warning | `#A8650B` light, `#F5AE55` dark | | |
| Error | `#C2402C` light, `#FF6F5E` dark | | |

The macro colours (protein, carbs and fat) are functional and kept from the app.

**Measured contrast (WCAG 2.1):**

| Pairing | Ratio | Passes |
| --- | --- | --- |
| Charcoal on white | 18.1:1 | AAA |
| Green on white | 5.95:1 | AA |
| Green on Mist | 5.22:1 | AA |
| Green on the soft green tint | 4.95:1 | AA |
| White text on a green button | 5.95:1 | AA |
| Lime on charcoal | 13.6:1 | AAA |
| Dark ink on a lime button | 12.7:1 | AAA |
| Muted grey on white | 5.55:1 | AA |
| Muted grey on dark | 6.7:1 | AA |

In the app, all colours are design tokens in `src/styles.css` (`--primary`, `--bg` and so on, plus `--brand-tile`,
`--brand-on-tile` and `--brand-dot` for the logo).

## 4. Typography

* **Display, numbers and Latin headings:** Readex Pro (Google Fonts, SIL Open Font License).
* **Arabic and body text:** IBM Plex Sans Arabic (Google Fonts, SIL Open Font License).
* Weights: 400 for text, 500–600 for headings and labels, 700 for large numbers. The wordmark is drawn, not typed.

## 5. Voice

Clear, calm and precise. We explain and never shame: going over a target is information, not failure. We use real
units (kcal, g) and cite sources (USDA). We don't promise medical results.

## 6. Tagline

* **EN:** Eat Smart. Train Hard. Live Better.
* **AR (proposed, used in the Arabic interface, awaiting owner approval):** كُل بذكاء. تمرّن بقوة. عِش أفضل.

## 7. About text

* **EN:** MEGO is your personal nutrition and fitness companion. Track your calories and macros, plan your meals,
  monitor your progress, and build healthier habits through smarter decisions.
* **AR:** MEGO هو رفيقك الشخصي للتغذية واللياقة البدنية. تابع سعراتك الحرارية والعناصر الغذائية، وخطط وجباتك، وراقب تقدمك،
  وابنِ عادات صحية من خلال قرارات أكثر ذكاءً.

## 8. Social media bio

```
MEGO | Nutrition & Fitness
Eat Smart. Train Hard. Live Better.
Track your nutrition, build better habits, and monitor your fitness progress.
```

No social media accounts, usernames or contact details exist yet. Add them only once they are real.

## 9. Where the brand appears in the app

| Place | What is shown |
| --- | --- |
| Header (phone) and sidebar (desktop) | symbol tile and wordmark |
| Welcome / login / registration | the large logo with the tagline |
| Loading splash (`index.html`) | the symbol, with the M drawn in and the dot fading in |
| Browser tab | `public/icon.svg` |
| PWA / home screen | `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`; manifest name "MEGO", theme `#0D1110` |
| Settings → About MEGO | logo, tagline and the About text in AR and EN |
