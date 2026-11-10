/**
 * Original exercise illustrations (no third-party images): a proportioned human figure posed by joint angles,
 * with two-joint inverse kinematics so hands and feet stay on the bar, floor, pad or platform. Every exercise has a
 * START and a FINISH pose; the app animates between them. Angles are degrees clockwise from straight down
 * (0 = down, 90 = forward/right — the figure faces right, 180 = up, -90 = backward/left).
 * Muscle regions are highlighted on the figure; the anatomical front/back chart shows the exact muscles.
 */
import type { Muscle } from './exercises';

export const SEG = { torso: 50, neck: 7, head: 8.5, uarm: 28, farm: 26, thigh: 42, shin: 40, foot: 13, shoulderW: 22, hipW: 14 } as const;
export type Pt = [number, number];
export const dir = (deg: number): Pt => [Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180)];
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
export const angleOf = (from: Pt, to: Pt) => (Math.atan2(to[0] - from[0], to[1] - from[1]) * 180) / Math.PI;

/** Two-joint IK: angles of the two segments from `a` to reach `t`. bend = 1 or -1 picks the side of the middle joint. */
export function ik(a: Pt, t: Pt, l1: number, l2: number, bend: 1 | -1): [number, number] {
  const dx = t[0] - a[0], dy = t[1] - a[1];
  const d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01);
  const base = angleOf(a, t);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const alpha = (Math.acos(Math.max(-1, Math.min(1, cosA))) * 180) / Math.PI;
  const s1 = base + bend * alpha;
  const mid = add(a, dir(s1), l1);
  return [s1, angleOf(mid, t)];
}

type Limb = { a?: number; b?: number; to?: Pt; rel?: Pt; bend?: 1 | -1 };
export interface SidePose {
  /** root: hip position, or shoulder position (then hip = shoulder − torso). */
  hip?: Pt;
  shoulder?: Pt;
  torso: number;
  head?: number;
  arm: Limb;
  arm2?: Limb;
  leg: Limb;
  leg2?: Limb;
  /** foot angle (default: perpendicular to the shin, pointing forward). */
  foot?: number;
  foot2?: number;
  /** projection factor for arms moving toward/away from the viewer (1 = in the picture plane). */
  armScale?: number;
}
export interface FrontPose {
  /** shoulder abduction from straight down (0) to horizontal (90). */
  abd: number;
  /** elbow bend (0 = straight; 90 = forearm pointing up when the upper arm is horizontal). */
  elbow: number;
  /** horizontal adduction: 0 = arms in the frontal plane, 90 = straight forward, > 90 = crossing the midline. */
  h: number;
  seated?: boolean;
  /** hip hinge seen from the front (shortens the torso), degrees. */
  hinge?: number;
}
export type Equip = 'barbell' | 'ez' | 'dumbbell' | 'handle' | 'rope' | 'none' | 'wheel';
export type Prop =
  | { t: 'rect'; x: number; y: number; w: number; h: number; rot?: number; r?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; w?: number }
  | { t: 'pad'; at: Joint; w: number; h: number; rot?: number; dx?: number; dy?: number }
  | { t: 'cable'; to: Pt };
export type Joint = 'shoulder' | 'elbow' | 'wrist' | 'hip' | 'knee' | 'ankle' | 'toe';

export interface Visual {
  view: 'side' | 'front';
  start: SidePose | FrontPose;
  end: SidePose | FrontPose;
  equip: Equip;
  props?: Prop[];
  floor?: number;
  /** One-line caption naming what the drawing shows when it is a variant (e.g. the machine version). */
  noteEn?: string;
  noteAr?: string;
}

export interface Skeleton {
  hip: Pt; shoulder: Pt; neck: Pt; head: Pt;
  elbow: Pt; wrist: Pt; elbow2: Pt; wrist2: Pt;
  knee: Pt; ankle: Pt; toe: Pt; knee2: Pt; ankle2: Pt; toe2: Pt;
}

function limb(from: Pt, l: Limb, l1: number, l2: number, scale = 1): { mid: Pt; end: Pt; a: number; b: number } {
  let a = l.a ?? 0, b = l.b ?? 0;
  if (l.to || l.rel) {
    const t = l.to ?? add(from, l.rel!);
    [a, b] = ik(from, t, l1 * scale, l2 * scale, l.bend ?? 1);
  }
  const mid = add(from, dir(a), l1 * scale);
  return { mid, end: add(mid, dir(b), l2 * scale), a, b };
}

export function solveSide(p: SidePose): Skeleton {
  const tDir = dir(p.torso);
  const hip: Pt = p.hip ?? add(p.shoulder!, tDir, -SEG.torso);
  const shoulder: Pt = p.shoulder ?? add(hip, tDir, SEG.torso);
  const neck = add(shoulder, dir(p.head ?? p.torso), SEG.neck);
  const head = add(neck, dir(p.head ?? p.torso), SEG.head);
  const s = p.armScale ?? 1;
  const A = limb(shoulder, p.arm, SEG.uarm, SEG.farm, s);
  const A2 = limb(shoulder, p.arm2 ?? p.arm, SEG.uarm, SEG.farm, s);
  const L = limb(hip, p.leg, SEG.thigh, SEG.shin);
  const L2 = limb(hip, p.leg2 ?? p.leg, SEG.thigh, SEG.shin);
  const toe = add(L.end, dir(p.foot ?? L.b + 90), SEG.foot);
  const toe2 = add(L2.end, dir(p.foot2 ?? p.foot ?? L2.b + 90), SEG.foot);
  return { hip, shoulder, neck, head, elbow: A.mid, wrist: A.end, elbow2: A2.mid, wrist2: A2.end, knee: L.mid, ankle: L.end, toe, knee2: L2.mid, ankle2: L2.end, toe2 };
}

/** Linear interpolation of two side poses after solving (keeps contacts consistent through the movement). */
export function lerpSkeleton(a: Skeleton, b: Skeleton, t: number): Skeleton {
  const out = {} as Skeleton;
  for (const k of Object.keys(a) as (keyof Skeleton)[]) out[k] = [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t];
  return out;
}
/** Joint-angle interpolation (smooth arcs) for side poses defined only by angles; IK poses re-solve per frame. */
export function lerpSide(a: SidePose, b: SidePose, t: number): SidePose {
  const n = (x: number | undefined, y: number | undefined) => (x === undefined || y === undefined ? (t < 0.5 ? x : y) : x + (y - x) * t);
  const p = (x?: Pt, y?: Pt): Pt | undefined => (x && y ? [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t] : t < 0.5 ? x : y);
  const l = (x?: Limb, y?: Limb): Limb | undefined => (!x || !y ? (t < 0.5 ? x : y) : { a: n(x.a, y.a), b: n(x.b, y.b), to: p(x.to, y.to), rel: p(x.rel, y.rel), bend: t < 0.5 ? x.bend : y.bend });
  return {
    hip: p(a.hip, b.hip), shoulder: p(a.shoulder, b.shoulder), torso: n(a.torso, b.torso)!, head: n(a.head, b.head), foot: n(a.foot, b.foot), foot2: n(a.foot2, b.foot2),
    armScale: n(a.armScale ?? 1, b.armScale ?? 1), arm: l(a.arm, b.arm)!, arm2: l(a.arm2, b.arm2), leg: l(a.leg, b.leg)!, leg2: l(a.leg2, b.leg2)
  };
}
export function lerpFront(a: FrontPose, b: FrontPose, t: number): FrontPose {
  return { abd: a.abd + (b.abd - a.abd) * t, elbow: a.elbow + (b.elbow - a.elbow) * t, h: a.h + (b.h - a.h) * t, seated: a.seated, hinge: (a.hinge ?? 0) + ((b.hinge ?? 0) - (a.hinge ?? 0)) * t };
}

/* ------------------------------------------------------------------ pose library */

const FLOOR = 182;
const stand = (x = 100): Pick<SidePose, 'hip' | 'torso' | 'leg'> => ({ hip: [x - 4, FLOOR - 3 - SEG.thigh - SEG.shin + 1], torso: 180, leg: { to: [x, FLOOR - 3], bend: 1 } });
const benchFlat = (x1: number, x2: number, top: number): Prop[] => [
  { t: 'rect', x: x1, y: top, w: x2 - x1, h: 7, r: 3 }, { t: 'line', x1: x1 + 8, y1: top + 7, x2: x1 + 8, y2: FLOOR, w: 4 }, { t: 'line', x1: x2 - 8, y1: top + 7, x2: x2 - 8, y2: FLOOR, w: 4 }
];
const incline = (hip: Pt, deg: number, len = 62): Prop[] => {
  const d = dir(deg);
  const base: Pt = [hip[0] + 4, hip[1] + 7];
  return [
    { t: 'line', x1: base[0], y1: base[1], x2: base[0] + d[0] * len, y2: base[1] + d[1] * len, w: 7 },
    { t: 'line', x1: base[0] - 14, y1: base[1], x2: base[0] + 24, y2: base[1], w: 7 },
    { t: 'line', x1: base[0] + 4, y1: base[1], x2: base[0] + 4, y2: FLOOR, w: 4 }
  ];
};
const rails = (x: number): Prop[] => [{ t: 'line', x1: x - 26, y1: 8, x2: x - 26, y2: FLOOR, w: 3 }, { t: 'line', x1: x + 26, y1: 8, x2: x + 26, y2: FLOOR, w: 3 }];
const seat = (hip: Pt, back = true, backDeg = -172): Prop[] => [
  { t: 'line', x1: hip[0] - 16, y1: hip[1] + 7, x2: hip[0] + 22, y2: hip[1] + 7, w: 7 }, { t: 'line', x1: hip[0], y1: hip[1] + 7, x2: hip[0], y2: FLOOR, w: 4 },
  ...(back ? [{ t: 'line', x1: hip[0] - 9, y1: hip[1] + 4, x2: hip[0] - 9 + dir(backDeg)[0] * 56, y2: hip[1] + 4 + dir(backDeg)[1] * 56, w: 7 } as Prop] : [])
];

const LIE: Pt = [122, 116];
const INC: Pt = [118, 118];
const SEAT: Pt = [92, 124];

export const VISUALS: Record<string, Visual> = {
  /* chest */
  bench_press: { view: 'side', equip: 'barbell', props: benchFlat(36, 146, 121),
    start: { hip: LIE, torso: -90, head: -92, arm: { a: 180, b: 180 }, leg: { to: [162, 179], bend: 1 } },
    end: { hip: LIE, torso: -90, head: -92, arm: { a: 18, b: 172 }, leg: { to: [162, 179], bend: 1 } } },
  db_bench: { view: 'side', equip: 'dumbbell', props: benchFlat(36, 146, 121),
    start: { hip: LIE, torso: -90, head: -92, arm: { a: 178, b: 180 }, leg: { to: [162, 179], bend: 1 } },
    end: { hip: LIE, torso: -90, head: -92, arm: { a: 10, b: 176 }, leg: { to: [162, 179], bend: 1 } } },
  incline_db_press: { view: 'side', equip: 'dumbbell', props: incline(INC, -125),
    start: { hip: INC, torso: -125, head: -128, arm: { a: 180, b: 180 }, leg: { to: [156, 179], bend: 1 } },
    end: { hip: INC, torso: -125, head: -128, arm: { a: 6, b: 178 }, leg: { to: [156, 179], bend: 1 } } },
  incline_bench: { view: 'side', equip: 'barbell', props: incline(INC, -125),
    start: { hip: INC, torso: -125, head: -128, arm: { a: 180, b: 180 }, leg: { to: [156, 179], bend: 1 } },
    end: { hip: INC, torso: -125, head: -128, arm: { a: 10, b: 174 }, leg: { to: [156, 179], bend: 1 } } },
  smith_bench: { view: 'side', equip: 'barbell', props: [...benchFlat(36, 146, 121), ...rails(80)],
    start: { hip: LIE, torso: -90, head: -92, arm: { a: 180, b: 180 }, leg: { to: [162, 179], bend: 1 } },
    end: { hip: LIE, torso: -90, head: -92, arm: { a: 18, b: 172 }, leg: { to: [162, 179], bend: 1 } } },
  smith_incline: { view: 'side', equip: 'barbell', props: [...incline(INC, -125), ...rails(80)],
    start: { hip: INC, torso: -125, head: -128, arm: { a: 180, b: 180 }, leg: { to: [156, 179], bend: 1 } },
    end: { hip: INC, torso: -125, head: -128, arm: { a: 10, b: 174 }, leg: { to: [156, 179], bend: 1 } } },
  machine_chest_press: { view: 'side', equip: 'handle', props: [...seat(SEAT), { t: 'rect', x: 160, y: 30, w: 10, h: 152 }],
    start: { hip: SEAT, torso: -172, head: -176, arm: { rel: [6, 12], bend: 1 }, leg: { to: [140, 179], bend: 1 } },
    end: { hip: SEAT, torso: -172, head: -176, arm: { a: 94, b: 92 }, leg: { to: [140, 179], bend: 1 } } },
  cable_fly: { view: 'front', equip: 'handle', props: [{ t: 'cable', to: [6, 18] }],
    start: { abd: 85, elbow: 15, h: 0 }, end: { abd: 72, elbow: 15, h: 100 } },
  pec_deck: { view: 'front', equip: 'none', start: { abd: 88, elbow: 85, h: 0, seated: true }, end: { abd: 88, elbow: 85, h: 92, seated: true } },
  db_fly: { view: 'side', equip: 'dumbbell', props: benchFlat(36, 146, 121),
    noteEn: 'Side view: at the bottom the arms point out to the sides, so they look short.', noteAr: 'منظر جانبي: في الأسفل تتجه الذراعان إلى الجانبين فتبدوان أقصر.',
    start: { hip: LIE, torso: -90, head: -92, arm: { a: 180, b: 180 }, leg: { to: [162, 179], bend: 1 } },
    end: { hip: LIE, torso: -90, head: -92, arm: { a: 6, b: 10 }, armScale: 0.42, leg: { to: [162, 179], bend: 1 } } },
  pushup: { view: 'side', equip: 'none',
    start: { shoulder: [132, FLOOR - 54], torso: 112, head: 110, arm: { to: [132, FLOOR - 1], bend: -1 }, leg: { to: [10, FLOOR - 4], bend: 1 }, foot: 20 },
    end: { shoulder: [140, FLOOR - 19], torso: 96, head: 96, arm: { to: [132, FLOOR - 1], bend: -1 }, leg: { to: [10, FLOOR - 4], bend: 1 }, foot: 20 } },
  /* back */
  pullup: { view: 'side', equip: 'none', floor: 0, props: [{ t: 'line', x1: 60, y1: 0, x2: 140, y2: 0, w: 5 }],
    start: { shoulder: [99, 54], torso: 180, head: 182, arm: { to: [100, 0], bend: 1 }, leg: { a: 12, b: -28 } },
    end: { shoulder: [95, 14], torso: 188, head: 175, arm: { to: [100, 0], bend: 1 }, leg: { a: 20, b: -20 } } },
  assisted_pullup: { view: 'side', equip: 'none', floor: 0, props: [{ t: 'line', x1: 60, y1: 0, x2: 140, y2: 0, w: 5 }, { t: 'pad', at: 'knee', w: 30, h: 7, dy: 6 }],
    start: { shoulder: [99, 54], torso: 180, head: 182, arm: { to: [100, 0], bend: 1 }, leg: { a: 0, b: -90 } },
    end: { shoulder: [95, 14], torso: 186, head: 176, arm: { to: [100, 0], bend: 1 }, leg: { a: 0, b: -90 } } },
  lat_pulldown: { view: 'side', equip: 'handle', props: [...seat([90, 124], false), { t: 'pad', at: 'knee', w: 16, h: 7, dy: -7 }, { t: 'cable', to: [106, 8] }],
    start: { hip: [90, 124], torso: -172, head: -176, arm: { rel: [10, -52], bend: 1 }, leg: { to: [134, 179], bend: 1 } },
    end: { hip: [90, 124], torso: -166, head: -170, arm: { rel: [10, 6], bend: 1 }, leg: { to: [134, 179], bend: 1 } } },
  barbell_row: { view: 'side', equip: 'barbell',
    start: { hip: [74, 106], torso: 133, head: 128, arm: { a: 0, b: 0 }, leg: { to: [100, 179], bend: 1 } },
    end: { hip: [74, 106], torso: 133, head: 128, arm: { to: [98, 98], bend: 1 }, leg: { to: [100, 179], bend: 1 } } },
  db_row: { view: 'side', equip: 'dumbbell', props: benchFlat(40, 150, 142),
    start: { hip: [68, 104], torso: 98, head: 96, arm: { a: 0, b: 0 }, arm2: { to: [118, 142], bend: 1 }, leg: { to: [60, 179], bend: 1 }, leg2: { a: 0, b: -90 } },
    end: { hip: [68, 104], torso: 98, head: 96, arm: { to: [92, 108], bend: 1 }, arm2: { to: [118, 142], bend: 1 }, leg: { to: [60, 179], bend: 1 }, leg2: { a: 0, b: -90 } } },
  seated_cable_row: { view: 'side', equip: 'handle', props: [{ t: 'rect', x: 40, y: 150, w: 70, h: 8, r: 3 }, { t: 'rect', x: 140, y: 120, w: 8, h: 62 }, { t: 'cable', to: [146, 150] }],
    start: { hip: [70, 144], torso: 172, head: 175, arm: { a: 98, b: 96 }, leg: { to: [136, 138], bend: 1 }, foot: 180 },
    end: { hip: [70, 144], torso: 184, head: 182, arm: { rel: [12, 34], bend: 1 }, leg: { to: [136, 138], bend: 1 }, foot: 180 } },
  chest_supported_row: { view: 'side', equip: 'dumbbell', props: [{ t: 'line', x1: 64, y1: 124, x2: 64 + dir(135)[0] * 70, y2: 124 + dir(135)[1] * 70, w: 8 }, { t: 'line', x1: 66, y1: 124, x2: 66, y2: FLOOR, w: 4 }],
    start: { hip: [72, 112], torso: 135, head: 130, arm: { a: 0, b: 0 }, leg: { to: [92, 179], bend: 1 } },
    end: { hip: [72, 112], torso: 135, head: 130, arm: { to: [94, 92], bend: 1 }, leg: { to: [92, 179], bend: 1 } } },
  straight_arm_pulldown: { view: 'side', equip: 'handle', props: [{ t: 'cable', to: [178, 6] }],
    start: { ...stand(96), torso: 166, head: 164, arm: { a: 148, b: 150 } },
    end: { ...stand(96), torso: 166, head: 164, arm: { a: 8, b: 6 } } },
  /* shoulders */
  ohp: { view: 'side', equip: 'barbell',
    start: { ...stand(), head: 180, arm: { rel: [7, -4], bend: -1 } },
    end: { ...stand(), head: 182, arm: { a: 178, b: 180 } } },
  db_shoulder_press: { view: 'side', equip: 'dumbbell', props: seat(SEAT, true, -178),
    start: { hip: SEAT, torso: 180, head: 180, arm: { rel: [2, -8], bend: -1 }, leg: { to: [138, 179], bend: 1 } },
    end: { hip: SEAT, torso: 180, head: 180, arm: { a: 178, b: 180 }, leg: { to: [138, 179], bend: 1 } } },
  machine_shoulder_press: { view: 'side', equip: 'handle', props: seat(SEAT, true, -176),
    start: { hip: SEAT, torso: -178, head: 180, arm: { rel: [8, -6], bend: -1 }, leg: { to: [138, 179], bend: 1 } },
    end: { hip: SEAT, torso: -178, head: 180, arm: { a: 172, b: 175 }, leg: { to: [138, 179], bend: 1 } } },
  lateral_raise: { view: 'front', equip: 'dumbbell', start: { abd: 12, elbow: 12, h: 0 }, end: { abd: 88, elbow: 12, h: 8 } },
  cable_lateral_raise: { view: 'front', equip: 'handle', props: [{ t: 'cable', to: [100, 186] }], start: { abd: -12, elbow: 10, h: 0 }, end: { abd: 86, elbow: 10, h: 6 } },
  rear_delt_fly: { view: 'front', equip: 'handle', noteEn: 'Shown on the reverse pec-deck (seated, facing the pad); the bent-over dumbbell version follows the same arm path.', noteAr: 'موضّح على جهاز الفراشة العكسي (جلوس مع مواجهة الوسادة)؛ نسخة الدمبل بانحناء تتبع مسار الذراعين نفسه.',
    start: { abd: 85, elbow: 8, h: 92, seated: true }, end: { abd: 85, elbow: 8, h: -8, seated: true } },
  face_pull: { view: 'side', equip: 'rope', props: [{ t: 'cable', to: [182, 40] }],
    start: { ...stand(), head: 180, arm: { a: 98, b: 96 } },
    end: { ...stand(), head: 180, arm: { rel: [6, -12], bend: -1 } } },
  /* biceps */
  barbell_curl: { view: 'side', equip: 'barbell', start: { ...stand(), arm: { a: 2, b: 2 } }, end: { ...stand(), arm: { a: 6, b: 160 } } },
  db_curl: { view: 'side', equip: 'dumbbell', start: { ...stand(), arm: { a: 0, b: 0 } }, end: { ...stand(), arm: { a: 4, b: 158 } } },
  hammer_curl: { view: 'side', equip: 'dumbbell', start: { ...stand(), arm: { a: 0, b: 0 } }, end: { ...stand(), arm: { a: 4, b: 155 } } },
  incline_db_curl: { view: 'side', equip: 'dumbbell', props: incline([112, 124], -148, 66),
    start: { hip: [112, 124], torso: -148, head: -152, arm: { a: 0, b: 0 }, leg: { to: [158, 179], bend: 1 } },
    end: { hip: [112, 124], torso: -148, head: -152, arm: { a: 0, b: 162 }, leg: { to: [158, 179], bend: 1 } } },
  cable_curl: { view: 'side', equip: 'handle', props: [{ t: 'cable', to: [176, 176] }], start: { ...stand(), arm: { a: 4, b: 14 } }, end: { ...stand(), arm: { a: 6, b: 162 } } },
  preacher_curl: { view: 'side', equip: 'ez', props: [{ t: 'pad', at: 'elbow', w: 36, h: 8, rot: -45, dx: -10, dy: -2 }, ...seat([86, 128], false)],
    start: { hip: [86, 128], torso: 172, head: 170, arm: { a: 48, b: 62 }, leg: { to: [130, 179], bend: 1 } },
    end: { hip: [86, 128], torso: 172, head: 170, arm: { a: 48, b: 168 }, leg: { to: [130, 179], bend: 1 } } },
  /* triceps */
  dips: { view: 'side', equip: 'none', props: [{ t: 'line', x1: 84, y1: 88, x2: 124, y2: 88, w: 5 }, { t: 'line', x1: 118, y1: 88, x2: 118, y2: FLOOR, w: 4 }],
    start: { shoulder: [100, 34], torso: 174, head: 174, arm: { to: [102, 88], bend: 1 }, leg: { a: 8, b: -60 } },
    end: { shoulder: [92, 64], torso: 160, head: 162, arm: { to: [102, 88], bend: 1 }, leg: { a: 18, b: -75 } } },
  machine_dip: { view: 'side', equip: 'handle', props: seat(SEAT, true, -178),
    start: { hip: SEAT, torso: 180, head: 180, arm: { rel: [6, 22], bend: 1 }, leg: { to: [138, 179], bend: 1 } },
    end: { hip: SEAT, torso: 180, head: 180, arm: { a: 4, b: 2 }, leg: { to: [138, 179], bend: 1 } } },
  close_grip_bench: { view: 'side', equip: 'barbell', props: benchFlat(36, 146, 121),
    start: { hip: LIE, torso: -90, head: -92, arm: { a: 180, b: 180 }, leg: { to: [162, 179], bend: 1 } },
    end: { hip: LIE, torso: -90, head: -92, arm: { a: 30, b: 168 }, leg: { to: [162, 179], bend: 1 } } },
  rope_pushdown: { view: 'side', equip: 'rope', props: [{ t: 'cable', to: [150, -10] }],
    start: { ...stand(), torso: 172, head: 172, arm: { a: 6, b: 150 } },
    end: { ...stand(), torso: 172, head: 172, arm: { a: 4, b: 2 } } },
  overhead_ext: { view: 'side', equip: 'dumbbell',
    start: { ...stand(), head: 180, arm: { a: 174, b: 16 } },
    end: { ...stand(), head: 180, arm: { a: 174, b: 176 } } },
  skullcrusher: { view: 'side', equip: 'ez', props: benchFlat(36, 146, 121),
    start: { hip: LIE, torso: -90, head: -92, arm: { a: -166, b: -166 }, leg: { to: [162, 179], bend: 1 } },
    end: { hip: LIE, torso: -90, head: -92, arm: { a: -166, b: -82 }, leg: { to: [162, 179], bend: 1 } } },
  /* legs */
  squat: { view: 'side', equip: 'barbell',
    start: { ...stand(), torso: 176, head: 178, arm: { rel: [-4, 3], bend: -1 } },
    end: { hip: [64, 138], torso: 134, head: 120, arm: { rel: [-4, 3], bend: -1 }, leg: { to: [100, 179], bend: 1 } } },
  smith_squat: { view: 'side', equip: 'barbell', props: rails(94),
    start: { hip: [90, 98], torso: 178, head: 180, arm: { rel: [-4, 3], bend: -1 }, leg: { to: [104, 179], bend: 1 } },
    end: { hip: [70, 140], torso: 150, head: 140, arm: { rel: [-4, 3], bend: -1 }, leg: { to: [104, 179], bend: 1 } } },
  hack_squat: { view: 'side', equip: 'none', props: [{ t: 'pad', at: 'shoulder', w: 64, h: 7, rot: -65, dx: -8, dy: 22 }, { t: 'pad', at: 'ankle', w: 30, h: 6, rot: 55, dx: 6 }],
    start: { hip: [82, 100], torso: -156, head: -160, arm: { rel: [4, 8], bend: 1 }, leg: { to: [132, 160], bend: 1 } },
    end: { hip: [101, 141], torso: -156, head: -160, arm: { rel: [4, 8], bend: 1 }, leg: { to: [132, 160], bend: 1 } } },
  leg_press: { view: 'side', equip: 'none', props: [{ t: 'line', x1: 64, y1: 150, x2: 64 + dir(-128)[0] * 64, y2: 150 + dir(-128)[1] * 64, w: 7 }, { t: 'line', x1: 50, y1: 152, x2: 86, y2: 152, w: 7 }, { t: 'pad', at: 'ankle', w: 38, h: 6, rot: 45, dx: 5, dy: 4 }],
    start: { hip: [70, 142], torso: -128, head: -130, arm: { a: 40, b: 60 }, leg: { to: [128, 86], bend: 1 } },
    end: { hip: [70, 142], torso: -128, head: -130, arm: { a: 40, b: 60 }, leg: { to: [104, 110], bend: 1 } } },
  rdl: { view: 'side', equip: 'barbell',
    start: { ...stand(), arm: { a: 0, b: 0 } },
    end: { hip: [62, 108], torso: 115, head: 112, arm: { a: 0, b: 0 }, leg: { to: [100, 179], bend: 1 } } },
  leg_curl: { view: 'side', equip: 'none', props: [...benchFlat(30, 150, 128), { t: 'pad', at: 'ankle', w: 8, h: 14, dy: -8 }],
    start: { hip: [104, 122], torso: -90, head: -96, arm: { a: -96, b: -92 }, leg: { a: 90, b: 90 }, foot: 180 },
    end: { hip: [104, 122], torso: -90, head: -96, arm: { a: -96, b: -92 }, leg: { a: 90, b: -150 }, foot: -60 } },
  leg_extension: { view: 'side', equip: 'none', props: [...seat([88, 122], true, -170), { t: 'pad', at: 'ankle', w: 8, h: 14, dx: 6, dy: -4 }],
    start: { hip: [88, 122], torso: -174, head: -178, arm: { a: 10, b: 40 }, leg: { a: 90, b: 0 } },
    end: { hip: [88, 122], torso: -174, head: -178, arm: { a: 10, b: 40 }, leg: { a: 90, b: 88 }, foot: 180 } },
  bulgarian_split: { view: 'side', equip: 'dumbbell', props: benchFlat(18, 62, 138),
    start: { hip: [94, 102], torso: 176, head: 178, arm: { a: 0, b: 0 }, leg: { to: [118, 179], bend: 1 }, leg2: { to: [48, 136], bend: 1 }, foot2: -130 },
    end: { hip: [86, 132], torso: 166, head: 170, arm: { a: 0, b: 0 }, leg: { to: [118, 179], bend: 1 }, leg2: { to: [48, 136], bend: 1 }, foot2: -130 } },
  walking_lunge: { view: 'side', equip: 'dumbbell',
    start: { hip: [96, 98], torso: 180, head: 180, arm: { a: 0, b: 0 }, leg: { to: [100, 179], bend: 1 }, leg2: { to: [96, 179], bend: 1 } },
    end: { hip: [92, 134], torso: 178, head: 180, arm: { a: 0, b: 0 }, leg: { to: [134, 179], bend: 1 }, leg2: { to: [50, 176], bend: 1 }, foot2: 40 } },
  hip_thrust: { view: 'side', equip: 'barbell', props: benchFlat(26, 68, 126),
    start: { shoulder: [66, 120], torso: -142, head: -120, arm: { rel: [26, 28], bend: 1 }, leg: { to: [140, 179], bend: 1 } },
    end: { shoulder: [66, 120], torso: -92, head: -70, arm: { rel: [40, -4], bend: 1 }, leg: { to: [140, 179], bend: 1 } } },
  calf_raise: { view: 'side', equip: 'none', floor: 190, props: [{ t: 'rect', x: 104, y: 182, w: 36, h: 8 }, { t: 'pad', at: 'shoulder', w: 22, h: 7, dy: -6 }],
    start: { hip: [96, 104], torso: 180, head: 180, arm: { rel: [2, -4], bend: -1 }, leg: { a: 0, b: 0 }, foot: 116 },
    end: { hip: [96, 92], torso: 180, head: 180, arm: { rel: [2, -4], bend: -1 }, leg: { a: 0, b: 0 }, foot: 40 } },
  seated_calf: { view: 'side', equip: 'none', props: [...seat([82, 124], false), { t: 'pad', at: 'knee', w: 24, h: 7, dy: -8 }, { t: 'rect', x: 116, y: 176, w: 36, h: 8 }],
    start: { hip: [82, 124], torso: 180, head: 180, arm: { rel: [24, 40], bend: 1 }, leg: { a: 90, b: 0 }, foot: 110 },
    end: { hip: [82, 124], torso: 180, head: 180, arm: { rel: [24, 34], bend: 1 }, leg: { a: 84, b: 0 }, foot: 50 } },
  /* abs */
  cable_crunch: { view: 'side', equip: 'rope', props: [{ t: 'cable', to: [150, -20] }],
    start: { hip: [92, 126], torso: 168, head: 170, arm: { rel: [8, -6], bend: -1 }, leg: { a: 0, b: -90 }, foot: 0 },
    end: { hip: [92, 126], torso: 104, head: 70, arm: { rel: [14, 10], bend: -1 }, leg: { a: 0, b: -90 }, foot: 0 } },
  crunch_machine: { view: 'side', equip: 'handle', props: [...seat(SEAT, false), { t: 'pad', at: 'shoulder', w: 8, h: 18, dx: 8 }],
    start: { hip: SEAT, torso: 180, head: 180, arm: { rel: [8, -4], bend: -1 }, leg: { to: [138, 179], bend: 1 } },
    end: { hip: SEAT, torso: 138, head: 120, arm: { rel: [8, -4], bend: -1 }, leg: { to: [138, 179], bend: 1 } } },
  hanging_leg_raise: { view: 'side', equip: 'none', floor: 0, props: [{ t: 'line', x1: 60, y1: 0, x2: 140, y2: 0, w: 5 }],
    start: { shoulder: [99, 54], torso: 180, head: 182, arm: { to: [100, 0], bend: 1 }, leg: { a: 2, b: 0 } },
    end: { shoulder: [99, 54], torso: 174, head: 176, arm: { to: [100, 0], bend: 1 }, leg: { a: 96, b: 92 }, foot: 180 } },
  ab_wheel: { view: 'side', equip: 'wheel',
    start: { hip: [60, 136], torso: 107, head: 110, arm: { to: [108, 172], bend: 1 }, leg: { a: 0, b: -90 }, foot: 0 },
    end: { hip: [99, 164], torso: 110, head: 104, arm: { to: [188, 172], bend: 1 }, leg: { to: [60, 178], bend: 1 }, foot: 0 } }
};

/* ------------------------------------------------------------------ muscle → figure regions */

export type Region = 'chest' | 'abs' | 'upperBack' | 'lowerBack' | 'delt' | 'uarm' | 'farm' | 'glute' | 'thigh' | 'shin';
export const MUSCLE_REGIONS: Record<Muscle, Region[]> = {
  chest: ['chest'], back: ['upperBack', 'lowerBack'], shoulders: ['delt'], biceps: ['uarm'], triceps: ['uarm'], forearms: ['farm'],
  quads: ['thigh'], hamstrings: ['thigh'], glutes: ['glute'], calves: ['shin'], abs: ['abs']
};
