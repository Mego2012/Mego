"""Generates the MEGO logo system (SVG). Run: python3 brand/scripts/build_logos.py
The wordmark is drawn from geometric strokes (no font file needed), so every SVG renders identically everywhere."""
import math, os
OUT = os.path.join(os.path.dirname(__file__), '..', 'svg')
os.makedirs(OUT, exist_ok=True)

C = dict(charcoal='#121715', graphite='#1C2420', lime='#B8F23E', green='#117336', white='#FFFFFF', mist='#F2F5F1')
SW = 7  # stroke weight of the wordmark (cap height 40)

# --- symbol: a geometric M that is also a figure with raised arms; the dot is the head / the energy point ---
def symbol(m, dot, sw=8.5):
    return (f'<path d="M15 50V18L32 37.5L49 18V50" fill="none" stroke="{m}" stroke-width="{sw}" stroke-linecap="butt" stroke-linejoin="round"/>'
            f'<circle cx="32" cy="15.5" r="6" fill="{dot}"/>')

# --- wordmark letters, cap height 40, stroke 7 ---
h = SW / 2
def letter_M(x): return f'M{x+h} 40V{h}L{x+20} 22.5L{x+40-h} {h}V40'
def letter_E(x): return f'M{x+28} {h}H{x+h}V{40-h}H{x+28}M{x+h} 20H{x+24}'
def letter_G(x):
    cx, cy, r = x + 20, 20, 20 - h + .4
    a = math.radians(-42)
    sx, sy = cx + r * math.cos(a), cy + r * math.sin(a)
    return f'M{sx:.2f} {sy:.2f}A{r:.2f} {r:.2f} 0 1 0 {cx + r:.2f} {cy}H{cx + 1.5:.2f}'
def letter_O(x):
    cx, r = x + 20, 20 - h + .4
    return f'M{cx - r:.2f} 20a{r:.2f} {r:.2f} 0 1 0 {2*r:.2f} 0a{r:.2f} {r:.2f} 0 1 0 {-2*r:.2f} 0Z'
GAP = 9
def wordmark(color, x0=0, y0=0):
    xs, x, parts = [], x0, []
    for fn, w in ((letter_M, 40), (letter_E, 28), (letter_G, 40), (letter_O, 40)):
        parts.append(fn(x)); x += w + GAP
    d = ''.join(parts)
    return f'<g transform="translate(0 {y0})"><path d="{d}" fill="none" stroke="{color}" stroke-width="{SW}" stroke-linecap="butt" stroke-linejoin="round"/></g>', x - GAP - x0
WM_W = 40 + 28 + 40 + 40 + 3 * GAP  # 175

def svg(w, hgt, body, title, bg=None):
    rect = f'<rect width="{w}" height="{hgt}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {hgt}" role="img" aria-label="{title}"><title>{title}</title>{rect}{body}</svg>\n'

def tile(bg, m, dot, size, knockout_id=None):
    """Rounded-square tile with the symbol, as in the app icon. knockout_id: the M and the dot are cut out (single colour)."""
    k = size / 64
    sym = symbol(m, dot)
    if knockout_id:
        return (f'<mask id="{knockout_id}"><rect width="64" height="64" fill="#fff"/>{symbol("#000", "#000")}</mask>'
                f'<g transform="scale({k:.4f})"><rect width="64" height="64" rx="14" fill="{bg}" mask="url(#{knockout_id})"/></g>')
    return f'<g transform="scale({k:.4f})"><rect width="64" height="64" rx="14" fill="{bg}"/><g transform="translate(5.6 2.4) scale(.825)">{sym}</g></g>'

def lockup(tile_svg, word, bg=None):
    T = 56  # tile size next to a 40-unit cap height
    wm, _ = wordmark(word)
    body = f'{tile_svg(T)}<g transform="translate({T + 18} 8)">{wm}</g>'
    W, H, pad = T + 18 + WM_W, T, 16
    return svg(W + 2 * pad, H + 2 * pad, f'<g transform="translate({pad} {pad})">{body}</g>', 'MEGO', bg)

files = {
    # primary = symbol + wordmark
    'mego-primary-light.svg': lockup(lambda t: tile(C['charcoal'], C['white'], C['lime'], t), C['charcoal']),   # light backgrounds
    'mego-primary-dark.svg': lockup(lambda t: tile('#26302B', C['white'], C['lime'], t), C['white']),           # dark backgrounds
    'mego-primary-mono-black.svg': lockup(lambda t: tile('#000000', '', '', t, 'k'), '#000000'),
    'mego-primary-mono-white.svg': lockup(lambda t: tile('#FFFFFF', '', '', t, 'k'), '#FFFFFF'),
    # secondary = wordmark only
    'mego-wordmark-light.svg': svg(WM_W + 32, 72, f'<g transform="translate(16 16)">{wordmark(C["charcoal"])[0]}</g>', 'MEGO'),
    'mego-wordmark-dark.svg': svg(WM_W + 32, 72, f'<g transform="translate(16 16)">{wordmark(C["white"])[0]}</g>', 'MEGO'),
    'mego-wordmark-mono-black.svg': svg(WM_W + 32, 72, f'<g transform="translate(16 16)">{wordmark("#000000")[0]}</g>', 'MEGO'),
    # symbol only
    'mego-symbol-light.svg': svg(64, 64, symbol(C['charcoal'], C['green']), 'MEGO'),
    'mego-symbol-dark.svg': svg(64, 64, symbol(C['white'], C['lime']), 'MEGO'),
    'mego-symbol-mono.svg': svg(64, 64, symbol('#000000', '#000000'), 'MEGO'),
    # app icon (rounded square, charcoal, white M, lime head) and maskable (full bleed, symbol inside the safe zone)
    'mego-app-icon.svg': svg(512, 512, f'<rect width="512" height="512" rx="112" fill="{C["charcoal"]}"/><g transform="translate(64 77.5) scale(6)">{symbol(C["white"], C["lime"])}</g>', 'MEGO'),
    'mego-app-icon-maskable.svg': svg(512, 512, f'<rect width="512" height="512" fill="{C["charcoal"]}"/><g transform="translate(80 92) scale(5.5)">{symbol(C["white"], C["lime"])}</g>', 'MEGO'),
    'mego-apple-touch-icon.svg': svg(512, 512, f'<rect width="512" height="512" fill="{C["charcoal"]}"/><g transform="translate(64 77.5) scale(6)">{symbol(C["white"], C["lime"])}</g>', 'MEGO'),
    'mego-favicon.svg': svg(64, 64, f'<rect width="64" height="64" rx="14" fill="{C["charcoal"]}"/><g transform="translate(4 5) scale(.875)">{symbol(C["white"], C["lime"], sw=9.5)}</g>', 'MEGO'),
}
for n, s in files.items():
    open(os.path.join(OUT, n), 'w').write(s)
print('\n'.join(files))
