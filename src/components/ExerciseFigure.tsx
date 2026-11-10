import { useEffect, useMemo, useState } from 'react';
import type { Muscle } from '../lib/exercises';
import {
  dir, lerpFront, lerpSide, MUSCLE_REGIONS, SEG, solveSide, type FrontPose, type Prop, type Pt, type Region, type SidePose, type Skeleton, type Visual
} from '../lib/exerciseVisuals';

const C = { body: 'var(--fig-body, #8a949c)', far: 'var(--fig-far, #c3c9ce)', primary: 'var(--primary)', secondary: 'color-mix(in srgb, var(--primary) 45%, var(--fig-body, #8a949c))', prop: 'var(--fig-prop, #59636b)', load: 'var(--fig-load, #2e3438)' };

function regionColors(primary: Muscle, secondary: Muscle[]) {
  const map: Partial<Record<Region, string>> = {};
  for (const m of secondary) for (const r of MUSCLE_REGIONS[m]) map[r] = C.secondary;
  for (const r of MUSCLE_REGIONS[primary]) map[r] = C.primary;
  return (r: Region) => map[r] ?? C.body;
}

function PropShape({ p, sk }: { p: Prop; sk: Skeleton }) {
  if (p.t === 'rect') return <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={p.r ?? 2} fill={C.prop} transform={p.rot ? `rotate(${p.rot} ${p.x + p.w / 2} ${p.y + p.h / 2})` : undefined} />;
  if (p.t === 'line') return <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={C.prop} strokeWidth={p.w ?? 4} strokeLinecap="round" />;
  if (p.t === 'pad') {
    const j = sk[p.at as keyof Skeleton] as Pt;
    const x = j[0] + (p.dx ?? 0), y = j[1] + (p.dy ?? 0);
    return <rect x={x - p.w / 2} y={y - p.h / 2} width={p.w} height={p.h} rx={3} fill={C.prop} transform={p.rot ? `rotate(${p.rot} ${x} ${y})` : undefined} />;
  }
  return <line x1={sk.wrist[0]} y1={sk.wrist[1]} x2={p.to[0]} y2={p.to[1]} stroke={C.prop} strokeWidth={1.4} strokeDasharray="3 2" />;
}

function Load({ equip, at, angle }: { equip: Visual['equip']; at: Pt; angle: number }) {
  if (equip === 'barbell' || equip === 'ez') return <g><circle cx={at[0]} cy={at[1]} r={equip === 'ez' ? 7 : 10} fill={C.load} /><circle cx={at[0]} cy={at[1]} r={2.5} fill="var(--bg, #fff)" /></g>;
  if (equip === 'dumbbell') return <g transform={`rotate(${-angle} ${at[0]} ${at[1]})`}><rect x={at[0] - 7} y={at[1] - 3} width={14} height={6} rx={2} fill={C.load} /><rect x={at[0] - 9} y={at[1] - 5} width={4} height={10} rx={1.5} fill={C.load} /><rect x={at[0] + 5} y={at[1] - 5} width={4} height={10} rx={1.5} fill={C.load} /></g>;
  if (equip === 'handle') return <rect x={at[0] - 5} y={at[1] - 2} width={10} height={4} rx={2} fill={C.load} />;
  if (equip === 'rope') return <g><line x1={at[0] - 4} y1={at[1]} x2={at[0] + 4} y2={at[1] + 5} stroke={C.load} strokeWidth={3} strokeLinecap="round" /></g>;
  if (equip === 'wheel') return <circle cx={at[0]} cy={at[1] + 1} r={8} fill="none" stroke={C.load} strokeWidth={4} />;
  return null;
}

const seg = (a: Pt, b: Pt, color: string, w: number, key?: string) => <line key={key} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={w} strokeLinecap="round" />;

function SideFigure({ sk, visual, color }: { sk: Skeleton; visual: Visual; color: (r: Region) => string }) {
  const mid = (a: Pt, b: Pt, k: number): Pt => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const chestTop = mid(sk.hip, sk.shoulder, 0.55);
  // offset torso halves to front/back (perpendicular to the torso line)
  const tx = sk.shoulder[0] - sk.hip[0], ty = sk.shoulder[1] - sk.hip[1], tl = Math.hypot(tx, ty) || 1;
  const nx = -ty / tl, ny = tx / tl; // left normal
  const front: Pt = [nx * 3.2, ny * 3.2];
  const o = (p: Pt, k: number): Pt => [p[0] + front[0] * k, p[1] + front[1] * k];
  const armAngle = (Math.atan2(sk.wrist[0] - sk.elbow[0], sk.wrist[1] - sk.elbow[1]) * 180) / Math.PI;
  return (
    <g>
      {/* far side limbs */}
      {seg(sk.hip, sk.knee2, C.far, 9)}{seg(sk.knee2, sk.ankle2, C.far, 8)}{seg(sk.ankle2, sk.toe2, C.far, 5)}
      {seg(sk.shoulder, sk.elbow2, C.far, 8)}{seg(sk.elbow2, sk.wrist2, C.far, 6.5)}
      {(visual.equip === 'dumbbell' || visual.equip === 'handle') && <g opacity={0.55}><Load equip={visual.equip} at={sk.wrist2} angle={armAngle} /></g>}
      {/* torso: back half / front half, lower / upper */}
      {seg(o(sk.hip, -1), o(chestTop, -1), color('lowerBack'), 7)}{seg(o(chestTop, -1), o(sk.shoulder, -1), color('upperBack'), 7)}
      {seg(o(sk.hip, 1), o(chestTop, 1), color('abs'), 7)}{seg(o(chestTop, 1), o(sk.shoulder, 1), color('chest'), 7)}
      <circle cx={sk.hip[0]} cy={sk.hip[1]} r={7} fill={color('glute')} />
      {seg(sk.shoulder, sk.neck, C.body, 5)}
      <circle cx={sk.head[0]} cy={sk.head[1]} r={SEG.head} fill={C.body} />
      {/* near side limbs */}
      {seg(sk.hip, sk.knee, color('thigh'), 10)}{seg(sk.knee, sk.ankle, color('shin'), 8.5)}{seg(sk.ankle, sk.toe, C.body, 5)}
      <circle cx={sk.shoulder[0]} cy={sk.shoulder[1]} r={6.5} fill={color('delt')} />
      {seg(sk.shoulder, sk.elbow, color('uarm'), 8.5)}{seg(sk.elbow, sk.wrist, color('farm'), 7)}
      <Load equip={visual.equip} at={sk.wrist} angle={armAngle} />
    </g>
  );
}

function FrontFigure({ p, visual, color }: { p: FrontPose; visual: Visual; color: (r: Region) => string }) {
  const cx = 100, hipY = p.seated ? 128 : 104, torso = SEG.torso * Math.cos(((p.hinge ?? 0) * Math.PI) / 180);
  const shY = hipY - torso;
  const parts: JSX.Element[] = [];
  const wrists: Pt[] = [];
  for (const side of [-1, 1]) {
    const sh: Pt = [cx + side * SEG.shoulderW, shY + 4];
    // arm direction in the frontal plane (abduction a from straight down); horizontal adduction h moves it forward,
    // which in this front view scales the sideways component by cos h (crossing the midline beyond 90°)
    const h = Math.cos((p.h * Math.PI) / 180), a = (p.abd * Math.PI) / 180, f = a + (p.elbow * Math.PI) / 180;
    const el: Pt = [sh[0] + side * Math.sin(a) * h * SEG.uarm, sh[1] + Math.cos(a) * SEG.uarm];
    const wr: Pt = [el[0] + side * Math.sin(f) * h * SEG.farm, el[1] + Math.cos(f) * SEG.farm];
    wrists.push(wr);
    parts.push(<g key={side}>{seg(sh, el, color('uarm'), 8.5)}{seg(el, wr, color('farm'), 7)}<circle cx={sh[0]} cy={sh[1]} r={7} fill={color('delt')} /><Load equip={visual.equip} at={wr} angle={0} /></g>);
  }
  const legs = p.seated
    ? [-1, 1].map((s) => <g key={s}>{seg([cx + s * SEG.hipW, hipY], [cx + s * 18, hipY + 14], color('thigh'), 11)}{seg([cx + s * 18, hipY + 14], [cx + s * 18, hipY + 52], color('shin'), 8.5)}</g>)
    : [-1, 1].map((s) => <g key={s}>{seg([cx + s * SEG.hipW * 0.7, hipY], [cx + s * 12, hipY + SEG.thigh], color('thigh'), 11)}{seg([cx + s * 12, hipY + SEG.thigh], [cx + s * 13, hipY + SEG.thigh + SEG.shin], color('shin'), 8.5)}</g>);
  return (
    <g>
      {p.seated && <rect x={cx - 30} y={hipY + 2} width={60} height={8} rx={3} fill={C.prop} />}
      {visual.props?.map((c, i) => (c.t === 'cable' ? wrists.map((w, k) => {
        // k = 0 → left arm, 1 → right arm; anchors at the corners, or low on the opposite side when to[0] = 100
        const x = c.to[0] === 100 ? (k ? 40 : 160) : (k ? 200 - c.to[0] : c.to[0]);
        return <line key={i + '-' + k} x1={w[0]} y1={w[1]} x2={x} y2={c.to[1]} stroke={C.prop} strokeWidth={1.4} strokeDasharray="3 2" />;
      }) : null))}
      {legs}
      <rect x={cx - SEG.shoulderW + 4} y={shY} width={(SEG.shoulderW - 4) * 2} height={torso * 0.55} rx={6} fill={color('chest')} />
      <rect x={cx - SEG.hipW - 2} y={shY + torso * 0.55} width={(SEG.hipW + 2) * 2} height={torso * 0.45} rx={5} fill={color('abs')} />
      <line x1={cx} y1={shY} x2={cx} y2={shY - SEG.neck} stroke={C.body} strokeWidth={6} />
      <circle cx={cx} cy={shY - SEG.neck - SEG.head} r={SEG.head} fill={C.body} />
      {parts}
    </g>
  );
}

/** Ease in-out cycle: hold start → move → hold end → return. */
function phase(ms: number, period = 4200): number {
  const t = (ms % period) / period;
  const e = (x: number) => 0.5 - Math.cos(Math.PI * x) / 2;
  if (t < 0.15) return 0;
  if (t < 0.45) return e((t - 0.15) / 0.3);
  if (t < 0.6) return 1;
  return 1 - e((t - 0.6) / 0.4);
}

export function ExerciseFigure({ visual, primary, secondary, at, animate, size = 220, label }: {
  visual: Visual; primary: Muscle; secondary: Muscle[]; at?: 0 | 1; animate?: boolean; size?: number; label?: string;
}) {
  const [t, setT] = useState<number>(at ?? 0);
  useEffect(() => {
    if (!animate) { setT(at ?? 0); return; }
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setT(1); return; }
    let raf = 0; const t0 = performance.now();
    const loop = (now: number) => { setT(phase(now - t0)); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [animate, at]);
  const color = useMemo(() => regionColors(primary, secondary), [primary, secondary]);
  const box = useMemo(() => viewBoxOf(visual), [visual]);
  const sk = visual.view === 'side' ? solveSide(lerpSide(visual.start as SidePose, visual.end as SidePose, t)) : null;
  return (
    <svg viewBox={box} width={size} height={size} role="img" aria-label={label} className="ex-figure" data-view={visual.view}>
      {visual.floor !== 0 && visual.view === 'side' && <line x1={-40} y1={(visual.floor ?? 182) + 1} x2={240} y2={(visual.floor ?? 182) + 1} stroke={C.prop} strokeWidth={2} opacity={0.5} />}
      {sk && visual.props?.map((p, i) => <PropShape key={i} p={p} sk={sk} />)}
      {sk ? <SideFigure sk={sk} visual={visual} color={color} /> : <FrontFigure p={lerpFront(visual.start as FrontPose, visual.end as FrontPose, t)} visual={visual} color={color} />}
    </svg>
  );
}

/** Square viewBox containing both poses and props. */
export function viewBoxOf(v: Visual): string {
  if (v.view === 'front') return '20 10 160 180';
  const pts: Pt[] = [];
  for (const p of [v.start, v.end] as SidePose[]) { const s = solveSide(p); pts.push(...Object.values(s), s.head); }
  for (const p of v.props ?? []) {
    if (p.t === 'line') pts.push([p.x1, p.y1], [p.x2, p.y2]);
    if (p.t === 'rect') pts.push([p.x, p.y], [p.x + p.w, p.y + p.h]);
    if (p.t === 'cable') pts.push(p.to);
  }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs) - 14, maxX = Math.max(...xs) + 14, minY = Math.min(...ys) - 14, maxY = Math.max(...ys, v.floor === 0 ? -Infinity : 184) + 6;
  const s = Math.max(maxX - minX, maxY - minY);
  return `${((minX + maxX) / 2 - s / 2).toFixed(1)} ${((minY + maxY) / 2 - s / 2).toFixed(1)} ${s.toFixed(1)} ${s.toFixed(1)}`;
}
void dir;
