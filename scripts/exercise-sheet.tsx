/** Renders every exercise illustration (start + finish) into one HTML contact sheet for visual review.
 * Usage: npx tsx scripts/exercise-sheet.tsx out.html [id,id] */
import React from 'react';
(globalThis as unknown as { React: unknown }).React = React;
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync } from 'node:fs';
import { ExerciseFigure } from '../src/components/ExerciseFigure';
import { EXERCISES } from '../src/lib/exercises';
import { VISUALS } from '../src/lib/exerciseVisuals';
const only = process.argv[3] ? process.argv[3].split(',') : null;
const cells = EXERCISES.filter((e) => !only || only.includes(e.id)).map((e) => {
  const v = VISUALS[e.id];
  if (!v) return `<div class=c><b>${e.id}</b> MISSING</div>`;
  const f = (at: 0 | 1) => renderToStaticMarkup(<ExerciseFigure visual={v} primary={e.primary} secondary={e.secondary} at={at} size={Number(process.env.SIZE || 170)} />);
  return `<div class=c><b>${e.id}</b><div>${f(0)}${f(1)}</div></div>`;
}).join('');
writeFileSync(process.argv[2], `<html><body style="margin:0;font:11px sans-serif;--primary:#0b7a5c"><style>.c{display:inline-block;border:1px solid #ddd;margin:2px;padding:2px;width:${2*Number(process.env.SIZE||170)+10}px}.c svg{border:1px solid #eee}</style>${cells}</body></html>`);
