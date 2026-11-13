// MonsGeek RY5088 command set (FUN60 MAX). Every method maps 1:1 to a
// firmware command; see README for the byte layouts.
import { CK7, CK8, HidError } from './hid.js';

export const KEYS = 128; // matrix slots (6 rows x 21 cols, padded)
const CHUNK = 56; // payload bytes per write packet (8 header + 56)

const u8 = (...a) => new Uint8Array(a);
const le16 = (a, i) => a[i] | (a[i + 1] << 8);

// Light effect ids as understood by firmware.
export const LIGHT = {
  Off: 0, AlwaysOn: 1, Breath: 2, Neon: 3, Wave: 4, Ripple: 5, Raindrop: 6,
  Snake: 7, PressAction: 8, Converge: 9, SineWave: 10, Kaleidoscope: 11,
  LineWave: 12, UserPicture: 13, Laser: 14, CircleWave: 15, Dazzle: 16,
  RainDown: 17, Meteor: 18, PressActionOff: 19, Train: 23, Fireworks: 24,
};
const DAZZLE = 7; // RY5088 "l" class swaps these two vs. base class
const NORMAL = 8;
const PRESET_COLORS = [0xff0000, 0x00ff00, 0x0000ff, 0xff5800, 0x7700ff, 0xffff00, 0xffffff];

export const RATES = [8000, 4000, 2000, 1000, 500, 250, 125];

// HE per-key op codes (cmd 0x65 set / 0xE5 get).
export const OP = {
  ACT: 0, REL: 1, RT_PRESS: 2, RT_REL: 3, DKS_TRAVEL: 4, MT_TIME: 5,
  DZ_BOTTOM: 6, MODE: 7, DKS_STAGE: 8, SNAP: 9, DKS_MODES: 10,
  DZ_TOP: 251, SWITCH: 252, LIVE: 254,
};
export const MODE = { normal: 0, dks: 2, mt: 3, tglHold: 4, tglTap: 5, snap: 7 };
const WIDE = new Set([OP.ACT, OP.REL, OP.RT_PRESS, OP.RT_REL, OP.DKS_TRAVEL, OP.DZ_BOTTOM]);

export class Keyboard {
  constructor(transport) {
    this.t = transport;
    this.id = 0;
    this.usb = 0;
    this.rf = 0;
    this.step = 100; // raw units per mm
    this.topDeadzone = false;
  }

  q(bytes, opts) {
    return this.t.xfer(bytes instanceof Uint8Array ? bytes : u8(...bytes), opts);
  }
  send(bytes, ck = CK7) {
    return this.q(bytes, { read: false, ck });
  }

  async identify() {
    const r = await this.q([0x8f]);
    this.id = (r[1] | (r[2] << 8) | (r[3] << 16) | (r[4] << 24)) >>> 0;
    this.usb = le16(r, 7);
    try {
      this.rf = le16(await this.q([0x80]), 1);
    } catch {
      this.rf = 0;
    }
    let precise = false;
    try {
      const f = await this.q([0xe6]);
      if (f[1] === 170) {
        precise = true;
        this.step = [100, 200, 1000][f[2]] ?? 100;
      }
    } catch {}
    if (!precise) {
      const v = this.rf || this.usb;
      this.step = v >= 1280 ? 200 : v >= 768 ? 100 : 10;
    }
    this.topDeadzone = this.rf >= 1024 || this.usb >= 1024;
    return { id: this.id, usb: this.usb, rf: this.rf, step: this.step };
  }

  // ---- paging helpers --------------------------------------------------
  async readPages(head, pageAt, count) {
    const out = new Uint8Array(count * 64);
    const h = u8(...head);
    for (let p = 0; p < count; p++) {
      h[pageAt] = p;
      out.set(await this.q(h, { echo: false }), p * 64);
    }
    return out;
  }

  // head: 8-byte prefix; fill(h, page, len, isLast) writes per-packet fields.
  async writeChunks(head, data, fill, ck = CK7) {
    const n = Math.max(1, Math.ceil(data.length / CHUNK));
    for (let p = 0; p < n; p++) {
      const pkt = new Uint8Array(64);
      pkt.set(head);
      const part = data.subarray(p * CHUNK, (p + 1) * CHUNK);
      fill(pkt, p, part.length, p === n - 1);
      pkt.set(part, 8);
      await this.send(pkt, ck);
    }
  }

  // ---- system ----------------------------------------------------------
  async getProfile() {
    return (await this.q([0x84]))[1];
  }
  async setProfile(p) {
    await this.send([0x04, p]);
    await this.t.settle(120);
  }
  async getRate() {
    return RATES[(await this.q([0x83]))[2]];
  }
  async setRate(hz) {
    await this.send([0x03, 0, Math.max(0, RATES.indexOf(hz))]);
    await this.t.settle();
  }
  async getSleep() {
    const r = await this.q([0x91]);
    return { bt: le16(r, 8), rf: le16(r, 10), btDeep: le16(r, 12), rfDeep: le16(r, 14) };
  }
  async setSleep(s) {
    const b = new Uint8Array(16);
    b[0] = 0x11;
    const put = (i, v) => ((b[i] = v & 255), (b[i + 1] = (v >> 8) & 255));
    put(8, s.bt);
    put(10, s.rf);
    put(12, s.btDeep);
    put(14, s.rfDeep);
    await this.send(b);
    await this.t.settle();
  }
  async getOptions() {
    const r = await this.q([0x89]);
    return {
      os: r[1],
      fnIndex: r[2],
      guard: !!r[3],
      rtStab: r[4] > 5 ? 0 : r[4] * 25,
      wasdSwap: r[5] === 1,
    };
  }
  async setOptions(o) {
    await this.send([0x09, 0, o.fnIndex, o.guard ? 1 : 0, Math.round(o.rtStab / 25), o.wasdSwap ? 1 : 0]);
    await this.t.settle();
  }
  async factoryReset() {
    await this.send([0x01]);
    await this.t.settle(2000);
  }

  // ---- lighting --------------------------------------------------------
  async getLight() {
    const r = await this.q([0x87]);
    const flag = r[4] & 15;
    let rgb = (r[5] << 16) | (r[6] << 8) | r[7];
    if (flag !== DAZZLE && flag !== NORMAL && PRESET_COLORS[flag] !== undefined) rgb = PRESET_COLORS[flag];
    if (rgb === 0xfafafa) rgb = 0xffffff;
    return {
      mode: r[1],
      speed: Math.max(0, 4 - r[2]),
      bright: r[3],
      option: r[4] >> 4,
      dazzle: flag === DAZZLE,
      rgb,
    };
  }
  async setLight(l) {
    const b = new Uint8Array(64);
    b[0] = 0x07;
    b[1] = l.mode;
    b[2] = 4 - l.speed;
    b[3] = l.bright;
    b[4] = l.mode === LIGHT.UserPicture ? l.option << 4 : (l.option << 4) | (l.dazzle ? DAZZLE : NORMAL);
    let rgb = l.rgb === 0xffffff ? 0xfafafa : l.rgb;
    if (l.mode === LIGHT.UserPicture) rgb = 0x00c8c8;
    b[5] = (rgb >> 16) & 255;
    b[6] = (rgb >> 8) & 255;
    b[7] = rgb & 255;
    await this.send(b, CK8);
    await this.t.settle();
  }
  // Per-key colors: 126 slots * RGB (378 bytes). Slot = user picture 0..4.
  async getPicture(slot) {
    const raw = await this.readPages([0x8c, slot, 0xff, 0], 3, 6);
    return raw.subarray(0, 378);
  }
  async setPicture(slot, rgb378) {
    const data = new Uint8Array(392);
    data.set(rgb378.subarray(0, 378));
    for (let p = 0; p < 7; p++) {
      const pkt = new Uint8Array(64);
      pkt.set([0x0c, slot, 0xff, p, p === 6 ? 42 : 56, p === 6 ? 1 : 0]);
      pkt.set(data.subarray(p * 56, p * 56 + 56), 8);
      await this.send(pkt);
    }
    await this.t.settle();
  }

  // ---- keymap ----------------------------------------------------------
  // layer = sub profile (0 = normal, 1..3 used by DKS/MT actions)
  getKeymap(profile, layer = 0) {
    return this.readPages([0x8a, profile, 0xff, 0, layer], 3, 8);
  }
  async setKey(profile, idx, code, layer = 0) {
    const b = new Uint8Array(12);
    b.set([0x0a, profile, idx, 0, 0, 1, layer]);
    b.set(code, 8);
    await this.send(b);
  }
  async setKeymap(profile, matrix, layer = 0) {
    await this.writeChunks(u8(0x0a, profile, 0xff, 0, 0, 0, layer), matrix, (h, p, len, last) => {
      h[3] = p;
      h[4] = len;
      h[5] = last ? 1 : 0;
    });
    await this.t.settle();
  }
  // Fn layers: layer 0/1, os 0 = win, 1 = mac
  getFn(layer, os = 0) {
    return this.readPages([0x90, os, layer, 0xff, 0], 4, 8);
  }
  async setFnKey(layer, idx, code, os = 0) {
    const b = new Uint8Array(12);
    b.set([0x10, os, layer, idx]);
    b.set(code, 8);
    await this.send(b);
  }
  async setFn(layer, matrix, os = 0) {
    const data = new Uint8Array(560);
    data.set(matrix.subarray(0, 512));
    for (let p = 0; p < 10; p++) {
      const pkt = new Uint8Array(64);
      pkt.set([0x10, os, layer, 0xff, p, p === 9 ? 0 : 56, p === 9 ? 1 : 0]);
      pkt.set(data.subarray(p * 56, p * 56 + 56), 8);
      await this.send(pkt);
    }
    await this.t.settle();
  }

  // ---- macros ----------------------------------------------------------
  async getMacro(i) {
    const out = [];
    for (let p = 0; p < 4; p++) {
      const r = await this.q([0x8b, i, p], { echo: false });
      out.push(r);
      if (hasZeroRun(r)) break;
    }
    const buf = new Uint8Array(out.length * 64);
    out.forEach((r, k) => buf.set(r, k * 64));
    return buf;
  }
  async setMacro(i, bytes256) {
    let used = 0;
    for (let s = 0; s < 5; s++) if (bytes256.subarray(s * 56, s * 56 + 56).some((v) => v)) used = s + 1;
    used = Math.max(1, used);
    for (let s = 0; s < used; s++) {
      const pkt = new Uint8Array(64);
      pkt.set([0x0b, i, s, 56, s === used - 1 ? 1 : 0]);
      pkt.set(bytes256.subarray(s * 56, s * 56 + 56), 8);
      await this.send(pkt);
    }
    await this.t.settle();
  }

  // ---- hall effect -----------------------------------------------------
  async getOp(op) {
    const wide = WIDE.has(op) || op === OP.LIVE;
    const pages = op === OP.DKS_MODES ? 8 : wide ? 4 : 2;
    const raw = await this.readPages([0xe5, op, 1, 0], 3, pages);
    if (op === OP.DKS_MODES) return raw.subarray(0, 512);
    if (!wide) return Array.from(raw.subarray(0, KEYS));
    const v = new Array(KEYS);
    for (let k = 0; k < KEYS; k++) v[k] = le16(raw, k * 2);
    return v;
  }
  // Whole-array write: values[] for 128 keys (raw units). `last` commits.
  async setOp(op, values, last) {
    const wide = WIDE.has(op);
    let data;
    if (op === OP.DKS_MODES) data = values;
    else if (wide) {
      data = new Uint8Array(KEYS * 2);
      for (let k = 0; k < KEYS; k++) {
        const v = Math.max(0, Math.round(values[k] || 0));
        data[k * 2] = v & 255;
        data[k * 2 + 1] = (v >> 8) & 255;
      }
    } else data = Uint8Array.from(values.slice(0, KEYS), (v) => Math.max(0, Math.round(v || 0)) & 255);
    await this.writeChunks(u8(0x65, op, 1, 0, 0), data, (h, p, len, isEnd) => {
      h[3] = p;
      h[4] = last && isEnd ? 1 : 0;
    });
  }
  // Single-key write (used for DKS stage bytes and small edits).
  async setOpKey(op, idx, payload, last) {
    const b = new Uint8Array(8 + payload.length);
    b.set([0x65, op, 0, idx, last ? 1 : 0]);
    b.set(payload, 8);
    await this.send(b);
  }
  async calibrate(phase, on) {
    // phase 'min' = 0x1C (rest position), 'max' = 0x1E (bottom out)
    await this.send([phase === 'min' ? 0x1c : 0x1e, on ? 1 : 0]);
    await this.t.settle(100);
  }
  liveTravel() {
    return this.getOp(OP.LIVE);
  }
}

function hasZeroRun(a) {
  for (let i = 0; i + 3 < a.length; i++) if (!a[i] && !a[i + 1] && !a[i + 2] && !a[i + 3]) return true;
  return false;
}

// ---- macro encoding ------------------------------------------------------
// Event list: [{t:'key'|'mouse', code, down, delay}] ; delay ms after event.
export function encodeMacro(events, repeat = 1) {
  const b = new Uint8Array(256);
  b[0] = repeat & 255;
  b[1] = (repeat >> 8) & 255;
  let i = 2;
  for (const e of events) {
    const d = Math.max(1, Math.min(65535, Math.round(e.delay)));
    const need = d <= 127 ? 2 : 4;
    if (i + need > 252) throw new HidError('macro_full', 'Macro too long');
    b[i++] = e.code;
    if (d <= 127) b[i++] = (e.down ? 128 : 0) + d;
    else {
      b[i++] = e.down ? 128 : 0;
      b[i++] = d & 255;
      b[i++] = d >> 8;
    }
  }
  return b;
}

export function decodeMacro(buf) {
  const repeat = buf[0] | (buf[1] << 8);
  const events = [];
  let i = 2;
  while (i + 1 < buf.length) {
    const code = buf[i];
    const f = buf[i + 1];
    if (!code && !f && !buf[i + 2] && !buf[i + 3]) break;
    if (code === 249) break; // mouse move: not authored here
    let delay;
    if (f & 127) {
      delay = f & 127;
      i += 2;
    } else {
      delay = buf[i + 2] | (buf[i + 3] << 8);
      i += 4;
    }
    const mouse = code >= 240 && code <= 244;
    events.push({ t: mouse ? 'mouse' : 'key', code, down: f > 127, delay });
  }
  return { repeat: repeat || 1, events };
}
