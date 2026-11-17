// Exports PNGs of every brand SVG (transparent background) and the app icons in public/. Run: node brand/scripts/export_png.cjs
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), svgDir = path.join(root, 'svg'), pngDir = path.join(root, 'png'), pub = path.join(root, '..', 'public');
fs.mkdirSync(pngDir, { recursive: true });
async function render(page, file, w, h, out) {
  const svg = fs.readFileSync(path.join(svgDir, file), 'utf8');
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${w}" height="${h}" `)}</body></html>`);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
}
(async () => {
  const b = await chromium.launch(); const page = await b.newPage();
  for (const f of fs.readdirSync(svgDir).filter((x) => x.endsWith('.svg'))) {
    const [, , vw, vh] = fs.readFileSync(path.join(svgDir, f), 'utf8').match(/viewBox="([\d.\s]+)"/)[1].split(/\s+/).map(Number);
    const sizes = /icon|favicon|symbol/.test(f) ? [64, 192, 512, 1024] : [1200, 2400];
    for (const s of sizes) {
      const square = /icon|favicon|symbol/.test(f);
      const w = s, h = square ? s : Math.round((s * vh) / vw);
      await render(page, f, w, h, path.join(pngDir, f.replace('.svg', `-${w}.png`)));
    }
  }
  // icons served by the app
  await render(page, 'mego-app-icon.svg', 192, 192, path.join(pub, 'icon-192.png'));
  await render(page, 'mego-app-icon.svg', 512, 512, path.join(pub, 'icon-512.png'));
  await render(page, 'mego-app-icon-maskable.svg', 512, 512, path.join(pub, 'icon-maskable-512.png'));
  await render(page, 'mego-apple-touch-icon.svg', 180, 180, path.join(pub, 'apple-touch-icon.png'));
  fs.copyFileSync(path.join(svgDir, 'mego-favicon.svg'), path.join(pub, 'icon.svg'));
  await b.close();
  console.log(fs.readdirSync(pngDir).length, 'PNGs');
})();
