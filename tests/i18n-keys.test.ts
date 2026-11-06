import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { DICTS } from '../src/lib/i18n';
import { ARTICLES } from '../src/lib/education';
import { RANKINGS } from '../src/lib/foodIntel';
import { TIPS } from '../src/lib/coach';
import { DIET_TAGS } from '../src/lib/intelCatalog';

const ROOT = path.resolve(__dirname, '../src');
const files = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : []; });

it('every translation key used in the code exists in Arabic and English', () => {
  const keys = new Set<string>();
  for (const f of files(ROOT)) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\('([a-zA-Z][\w]*)'[,)]/g)) keys.add(m[1]);
    for (const m of src.matchAll(/\b(?:key|reasonKey|sourceKey): '([a-z]{2,}_[\w]+)'/g)) keys.add(m[1]);
  }
  RANKINGS.forEach((k) => { keys.add('rank_' + k); keys.add('rank_explain_' + k); });
  TIPS.forEach((k) => keys.add(k));
  DIET_TAGS.forEach((k) => keys.add('dtag_' + k));
  ['his', 'ile', 'leu', 'lys', 'saa', 'aaa', 'thr', 'trp', 'val'].forEach((k) => keys.add('aa_' + k));
  ['data', 'guidance'].forEach((k) => keys.add('basis_' + k));
  ['established', 'practical'].forEach((k) => keys.add('level_' + k));
  ['animal', 'plant'].forEach((k) => keys.add('origin_' + k));
  const missingEn = [...keys].filter((k) => !(k in DICTS.en));
  const missingAr = [...keys].filter((k) => !(k in DICTS.ar));
  expect(missingEn).toEqual([]);
  expect(missingAr).toEqual([]);
  expect(ARTICLES.every((a) => a.title.ar && a.title.en && a.sections.every((s) => s.ar && s.en))).toBe(true);
});
