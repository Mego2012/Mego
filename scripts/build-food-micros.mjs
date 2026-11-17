/**
 * Builds public/fooddb/micros.json — vitamins, minerals and fat / carbohydrate details for the foods in usda.json,
 * straight from the official USDA FoodData Central CSV releases (the same SR Legacy 2018-04 and FNDDS 2024-10-31
 * releases as usda.json). Values are per 100 g edible portion, in the units listed in meta.units.
 *
 *   node scripts/build-food-micros.mjs <dir containing the unzipped USDA CSV folders>
 *
 * Rules: a value is written only when USDA reports it for that food; anything missing stays null (unknown — never 0).
 * Derived values (omega-3, omega-6) are written only when every component they need is reported.
 * FNDDS files use legacy nutrient NUMBERS in food_nutrient.nutrient_id; they are mapped to FDC nutrient ids with the
 * FNDDS nutrient.csv itself, restricted to the ids used here (several ids share one number, e.g. 323).
 */
import { createReadStream, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2];
if (!SRC || !existsSync(SRC)) { console.error('usage: node scripts/build-food-micros.mjs <usda-dir>'); process.exit(1); }

/** key → [FDC nutrient id, unit] (direct values) */
const DIRECT = {
  water: [1051, 'g'], starch: [1009, 'g'], transFat: [1257, 'g'], mufa: [1292, 'g'], pufa: [1293, 'g'], cholesterol: [1253, 'mg'],
  potassium: [1092, 'mg'], calcium: [1087, 'mg'], magnesium: [1090, 'mg'], iron: [1089, 'mg'], zinc: [1095, 'mg'], phosphorus: [1091, 'mg'],
  selenium: [1103, 'µg'], copper: [1098, 'mg'], manganese: [1101, 'mg'], iodine: [1100, 'µg'],
  vitA: [1106, 'µg'], vitC: [1162, 'mg'], vitD: [1114, 'µg'], vitE: [1109, 'mg'], vitK: [1185, 'µg'],
  b1: [1165, 'mg'], b2: [1166, 'mg'], b3: [1167, 'mg'], b5: [1170, 'mg'], b6: [1175, 'mg'], b7: [1176, 'µg'], folate: [1190, 'µg'], b12: [1178, 'µg'],
  addedSugar: [1235, 'g'], sugarAlcohol: [1086, 'g']
};
// components of derived values
const ALA = [1404, 1270], EPA = 1278, DPA = 1280, DHA = 1272, LA = [1316, 1269], AA = 1271;
const KEYS = [...Object.keys(DIRECT), 'omega3', 'omega6'];
const UNITS = { ...Object.fromEntries(Object.entries(DIRECT).map(([k, [, u]]) => [k, u])), omega3: 'g', omega6: 'g' };
const WANT = new Set([...Object.values(DIRECT).map(([id]) => id), ...ALA, EPA, DPA, DHA, ...LA, AA]);

const usda = JSON.parse(readFileSync(path.join(ROOT, 'public/fooddb/usda.json'), 'utf8'));
const ids = new Set(usda.rows.map((r) => r[0]));

function findDir(needle) {
  for (const d of readdirSync(SRC, { recursive: true })) if (String(d).includes(needle) && existsSync(path.join(SRC, String(d), 'food_nutrient.csv'))) return path.join(SRC, String(d));
  throw new Error('not found: ' + needle);
}
function parseLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}
async function* rows(file) {
  const rl = readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let header = null;
  for await (const line of rl) { const r = parseLine(line); if (!header) { header = r; continue; } yield Object.fromEntries(header.map((h, i) => [h, r[i]])); }
}

const values = new Map(); // id → Map(nutrientId → amount)
async function load(prefix, dir, byNumber) {
  let map = null;
  if (byNumber) {
    map = new Map();
    for await (const n of rows(path.join(dir, 'nutrient.csv'))) {
      const id = Number(n.id), nbr = n.nutrient_nbr ? String(Math.round(Number(n.nutrient_nbr))) : '';
      if (nbr && WANT.has(id)) map.set(nbr, id);
    }
  }
  for await (const r of rows(path.join(dir, 'food_nutrient.csv'))) {
    const key = prefix + r.fdc_id;
    if (!ids.has(key) || r.amount === '' || r.amount === undefined) continue;
    const nid = byNumber ? map.get(String(Math.round(Number(r.nutrient_id)))) : Number(r.nutrient_id);
    if (!nid || !WANT.has(nid)) continue;
    if (!values.has(key)) values.set(key, new Map());
    const m = values.get(key);
    if (!m.has(nid)) m.set(nid, Number(r.amount));
  }
}
await load('S', findDir('sr_legacy'), false);
await load('N', findDir('survey'), true);

const r3 = (x) => Math.round(x * 1000) / 1000;
const first = (m, list) => { for (const id of list) if (m.has(id)) return m.get(id); return undefined; };
const out = {};
const count = Object.fromEntries(KEYS.map((k) => [k, 0]));
for (const id of ids) {
  const m = values.get(id) ?? new Map();
  const row = KEYS.map((k) => {
    let v;
    if (k === 'omega3') {
      const ala = first(m, ALA);
      v = ala !== undefined && m.has(EPA) && m.has(DHA) ? ala + m.get(EPA) + m.get(DHA) + (m.get(DPA) ?? 0) : undefined;
    } else if (k === 'omega6') {
      const la = first(m, LA);
      v = la !== undefined && m.has(AA) ? la + m.get(AA) : undefined;
    } else v = m.get(DIRECT[k][0]);
    if (v === undefined || !Number.isFinite(v)) return null;
    count[k]++;
    return r3(v);
  });
  if (row.some((x) => x !== null)) out[id] = row;
}
const meta = {
  format: 'mego-micros', version: 1, builtAt: new Date().toISOString().slice(0, 10), basis: 'per 100 g edible portion',
  sources: usda.meta.sources, columns: KEYS, units: UNITS, coverage: count, foods: ids.size,
  notes: {
    omega3: 'ALA (18:3 n-3, or 18:3 undifferentiated when n-3 is not separated) + EPA + DPA + DHA; only when ALA, EPA and DHA are reported',
    omega6: 'LA (18:2 n-6, or 18:2 undifferentiated) + arachidonic acid (20:4); only when both are reported',
    vitA: 'µg retinol activity equivalents (RAE)', folate: 'µg dietary folate equivalents (DFE)', b3: 'mg preformed niacin', vitE: 'mg alpha-tocopherol', vitK: 'µg phylloquinone'
  }
};
writeFileSync(path.join(ROOT, 'public/fooddb/micros.json'), JSON.stringify({ meta, rows: out }));
console.log('foods', ids.size, 'with any value', Object.keys(out).length);
for (const k of KEYS) console.log(k.padEnd(13), count[k]);
