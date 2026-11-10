import type { Muscle } from '../lib/exercises';

/**
 * Consistent anatomical chart (front + back) used for every exercise: primary muscle in the strong color,
 * secondary muscles in the light tint, everything else neutral. Original drawing (no third-party artwork).
 */
type Shape = { m: Muscle | null; d: string };
const sym = (d: (s: 1 | -1) => string): string[] => [d(-1), d(1)];
const ell = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${2 * rx},0 a${rx},${ry} 0 1,0 ${-2 * rx},0`;

function body(back: boolean): Shape[] {
  const x = (s: number, v: number) => 60 + s * v;
  const shapes: Shape[] = [
    { m: null, d: ell(60, 16, 10, 12) },
    { m: null, d: 'M54,27 h12 v8 h-12z' },
    ...sym((s) => ell(x(s, 22), 42, 9, 8)).map((d) => ({ m: 'shoulders' as Muscle, d })),
    ...(back
      ? [{ m: 'back' as Muscle, d: 'M42,36 Q60,30 78,36 L80,62 Q60,74 40,62 Z' }, { m: 'back' as Muscle, d: 'M44,64 Q60,74 76,64 L72,86 Q60,90 48,86 Z' }]
      : sym((s) => `M60,36 L${x(s, 18)},38 Q${x(s, 20)},54 ${x(s, 12)},58 L60,58 Z`).map((d) => ({ m: 'chest' as Muscle, d }))),
    ...(back ? [] : [{ m: 'abs' as Muscle, d: 'M50,60 h20 v30 q-10,6 -20,0z' }]),
    ...(back ? [] : sym((s) => `M${x(s, 13)},60 L${x(s, 17)},62 L${x(s, 15)},88 L${x(s, 11)},90 Z`).map((d) => ({ m: 'abs' as Muscle, d }))),
    ...sym((s) => ell(x(s, 25), 60, 5.5, 12)).map((d) => ({ m: (back ? 'triceps' : 'biceps') as Muscle, d })),
    ...sym((s) => `M${x(s, 24)},73 L${x(s, 32)},73 L${x(s, 30)},100 L${x(s, 25)},100 Z`).map((d) => ({ m: 'forearms' as Muscle, d })),
    ...(back ? sym((s) => ell(x(s, 8), 98, 9, 9)).map((d) => ({ m: 'glutes' as Muscle, d })) : [{ m: null as Muscle | null, d: 'M46,90 h28 v12 h-28z' }]),
    ...sym((s) => `M${x(s, 2)},${back ? 107 : 102} L${x(s, 17)},${back ? 105 : 100} L${x(s, 14)},140 L${x(s, 4)},140 Z`).map((d) => ({ m: (back ? 'hamstrings' : 'quads') as Muscle, d })),
    ...sym((s) => back ? ell(x(s, 9), 158, 5.5, 13) : `M${x(s, 5)},144 L${x(s, 13)},144 L${x(s, 12)},176 L${x(s, 7)},176 Z`).map((d) => ({ m: back ? ('calves' as Muscle) : null, d }))
  ];
  return shapes;
}

export function MuscleChart({ primary, secondary, labels }: { primary: Muscle; secondary: Muscle[]; labels: { front: string; back: string } }) {
  const fill = (m: Muscle | null) => (m === primary ? 'var(--primary)' : m && secondary.includes(m) ? 'color-mix(in srgb, var(--primary) 40%, var(--surface-3))' : 'var(--surface-3)');
  return (
    <div className="muscle-chart" data-testid="muscle-chart">
      {[false, true].map((back) => (
        <figure key={String(back)}>
          <svg viewBox="0 0 120 184" width="120" height="184" role="img" aria-label={back ? labels.back : labels.front}>
            {body(back).map((s, i) => <path key={i} d={s.d} fill={fill(s.m)} stroke="var(--bg)" strokeWidth="1.2" data-muscle={s.m ?? ''} />)}
          </svg>
          <figcaption className="tiny muted">{back ? labels.back : labels.front}</figcaption>
        </figure>
      ))}
    </div>
  );
}
