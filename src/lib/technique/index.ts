import { TECHNIQUE_1 } from './part1';
import { TECHNIQUE_2 } from './part2';
import { TECHNIQUE_3 } from './part3';
import type { Technique } from './types';
export type { Technique } from './types';
export const TECHNIQUE: Record<string, Technique> = { ...TECHNIQUE_1, ...TECHNIQUE_2, ...TECHNIQUE_3 };
