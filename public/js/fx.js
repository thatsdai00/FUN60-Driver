// Live on-screen approximation of the firmware lighting effects.
// One rAF loop; every key gets an RGB colour + alpha written to --kc.
import { KEY_INDEXES, GEOMETRY } from './layout.js';
import { LIGHT } from './proto.js';

const KEYS = KEY_INDEXES.map((idx) => {
  const g = GEOMETRY[idx];
  return { idx, cx: g.x + g.w / 2, cy: g.y + 0.5, row: g.y, col: Math.floor(g.x + g.w / 2) };
});
const CX = 7.5;
const CY = 2.5;
for (const k of KEYS) {
  k.dist = Math.hypot((k.cx - CX) / 1.6, k.cy - CY);
  k.ang = Math.atan2(k.cy - CY, (k.cx - CX) / 2.2);
  k.seed = Math.sin(k.idx * 12.9898) * 43758.5453;
  k.seed -= Math.floor(k.seed);
}
// serpentine order for "Stream" (zigzag) and a ring walk for the loop option
const ZIG = [...KEYS].sort((a, b) => a.row - b.row || (a.row % 2 ? b.cx - a.cx : a.cx - b.cx));
const LOOP = [...KEYS].sort((a, b) => a.ang - b.ang || a.dist - b.dist);
const zigPos = new Map(ZIG.map((k, i) => [k.idx, i]));
const loopPos = new Map(LOOP.map((k, i) => [k.idx, i]));

const fract = (v) => v - Math.floor(v);
const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
function hsv(h, s = 1, v = 1) {
  h = fract(h) * 6;
  const i = Math.floor(h);
  const f = h - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
}

export function createFx(kb) {
  let L = null;
  let raf = 0;
  let running = false;
  let presses = []; // {k, t}
  let lastReal = -1e9;
  let bursts = [];
  const t0 = performance.now();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  const press = (idx, real = true) => {
    const k = KEYS.find((x) => x.idx === idx);
    if (!k) return;
    const t = (performance.now() - t0) / 1000;
    presses.push({ k, t });
    if (real) lastReal = t;
    if (presses.length > 40) presses.shift();
  };

  function base(k, t, hueShift = 0) {
    if (L.dazzle) return hsv(k.cx / 15 + hueShift + t * 0.05);
    const c = L.rgb;
    return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
  }

  // returns [r,g,b,intensity]
  function shade(k, t, s) {
    const m = L.mode;
    switch (m) {
      case LIGHT.AlwaysOn:
        return [...base(k, t), 1];
      case LIGHT.Breath: {
        const ph = t * s * 0.55;
        const v = 0.5 - 0.5 * Math.cos(ph * Math.PI * 2);
        const c = L.dazzle ? hsv(Math.floor(ph) * 0.17) : base(k, t);
        return [...c, 0.06 + 0.94 * v * v];
      }
      case LIGHT.Neon:
        return [...hsv(t * s * 0.08), 1];
      case LIGHT.Wave: {
        const axis = [-k.cx, k.cx, -k.cy * 1.2, k.cy * 1.2][L.option] ?? -k.cx;
        return [...hsv(axis / 15 + t * s * 0.12), 1];
      }
      case LIGHT.Meteor: {
        const len = 4.5;
        const pos = fract(t * s * 0.22 + fract(k.row * 0.37)) * (15 + len * 2) - len;
        const d = pos - k.cx;
        return [...base(k, t), d >= 0 && d < len ? Math.pow(1 - d / len, 1.6) : 0];
      }
      case LIGHT.Ripple:
      case LIGHT.Laser:
      case LIGHT.PressAction:
      case LIGHT.PressActionOff:
        return reactive(k, t, s, m);
      case LIGHT.Train: {
        const dir = k.row % 2 ? 1 : -1;
        const v = fract((k.cx + dir * t * s * 2.2) / 5);
        return [...base(k, t), v < 0.5 ? 1 : 0.08];
      }
      case LIGHT.RainDown: {
        let v = 0;
        for (let n = 0; n < 2; n++) {
          const ph = fract(t * s * 0.18 + fract(Math.sin((k.col + n * 7.1) * 91.7) * 1e3));
          const y = ph * 8 - 1.5;
          v = Math.max(v, clamp(1 - Math.abs(k.cy - y) * 1.1) * (k.cy <= y + 0.6 ? 1 : 0.4));
        }
        return [...base(k, t), v];
      }
      case LIGHT.Converge: {
        const hgt = (0.5 + 0.5 * Math.sin(t * s * 1.3 + k.col * 0.55)) * 5.2;
        const top = 5 - hgt;
        return [...(L.dazzle ? hsv(k.cy / 6 + t * 0.05) : base(k, t)), k.cy >= top ? 1 : 0.05];
      }
      case LIGHT.Snake: {
        const order = L.option === 1 ? loopPos : zigPos;
        const head = fract(t * s * 0.09) * KEYS.length;
        let d = head - order.get(k.idx);
        if (d < 0) d += KEYS.length;
        return [...base(k, t, -order.get(k.idx) / KEYS.length), d < 9 ? Math.pow(1 - d / 9, 1.4) : 0.04];
      }
      case LIGHT.Raindrop: {
        const v = Math.pow(Math.max(0, Math.sin(t * s * (0.8 + k.seed * 1.6) + k.seed * 40)), 8);
        return [...(L.dazzle ? hsv(k.seed) : base(k, t)), 0.04 + v * 0.96];
      }
      case LIGHT.SineWave: {
        const yy = CY + 2.1 * Math.sin(k.cx * 0.55 - t * s * 1.8);
        return [...base(k, t), clamp(1 - Math.abs(k.cy - yy) * 0.9)];
      }
      case LIGHT.Kaleidoscope: {
        const dir = L.option === 1 ? 1 : -1;
        return [...hsv(k.dist * 0.12 + dir * t * s * 0.15), 1];
      }
      case LIGHT.LineWave: {
        const v = 0.5 + 0.5 * Math.cos(k.dist * 1.5 - t * s * 2.6);
        return [...base(k, t, k.dist * 0.05), 0.08 + 0.92 * v * v];
      }
      case LIGHT.CircleWave: {
        const dir = L.option === 1 ? 1 : -1;
        const a = k.ang / (Math.PI * 2) + dir * t * s * 0.12;
        return L.dazzle ? [...hsv(a), 1] : [...base(k, t), 0.1 + 0.9 * Math.pow(0.5 + 0.5 * Math.cos(a * Math.PI * 2), 3)];
      }
      case LIGHT.Dazzle: {
        const vx = Math.pow(0.5 + 0.5 * Math.cos(k.cx * 0.9 - t * s * 2), 6);
        const vy = Math.pow(0.5 + 0.5 * Math.cos(k.cy * 1.6 + t * s * 1.7), 6);
        return [...hsv(k.cx / 15 + k.cy / 10 + t * 0.06), Math.max(vx, vy, 0.06)];
      }
      case LIGHT.Fireworks: {
        let v = 0;
        let hue = 0;
        for (const b of bursts) {
          const age = t - b.t;
          const r = age * s * 3.2;
          const dx = (k.cx - (b.x + (L.option === 1 ? -1 : 1) * age * 1.4)) / 1.3;
          const d = Math.hypot(dx, k.cy - b.y);
          const ring = clamp(1 - Math.abs(d - r) * 1.2) * clamp(1 - age / 1.6);
          if (ring > v) (v = ring), (hue = b.h);
        }
        return [...(L.dazzle ? hsv(hue) : base(k, t)), v];
      }
      default:
        return [0, 0, 0, 0];
    }
  }

  function reactive(k, t, s, m) {
    let v = 0;
    let hue = 0;
    for (const p of presses) {
      const age = t - p.t;
      if (age < 0) continue;
      let e = 0;
      if (m === LIGHT.PressAction || m === LIGHT.PressActionOff) {
        e = p.k === k ? Math.exp(-age * s * 1.4) : 0;
      } else if (m === LIGHT.Ripple) {
        const d = Math.hypot((k.cx - p.k.cx) / 1.2, k.cy - p.k.cy);
        e = clamp(1 - Math.abs(d - age * s * 5) * 0.9) * clamp(1 - age / 2.2);
      } else {
        // laser: a line racing along the pressed row
        if (k.row === p.k.row) e = clamp(1 - Math.abs(Math.abs(k.cx - p.k.cx) - age * s * 10) * 0.6) * clamp(1 - age / 1.4);
      }
      if (e > v) (v = e), (hue = p.k.cx / 15);
    }
    const c = L.dazzle ? hsv(hue + t * 0.05) : base(k, t);
    if (m === LIGHT.PressActionOff) return [...(L.dazzle ? hsv(k.cx / 15 + t * 0.05) : base(k, t)), 1 - v];
    return [...c, v];
  }

  function frame(now) {
    if (!running || !L) return;
    const t = (now - t0) / 1000;
    const s = 0.35 + L.speed * 0.42;
    // demo input when the user is not typing, so reactive modes stay alive
    if (t - lastReal > 2.5 && (!presses.length || t - presses[presses.length - 1].t > 0.9 / s)) {
      press(KEYS[Math.floor(Math.random() * KEYS.length)].idx, false);
    }
    if (L.mode === LIGHT.Fireworks && (!bursts.length || t - bursts[bursts.length - 1].t > 1.1 / s)) {
      bursts.push({ t, x: 2 + Math.random() * 11, y: 0.5 + Math.random() * 4, h: Math.random() });
      if (bursts.length > 4) bursts.shift();
    }
    const bright = L.mode === LIGHT.Off ? 0 : 0.25 + (L.bright / 4) * 0.75;
    for (const k of KEYS) {
      const [r, g, b, i] = shade(k, t, s);
      const a = Math.round(clamp(i) * bright * 100) / 100;
      kb.set(k.idx, { color: a <= 0.01 ? 'transparent' : `rgb(${(r * 255) | 0} ${(g * 255) | 0} ${(b * 255) | 0} / ${a})` });
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    kb.root.classList.add('fx');
    if (reduce.matches) {
      frame(performance.now() + 2000);
      running = false;
      return;
    }
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    kb.root.classList.remove('fx');
  }
  const vis = () => {
    cancelAnimationFrame(raf);
    if (!document.hidden && running) raf = requestAnimationFrame(frame);
  };
  document.addEventListener('visibilitychange', vis);

  return {
    set(next) {
      L = next;
      if (reduce.matches && running) frame(performance.now() + 2000);
    },
    press,
    start,
    stop,
    destroy() {
      stop();
      document.removeEventListener('visibilitychange', vis);
    },
  };
}
