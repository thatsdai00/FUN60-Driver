// In-memory FUN60 MAX emulator behind a WebHID-shaped device (?demo).
// Speaks the same 2.4G dongle protocol as the real receiver.
import { KEY_INDEXES, defaultBase, defaultFn } from './layout.js';

export function createMockDevice() {
  const km = [0, 1, 2, 3].map(() => [0, 1, 2, 3].map(() => new Uint8Array(512)));
  for (const p of km) for (const idx of KEY_INDEXES) p[0].set(defaultBase(idx), idx * 4);
  const fn = [0, 1].map(() => {
    const m = new Uint8Array(512);
    for (const idx of KEY_INDEXES) m.set(defaultFn(idx), idx * 4);
    return m;
  });
  const macros = [...Array(50)].map(() => new Uint8Array(256));
  macros[0].set([5, 0, 4, 158, 4, 30, 5, 158, 5, 30, 6, 158, 6, 30]);
  const pics = [...Array(5)].map(() => new Uint8Array(392));
  const ops = {};
  const wide = (v) => {
    const b = new Uint8Array(256);
    for (let k = 0; k < 128; k++) (b[k * 2] = v & 255), (b[k * 2 + 1] = v >> 8);
    return b;
  };
  ops[7] = new Uint8Array(128).fill(0x80);
  ops[0] = wide(100); ops[1] = wide(100); ops[2] = wide(50); ops[3] = wide(150); ops[6] = wide(30);
  ops[4] = wide(0); ops[5] = new Uint8Array(128); ops[9] = new Uint8Array(128); ops[251] = new Uint8Array(128);
  ops[252] = new Uint8Array(128); ops[10] = new Uint8Array(512);
  let light = [4, 0, 4, 7, 0xfa, 0xff, 0xfa];
  let opts = [0, 0, 0, 0, 0];
  let sleep = [120, 0, 44, 1, 12, 3, 224, 1];
  let profile = 0;
  let rate = 0;
  let pending = new Uint8Array(64);
  let next = new Uint8Array(64);
  let canRead = false;
  const down = new Set();
  addEventListener('keydown', (e) => down.add(e.code));
  addEventListener('keyup', (e) => down.delete(e.code));

  const page = (buf, p) => {
    const out = new Uint8Array(64);
    out.set(buf.subarray(p * 64, p * 64 + 64));
    return out;
  };
  const reply = (...a) => {
    const r = new Uint8Array(64);
    r.set(a);
    return r;
  };

  function live() {
    const b = new Uint8Array(256);
    const t = performance.now() / 600;
    KEY_INDEXES.forEach((idx, n) => {
      const v = Math.max(0, Math.sin(t + n * 0.35)) * 380;
      b[idx * 2] = v & 255;
      b[idx * 2 + 1] = v >> 8;
    });
    return b;
  }

  function handle(d) {
    switch (d[0]) {
      case 0x8f: return reply(0x8f, 0xe3, 0x0c, 0, 0, 0, 0, 0, 0x04);
      case 0x80: return reply(0x80);
      case 0xe6: return reply(0xe6);
      case 0x84: return reply(0x84, profile);
      case 0x04: profile = d[1]; return null;
      case 0x83: return reply(0x83, 0, rate);
      case 0x03: rate = d[2]; return null;
      case 0x87: return reply(0x87, ...light);
      case 0x07: light = Array.from(d.subarray(1, 8)); return null;
      case 0x89: return reply(0x89, ...opts);
      case 0x09: opts = [0, d[2], d[3], d[4], d[5]]; return null;
      case 0x91: { const r = reply(0x91); r.set(sleep, 8); return r; }
      case 0x11: sleep = Array.from(d.subarray(8, 16)); return null;
      case 0x8a: return page(km[d[1]][d[4]], d[3]);
      case 0x0a:
        if (d[2] === 0xff) km[d[1]][d[6]].set(d.subarray(8, 8 + d[4]), d[3] * 56);
        else km[d[1]][d[6]].set(d.subarray(8, 12), d[2] * 4);
        return null;
      case 0x90: return page(fn[d[2]], d[4]);
      case 0x10:
        if (d[3] === 0xff) fn[d[2]].set(d.subarray(8, 8 + Math.min(56, 512 - d[4] * 56)), d[4] * 56);
        else fn[d[2]].set(d.subarray(8, 12), d[3] * 4);
        return null;
      case 0x8b: return page(macros[d[1]], d[2]);
      case 0x0b: macros[d[1]].set(d.subarray(8, 8 + Math.min(56, 256 - d[2] * 56)), d[2] * 56); if (d[4]) macros[d[1]].fill(0, d[2] * 56 + 56); return null;
      case 0x8c: return page(pics[d[1]], d[3]);
      case 0x0c: pics[d[1]].set(d.subarray(8, 8 + d[4]), d[3] * 56); return null;
      case 0xe5: return page(d[1] === 254 ? live() : ops[d[1]], d[3]);
      case 0x65: {
        const buf = ops[d[1]];
        if (!buf) return null;
        if (d[2] === 1) buf.set(d.subarray(8, 8 + Math.min(56, buf.length - d[3] * 56)), d[3] * 56);
        else if (d[1] === 8) for (let a = 0; a < 4; a++) ops[10][a * 128 + d[3]] = d[8 + a];
        else if ([0, 1, 2, 3, 4, 6].includes(d[1])) buf.set(d.subarray(8, 10), d[3] * 2);
        else buf[d[3]] = d[8];
        return null;
      }
      default: return null;
    }
  }

  const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
  return {
    vendorId: 0x3151,
    productId: 0x5038,
    productName: 'FUN60 MAX (demo)',
    opened: false,
    collections: [{ usagePage: 0xffff, usage: 2, featureReports: [{ reportId: 0 }] }],
    async open() { this.opened = true; },
    async close() { this.opened = false; },
    async sendFeatureReport(id, data) {
      await sleepMs(1);
      const d = new Uint8Array(data);
      if (d[0] === 0xf7) next = reply(canRead ? 1 : 0, 100, 0, 0, 1, 1, 1);
      else if (d[0] === 0xf6) {}
      else if (d[0] === 0xfc) { next = pending; canRead = false; }
      else {
        const r = handle(d);
        if (r) { pending = r; canRead = true; }
      }
    },
    async receiveFeatureReport() {
      await sleepMs(1);
      return new DataView(next.slice().buffer);
    },
  };
}
