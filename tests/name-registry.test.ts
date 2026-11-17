/** Every recipe library part must be registered for display-language names (otherwise saved recipes and planner
 *  items show the Arabic name in English mode). Found by the localization crawl after part 4 was added. */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('name registry', () => {
  it('AppContext registers the names of every recipeLibraryData file', () => {
    const ctx = readFileSync('src/app/AppContext.tsx', 'utf8');
    const parts = readdirSync('src/lib').filter((f) => /^recipeLibraryData\d*\.ts$/.test(f)).map((f) => f.replace('.ts', ''));
    expect(parts.length).toBeGreaterThanOrEqual(4);
    for (const p of parts) expect(ctx.includes(`import('../lib/${p}')`), p).toBe(true);
  });
});
