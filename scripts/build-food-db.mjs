#!/usr/bin/env node
/**
 * Builds the shared reference food database from USDA FoodData Central (public domain, U.S. Government work):
 *   - SR Legacy (2018-04): ~7,800 basic foods and ingredients, restaurant & fast-food items
 *   - FNDDS / Survey foods (2024-10-31): ~5,400 foods "as eaten", mixed dishes, international and takeaway meals
 *
 *   node scripts/build-food-db.mjs <dir containing the unzipped USDA CSV folders>   → public/fooddb/usda.json
 *
 * Rules: values are copied exactly as published (per 100 g edible portion); nothing is estimated or "fixed".
 * Foods without a published energy value are skipped (not invented). Every row keeps its FDC ID so the source
 * can be checked at https://fdc.nal.usda.gov/food-details/<id>/nutrients. Atwater mismatches are flagged, not changed.
 */
import { createReadStream, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2];
if (!SRC || !existsSync(SRC)) { console.error('usage: node scripts/build-food-db.mjs <usda-dir>'); process.exit(1); }

/** Minimal RFC-4180 CSV line parser (USDA files quote every field). */
function parseLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}
async function readCsv(file, onRow) {
  const rl = readline.createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  let header = null;
  for await (const line of rl) {
    if (!line) continue;
    const cells = parseLine(line);
    if (!header) { header = cells; continue; }
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i]; });
    onRow(row);
  }
}
const findDir = (needle) => {
  for (const d of readdirSync(SRC, { recursive: true })) if (String(d).includes(needle) && existsSync(path.join(SRC, String(d), 'food.csv'))) return path.join(SRC, String(d));
  throw new Error('not found: ' + needle);
};

// nutrient ids (FDC): energy kcal 1008 (fallback Atwater 2047/2048), protein 1003, fat 1004, carbs 1005,
// fiber 1079, sugars 2000 (fallback 1063 "Sugars, total NLEA"), saturated fat 1258, sodium 1093
// extra nutrients for the Food Intelligence rankings (separate file, loaded on demand)
const X = { 1292: 'mufa', 1293: 'pufa', 1404: 'ala', 1270: 'ala18', 1278: 'epa', 1272: 'dha', 1280: 'dpa', 1087: 'ca', 1089: 'fe', 1090: 'mg', 1092: 'k',
  1095: 'zn', 1106: 'vitA', 1109: 'vitE', 1162: 'vitC', 1178: 'b12', 1190: 'folate',
  1221: 'his', 1212: 'ile', 1213: 'leu', 1214: 'lys', 1215: 'met', 1216: 'cys', 1217: 'phe', 1218: 'tyr', 1211: 'thr', 1210: 'trp', 1219: 'val' };
const N = { 1008: 'kcal', 2047: 'kcalAtw', 2048: 'kcalAtwS', 1003: 'protein', 1004: 'fat', 1005: 'carbs', 1079: 'fiber', 2000: 'sugar', 1063: 'sugar2', 1258: 'satFat', 1093: 'sodium' };
const r2 = (x) => Math.round(x * 100) / 100;
const extra = {};

async function load(dir, dataset, categoryOf) {
  const foods = new Map();
  await readCsv(path.join(dir, 'food.csv'), (r) => foods.set(r.fdc_id, { id: r.fdc_id, name: r.description.trim(), catId: r.food_category_id, n: {}, portions: [] }));
  // FNDDS files reference nutrients by their legacy number (208 = energy…); map them through nutrient.csv.
  const byNumber = new Map();
  await readCsv(path.join(dir, 'nutrient.csv'), (r) => { if (r.nutrient_nbr) byNumber.set(String(Number(r.nutrient_nbr)), r.id); });
  await readCsv(path.join(dir, 'food_nutrient.csv'), (r) => {
    const f = foods.get(r.fdc_id);
    const id = N[r.nutrient_id] || X[r.nutrient_id] ? r.nutrient_id : byNumber.get(r.nutrient_id);
    const key = N[id] ?? X[id];
    if (f && key && r.amount !== '') f.n[key] = Number(r.amount);
  });
  const units = new Map();
  if (existsSync(path.join(dir, 'measure_unit.csv'))) await readCsv(path.join(dir, 'measure_unit.csv'), (r) => units.set(r.id, r.name));
  await readCsv(path.join(dir, 'food_portion.csv'), (r) => {
    const f = foods.get(r.fdc_id);
    const g = Number(r.gram_weight);
    if (!f || !(g > 0)) return;
    let label = (r.portion_description || '').trim();
    if (!label) {
      const unit = r.measure_unit_id !== '9999' ? units.get(r.measure_unit_id) || '' : '';
      label = [r.amount, unit, r.modifier].filter((x) => x && !/^\d{5}$/.test(x)).join(' ').trim();
    }
    if (!label || /not specified/i.test(label)) return;
    if (f.portions.length < 6 && !f.portions.some((p) => p[0] === label)) f.portions.push([label.slice(0, 60), r2(g)]);
  });
  const out = [];
  let skipped = 0, flagged = 0;
  for (const f of foods.values()) {
    const kcal = f.n.kcal ?? f.n.kcalAtwS ?? f.n.kcalAtw;
    if (kcal === undefined || f.n.protein === undefined || f.n.fat === undefined || f.n.carbs === undefined) { skipped++; continue; }
    const sugar = f.n.sugar ?? f.n.sugar2;
    const calc = 4 * f.n.protein + 4 * f.n.carbs + 9 * f.n.fat;
    const mismatch = kcal > 40 && Math.abs(calc - kcal) / kcal > 0.25 ? 1 : 0; // flagged for review, values unchanged
    flagged += mismatch;
    const id = (dataset === 'sr' ? 'S' : 'N') + f.id;
    const v = (k) => (f.n[k] === undefined ? null : r2(f.n[k]));
    const aa = ['his', 'ile', 'leu', 'lys', 'met', 'cys', 'phe', 'tyr', 'thr', 'trp', 'val'];
    extra[id] = [v('mufa'), v('pufa'), f.n.ala !== undefined ? v('ala') : v('ala18'), v('epa'), v('dha'), v('dpa'), v('ca'), v('fe'), v('mg'), v('k'), v('zn'),
      v('vitA'), v('vitE'), v('vitC'), v('b12'), v('folate'), aa.every((k) => f.n[k] !== undefined) ? aa.map((k) => r2(f.n[k] * 1000) / 1000) : null];
    out.push([
      id, f.name, categoryOf(f), r2(kcal), r2(f.n.protein), r2(f.n.carbs), r2(f.n.fat),
      f.n.fiber === undefined ? null : r2(f.n.fiber), sugar === undefined ? null : r2(sugar), f.n.satFat === undefined ? null : r2(f.n.satFat),
      f.n.sodium === undefined ? null : r2(f.n.sodium), f.portions, mismatch
    ]);
  }
  return { rows: out, skipped, flagged };
}

const srDir = findDir('sr_legacy_food_csv');
const fnDir = findDir('survey_food_csv');
const srCats = new Map();
await readCsv(path.join(srDir, 'food_category.csv'), (r) => srCats.set(r.id, r.description));
const fnCatByFood = new Map();
await readCsv(path.join(fnDir, 'survey_fndds_food.csv'), (r) => fnCatByFood.set(r.fdc_id, r.wweia_category_number));
const fnCats = new Map();
await readCsv(path.join(fnDir, 'wweia_food_category.csv'), (r) => fnCats.set(r.wweia_food_category, r.wweia_food_category_description));

const EXCLUDED_SR = new Set(['Quality Control Materials', 'Baby Foods']);
const sr = await load(srDir, 'sr', (f) => srCats.get(f.catId) || 'Other');
const fn = await load(fnDir, 'fn', (f) => fnCats.get(fnCatByFood.get(f.id)) || 'Other');
const srRows = sr.rows.filter((r) => !EXCLUDED_SR.has(r[2]));

// category dictionary (index) to keep the file small
const cats = [];
const catIdx = (c) => { let i = cats.indexOf(c); if (i < 0) { cats.push(c); i = cats.length - 1; } return i; };
const rows = [...srRows, ...fn.rows].map((r) => { r[2] = catIdx(r[2]); return r; });

const meta = {
  format: 'mego-fooddb', version: 1, builtAt: new Date().toISOString().slice(0, 10),
  sources: [
    { id: 'S', name: 'USDA FoodData Central — SR Legacy', release: '2018-04', url: 'https://fdc.nal.usda.gov/', license: 'Public domain (U.S. Government work)' },
    { id: 'N', name: 'USDA FoodData Central — FNDDS (Survey foods)', release: '2024-10-31', url: 'https://fdc.nal.usda.gov/', license: 'Public domain (U.S. Government work)' }
  ],
  columns: ['id', 'name', 'category', 'kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'satFat', 'sodiumMg', 'portions[label,grams]', 'energyFlag'],
  basis: 'per 100 g edible portion', categories: cats,
  stats: { sr: srRows.length, fndds: fn.rows.length, skippedNoEnergyOrMacros: sr.skipped + fn.skipped, energyFlagged: sr.flagged + fn.flagged }
};
mkdirSync(path.join(ROOT, 'public/fooddb'), { recursive: true });
writeFileSync(path.join(ROOT, 'public/fooddb/usda.json'), JSON.stringify({ meta, rows }));
const kept = new Set(rows.map((r) => r[0]));
for (const k of Object.keys(extra)) if (!kept.has(k)) delete extra[k];
writeFileSync(path.join(ROOT, 'public/fooddb/usda-extra.json'), JSON.stringify({
  format: 'mego-fooddb-extra', version: 1, basis: 'per 100 g',
  columns: ['mufa g', 'pufa g', 'ALA 18:3 n-3 g (or total 18:3 when n-3 not reported)', 'EPA g', 'DHA g', 'DPA g', 'calcium mg', 'iron mg', 'magnesium mg', 'potassium mg', 'zinc mg',
    'vitamin A µg RAE', 'vitamin E mg', 'vitamin C mg', 'vitamin B12 µg', 'folate µg DFE', 'essential amino acids g/100 g food [His, Ile, Leu, Lys, Met, Cys, Phe, Tyr, Thr, Trp, Val]'],
  values: extra
}));
console.log(JSON.stringify(meta.stats), 'categories', cats.length, 'total', rows.length);
