/** Display-time localization of stored names: records are never changed, only how a name is shown. */
import { beforeAll, describe, expect, it } from 'vitest';
import { joinList, localCategory, localName, registerNames, setUsdaTranslator } from '../src/lib/localize';
import { usdaArabicName } from '../src/lib/usdaGlossary';
import { LIBRARY } from '../src/lib/recipeEngine';
import { EXERCISES } from '../src/lib/exercises';
import { displayName } from '../src/lib/repo';

beforeAll(() => {
  registerNames(LIBRARY.map((r) => [r.nameAr, r.nameEn] as [string, string]));
  registerNames(EXERCISES.map((e) => [e.nameAr, e.nameEn] as [string, string]));
  setUsdaTranslator(usdaArabicName);
});

describe('stored names follow the display language', () => {
  it('food names from the dictionary, both directions', () => {
    expect(localName('صدر دجاج مشوي', 'en')).toBe('Chicken breast, grilled');
    expect(localName('Chicken breast, grilled', 'ar')).toBe('صدر دجاج مشوي');
    expect(localName('ملح', 'en')).toBe('Salt');
  });
  it('every library recipe and exercise has a name in both languages', () => {
    for (const r of LIBRARY) { expect(localName(r.nameAr, 'en'), r.id).toBe(r.nameEn); expect(localName(r.nameEn, 'ar'), r.id).toBe(r.nameAr); }
    for (const e of EXERCISES) { expect(e.nameAr && e.nameEn, e.id).toBeTruthy(); }
  });
  it('a saved substituted recipe keeps its suffix translated', () => {
    const r = LIBRARY.find((x) => x.id === 'lib-lemon-herb-chicken')!;
    expect(localName(r.nameAr + ' (معدّلة)', 'en')).toBe(r.nameEn + ' (modified)');
  });
  it('default habits and program name', () => {
    expect(localName('بروتين في كل وجبة', 'en')).toBe('Protein at every meal');
    expect(localName('My split', 'ar')).toBe('برنامجي');
  });
  it('USDA reference descriptions get an Arabic name from the glossary; unknown ones stay as they are', () => {
    expect(localName('Chicken, broilers or fryers, meat only, raw', 'ar')).toBe('دجاج — لحم فقط، نيء');
    expect(localName('Beef, ground, 90% lean meat / 10% fat, raw', 'ar')).toBe('لحم بقري — مفروم، نيء');
    expect(localName('Zzz unknown product, raw', 'ar')).toBe('Zzz unknown product, raw');
  });
  it('text the user typed is never altered', () => {
    expect(localName('My special shake', 'en')).toBe('My special shake');
    expect(localName('عصير أمي', 'en')).toBe('عصير أمي');
    expect(localName('عصير أمي', 'ar')).toBe('عصير أمي');
  });
  it('categories and list separators', () => {
    expect(localCategory('Poultry Products', 'ar')).toBe('منتجات الدواجن');
    expect(localCategory('بروتين', 'en')).toBe('Protein');
    expect(joinList(['a', 'b'], 'en')).toBe('a, b');
    expect(joinList(['أ', 'ب'], 'ar')).toBe('أ، ب');
  });
  it('a food with a single name is shown through the dictionary', () => {
    expect(displayName({ nameAr: 'موز', nameEn: '' }, 'en')).toBe('Banana');
    expect(displayName({ nameAr: '', nameEn: 'Banana' }, 'ar')).toBe('موز');
  });
});
