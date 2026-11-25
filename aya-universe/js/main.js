/* For Aya: a small universe written in code. No dependencies. */
{
'use strict';
const $ = s => document.querySelector(s);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const QS = new URLSearchParams(location.search);
const SPEED = Math.max(.1, +QS.get('speed') || 1);
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const E = {
  inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  out: t => 1 - Math.pow(1 - t, 3),
  sine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  lin: t => t
};
const sleep = ms => new Promise(r => setTimeout(r, ms / SPEED));

/* ---------- tweens & skippable waits ---------- */
const tweens = [];
function tween(o, k, to, ms, ease = E.inOut) {
  for (let i = tweens.length; i--;) if (tweens[i].o === o && tweens[i].k === k) { tweens[i].res(); tweens.splice(i, 1); }
  return new Promise(res => tweens.push({ o, k, from: o[k], to, d: Math.max(1, ms / SPEED), t: 0, ease, res }));
}
function stepTweens(dt) {
  for (let i = tweens.length; i--;) {
    const w = tweens[i]; w.t += dt * 1000;
    const p = clamp(w.t / w.d); w.o[w.k] = lerp(w.from, w.to, w.ease(p));
    if (p >= 1) { tweens.splice(i, 1); w.res(); }
  }
}
const skippers = new Set(); let lastSkip = 0;
function wait(ms) {
  return new Promise(res => {
    let t; const done = () => { clearTimeout(t); skippers.delete(done); res(); };
    t = setTimeout(done, ms / SPEED); skippers.add(done);
  });
}
function skip() {
  const now = performance.now();
  if (now - lastSkip < 700 || !skippers.size) return;
  lastSkip = now; [...skippers].forEach(f => f());
}
const hint = $('#hint');
async function hold(ms) { hint.classList.add('on'); await wait(ms); hint.classList.remove('on'); }
const clicked = el => new Promise(r => el.addEventListener('click', () => r(), { once: true }));

/* ---------- sound (all generated live, no recordings) ---------- */
const Snd = {
  ctx: null, on: false, timer: 0, nextBar: 0, bar: 0, barDur: 60 / 66 * 4,
  init() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0; this.master.connect(c.destination);
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.connect(this.master); this.out = comp;
    this.verb = c.createConvolver(); this.verb.buffer = this.impulse(3.4, 2.4);
    const vg = c.createGain(); vg.gain.value = .6; this.verb.connect(vg); vg.connect(comp);
    this.mus = c.createGain(); this.mus.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    this.mus.connect(lp); lp.connect(comp); lp.connect(this.verb);
    this.fx = c.createGain(); this.fx.gain.value = .9; this.fx.connect(comp); this.fx.connect(this.verb);
    this.dry = c.createGain(); this.dry.gain.value = 1; this.dry.connect(comp);
    const n = c.sampleRate * 2, nb = c.createBuffer(1, n, c.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noise = nb; return true;
  },
  impulse(sec, decay) {
    const c = this.ctx, len = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  },
  async enable() {
    if (!this.init()) return false;
    try { await this.ctx.resume(); } catch (e) { return false; }
    this.on = true; const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t); this.master.gain.setValueAtTime(this.master.gain.value, t); this.master.gain.linearRampToValueAtTime(.9, t + 1.2);
    this.mus.gain.cancelScheduledValues(t); this.mus.gain.setValueAtTime(this.mus.gain.value, t); this.mus.gain.linearRampToValueAtTime(.85, t + 4);
    this.nextBar = t + .15;
    clearInterval(this.timer); this.timer = setInterval(() => this.sched(), 200); this.sched();
    return true;
  },
  disable() {
    if (!this.ctx) return; this.on = false; const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t); this.master.gain.setValueAtTime(this.master.gain.value, t); this.master.gain.linearRampToValueAtTime(0, t + .7);
    clearInterval(this.timer);
  },
  duck(v, sec = 2) { if (!this.ctx) return; const t = this.ctx.currentTime, g = this.mus.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + sec); },
  sched() { if (!this.on) return; while (this.nextBar < this.ctx.currentTime + 1.2) { this.scheduleBar(this.nextBar); this.nextBar += this.barDur; } },
  mf: m => 440 * Math.pow(2, (m - 69) / 12),
  PROG: [[41, [57, 60, 64, 67]], [43, [59, 62, 64, 67]], [40, [55, 59, 62, 64]], [45, [57, 60, 64, 71]]],
  scheduleBar(t) {
    const [bass, ch] = this.PROG[this.bar % 4], bd = this.barDur;
    ch.forEach(m => this.pad(this.mf(m), t, bd, .028, this.mus));
    this.pad(this.mf(bass), t, bd, .05, this.mus, 'sine');
    const order = [0, 1, 2, 3, 2, 1, 3, 2];
    for (let i = 0; i < 8; i++) {
      if (Math.random() < (i % 2 ? .38 : .8)) {
        const m = ch[order[(i + this.bar) % 8]] + 12 + (Math.random() < .18 ? 12 : 0);
        this.pluck(this.mf(m), t + i * bd / 8 + rnd(0, .025), .05 * rnd(.55, 1), this.mus);
      }
    }
    this.bar++;
  },
  pad(f, t, dur, v, dest, type = 'triangle') {
    const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1300;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 1.6); g.gain.setValueAtTime(v, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 2.2);
    lp.connect(g); g.connect(dest);
    [-7, 7].forEach(cents => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = cents; o.connect(lp); o.start(t); o.stop(t + dur + 2.4); });
  },
  pluck(f, t, v, dest) {
    const c = this.ctx, g = c.createGain();
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + 2.8); g.connect(dest);
    [[1, 1, 'sine'], [2, .25, 'sine'], [3, .07, 'triangle']].forEach(([m, a, type]) => {
      const o = c.createOscillator(), og = c.createGain(); o.type = type; o.frequency.value = f * m; og.gain.value = a;
      o.connect(og); og.connect(g); o.start(t); o.stop(t + 2.9);
    });
  },
  noiseSrc() { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; return s; },
  tick() {
    if (!this.on) return; const c = this.ctx, t = c.currentTime, s = this.noiseSrc(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.value = rnd(2600, 4200); f.Q.value = 2;
    g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.0001, t + .03);
    s.connect(f); f.connect(g); g.connect(this.dry); s.start(t, rnd(0, 1.5)); s.stop(t + .04);
  },
  heartbeat(v = 1) {
    if (!this.on) return; const c = this.ctx, t = c.currentTime + .03;
    [[0, 1], [.23, .62]].forEach(([d, a]) => {
      [[1, 1], [2.02, .3]].forEach(([m, am]) => {
        const o = c.createOscillator(), g = c.createGain(); o.type = 'sine';
        o.frequency.setValueAtTime(86 * m, t + d); o.frequency.exponentialRampToValueAtTime(40 * m, t + d + .2);
        g.gain.setValueAtTime(.0001, t + d); g.gain.exponentialRampToValueAtTime(.7 * a * am * v, t + d + .012); g.gain.exponentialRampToValueAtTime(.0001, t + d + .4);
        o.connect(g); g.connect(this.dry); o.start(t + d); o.stop(t + d + .45);
      });
    });
  },
  whoosh(dur = 1.8, v = .22) {
    if (!this.on) return; const c = this.ctx, t = c.currentTime, s = this.noiseSrc(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(2400, t + dur * .55); f.frequency.exponentialRampToValueAtTime(500, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur * .5); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.fx); s.start(t); s.stop(t + dur + .05);
  },
  shimmer(v = .05, n = 6) {
    if (!this.on) return; const t = this.ctx.currentTime, notes = [84, 88, 91, 93, 96, 100, 103];
    for (let i = 0; i < n; i++) this.pluck(this.mf(notes[Math.floor(Math.random() * notes.length)]), t + i * .07 + rnd(0, .03), v * rnd(.5, 1), this.fx);
  },
  swell() { if (!this.on) return; const t = this.ctx.currentTime; [53, 60, 64, 69, 72].forEach(m => this.pad(this.mf(m), t, 2.5, .03, this.fx)); },
  rustle() {
    if (!this.on) return; const c = this.ctx, t = c.currentTime, s = this.noiseSrc(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'highpass'; f.frequency.value = 1800;
    g.gain.setValueAtTime(.0001, t);
    for (let i = 0; i < 7; i++) { const tt = t + i * .07 + rnd(0, .03); g.gain.exponentialRampToValueAtTime(rnd(.03, .09), tt + .02); g.gain.exponentialRampToValueAtTime(.002, tt + .06); }
    g.gain.exponentialRampToValueAtTime(.0001, t + .6);
    s.connect(f); f.connect(g); g.connect(this.fx); s.start(t, rnd(0, 1)); s.stop(t + .65);
  },
  chime() { if (!this.on) return; const t = this.ctx.currentTime; [65, 69, 72, 76, 79, 84, 88].forEach((m, i) => this.pluck(this.mf(m), t + i * .11, .09, this.fx)); }
};

/* ---------- canvases ---------- */
const sky = { c: $('#sky'), g: null, dpr: 1, speed: .015, warp: 0, nebA: 1, starA: 1, bright: 0, gold: 0, emberA: 1, px: 0, py: 0, tpx: 0, tpy: 0, stars: [], embers: [], shoots: [], cons: null };
const st = { c: $('#stage'), g: null, dpr: 1 };
sky.g = sky.c.getContext('2d'); st.g = st.c.getContext('2d');
let W = innerWidth, Ht = innerHeight, topSafe = 0;

/* heart geometry: classic parametric heart, normalised so width = 1 */
const N = 480;
const HP = (() => {
  const raw = [];
  for (let i = 0; i < N; i++) { const t = i / N * Math.PI * 2; raw.push([16 * Math.pow(Math.sin(t), 3), -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]); }
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  raw.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
  const w = x1 - x0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return raw.map(([x, y]) => ({ x: (x - cx) / w, y: (y - cy) / w }));
})();
const HRATIO = (() => { let a = 1e9, b = -1e9; HP.forEach(p => { a = Math.min(a, p.y); b = Math.max(b, p.y); }); return b - a; })();
const CUSP = HP[0].y, TIP = HP[N / 2].y;
const HPath = new Path2D(); HP.forEach((p, i) => i ? HPath.lineTo(p.x, p.y) : HPath.moveTo(p.x, p.y)); HPath.closePath();
const SEAM = (() => { const pts = []; const n = 14; for (let i = 0; i <= n; i++) pts.push({ x: i && i < n ? (i % 2 ? .018 : -.014) * (1 - Math.abs(i / n - .5)) : 0, y: lerp(CUSP, TIP, i / n) }); return pts; })();

/* sprites */
function glowSprite(r, g, b, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  const gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.16, `rgba(${r},${g},${b},.95)`); gr.addColorStop(.42, `rgba(${r},${g},${b},.28)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, size, size); return c;
}
function heartSprite(color, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  x.translate(size / 2, size / 2); x.shadowColor = color; x.shadowBlur = size * .18;
  x.scale(size * .62, size * .62); x.fillStyle = color; x.fill(HPath); return c;
}
const SPR = { red: glowSprite(255, 45, 85), pink: glowSprite(255, 150, 180), gold: glowSprite(246, 200, 170), white: glowSprite(255, 232, 238) };
const HSPR = [heartSprite('#ff2d55'), heartSprite('#ff8fab'), heartSprite('#f3c6b5')];

/* lit 3D heart: distance field -> height -> normals -> shading, rendered once */
let HIMG = null, HIS = 1;
function buildHeart(S) {
  const m = Math.round(S * .07), inner = S - 2 * m;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.beginPath(); HP.forEach((p, i) => { const X = S / 2 + p.x * inner, Y = S / 2 + p.y * inner; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath(); g.fill();
  const id = g.getImageData(0, 0, S, S), A = id.data, n = S * S;
  const D = new Float32Array(n), R2 = 1.41421;
  for (let i = 0; i < n; i++) D[i] = A[i * 4 + 3] > 127 ? 1e9 : 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x; if (!D[i]) continue; let v = D[i];
    if (x > 0) v = Math.min(v, D[i - 1] + 1);
    if (y > 0) { v = Math.min(v, D[i - S] + 1); if (x > 0) v = Math.min(v, D[i - S - 1] + R2); if (x < S - 1) v = Math.min(v, D[i - S + 1] + R2); }
    D[i] = v;
  }
  for (let y = S - 1; y >= 0; y--) for (let x = S - 1; x >= 0; x--) {
    const i = y * S + x; if (!D[i]) continue; let v = D[i];
    if (x < S - 1) v = Math.min(v, D[i + 1] + 1);
    if (y < S - 1) { v = Math.min(v, D[i + S] + 1); if (x < S - 1) v = Math.min(v, D[i + S + 1] + R2); if (x > 0) v = Math.min(v, D[i + S - 1] + R2); }
    D[i] = v;
  }
  let dmax = 1; for (let i = 0; i < n; i++) if (D[i] > dmax) dmax = D[i];
  let Hh = new Float32Array(n);
  for (let i = 0; i < n; i++) { const d = D[i] / dmax; Hh[i] = d > 0 ? Math.sqrt(1 - (1 - d) * (1 - d)) : 0; }
  const r = Math.max(2, Math.round(S / 90)), tmp = new Float32Array(n);
  const blur = (src, dst, horiz) => {
    for (let a = 0; a < S; a++) {
      let acc = 0; const len = 2 * r + 1;
      for (let k = -r; k <= r; k++) { const b = clamp(k, 0, S - 1); acc += horiz ? src[a * S + b] : src[b * S + a]; }
      for (let b = 0; b < S; b++) {
        if (horiz) dst[a * S + b] = acc / len; else dst[b * S + a] = acc / len;
        const add = Math.min(S - 1, b + r + 1), rem = Math.max(0, b - r);
        acc += horiz ? src[a * S + add] - src[a * S + rem] : src[add * S + a] - src[rem * S + a];
      }
    }
  };
  for (let p = 0; p < 2; p++) { blur(Hh, tmp, true); blur(tmp, Hh, false); }
  const zs = dmax * .95;
  const L = norm3(-.45, -.62, .64), Hv = norm3(L[0], L[1], L[2] + 1);
  const out = g.createImageData(S, S), O = out.data;
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    const i = y * S + x, a = A[i * 4 + 3]; if (!a) continue;
    const dx = (Hh[i + 1] - Hh[i - 1]) * .5 * zs, dy = (Hh[i + S] - Hh[i - S]) * .5 * zs;
    let nx = -dx, ny = -dy, nz = 1; const ln = Math.hypot(nx, ny, nz); nx /= ln; ny /= ln; nz /= ln;
    const h = Hh[i], ndl = nx * L[0] + ny * L[1] + nz * L[2], wrap = clamp((ndl + .35) / 1.35);
    let R = lerp(.2, .82, wrap), G = lerp(.015, .07, wrap), B = lerp(.05, .17, wrap);
    const sss = h * h; R += .42 * sss; G += .05 * sss; B += .09 * sss;
    const nh = Math.max(0, nx * Hv[0] + ny * Hv[1] + nz * Hv[2]);
    const spec = Math.pow(nh, 110) * 1.5 + Math.pow(nh, 16) * .16;
    const rx = 2 * nz * nx, ry = 2 * nz * ny;
    const box = sstep(.17, .07, Math.abs(rx + .42)) * sstep(.13, .05, Math.abs(ry + .5)) * .55;
    const fr = Math.pow(1 - nz, 2.2);
    const side = clamp(.35 + .65 * (nx * .7 + ny * .45));
    R += fr * (.55 + .5 * side); G += fr * (.12 + .25 * side); B += fr * (.2 + .32 * side);
    const under = clamp(ny) * fr; R += under * .3; B += under * .12;
    R += spec + box; G += spec * .88 + box * .86; B += spec * .9 + box * .88;
    O[i * 4] = clamp(R) * 255; O[i * 4 + 1] = clamp(G) * 255; O[i * 4 + 2] = clamp(B) * 255; O[i * 4 + 3] = a;
  }
  g.putImageData(out, 0, 0);
  HIS = S / inner; return c;
}
function norm3(x, y, z) { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; }
function sstep(edge, soft, v) { return clamp((edge - v) / soft); }

/* ---------- heart actor ---------- */
const H = {
  x: .5, y: .5, size: 200, tx: .5, ty: .5, ts: 200, rate: 2,
  op: 0, spark: 0, sparkPos: 0, draw: 0, edge: 0, fill: 0, flash: 0, aya: 0, glow: 1, open: 0, crack: 0,
  auto: false, bt: 10, period: 1.05, amp: RM ? .025 : .07, audible: 0, waves: [], arcs: []
};
const EP = Array.from({ length: RM ? 14 : 38 }, () => ({ u: Math.random(), v: rnd(.03, .11) * (Math.random() < .5 ? -1 : 1), z: rnd(.5, 1.2), c: Math.random() < .3 ? 'white' : Math.random() < .5 ? 'pink' : 'red' }));
const gauss = (x, m, s) => Math.exp(-(((x - m) / s) ** 2));
const beatEnv = bt => gauss(bt, .08, .06) + .55 * gauss(bt, .31, .075);
function onBeat() {
  H.waves.push({ a: 0 });
  if (H.audible > 0) { Snd.heartbeat(H.audible > 2 ? 1 : .8); H.audible--; }
  if (!RM && H.fill > .5 && H.op > .5) for (let i = 0; i < 6; i++) { const p = HP[Math.floor(Math.random() * N)]; emit({ x: H.x * W + p.x * H.size, y: H.y * Ht + p.y * H.size, vx: p.x * rnd(40, 90), vy: p.y * rnd(40, 90) - 10, max: rnd(.6, 1.2), size: rnd(6, 12), spr: SPR.pink }); }
}
function beatOnce() { H.bt = 0; onBeat(); }
function baseSize() { return Math.min(W * .64, Ht * .44, 440); }
function placeHeart(x, y, size, snap) { H.tx = x; H.ty = y; H.ts = size; if (snap) { H.x = x; H.y = y; H.size = size; } }
function heartAbove(el, maxF = 1, top = topSafe + 62) {
  const r = el.getBoundingClientRect(), avail = Math.max(60, r.top - top - 14);
  const size = Math.max(70, Math.min(baseSize() * maxF, avail * .8 / HRATIO));
  placeHeart(.5, (top + avail / 2) / Ht, size);
}

function drawLit(g, s) { if (HIMG) g.drawImage(HIMG, -s * HIS / 2, -s * HIS / 2, s * HIS, s * HIS); }
let ayaCache = { fs: 0 };
function drawAya(g, s, t) {
  if (H.aya <= 0) return;
  const fs = Math.round(s * .19);
  g.save(); g.globalAlpha *= H.aya;
  g.font = `600 ${fs}px Cinzel, "Cormorant Garamond", serif`; g.textBaseline = 'middle'; g.textAlign = 'left';
  if (ayaCache.fs !== fs) {
    const sp = fs * .16, ws = ['A', 'Y', 'A'].map(ch => g.measureText(ch).width), tw = ws.reduce((a, b) => a + b, 0) + sp * 2;
    const gr = g.createLinearGradient(0, -fs * .55, 0, fs * .55);
    gr.addColorStop(0, '#fff4ee'); gr.addColorStop(.32, '#f6cdbb'); gr.addColorStop(.58, '#c4827f'); gr.addColorStop(.8, '#f8dacd'); gr.addColorStop(1, '#a5585f');
    ayaCache = { fs, sp, ws, tw, gr };
  }
  const { sp, ws, tw, gr } = ayaCache, y = s * .015;
  const drawWord = (dx, dy, style) => { let x = -tw / 2 + dx; g.fillStyle = style; for (let i = 0; i < 3; i++) { g.fillText(i === 1 ? 'Y' : 'A', x, y + dy); x += ws[i] + sp; } };
  g.globalAlpha *= .55; drawWord(0, fs * .045, 'rgba(60,0,12,.9)'); g.globalAlpha /= .55;
  g.shadowColor = 'rgba(255,190,170,.55)'; g.shadowBlur = fs * .35;
  drawWord(0, 0, gr);
  g.shadowBlur = 0;
  const glint = (t * .25) % 1;
  if (!RM && glint < .35) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha *= Math.sin(glint / .35 * Math.PI) * .5; const gx = lerp(-tw, tw, glint / .35); const lg = g.createLinearGradient(gx - fs, 0, gx + fs, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(.5, 'rgba(255,240,235,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); drawWord(0, 0, lg); g.restore(); }
  g.restore();
}
function neonPath(g, p, a, sc) {
  const m = Math.floor(p * N / 2); if (m < 1) return;
  g.beginPath();
  for (let j = -m; j <= m; j++) { const q = HP[(j + N) % N]; j === -m ? g.moveTo(q.x, q.y) : g.lineTo(q.x, q.y); }
  g.lineJoin = g.lineCap = 'round';
  [[18, .05, '255,30,70'], [9, .12, '255,40,80'], [3.4, .42, '255,70,105'], [1.3, .95, '255,222,230']].forEach(([w, al, c]) => { g.lineWidth = w / sc; g.strokeStyle = `rgba(${c},${al * a})`; g.stroke(); });
  return m;
}
function drawHeart(g, t, dt) {
  if (H.op < .004) { H.waves.length = 0; return; }
  const s = H.size, b = beatEnv(H.bt), k = 1 + H.amp * b;
  g.save(); g.translate(H.x * W, H.y * Ht); g.globalAlpha = H.op;
  g.globalCompositeOperation = 'lighter';
  const presence = Math.max(H.fill, H.draw * .5, H.spark * .25);
  const hr = s * (1 + .14 * b + .25 * H.open), ha = (.12 + .2 * presence + .22 * b * H.fill + H.flash * .45 + H.open * .2) * H.glow;
  const hg = g.createRadialGradient(0, -s * .04, 0, 0, -s * .04, hr);
  hg.addColorStop(0, `rgba(255,40,80,${ha})`); hg.addColorStop(.45, `rgba(190,12,50,${ha * .42})`); hg.addColorStop(1, 'rgba(120,0,30,0)');
  g.fillStyle = hg; g.fillRect(-hr, -hr - s * .04, hr * 2, hr * 2);

  if (H.spark > 0 && H.fill < 1) {
    const sy = lerp(0, CUSP * s, E.inOut(H.sparkPos)), pul = 1 + .22 * Math.sin(t * 9), ss = s * .07 * H.spark * pul * (1 - H.draw * .55);
    g.globalAlpha = H.op * H.spark * (1 - H.fill);
    g.drawImage(SPR.red, -ss * 3, sy - ss * 3, ss * 6, ss * 6); g.drawImage(SPR.white, -ss, sy - ss, ss * 2, ss * 2);
    g.globalAlpha = H.op;
  }
  if (H.draw > 0 && H.fill < 1) {
    g.save(); g.scale(s * k, s * k); const m = neonPath(g, H.draw, 1 - H.fill * .8, s * k); g.restore();
    if (m && H.draw < 1) [HP[m % N], HP[(N - m) % N]].forEach(q => { const hs = s * .05; g.drawImage(SPR.white, q.x * s * k - hs, q.y * s * k - hs, hs * 2, hs * 2); g.drawImage(SPR.red, q.x * s * k - hs * 2.5, q.y * s * k - hs * 2.5, hs * 5, hs * 5); });
  }
  if (H.fill > 0) {
    g.globalCompositeOperation = 'source-over';
    const fs = k * (.93 + .07 * E.out(H.fill)), sway = RM ? 1 : 1 - .035 * (1 + Math.sin(t * .55)) * .5;
    g.globalAlpha = H.op * clamp(H.fill * 1.3);
    if (H.open > 0 || H.crack > 0) {
      const o = E.inOut(H.open), tip = TIP * s * fs;
      g.save(); g.globalCompositeOperation = 'lighter';
      const ir = s * (.2 + .7 * o), ia = Math.max(o, H.crack * .5);
      const ig = g.createRadialGradient(0, -s * .05, 0, 0, -s * .05, ir);
      ig.addColorStop(0, `rgba(255,236,226,${.95 * ia})`); ig.addColorStop(.3, `rgba(255,150,170,${.6 * ia})`); ig.addColorStop(1, 'rgba(255,40,80,0)');
      g.fillStyle = ig; g.fillRect(-ir, -ir - s * .05, ir * 2, ir * 2); g.restore();
      [-1, 1].forEach(side => {
        g.save(); g.translate(0, tip); g.rotate(side * o * .34); g.translate(side * o * s * .07, 0); g.translate(0, -tip);
        g.beginPath(); g.rect(side < 0 ? -s * 2 : 0, -s * 2, s * 2, s * 4); g.clip();
        g.scale(fs, fs); drawLit(g, s); drawAya(g, s, t); g.restore();
      });
      if (H.crack > 0 && o < .4) {
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = H.op * H.crack * (1 - o / .4); g.scale(s * fs, s * fs);
        g.beginPath(); SEAM.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
        g.lineJoin = 'round'; [[10, .15, '255,60,100'], [3, .6, '255,170,190'], [1.2, 1, '255,245,240']].forEach(([w, a, c]) => { g.lineWidth = w / (s * fs); g.strokeStyle = `rgba(${c},${a})`; g.stroke(); });
        g.restore();
      }
    } else {
      g.save(); g.scale(fs * sway, fs); drawLit(g, s);
      if (!RM && H.fill > .9) {
        const u = (t % 7) / 7;
        if (u < .45) {
          g.save(); g.scale(s, s); g.clip(HPath); g.scale(1 / s, 1 / s); g.globalCompositeOperation = 'lighter';
          const bx = lerp(-s * 1.1, s * 1.1, u / .45), lg = g.createLinearGradient(bx - s * .3, -s * .3, bx + s * .3, s * .3);
          lg.addColorStop(0, 'rgba(255,200,215,0)'); lg.addColorStop(.5, 'rgba(255,200,215,.16)'); lg.addColorStop(1, 'rgba(255,200,215,0)');
          g.fillStyle = lg; g.fillRect(-s, -s, s * 2, s * 2); g.restore();
        }
      }
      drawAya(g, s, t); g.restore();
      g.save(); g.globalCompositeOperation = 'lighter'; g.scale(s * fs * sway, s * fs);
      g.lineWidth = 1.6 / (s * fs); g.strokeStyle = `rgba(255,90,125,${.32 * H.fill + .2 * b})`; g.stroke(HPath); g.restore();
    }
    g.globalAlpha = H.op;
  }
  g.globalCompositeOperation = 'lighter';
  if (H.edge > 0) {
    for (const p of EP) {
      p.u = (p.u + p.v * dt + 1) % 1;
      const idx = Math.floor(p.u * N) % N, dist = Math.min(idx, N - idx) / (N / 2);
      if (H.fill < .5 && dist > H.draw) continue;
      const dir = p.v > 0 ? -1 : 1;
      for (let q = 0; q < 5; q++) {
        const pt = HP[(idx + dir * q * 4 + N) % N], sz = s * .045 * p.z * (1 - q * .17);
        g.globalAlpha = H.op * H.edge * (1 - q * .2) * (q ? .5 : 1);
        g.drawImage(SPR[p.c], pt.x * s * k - sz, pt.y * s * k - sz, sz * 2, sz * 2);
      }
    }
    if (!RM && Math.random() < .09 * H.edge) H.arcs.push({ i: Math.floor(Math.random() * N), len: Math.floor(rnd(10, 30)), life: 0, seed: Math.random() });
    g.globalAlpha = H.op;
  }
  for (let i = H.arcs.length; i--;) {
    const a = H.arcs[i]; a.life += dt; if (a.life > .14) { H.arcs.splice(i, 1); continue; }
    g.beginPath();
    for (let j = 0; j <= 6; j++) { const q = HP[(a.i + Math.round(a.len * j / 6)) % N], off = j && j < 6 ? (Math.random() - .5) * .05 : 0; const X = (q.x * (1 + off)) * s * k, Y = (q.y * (1 + off)) * s * k; j ? g.lineTo(X, Y) : g.moveTo(X, Y); }
    g.globalAlpha = H.op * H.edge * (1 - a.life / .14);
    g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,215,228,.9)'; g.stroke(); g.lineWidth = 4; g.strokeStyle = 'rgba(255,60,100,.25)'; g.stroke();
  }
  g.globalAlpha = H.op;
  for (let i = H.waves.length; i--;) {
    const w = H.waves[i]; w.a += dt; const age = w.a / 1.5; if (age >= 1) { H.waves.splice(i, 1); continue; }
    const sc = s * k * (1 + E.out(age) * .6);
    g.save(); g.scale(sc, sc); g.globalAlpha = H.op * Math.max(H.fill, .3);
    g.lineWidth = 7 * (1 - age) / sc; g.strokeStyle = `rgba(255,40,80,${(1 - age) ** 2 * .16})`; g.stroke(HPath);
    g.lineWidth = 1.6 * (1 - age) / sc; g.strokeStyle = `rgba(255,120,150,${(1 - age) ** 2 * .6})`; g.stroke(HPath); g.restore();
  }
  g.restore();
}

/* ---------- particles ---------- */
const parts = [], MAXP = RM ? 120 : 800;
function emit(o) { if (parts.length < MAXP) parts.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 6, spr: SPR.red, drag: .985, gy: 0, rot: 0, vr: 0 }, o)); }
function drawParts(g, dt) {
  g.globalCompositeOperation = 'lighter';
  for (let i = parts.length; i--;) {
    const p = parts[i]; p.life += dt; if (p.life >= p.max) { parts.splice(i, 1); continue; }
    const dr = Math.pow(p.drag, dt * 60); p.vx *= dr; p.vy *= dr; p.vy += p.gy * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    const u = p.life / p.max; g.globalAlpha = Math.min(1, p.life * 8) * (1 - u) * (1 - u * .3);
    const sz = p.size * (p.heart ? 1 : 1 - u * .4);
    if (p.heart) { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.drawImage(p.spr, -sz / 2, -sz / 2, sz, sz); g.restore(); }
    else g.drawImage(p.spr, p.x - sz / 2, p.y - sz / 2, sz, sz);
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}
function burst(x, y, n, opts = {}) {
  const sp = opts.speed || 260;
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2), v = rnd(.25, 1) * sp, heart = Math.random() < (opts.hearts || 0);
    emit({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (opts.lift || 0), gy: opts.gy || 0, drag: .965, max: rnd(1.2, 2.6), heart, rot: rnd(-.4, .4), vr: rnd(-1, 1),
      size: heart ? rnd(10, 22) : rnd(5, 14), spr: heart ? HSPR[Math.floor(Math.random() * 3)] : [SPR.pink, SPR.gold, SPR.red, SPR.white][Math.floor(Math.random() * 4)] });
  }
}

/* ---------- sky ---------- */
let bgGrad = null, NEB = null;
function makeNebula() {
  const w = Math.ceil(W / 3), h = Math.ceil(Ht / 3), c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.globalCompositeOperation = 'lighter'; const M = Math.max(w, h);
  [[.5, .6, .7, '120,8,40', .5], [.24, .38, .45, '150,14,52', .32], [.8, .3, .42, '90,8,58', .32], [.62, .82, .38, '200,28,70', .16], [.38, .22, .3, '255,90,130', .07], [.12, .82, .5, '70,4,28', .4], [.9, .72, .4, '110,10,36', .28], [.55, .45, .2, '255,60,100', .08]]
    .forEach(([x, y, r, col, a]) => { const gr = g.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * M); gr.addColorStop(0, `rgba(${col},${a * .62})`); gr.addColorStop(.5, `rgba(${col},${a * .2})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  for (let i = 0; i < 5; i++) { g.save(); g.translate(rnd(0, w), rnd(0, h)); g.rotate(rnd(-1, 1)); g.scale(1, .22); const r = rnd(.2, .45) * M, gr = g.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, 'rgba(255,80,120,.07)'); gr.addColorStop(1, 'rgba(255,80,120,0)'); g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2); g.restore(); }
  return c;
}
const STAR_COL = ['255,240,244', '255,160,185', '248,214,198'];
function initStars() {
  const n = Math.round(clamp(W * Ht / 2600, 140, 460) * (RM ? .6 : 1));
  sky.stars = Array.from({ length: n }, () => ({ x: rnd(-1.5, 1.5), y: rnd(-1.5, 1.5), z: rnd(.2, 1.5), s: Math.pow(Math.random(), 3) * 1.6 + .45, ph: rnd(0, 6.3), tw: rnd(.5, 2.4), c: Math.random() < .12 ? 1 : Math.random() < .12 ? 2 : 0 }));
  if (!sky.embers.length) sky.embers = Array.from({ length: RM ? 10 : 42 }, () => newEmber(true));
}
function newEmber(any) { return { x: rnd(0, W), y: any ? rnd(0, Ht) : Ht + 10, vy: -rnd(6, 22), sw: rnd(0, 6.3), s: rnd(3, 9), life: 0, gold: Math.random() < sky.gold }; }
function drawSky(t, dt) {
  const g = sky.g;
  g.setTransform(sky.dpr, 0, 0, sky.dpr, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.fillStyle = bgGrad; g.fillRect(0, 0, W, Ht);
  sky.px += (sky.tpx - sky.px) * (1 - Math.exp(-dt * 2)); sky.py += (sky.tpy - sky.py) * (1 - Math.exp(-dt * 2));
  g.globalCompositeOperation = 'lighter';
  if (NEB && sky.nebA > 0) {
    g.save(); g.globalAlpha = sky.nebA * (.85 + .15 * Math.sin(t * .1));
    g.translate(W / 2 - sky.px * 10, Ht / 2 - sky.py * 10); if (!RM) g.rotate(Math.sin(t * .02) * .05); const sc = 1.18 + .03 * Math.sin(t * .07);
    g.drawImage(NEB, -W * sc / 2, -Ht * sc / 2, W * sc, Ht * sc); g.restore();
  }
  const speed = RM ? .01 : sky.speed + sky.warp * 2.4, F = Math.max(W, Ht) * .5, cx = W / 2, cy = Ht / 2;
  for (const s of sky.stars) {
    s.z -= speed * dt;
    if (s.z < .12) { s.z = 1.5; s.x = rnd(-1.5, 1.5); s.y = rnd(-1.5, 1.5); }
    const sx = cx + s.x / s.z * F - sky.px * 14 / s.z, sy = cy + s.y / s.z * F - sky.py * 14 / s.z;
    if (sx < -20 || sx > W + 20 || sy < -20 || sy > Ht + 20) continue;
    const a = sky.starA * clamp((1.55 - s.z) / 1.1) * (.55 + .45 * Math.sin(t * s.tw + s.ph)), size = s.s / s.z * .7;
    g.globalAlpha = a;
    if (sky.warp > .04) {
      const z2 = s.z + .04 + sky.warp * .12, px = cx + s.x / z2 * F, py = cy + s.y / z2 * F;
      g.strokeStyle = `rgba(${STAR_COL[s.c]},1)`; g.lineWidth = Math.max(.6, size * .7); g.beginPath(); g.moveTo(px, py); g.lineTo(sx, sy); g.stroke();
    } else if (size < 1.7) { g.fillStyle = `rgb(${STAR_COL[s.c]})`; g.fillRect(sx - size / 2, sy - size / 2, size, size); }
    else { const z = size * 3.2; g.drawImage(s.c === 1 ? SPR.pink : s.c === 2 ? SPR.gold : SPR.white, sx - z / 2, sy - z / 2, z, z); }
  }
  const C = sky.cons;
  if (C && C.a > .005) {
    const ox = -sky.px * 8, oy = -sky.py * 8;
    for (const p of C.pts) { const k = E.out(clamp(C.p * 1.7 - p.d)); p.cx = lerp(p.sx, p.tx, k) + ox; p.cy = lerp(p.sy, p.ty, k) + oy; }
    if (C.l > 0) { g.globalAlpha = C.a * C.l * .26; g.strokeStyle = 'rgb(255,200,212)'; g.lineWidth = .7; g.beginPath(); for (const [i, j] of C.links) { g.moveTo(C.pts[i].cx, C.pts[i].cy); g.lineTo(C.pts[j].cx, C.pts[j].cy); } g.stroke(); }
    for (const p of C.pts) { const z = p.s * (.75 + .25 * Math.sin(t * p.tw + p.ph)); g.globalAlpha = C.a * (.65 + .35 * Math.sin(t * p.tw * 1.3 + p.ph)); g.drawImage(p.c ? SPR.gold : SPR.white, p.cx - z, p.cy - z, z * 2, z * 2); }
  }
  for (let i = 0; i < sky.embers.length; i++) {
    const e = sky.embers[i]; e.life += dt; e.y += e.vy * dt * (RM ? .4 : 1); e.x += Math.sin(t * .6 + e.sw) * 8 * dt;
    if (e.y < -12) { sky.embers[i] = newEmber(false); continue; }
    g.globalAlpha = sky.emberA * clamp(e.life * .5) * (.25 + .25 * Math.sin(t * 1.5 + e.sw)) * clamp(e.y / Ht * 1.6);
    g.drawImage(e.gold ? SPR.gold : SPR.red, e.x - e.s, e.y - e.s, e.s * 2, e.s * 2);
  }
  for (let i = sky.shoots.length; i--;) {
    const s = sky.shoots[i]; s.life += dt; if (s.life > s.max) { sky.shoots.splice(i, 1); continue; }
    s.x += s.vx * dt; s.y += s.vy * dt; const a = Math.sin(s.life / s.max * Math.PI);
    const lg = g.createLinearGradient(s.x, s.y, s.x - s.vx * .12, s.y - s.vy * .12); lg.addColorStop(0, `rgba(255,235,240,${a})`); lg.addColorStop(1, 'rgba(255,90,130,0)');
    g.globalAlpha = 1; g.strokeStyle = lg; g.lineWidth = 1.6; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x - s.vx * .12, s.y - s.vy * .12); g.stroke();
    g.globalAlpha = a; g.drawImage(SPR.white, s.x - 6, s.y - 6, 12, 12);
  }
  if (sky.bright > .002) {
    const R = Math.max(W, Ht) * .85, hx = H.x * W, hy = H.y * Ht, gr = g.createRadialGradient(hx, hy, 0, hx, hy, R);
    gr.addColorStop(0, `rgba(255,50,90,${.34 * sky.bright})`); gr.addColorStop(.4, `rgba(140,10,42,${.2 * sky.bright})`); gr.addColorStop(1, `rgba(50,0,16,${.1 * sky.bright})`);
    g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(0, 0, W, Ht);
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}
function shootingStar(x, y) {
  const a = rnd(Math.PI * .65, Math.PI * .85), v = rnd(500, 800);
  sky.shoots.push({ x: x ?? rnd(W * .3, W), y: y ?? rnd(0, Ht * .4), vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rnd(.7, 1.1) });
}

/* constellation "AYA" */
function buildConstellation(cx, cy, maxW, maxH) {
  const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true });
  let fs = maxH * .8; g.font = `500 ${fs}px Cinzel, serif`;
  const tw = g.measureText('A Y A').width; if (tw > maxW) fs *= maxW / tw;
  g.font = `500 ${fs}px Cinzel, serif`;
  const w = Math.ceil(g.measureText('A Y A').width) + 10, h = Math.ceil(fs * 1.1);
  c.width = w; c.height = h; g.font = `500 ${fs}px Cinzel, serif`; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText('A Y A', 5, h / 2);
  const d = g.getImageData(0, 0, w, h).data, step = Math.max(6, fs / 7.5), pts = [];
  for (let y = step / 2; y < h; y += step) for (let x = step / 2; x < w; x += step) {
    const jx = x + rnd(-step * .25, step * .25), jy = y + rnd(-step * .25, step * .25), ix = Math.round(jx), iy = Math.round(jy);
    if (ix < 0 || iy < 0 || ix >= w || iy >= h) continue;
    if (d[(iy * w + ix) * 4 + 3] > 140) pts.push({ tx: cx - w / 2 + jx, ty: cy - h / 2 + jy, sx: rnd(0, W), sy: rnd(0, Ht), d: rnd(0, .7), s: rnd(2.4, 5.2), ph: rnd(0, 6.3), tw: rnd(.8, 2.2), c: Math.random() < .3 });
  }
  const links = [], lim = step * 1.55;
  pts.forEach((p, i) => {
    const near = pts.map((q, j) => [j, Math.hypot(p.tx - q.tx, p.ty - q.ty)]).filter(([j, dd]) => j > i && dd < lim).sort((a, b) => a[1] - b[1]).slice(0, 2);
    near.forEach(([j]) => links.push([i, j]));
  });
  const old = sky.cons;
  sky.cons = { pts, links, p: old ? old.p : 0, a: old ? old.a : 0, l: old ? old.l : 0 };
  return sky.cons;
}

/* ---------- resize & loop ---------- */
function resize() {
  W = innerWidth; Ht = innerHeight; topSafe = $('#probe').offsetHeight || 0;
  sky.dpr = Math.min(devicePixelRatio || 1, 1.5); st.dpr = Math.min(devicePixelRatio || 1, 2);
  sky.c.width = Math.round(W * sky.dpr); sky.c.height = Math.round(Ht * sky.dpr);
  st.c.width = Math.round(W * st.dpr); st.c.height = Math.round(Ht * st.dpr);
  bgGrad = sky.g.createRadialGradient(W / 2, Ht * .62, 0, W / 2, Ht * .62, Math.max(W, Ht) * .85);
  bgGrad.addColorStop(0, '#16050d'); bgGrad.addColorStop(.5, '#080206'); bgGrad.addColorStop(1, '#030103');
  NEB = makeNebula(); initStars();
  if (relayout) relayout();
}
let relayout = null, rT = 0;
addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(resize, 120); });

let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; const t = now / 1000;
  stepTweens(dt);
  const kk = 1 - Math.exp(-dt * H.rate); H.x += (H.tx - H.x) * kk; H.y += (H.ty - H.y) * kk; H.size += (H.ts - H.size) * kk;
  H.bt += dt; if (H.auto && H.bt >= H.period) { H.bt = 0; onBeat(); }
  drawSky(t, dt);
  const g = st.g; g.setTransform(st.dpr, 0, 0, st.dpr, 0, 0); g.clearRect(0, 0, W, Ht);
  drawHeart(g, t, dt); drawParts(g, dt);
  requestAnimationFrame(frame);
}

/* ---------- pointer: parallax, light trail, taps ---------- */
let started = false, typing = false, fastType = false, scene = 'gate', trailAcc = 0, lx = 0, ly = 0;
addEventListener('pointermove', e => {
  sky.tpx = RM ? 0 : (e.clientX / W - .5) * 2; sky.tpy = RM ? 0 : (e.clientY / Ht - .5) * 2;
  if (!started || RM) return;
  trailAcc += Math.hypot(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY;
  if (trailAcc > 16) { trailAcc = 0; emit({ x: e.clientX, y: e.clientY, vx: rnd(-12, 12), vy: rnd(-24, -4), max: rnd(.5, .9), size: rnd(5, 10), spr: Math.random() < .5 ? SPR.pink : SPR.red }); }
}, { passive: true });
addEventListener('pointerdown', e => {
  if (e.target.closest && e.target.closest('button')) {
    const b = e.target.closest('button'); if (!b.classList.contains('btn')) return;
    const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2, sp = document.createElement('span');
    sp.className = 'ripple'; sp.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    b.appendChild(sp); setTimeout(() => sp.remove(), 900); return;
  }
  if (scene === 'universe' && !e.target.closest('.env-wrap,.paper')) {
    shootingStar(e.clientX + rnd(40, 120), e.clientY - rnd(40, 100));
    burst(e.clientX, e.clientY, RM ? 6 : 16, { speed: 90, hearts: .4, lift: 20 }); Snd.shimmer(.03, 3);
  }
});
addEventListener('pointerup', e => {
  if (!started || (e.target.closest && e.target.closest('button,.env-wrap,.paper,a'))) return;
  if (typing) { fastType = true; return; }
  skip();
});
addEventListener('keydown', e => { if (started && (e.key === ' ' || e.key === 'ArrowRight') && !(e.target.closest && e.target.closest('button,.env-wrap'))) { if (typing) fastType = true; else skip(); } });

/* ---------- scene helpers ---------- */
function show(id) {
  document.querySelectorAll('.scene.on').forEach(s => { if (s.id !== id) s.classList.remove('on'); });
  $('#' + id).classList.add('on'); scene = id;
}
function makeGroup(html, cls) {
  const p = document.createElement('p'); p.className = 'grp ' + cls; let wi = 0;
  html.split('<br>').forEach(line => {
    const l = document.createElement('span'); l.className = 'l';
    line.trim().split(/\s+/).forEach((word, i) => {
      if (i) l.appendChild(document.createTextNode(' '));
      const w = document.createElement('span'); w.className = 'w' + (/AYA/.test(word) && cls.includes('romance') ? ' rg' : '');
      w.textContent = word; w.style.transitionDelay = `${(wi++) * (cls.includes('caps') || cls.includes('question') ? 140 : 110)}ms`; l.appendChild(w);
    });
    p.appendChild(l);
  });
  return p;
}
async function reveal(slot, html, cls) {
  const p = makeGroup(html, cls); slot.appendChild(p);
  p.getBoundingClientRect(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  p.classList.add('shown'); return p;
}
async function conceal(p, ms = 1000) { if (!p) return; p.classList.add('gone'); await sleep(ms); p.remove(); }

/* ---------- the code ---------- */
const CODE = `// aya.universe.js
// some feelings need a whole universe

const universe = {
  oneHeart: true,
  onePerson: "AYA",
  forever: true,
  love: Infinity
};

function myFavoriteChoice() {
  return "AYA";
}

const heart = new Heart(universe);
heart.beatFor(myFavoriteChoice());`;
const TOK = /(\/\/.*$)|("(?:[^"\\]|\\.)*")|\b(const|let|function|return|new|while)\b|\b(true|false|Infinity|null)\b|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)(?=\s*:)|([{}()[\];,.:=])/g;
function tokenize(line) {
  const out = []; let lastI = 0, m; TOK.lastIndex = 0;
  while ((m = TOK.exec(line))) {
    if (m.index > lastI) out.push(['', line.slice(lastI, m.index)]);
    out.push([m[1] ? 'c' : m[2] ? 's' : m[3] ? 'k' : m[4] ? 'b' : m[5] ? 'f' : m[6] ? 'p' : 'u', m[0]]);
    lastI = TOK.lastIndex;
  }
  if (lastI < line.length) out.push(['', line.slice(lastI)]);
  return out;
}
async function typeCode() {
  const pre = $('#codeEl'), body = $('#termBody'), cur = document.createElement('span'); cur.className = 'cursor';
  typing = true;
  const lines = CODE.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = `<span class="ln">${i + 1}</span>`; const src = document.createElement('span'); row.appendChild(src); pre.appendChild(row); src.appendChild(cur);
    for (const [cls, txt] of tokenize(lines[i])) {
      const sp = document.createElement('span'); if (cls) sp.className = 't-' + cls; src.insertBefore(sp, cur);
      if (fastType || RM) { sp.textContent = txt; continue; }
      for (const ch of txt) { sp.textContent += ch; if (ch !== ' ' && Math.random() < .55) Snd.tick(); await sleep(ch === ' ' ? 16 : rnd(24, 58)); if (fastType) { sp.textContent = txt; break; } }
    }
    body.scrollTop = body.scrollHeight;
    if (!fastType) await sleep(lines[i].trim() === '' ? 140 : /[{};]$/.test(lines[i]) ? 320 : 220);
    else await sleep(30);
  }
  typing = false; return cur;
}
async function runOutput(cur) {
  const out = $('#termOut'), status = $('#termStatus');
  status.textContent = 'compiling';
  const rows = [
    ['<span class="dim">$</span> node aya.universe.js', 500],
    ['<span class="ok">✓</span> universe compiled <span class="dim">in 0.0001s</span>', 650],
    ['<span class="ok">✓</span> hearts found: <span class="hl">1</span>', 650],
    ['<span class="ok">→</span> myFavoriteChoice() <span class="dim">returns</span> <span class="hl">"AYA"</span>', 800],
    ['<span class="ok">→</span> love <span class="dim">=</span> <span class="hl">Infinity</span>', 900]
  ];
  cur.remove();
  for (const [h, ms] of rows) { const d = document.createElement('div'); d.innerHTML = h; out.appendChild(d); d.getBoundingClientRect(); d.classList.add('on'); Snd.tick(); $('#termBody').scrollTop = 1e6; await sleep(ms); }
  status.textContent = 'alive';
}

/* ---------- chapters ---------- */
let introAborted = false;
async function chapterCode() {
  const X = () => introAborted;
  show('code'); await sleep(900); if (X()) return;
  $('#term').classList.add('in'); Snd.whoosh(2.4, .1);
  await sleep(2000); if (X()) return;
  const cur = await typeCode(); await sleep(500); if (X()) return;
  await runOutput(cur); if (X()) return;
  await wait(2200); if (X()) return;
  $('#term').classList.add('out'); Snd.whoosh(1.6, .14); await sleep(1500); if (X()) return;
  const slot = $('#codeMsg');
  const a = await reveal(slot, 'Some stories are written with words.', 'romance'); await hold(2600); if (X()) return;
  await conceal(a, 900); if (X()) return;
  const b = await reveal(slot, 'Ours deserves<br>its own universe.', 'romance'); await hold(3000); if (X()) return;
  await conceal(b, 1000);
}
async function chapterWarp() {
  Snd.whoosh(2.6, .26); $('#skip').classList.remove('show');
  await tween(sky, 'warp', 1, RM ? 300 : 1300, E.inOut);
  await sleep(RM ? 100 : 700);
  await tween(sky, 'warp', 0, RM ? 300 : 1900, E.out);
}
async function chapterHeart() {
  show('msg');
  relayout = () => placeHeart(.5, .47, baseSize() * 1.05, true);
  relayout(); H.rate = 2;
  H.op = 1; tween(sky, 'nebA', .75, 2000);
  Snd.shimmer(.03, 3);
  await tween(H, 'spark', 1, 1100, E.out);
  await sleep(1100);
  await tween(H, 'sparkPos', 1, 1100, E.inOut);
  Snd.whoosh(3, .12); tween(H, 'edge', .9, 2600, E.inOut);
  await tween(H, 'draw', 1, RM ? 1400 : 3200, E.sine);
  H.flash = 1; tween(H, 'flash', 0, 1400, E.out);
  burst(W / 2 + 0, H.y * Ht + TIP * H.size, RM ? 10 : 40, { speed: 160 }); Snd.shimmer(.05, 5);
  await sleep(700);
  Snd.swell(); tween(H, 'fill', 1, 2000, E.inOut); H.flash = 1.2; tween(H, 'flash', 0, 2200, E.out);
  await sleep(1500);
  H.auto = true; H.bt = H.period; H.audible = 4;
  tween(H, 'edge', .3, 2500);
  await sleep(1300);
  tween(H, 'aya', 1, 2400, E.inOut); Snd.shimmer(.04, 5);
  await sleep(2400); await hold(4200);
}
async function chapterMessages() {
  const slot = $('#msgSlot');
  slot.style.minHeight = '';
  relayout = () => { slot.style.minHeight = Math.min(Ht * .3, 260) + 'px'; heartAbove(slot, .62); };
  relayout(); H.rate = 1.4;
  await sleep(1400);
  const MS = [
    ['THIS LITTLE UNIVERSE<br>WAS CREATED FOR AYA.', 'caps', 4600],
    ['Out of billions of people,<br>somehow, my heart found you.', 'romance', 5200],
    ['You are not just someone I love.<br>You are the person I want beside me<br>in every chapter of my life.', 'romance', 6600],
    ['Every beautiful future I imagine<br>has you in it.', 'romance', 5200]
  ];
  for (const [h, c, ms] of MS) {
    const p = await reveal(slot, h, c); beatOnce(); Snd.shimmer(.02, 2);
    await sleep(1400); await hold(ms);
    await conceal(p, 1100); await sleep(250);
  }
}
async function chapterDiscover() {
  show('discover'); H.rate = 1.6;
  const btn = $('#discoverBtn'), inside = $('#inside'), next = $('#toUniverse');
  relayout = () => heartAbove(btn, .95); relayout();
  await sleep(1200); btn.classList.add('on');
  await clicked(btn);
  btn.classList.remove('on'); Snd.whoosh(1.4, .12);
  tween(H, 'edge', 1, 600); await tween(H, 'crack', 1, 900, E.inOut); Snd.shimmer(.05, 6);
  relayout = () => heartAbove(inside, .78); relayout();
  tween(H, 'open', 1, RM ? 800 : 1800, E.inOut); Snd.swell();
  const fountain = setInterval(() => {
    const cx = H.x * W, cy = H.y * Ht;
    for (let i = 0; i < (RM ? 1 : 5); i++) { const heart = Math.random() < .35; emit({ x: cx + rnd(-8, 8), y: cy, vx: rnd(-70, 70), vy: rnd(-170, -40), gy: 30, drag: .99, max: rnd(1.4, 2.8), heart, rot: rnd(-.3, .3), vr: rnd(-1, 1), size: heart ? rnd(10, 20) : rnd(6, 13), spr: heart ? HSPR[Math.floor(Math.random() * 3)] : (Math.random() < .5 ? SPR.gold : SPR.pink) }); }
  }, 60);
  setTimeout(() => clearInterval(fountain), 3200 / SPEED);
  await sleep(900);
  inside.classList.add('on');
  const lines = [...inside.querySelectorAll('.l')];
  for (const l of lines) { await sleep(850); l.classList.add('on'); if (l.classList.contains('em')) { beatOnce(); Snd.shimmer(.04, 4); } }
  await sleep(1400); next.classList.add('on');
  await clicked(next);
  next.classList.remove('on'); clearInterval(fountain);
  tween(H, 'open', 0, 1300, E.inOut); tween(H, 'crack', 0, 1300); tween(H, 'edge', .3, 1300);
  inside.classList.remove('on');
  await sleep(1300);
}
async function chapterUniverse() {
  show('universe'); H.rate = 1.2;
  const slot = $('#uniSlot'), actions = $('#uniActions'), bottom = $('#uniBottom');
  slot.style.minHeight = Math.min(Ht * .2, 180) + 'px';
  let consY = 0;
  relayout = () => {
    const top = topSafe + 62, avail = Math.max(120, bottom.getBoundingClientRect().top - top - 10), ch = avail * .36;
    consY = top + ch / 2;
    buildConstellation(W / 2, consY, Math.min(W * .84, 620), ch * .92);
    const hAvail = avail - ch, size = Math.max(70, Math.min(baseSize() * .62, hAvail * .78 / HRATIO));
    placeHeart(.5, (top + ch + hAvail / 2) / Ht, size);
  };
  relayout();
  tween(sky, 'nebA', 1.25, 3000); tween(sky, 'starA', 1.2, 3000);
  Snd.whoosh(2.2, .1);
  await sleep(600);
  tween(sky.cons, 'a', 1, 1500); tween(sky.cons, 'p', 1, RM ? 600 : 3200, E.lin); Snd.shimmer(.04, 6);
  await sleep(RM ? 700 : 2600); tween(sky.cons, 'l', 1, 2200);
  const p = await reveal(slot, 'In a universe full of possibilities,<br>you are my favorite one.', 'romance');
  const shooter = setInterval(() => { if (!RM && Math.random() < .55) shootingStar(); }, 2600);
  await sleep(3200); actions.classList.add('on');
  await clicked($('#toLetter'));
  clearInterval(shooter); actions.classList.remove('on');
  conceal(p, 1000);
  tween(sky.cons, 'a', 0, 1400); tween(sky, 'nebA', .8, 2000); tween(sky, 'starA', 1, 2000);
  tween(H, 'op', 0, 1400);
  await sleep(1300);
}
async function chapterLetter() {
  show('letter'); relayout = null;
  const env = $('#env'), cap = $('#envCap'), pw = $('#paperWrap'), paper = $('#paper'), body = $('#letterBody'), next = $('#toFinal');
  await sleep(600); env.classList.add('in'); await sleep(900); cap.classList.add('on');
  await new Promise(r => {
    const go = () => { env.removeEventListener('click', go); env.removeEventListener('keydown', key); r(); };
    const key = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    env.addEventListener('click', go); env.addEventListener('keydown', key);
  });
  cap.classList.remove('on'); env.classList.add('opened'); Snd.rustle();
  const r = env.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height * .58, RM ? 8 : 34, { speed: 140, hearts: .3 }); Snd.shimmer(.04, 4);
  await sleep(560); env.classList.add('flap-back');
  await sleep(1700);
  env.classList.add('away'); pw.classList.add('in'); Snd.whoosh(1.2, .08);
  await sleep(1300);
  paper.classList.add('unfold-b'); Snd.rustle(); await sleep(950);
  paper.classList.add('unfold-t'); Snd.rustle(); await sleep(1100);
  const ps = [...body.querySelectorAll('p')]; ps.forEach((p, i) => { p.style.transitionDelay = `${i * (RM ? .2 : .85)}s`; });
  body.classList.add('on'); Snd.shimmer(.03, 4);
  await sleep(ps.length * (RM ? 200 : 850) + 1600);
  next.classList.add('on');
  await clicked(next);
  next.classList.remove('on'); pw.classList.remove('in');
  body.style.transition = 'opacity .9s'; body.classList.remove('on');
  paper.style.transition = 'opacity 1.4s ease, transform 1.6s cubic-bezier(.5,0,.3,1)';
  await sleep(1400);
}
async function chapterFinal() {
  show('final'); document.body.classList.add('quiet'); relayout = null;
  const slot = $('#finalSlot'), actions = $('#finalActions');
  Snd.duck(.4, 3);
  tween(sky, 'starA', .45, 3000); tween(sky, 'nebA', .45, 3000); tween(sky, 'emberA', .4, 3000);
  H.auto = false; H.rate = 1; H.open = 0; H.crack = 0; H.edge = .2; H.aya = 1; H.fill = 1; H.draw = 1;
  placeHeart(.5, .47, baseSize() * 1.02, true);
  await sleep(1200);
  await tween(H, 'op', 1, 2400, E.inOut);
  await sleep(900);
  for (let i = 0; i < 3; i++) {
    H.audible = 1; beatOnce(); tween(sky, 'bright', (i + 1) / 3 * .85, 900, E.out); H.glow = 1 + (i + 1) * .25;
    await sleep(1800);
  }
  H.period = 1.2; H.auto = true; H.bt = 0; tween(H, 'edge', .55, 2000);
  Snd.duck(.85, 4); sky.gold = .8; tween(sky, 'emberA', 1.4, 3000); tween(sky, 'starA', .8, 3000);
  relayout = () => {
    const probe = makeGroup('AYA, WILL YOU BE<br>MY FOREVER?', 'question'); probe.style.visibility = 'hidden';
    const o = makeGroup('One heart.<br>One choice.<br>One lifetime.<br>You.', 'ones'); probe.appendChild(o); slot.appendChild(probe);
    slot.style.setProperty('--finalH', probe.getBoundingClientRect().height + 'px'); probe.remove();
    heartAbove(slot, .72);
  };
  relayout();
  await sleep(800);
  let p = await reveal(slot, 'AYA…', 'caps big'); Snd.shimmer(.04, 4);
  await sleep(1600); await hold(2600); await conceal(p, 1200); await sleep(500);
  p = await reveal(slot, 'Among all the possibilities in this universe,<br>I would still choose you.', 'romance');
  await sleep(1600); await hold(4600); await conceal(p, 1200); await sleep(500);
  p = await reveal(slot, 'I DON’T JUST WANT A LOVE STORY WITH YOU.<br>I WANT A LIFETIME.', 'caps');
  await sleep(2200); await hold(4800); await conceal(p, 1300); await sleep(900);
  beatOnce(); Snd.swell(); tween(sky, 'bright', 1, 1500);
  const q = await reveal(slot, 'AYA, WILL YOU BE<br>MY FOREVER?', 'question');
  await sleep(2600);
  const ones = makeGroup('One heart.<br>One choice.<br>One lifetime.<br>You.', 'ones'); ones.classList.add('shown'); q.appendChild(ones);
  const ls = [...ones.querySelectorAll('.l')];
  for (const l of ls) { await sleep(1100); l.classList.add('on'); }
  Snd.shimmer(.05, 6);
  await sleep(2200); actions.classList.add('on');
}
async function celebrate() {
  const yes = $('#yes'), actions = $('#finalActions');
  await clicked(yes);
  Snd.chime(); H.period = .75; H.audible = 2; beatOnce();
  const cx = H.x * W, cy = H.y * Ht;
  burst(cx, cy, RM ? 30 : 160, { speed: 420, hearts: .45, gy: 60 });
  setTimeout(() => burst(cx, cy, RM ? 20 : 120, { speed: 300, hearts: .6, gy: 40 }), 500 / SPEED);
  sky.bright = 1.4; tween(sky, 'bright', 1, 2500);
  for (let i = 0; i < 4; i++) setTimeout(() => shootingStar(), i * 600);
  yes.classList.add('fade'); yes.style.opacity = '0'; yes.style.pointerEvents = 'none';
  await sleep(500); yes.remove();
  const f = document.createElement('p'); f.className = 'forever fade'; f.textContent = 'Then forever starts now.';
  actions.prepend(f); f.getBoundingClientRect(); f.classList.add('on');
  await sleep(3500); H.period = 1.1;
}

/* ---------- boot ---------- */
async function main(withSound) {
  started = true;
  $('#gate').classList.remove('on');
  $('#music').classList.add('show');
  if (withSound) setMusic(true);
  $('#skip').classList.add('show');
  await sleep(1400);
  let skipped = false;
  const skipP = new Promise(r => $('#skip').addEventListener('click', () => { skipped = true; r(); }, { once: true }));
  await Promise.race([chapterCode(), skipP]);
  if (skipped) { introAborted = true; fastType = true; hint.classList.remove('on'); [...skippers].forEach(f => f()); $('#term').classList.add('out'); $('#codeMsg').innerHTML = ''; await sleep(700); }
  $('#skip').classList.remove('show'); $('#codeMsg').innerHTML = '';
  await chapterWarp();
  await chapterHeart();
  await chapterMessages();
  await chapterDiscover();
  await chapterUniverse();
  await chapterLetter();
  await chapterFinal();
  await celebrate();
}
async function setMusic(on) {
  const b = $('#music');
  if (on) { const ok = await Snd.enable(); b.setAttribute('aria-pressed', ok ? 'true' : 'false'); $('#musicLabel').textContent = ok ? 'Music on' : 'No audio'; b.setAttribute('aria-label', ok ? 'Mute music' : 'Audio unavailable'); }
  else { Snd.disable(); b.setAttribute('aria-pressed', 'false'); $('#musicLabel').textContent = 'Music off'; b.setAttribute('aria-label', 'Play music'); }
}
$('#music').addEventListener('click', () => setMusic(!Snd.on));
$('#replay').addEventListener('click', () => location.reload());

(async () => {
  resize();
  requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
  const fontsReady = (async () => {
    try { await Promise.all(['600 64px Cinzel', '500 64px Cinzel', 'italic 400 32px "Cormorant Garamond"', '400 14px "JetBrains Mono"'].map(f => document.fonts.load(f))); } catch (e) { }
  })();
  await Promise.race([fontsReady, sleep(3500)]);
  await new Promise(r => setTimeout(r, 30));
  const S = Math.round(clamp(baseSize() * 1.15 * st.dpr, 320, 900));
  HIMG = buildHeart(S);
  $('#loadTxt').style.opacity = '0';
  $('#gateActions').classList.add('on'); $('#gateNote').classList.add('on');
  $('#startSound').addEventListener('click', () => main(true), { once: true });
  $('#startQuiet').addEventListener('click', () => main(false), { once: true });
  if (QS.has('auto')) main(false);
})();
}
