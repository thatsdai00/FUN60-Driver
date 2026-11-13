// WebHID transport for MonsGeek RY5088 keyboards (wired and 2.4G dongle).
//
// Wire format: 64-byte feature reports on the vendor interface
// (usage page 0xFFFF, usage 0x02). Byte 7 (or byte 8) carries a checksum:
//   ck = 255 - (sum(bytes[0..n)) & 255)
//
// Over the 2.4G dongle every command is relayed through a small mailbox:
//   F7        -> dongle status (canRead, battery, online, canSend, kind)
//   F6 0A     -> route traffic to the keyboard slot
//   FC        -> "pull" the queued keyboard response into the feature buffer
// The vendor app sleeps ~100 ms between every step. We poll instead, which
// brings a read round trip from ~250 ms down to ~20-40 ms.

const VID = 0x3151;
// RY5088 family. 0x5030 = FUN60 MAX wired, 0x5038 = 8K 2.4G receiver.
export const WIRED_PIDS = new Set([0x5029, 0x502d, 0x502e, 0x502f, 0x5030]);
export const DONGLE_PIDS = new Set([0x5031, 0x5037, 0x5038]);

export const FILTERS = [...DONGLE_PIDS, ...WIRED_PIDS].map((productId) => ({
  vendorId: VID,
  productId,
  usagePage: 0xffff,
  usage: 0x02,
}));

export const CK7 = 7;
export const CK8 = 8;
export const NOCK = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class HidError extends Error {
  constructor(code, msg) {
    super(msg || code);
    this.code = code;
  }
}

export function encode(cmd, ck = CK7) {
  const b = new Uint8Array(64);
  b.set(cmd.length > 64 ? cmd.subarray(0, 64) : cmd);
  if (ck === CK7 || ck === CK8) {
    let s = 0;
    for (let i = 0; i < ck; i++) s += b[i];
    b[ck] = 255 - (s & 255);
  }
  return b;
}

export class Transport extends EventTarget {
  constructor(device) {
    super();
    this.dev = device;
    this.dongle = DONGLE_PIDS.has(device.productId);
    this.rid = 0;
    this.chain = Promise.resolve();
    this.routed = false;
    this.status = { online: !this.dongle, battery: 100, canSend: true, canRead: false };
    this.pollTimer = 0;
    this.busy = 0;
    this.stats = { cmds: 0, ms: 0 };
  }

  async open() {
    if (!this.dev.opened) await this.dev.open();
    for (const c of this.dev.collections) {
      if (c.usagePage === 0xffff && c.featureReports?.length) {
        this.rid = c.featureReports[0].reportId ?? 0;
        break;
      }
    }
    if (this.dongle) {
      await this.run(() => this._status());
      this._startPoll();
    }
    return this;
  }

  async close() {
    clearInterval(this.pollTimer);
    try {
      await this.chain;
    } catch {}
    if (this.dev.opened) await this.dev.close();
  }

  // Serialize every device exchange. One packet in flight, always.
  run(fn) {
    const p = this.chain.then(async () => {
      this.busy++;
      try {
        return await fn();
      } finally {
        this.busy--;
      }
    });
    this.chain = p.catch(() => {});
    return p;
  }

  async _set(bytes) {
    const b = bytes.length === 64 ? bytes : encode(bytes, NOCK);
    await this.dev.sendFeatureReport(this.rid, b);
  }

  async _get() {
    const dv = await this.dev.receiveFeatureReport(this.rid);
    let a = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
    if (this.rid !== 0) a = a.subarray(1);
    return a.slice(0, 64);
  }

  async _status() {
    await this._set(new Uint8Array([0xf7]));
    const r = await this._get();
    const kind = r[6];
    const kb = kind === 1 || kind === 3;
    const s = {
      canRead: kb && r[0] === 1,
      battery: kb ? r[1] : this.status.battery,
      online: kb && r[3] === 0,
      canSend: kb && r[5] === 1,
    };
    const changed = s.online !== this.status.online || s.battery !== this.status.battery;
    this.status = s;
    if (changed) this.dispatchEvent(new CustomEvent('status', { detail: s }));
    return s;
  }

  _startPoll() {
    clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      if (this.busy === 0) this.run(() => this._status()).catch(() => {});
    }, 2500);
  }

  async _waitDongle(key, budgetMs) {
    const t0 = performance.now();
    for (;;) {
      const s = await this._status();
      if (s[key]) return true;
      if (performance.now() - t0 > budgetMs) return false;
    }
  }

  // One request/response exchange. `read` false = fire and forget.
  // `echo` true = response byte 0 must equal command byte 0.
  async xfer(cmd, { ck = CK7, read = true, echo = true, tries = 3 } = {}) {
    const pkt = encode(cmd, ck);
    return this.run(async () => {
      const t0 = performance.now();
      try {
        for (let attempt = 0; attempt < tries; attempt++) {
          const r = this.dongle
            ? await this._xferDongle(pkt, read)
            : await this._xferWired(pkt, read, attempt);
          if (r === true) return true;
          if (r && (!echo || r[0] === pkt[0])) return r;
        }
        throw new HidError('timeout', 'No response from keyboard');
      } finally {
        this.stats.cmds++;
        this.stats.ms += performance.now() - t0;
      }
    });
  }

  async _xferWired(pkt, read, attempt) {
    await this._set(pkt);
    if (!read) return true;
    await sleep(2 + attempt * 8);
    return this._get();
  }

  async _xferDongle(pkt, read) {
    if (!(await this._waitDongle('canSend', 600))) {
      if (!this.status.online) throw new HidError('offline', 'Keyboard is asleep or out of range');
      return null;
    }
    if (!this.routed) {
      await this._set(new Uint8Array([0xf6, 0x0a]));
      this.routed = true;
    }
    await this._set(pkt);
    if (!read) return true;
    if (!(await this._waitDongle('canRead', 500))) return null;
    await this._set(new Uint8Array([0xfc]));
    return this._get();
  }

  // Plain wait that keeps queue order (device settle after flash writes).
  settle(ms = 60) {
    return this.run(() => (this.dongle ? this._waitDongle('canSend', ms * 4) : sleep(ms)));
  }
}

export const hidSupported = () => typeof navigator !== 'undefined' && 'hid' in navigator;

export async function pickDevice() {
  const list = await navigator.hid.requestDevice({ filters: FILTERS });
  return list.find((d) => d.collections.some((c) => c.usagePage === 0xffff)) || list[0];
}

export async function knownDevice() {
  const list = await navigator.hid.getDevices();
  return list.find(
    (d) => d.vendorId === VID && d.collections.some((c) => c.usagePage === 0xffff),
  );
}
