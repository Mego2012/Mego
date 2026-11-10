import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { isPristineDefault } from '../src/lib/cloudSync';
import { defaultSettings } from '../src/lib/defaults';
import { getSettings, saveSettings } from '../src/lib/repo';

describe('recovering an account after the local database was lost', () => {
  it('untouched defaults are recognised and never outrank the account settings from the cloud', async () => {
    expect(isPristineDefault({ ...defaultSettings(), updatedAt: Date.now() + 1e9 })).toBe(true);
    const s = await getSettings();
    expect(s.updatedAt).toBe(0); // a fresh default carries no "newer" timestamp
    expect(isPristineDefault(s)).toBe(true);
  });
  it('settings the user changed are never treated as defaults', async () => {
    const s = await saveSettings((x) => { x.targets.training.kcal = 2110; });
    expect(isPristineDefault(s)).toBe(false);
    expect(s.updatedAt).toBeGreaterThan(0);
  });
});
