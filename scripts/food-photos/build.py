"""
Step 2 of the food-photo pipeline (developer tool, not shipped):
reads candidates.json (step 1) and selection.json (one hand-picked candidate index per key, chosen by looking at the
contact sheets), downloads each chosen photo once, crops it to a centred square, writes 320 px WebP files to
public/food-img/ and the attribution manifest (author, licence, source page) used by the app and CREDITS.md.
Usage: python3 -I scripts/food-photos/build.py CANDIDATES_DIR
"""
import html, io, json, re, sys, time, urllib.request
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = ROOT / 'public' / 'food-img'
OUT.mkdir(parents=True, exist_ok=True)
cand = json.loads((Path(sys.argv[1]) / 'candidates.json').read_text())
sel = json.loads((HERE / 'selection.json').read_text())
UA = {'User-Agent': 'MEGO-food-photo-builder/1.0 (open-source nutrition app; image curation)'}
SIZE = 320

def get(url):
    for i in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return r.read()
        except Exception:
            time.sleep(3 * 2 ** i)
    raise RuntimeError('fetch failed ' + url)

def plain(s):
    s = re.sub(r'<[^>]+>', '', s or '')
    return re.sub(r'\s+', ' ', html.unescape(s)).strip()[:120] or 'unknown'

mf = OUT / 'manifest.json'
manifest = json.loads(mf.read_text()) if mf.exists() else {}
for key, idx in sel.items():
    if idx is None or key in manifest:
        continue
    c = cand[key][idx]
    try:
        thumb = re.sub(r'/\d+px-', '/500px-', c['thumb']) if min(c['w'], c['h']) > 500 else c['thumb']
        im = Image.open(io.BytesIO(get(thumb))).convert('RGB')
    except Exception as e:
        print('skip', key, e)
        continue
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((SIZE, SIZE), Image.LANCZOS)
    im.save(OUT / f'{key}.webp', 'WEBP', quality=74, method=6)
    manifest[key] = {'file': f'{key}.webp', 'title': c['title'].replace('File:', ''), 'author': plain(c['artist']),
                     'license': c['license'], 'licenseUrl': c['licenseUrl'], 'source': c['descurl']}
    time.sleep(0.5)

mf.write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
lines = ['# Food photo credits', '',
         'Freely licensed photos from Wikimedia Commons, cropped to a square and resized (320 px WebP). '
         'Each photo is shown only for foods that match it; all other foods use a drawn placeholder.', '',
         '| Food | Photo | Author | Licence |', '| --- | --- | --- | --- |']
for k, m in sorted(manifest.items()):
    lines.append(f"| {k} | [{m['title']}]({m['source']}) | {m['author'].replace('|', '/')} | [{m['license']}]({m['licenseUrl'] or m['source']}) |")
(OUT / 'CREDITS.md').write_text('\n'.join(lines) + '\n')
print('photos', len(manifest), 'bytes', sum(p.stat().st_size for p in OUT.glob('*.webp')))
