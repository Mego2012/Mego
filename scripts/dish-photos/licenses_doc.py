"""
Writes docs/launch/MEGO_IMAGE_LICENSES.md from public/dish-img/manifest.json, selection.json and the recipe list
(npx vite-node scripts/dish-photos/recipes.ts > recipes.json). Usage: python3 -I scripts/dish-photos/licenses_doc.py recipes.json
"""
import json, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent; ROOT = HERE.parent.parent
recipes = {r['id']: r for r in json.loads(Path(sys.argv[1]).read_text())}
dish = json.loads((ROOT / 'public/dish-img/manifest.json').read_text())
food = json.loads((ROOT / 'public/food-img/manifest.json').read_text())
sel = {k: v for k, v in json.loads((HERE / 'selection.json').read_text()).items() if not k.startswith('_')}
REASON = {
 'lib-fish-tacos': 'every freely licensed candidate showed meat tacos (carnitas / al pastor), not fish',
 'lib4-egyptian-chicken-rice': 'search failed (rate limit); a photo of plain vermicelli rice alone would not show the dish',
 'lib4-creamy-chicken-mozzarella-pasta': 'best candidate is a mushroom cream pasta; the recipe has spinach and no mushrooms',
 'lib4-garlic-parmesan-chicken-pasta': 'best candidate is an unidentified restaurant product shot; dish cannot be confirmed from its record',
 'lib-mango-chia': 'no freely licensed photo found',
 'lib4-yogurt-banana-honey': 'only candidate was a breakfast table with many dishes',
 'lib-yogurt-bowl': 'rejected after review: the photo shows purple blueberry yogurt; the recipe is white Greek yogurt with strawberries and banana',
 'lib-hummus-veg': 'rejected after review: the square crop shows only the vegetable sticks, the hummus is cut off',
 'lib-airfryer-nuggets': 'candidates were dominated by fries or novelty-shaped nuggets',
}
L = ['# MEGO — Image licences', '',
 f'Generated from the repository on 18 November 2026. {len(dish)} dish photos and {len(food)} single-food photos ship with the app.', '',
 '## Rules applied', '',
 '* **Only free licences that allow commercial use and modification:** CC0, public domain, CC BY, CC BY-SA. No NC (non-commercial) or ND (no-derivatives) licences, no stock or unlicensed images. The unit test `tests/photos.test.ts` fails the build if a shipped photo lacks a free licence, an author or a source page.',
 '* **Every photo was chosen by a person looking at it** (contact sheets) and checking its title/description against the recipe ingredients. Candidates showing a different dish, branded fast-food packaging or mostly side dishes were rejected.',
 '* **Honest labelling:** a dish photo is an *example of this kind of dish*, not a photo of the MEGO recipe. Under the recipe cover the app says so in Arabic and English ("Example photo of this kind of dish, not of this exact recipe…"), with the author and licence linked to the source page. The image alt text is "Example photo of {dish}" / "صورة توضيحية لطبق {dish}".',
 '* **Ingredient mosaics are never presented as dish photos.** Recipes without a dish photo keep the mosaic of their own ingredient photos (marked decorative, `aria-hidden`) or a drawn placeholder.',
 '* **Fallback:** if a dish photo fails to load (offline before caching, broken link), the component falls back to the ingredient mosaic automatically.',
 '* **Processing:** centre-cropped to a square, resized to 400×400 px, WebP quality 72 (CC BY-SA "adapted" — the licence is kept and credited). Files: `public/dish-img/`; pipeline: `scripts/dish-photos/` (candidates → hand selection → build).',
 '* **Credits in the app:** Settings → Photo credits → "Dish photos" lists every photo with author, licence link and source page.', '',
 '## Dish photos shipped', '',
 '| Recipe id | Recipe (EN / AR) | Photo (source page) | Author | Licence |', '| --- | --- | --- | --- | --- |']
for k in sorted(dish):
    m = dish[k]; r = recipes.get(k, {'en': '?', 'ar': '?'})
    L.append(f"| `{k}` | {r['en']} / {r['ar']} | [{m['title']}]({m['source']}) | {m['author'].replace('|', '/')} | [{m['license']}]({m['licenseUrl'] or m['source']}) |")
L += ['', '## Prioritised recipes without a dish photo (deliberately)', '', '| Recipe id | Recipe | Why not |', '| --- | --- | --- |']
for k, v in sel.items():
    if v is None or k not in dish:
        r = recipes.get(k, {'en': '?'})
        L.append(f"| `{k}` | {r['en']} | {REASON.get(k, 'download failed during build; retry the pipeline')} |")
rest = [r for k, r in recipes.items() if k not in sel]
L += ['', '## Other recipes', '',
 f'The remaining {len(rest)} library recipes are home-style combinations (for example "chicken with rice and salad" variants) for which no single public photo would truthfully represent the recipe. They were not searched in this round and show their ingredient mosaic. Priority for this round was the best-known named dishes in the library (Arab, Mediterranean and international classics), because those are where a genuine example photo of the same dish exists.', '',
 '## Single-food photos (existing, unchanged)', '',
 f'{len(food)} single-food photos (Wikimedia Commons, same licence rules, 320 px WebP) are listed with author, licence and source in `public/food-img/CREDITS.md` and in Settings → Photo credits.', '',
 '## Brand assets', '', 'The MEGO logo, icons and drawn placeholders are original work made for MEGO.', '',
 '*Technical licence record, not legal advice. CC BY-SA requires attribution and share-alike for the adapted image files; the in-app credits and this file provide the attribution.*']
(ROOT / 'docs/launch/MEGO_IMAGE_LICENSES.md').write_text('\n'.join(L) + '\n')
print('dish', len(dish), 'uncovered', sum(1 for k, v in sel.items() if v is None or k not in dish))
