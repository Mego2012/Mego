import { it, expect } from 'vitest';
import { DICTS } from '../src/lib/i18n';
it('every Arabic string has an English one and vice versa', () => {
  const en = Object.keys(DICTS.en), ar = Object.keys(DICTS.ar);
  expect(en.filter((k) => !ar.includes(k))).toEqual([]);
  expect(ar.filter((k) => !en.includes(k))).toEqual([]);
});
