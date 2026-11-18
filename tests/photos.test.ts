import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { photoKeyFor, PHOTO_KEYS } from '../src/lib/foodPhotos';
import { LIBRARY } from '../src/lib/recipeEngine';

describe('Food photos — only honest matches', () => {
  it('matches single foods in Arabic and English', () => {
    const yes: [string, string][] = [
      ['صدور فراخ', 'chicken-breast'], ['صدر دجاج مشوي', 'chicken-breast'], ['Chicken, broilers or fryers, breast, meat only, cooked, roasted', 'chicken-breast'],
      ['بيض مسلوق', 'egg-boiled'], ['بياض بيض', 'egg-white'], ['أرز أبيض مطبوخ', 'white-rice'], ['Rice, brown, long-grain, cooked', 'brown-rice'],
      ['Sweet potato, cooked, baked in skin', 'sweet-potato'], ['Potatoes, boiled', 'potato'], ['شوفان', 'oats'], ['موز', 'banana'], ['Peanut butter, smooth', 'peanut-butter'],
      ['زبدة الفول السوداني', 'peanut-butter'], ['Olive oil', 'olive-oil'], ['زيت زيتون', 'olive-oil'], ['تونة معلبة', 'tuna-canned'], ['فول مدمس', 'fava-beans'],
      ['Milk, nonfat, fluid', 'milk'], ['جبن قريش', 'cottage-cheese'], ['Lentils, mature seeds, cooked, boiled', 'lentils']
    ];
    for (const [name, key] of yes) expect(photoKeyFor(/[؀-ۿ]/.test(name) ? { nameAr: name } : { nameEn: name }), name).toBe(key);
  });
  it('never shows a single-ingredient photo for dishes, products or look-alike names', () => {
    const no = ['Chicken nuggets', 'Chicken breast, breaded, fried', 'Milk chocolate', 'Almond milk', 'Rice milk', 'Almond oil', 'Apple juice', 'Orange juice',
      'Rice cakes', 'Tuna salad', 'Egg noodles', 'Banana chips', 'Wheat flour', 'فول سوداني', 'كبسة دجاج', 'عصير برتقال', 'حلاوة طحينية', 'شوكولاتة بالحليب', 'Pizza'];
    for (const name of no) expect(photoKeyFor(/[؀-ۿ]/.test(name) ? { nameAr: name } : { nameEn: name }), name).toBeNull();
  });
  it('a USDA food maps by its FDC id first', () => {
    expect(photoKeyFor({ nameEn: 'anything', sourceRef: 'USDA FDC 171477 (SR Legacy)' })).toBe('chicken-breast');
    expect(photoKeyFor({ id: 'S173944' })).toBe('banana');
  });
  it('every shipped photo has a key, a file and full attribution (author, licence, source page)', () => {
    const mf = new URL('../public/food-img/manifest.json', import.meta.url);
    const m = JSON.parse(readFileSync(mf, 'utf8')) as Record<string, { file: string; author: string; license: string; source: string }>;
    const keys = new Set(PHOTO_KEYS.map((k) => k.key));
    expect(Object.keys(m).length).toBeGreaterThan(40);
    for (const [k, c] of Object.entries(m)) {
      expect(keys.has(k), k).toBe(true);
      expect(existsSync(new URL('../public/food-img/' + c.file, import.meta.url)), c.file).toBe(true);
      expect(c.license).toMatch(/^(CC0|CC BY|CC-BY|Public domain|PD)/);
      expect(c.source).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      expect(c.author.length).toBeGreaterThan(0);
    }
  });
});

describe('Dish photos — licensed, documented, matched to a real recipe', () => {
  const mf = new URL('../public/dish-img/manifest.json', import.meta.url);
  const m = JSON.parse(readFileSync(mf, 'utf8')) as Record<string, { file: string; title: string; author: string; license: string; licenseUrl: string; source: string }>;
  it('every dish photo belongs to an existing library recipe, exists on disk and has full attribution', () => {
    const ids = new Set(LIBRARY.map((r) => r.id));
    expect(Object.keys(m).length).toBeGreaterThan(0);
    for (const [id, c] of Object.entries(m)) {
      expect(ids.has(id), id).toBe(true);
      expect(c.file).toBe(id + '.webp');
      expect(existsSync(new URL('../public/dish-img/' + c.file, import.meta.url)), c.file).toBe(true);
      expect(c.license, id).toMatch(/^(CC0|CC BY|CC-BY|Public domain|PD)/);
      expect(c.license, id).not.toMatch(/NC|ND/);
      expect(c.source).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      expect(c.author.length).toBeGreaterThan(0);
    }
  });
  it('the licence document lists every shipped dish photo', () => {
    const doc = readFileSync(new URL('../docs/launch/MEGO_IMAGE_LICENSES.md', import.meta.url), 'utf8');
    for (const [id, c] of Object.entries(m)) { expect(doc, id).toContain(id); expect(doc, id).toContain(c.source); }
  });
});
