"""
Step 1 of the food-photo pipeline (developer tool, not shipped):
search Wikimedia Commons for each key in keys.tsv, keep only freely licensed photos (CC0, public domain, CC BY, CC BY-SA),
and write numbered contact sheets so a person can pick the right photo for each food (no automatic choice).
Usage: python3 -I scripts/food-photos/candidates.py OUT_DIR [key ...]
"""
import io, json, sys, time, urllib.parse, urllib.request
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
ONLY = set(sys.argv[2:])
UA = {'User-Agent': 'MEGO-food-photo-builder/1.0 (open-source nutrition app; image curation)'}
FREE = ('CC0', 'Public domain', 'CC BY', 'CC-BY', 'PD')
PER_KEY = 8

def get(url):
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read()
        except Exception as e:  # network hiccup → back off
            time.sleep(3 * 2 ** i)
    raise RuntimeError('fetch failed ' + url)

def search(q):
    p = {'action': 'query', 'format': 'json', 'generator': 'search', 'gsrnamespace': 6, 'gsrlimit': 30,
         'gsrsearch': q + ' filetype:bitmap', 'prop': 'imageinfo', 'iiprop': 'url|size|extmetadata|mime', 'iiurlwidth': 220}
    j = json.loads(get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(p)))
    pages = sorted(j.get('query', {}).get('pages', {}).values(), key=lambda x: x.get('index', 99))
    out = []
    for pg in pages:
        ii = (pg.get('imageinfo') or [{}])[0]
        md = ii.get('extmetadata', {})
        lic = md.get('LicenseShortName', {}).get('value', '')
        if not lic.startswith(FREE) or ii.get('mime') not in ('image/jpeg', 'image/png', 'image/webp'):
            continue
        if min(ii.get('width', 0), ii.get('height', 0)) < 500:
            continue
        out.append({'title': pg['title'], 'thumb': ii['thumburl'], 'url': ii['url'], 'descurl': ii['descriptionurl'], 'license': lic,
                    'licenseUrl': md.get('LicenseUrl', {}).get('value', ''), 'artist': md.get('Artist', {}).get('value', ''),
                    'w': ii['width'], 'h': ii['height']})
        if len(out) >= PER_KEY:
            break
    return out

rows = [l.rstrip('\n').split('\t') for l in (HERE / 'keys.tsv').read_text().splitlines() if l.strip()]
allc = {}
cand_file = OUT / 'candidates.json'
if cand_file.exists():
    allc = json.loads(cand_file.read_text())
for key, q, *_ in rows:
    if (ONLY and key not in ONLY) or (not ONLY and allc.get(key)):
        continue
    try:
        allc[key] = search(q)
    except Exception as e:
        print('skip', key, e)
    cand_file.write_text(json.dumps(allc, indent=1))
    time.sleep(1)

# contact sheets: 6 keys per sheet, one row per key
keys = [r[0] for r in rows if (not ONLY or r[0] in ONLY)]
T = 150
for s in range(0, len(keys), 6):
    chunk = keys[s:s + 6]
    sheet = Image.new('RGB', (T * PER_KEY + 140, T * len(chunk)), 'white')
    dr = ImageDraw.Draw(sheet)
    for r, key in enumerate(chunk):
        dr.text((4, r * T + 60), key, fill='black')
        for c, cand in enumerate(allc.get(key, [])):
            try:
                im = Image.open(io.BytesIO(get(cand['thumb']))).convert('RGB')
                im.thumbnail((T - 6, T - 18))
                sheet.paste(im, (140 + c * T, r * T + 14))
                dr.text((140 + c * T, r * T), str(c), fill='red')
            except Exception:
                pass
    sheet.save(OUT / f'sheet-{s // 6:02d}.jpg', quality=82)
print('keys', len(keys), 'sheets', (len(keys) + 5) // 6)
