import { Transport, hidSupported, pickDevice, knownDevice } from './hid.js';
import { Keyboard, OP, MODE, KEYS } from './proto.js';
import { createKeyboard, segmented, toast, h } from './ui.js';
import { DOM_TO_HID } from './keys.js';
import { HID_TO_IDX, MODELS, KEY_INDEXES, baseHid } from './layout.js';
import { HID } from './keys.js';
import { t, getLang, setLang } from './i18n.js';
import { keymapView } from './views/keymap.js';
import { perfView } from './views/perf.js';
import { lightView } from './views/light.js';
import { macroView } from './views/macro.js';
import { systemView } from './views/system.js';

const VIEWS = { keys: keymapView, perf: perfView, light: lightView, macros: macroView, system: systemView };
const $ = (s) => document.querySelector(s);

// ---- theme + language -------------------------------------------------------
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
function applyTheme(mode) {
  if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode;
  else delete document.documentElement.dataset.theme;
}
let theme = store.get('theme') || 'auto';
applyTheme(theme);
setLang(getLang());

// ---- shell --------------------------------------------------------------------
const kb = createKeyboard($('#kb'));
const toolbar = $('#toolbar');
const panel = $('#panel');
let tab = VIEWS[store.get('tab')] ? store.get('tab') : 'keys';
let view = null;
let tabSeg = null;

const state = { profile: 0 };
let dev = null;
let transport = null;
let cache = {};
let loadingN = 0;

function paintIdle() {
  for (const idx of KEY_INDEXES)
    kb.set(idx, { label: idx === 71 ? 'Fn' : HID[baseHid(idx)]?.label ?? '', sub: '', cls: '', fill: 0, color: '' });
}

function renderChrome() {
  document.title = 'FUN60 MAX';
  $('#hero-title').textContent = t('connectTitle');
  $('#hero-body').textContent = t('connectBody');
  $('#connect').textContent = t('connect');
  $('#lang').textContent = getLang().toUpperCase();
  const nav = $('#tabs');
  nav.textContent = '';
  tabSeg = segmented(Object.keys(VIEWS).map((k) => [k, t(k)]), tab, (k) => switchTab(k), 'nav');
  nav.append(tabSeg);
  if (!hidSupported()) setHeroError(t('noHid'));
  else if (!isSecureContext) setHeroError(t('insecure'));
}

function setHeroError(msg) {
  const el = $('#hero-error');
  el.textContent = msg;
  el.hidden = !msg;
  $('#connect').disabled = !!msg;
}

function setStatus() {
  const pill = $('#status');
  if (!transport) {
    pill.hidden = true;
    return;
  }
  pill.hidden = false;
  const s = transport.status;
  pill.classList.toggle('off', !s.online);
  $('#status-text').textContent = transport.dongle ? `${t('dongle')} · ${s.battery}%` : t('wired');
  pill.style.setProperty('--bat', (transport.dongle ? s.battery : 100) / 100);
}

// ---- context shared with views ------------------------------------------------
const ctx = {
  kb, toolbar, panel, state,
  get dev() { return dev; },
  get transport() { return transport; },
  get board() { return board3d; },
  // Fill the left / right sides of the strip under the keyboard.
  info(left = [], right = []) {
    $('#strip-l').replaceChildren(...[left].flat().filter(Boolean));
    $('#strip-r').replaceChildren(...[right].flat().filter(Boolean));
  },
  loading(on) {
    loadingN += on ? 1 : -1;
    document.body.classList.toggle('loading', loadingN > 0);
  },
  async keymap(profile, layer = 0) {
    const k = `km${profile}:${layer}`;
    return (cache[k] ??= dev.getKeymap(profile, layer).then((a) => new Uint8Array(a)));
  },
  async fnmap(layer) {
    const k = `fn${layer}`;
    return (cache[k] ??= dev.getFn(layer, 0).then((a) => new Uint8Array(a)));
  },
  async he() {
    return (cache.he ??= loadHe());
  },
  async setProfile(p) {
    await dev.setProfile(p);
    state.profile = p;
    delete cache.he;
  },
  invalidate() {
    cache = {};
    state.light = state.opts = state.rate = state.sleep = undefined;
    switchTab(tab, true);
  },
};

async function loadHe() {
  const z = () => new Array(KEYS).fill(0);
  const he = {
    mode: await dev.getOp(OP.MODE),
    act: await dev.getOp(OP.ACT),
    rel: await dev.getOp(OP.REL),
    rtp: await dev.getOp(OP.RT_PRESS),
    rtr: await dev.getOp(OP.RT_REL),
    dzb: await dev.getOp(OP.DZ_BOTTOM),
    dzt: dev.topDeadzone ? await dev.getOp(OP.DZ_TOP) : z(),
    sw: await dev.getOp(OP.SWITCH),
  };
  const modes = new Set(he.mode.map((m) => m & 127));
  he.dks = modes.has(MODE.dks) ? await dev.getOp(OP.DKS_TRAVEL) : z();
  he.dksModes = modes.has(MODE.dks) ? new Uint8Array(await dev.getOp(OP.DKS_MODES)) : new Uint8Array(512);
  he.mt = modes.has(MODE.mt) ? await dev.getOp(OP.MT_TIME) : z();
  he.snap = modes.has(MODE.snap) ? await dev.getOp(OP.SNAP) : z();
  return he;
}

function mountView() {
  view?.destroy?.();
  toolbar.textContent = '';
  panel.textContent = '';
  ctx.info();
  kb.clear();
  paintIdle();
  view = VIEWS[tab](ctx);
  kb.onPointer((type, idx, e, mode) => view?.onKey?.(type, idx, e, mode));
}

function switchTab(k, force) {
  if (k === tab && !force && view) return;
  tab = k;
  store.set('tab', k);
  tabSeg?.set(k);
  if (!dev) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (document.startViewTransition && !reduce) document.startViewTransition(mountView);
  else mountView();
}

// ---- connection ---------------------------------------------------------------
async function connect(device) {
  if (!device) return;
  $('#connect').disabled = true;
  $('#connect').textContent = t('connecting');
  document.body.classList.add('connecting');
  try {
    transport = new Transport(device);
    transport.addEventListener('status', onStatus);
    await transport.open();
    dev = new Keyboard(transport);
    await identifyLoop();
    state.profile = (await dev.getProfile()) ?? 0;
    if (!MODELS[dev.id]) toast(t('unsupported', { id: dev.id }), 'err');
    cache = {};
    setStatus();
    document.body.classList.remove('connecting');
    document.body.classList.add('ready');
    mountView();
  } catch (e) {
    console.error(e);
    toast(e.message || String(e), 'err');
    await disconnect();
  } finally {
    $('#connect').disabled = false;
    $('#connect').textContent = t('connect');
  }
}

async function identifyLoop() {
  for (let i = 0; ; i++) {
    try {
      return await dev.identify();
    } catch (e) {
      if (e.code !== 'offline' || i > 40) throw e;
      if (i === 0) toast(t('asleep'), 'warn');
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

function onStatus() {
  setStatus();
  if (transport && !transport.status.online) toast(t('asleep'), 'warn');
}

async function disconnect() {
  view?.destroy?.();
  view = null;
  try {
    await transport?.close();
  } catch {}
  transport = dev = null;
  cache = {};
  document.body.classList.remove('ready', 'connecting');
  toolbar.textContent = '';
  panel.textContent = '';
  ctx.info();
  kb.clear();
  paintIdle();
  setStatus();
}

// ---- wiring ---------------------------------------------------------------------
$('#connect').addEventListener('click', async () => {
  try {
    await connect(await pickDevice());
  } catch (e) {
    if (e.name !== 'NotFoundError') toast(e.message, 'err');
  }
});
$('#lang').addEventListener('click', () => {
  setLang(getLang() === 'tr' ? 'en' : 'tr');
  renderChrome();
  setStatus();
  if (dev) mountView();
});
$('#theme').addEventListener('click', () => {
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  theme = dark ? 'light' : 'dark';
  store.set('theme', theme);
  const go = () => applyTheme(theme);
  document.startViewTransition ? document.startViewTransition(go) : go();
});
$('#status').addEventListener('click', () => disconnect());

// Real 3D board (WebGL). Loaded after first paint; the CSS board stays as the
// fallback and as the accessible key list underneath.
let board3d = null;
async function load3D() {
  if (board3d || new URLSearchParams(location.search).has('flat')) return;
  try {
    const m = await import('./board3d.js');
    if (!m.supports3D()) return;
    board3d = m.mountBoard3D(kb, $('.board'));
  } catch (e) {
    console.warn('3D board unavailable', e);
  }
}
(window.requestIdleCallback || setTimeout)(load3D);
if (new URLSearchParams(location.search).has('demo')) window.__fun60 = { kb, load3D: () => ((board3d = null), load3D()), setBoard: (b) => (board3d = b) };

// Gentle parallax: the 3D board leans toward the pointer.
{
  const board = $('.board');
  const shell = $('.case');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  board.addEventListener('pointermove', (e) => {
    if (e.buttons || still.matches || innerWidth < 860) return;
    const r = board.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    shell.style.setProperty('--ry', (x * 4).toFixed(2) + 'deg');
    shell.style.setProperty('--rx', (24 - y * 4).toFixed(2) + 'deg');
  });
  board.addEventListener('pointerleave', () => {
    shell.style.removeProperty('--ry');
    shell.style.removeProperty('--rx');
  });
}

// Physical key feedback on the on-screen board.
const typing = (e) => e.target.closest?.('input, textarea, select');
addEventListener('keydown', (e) => {
  if (typing(e)) return;
  const idx = HID_TO_IDX[DOM_TO_HID[e.code]];
  if (idx !== undefined) kb.press(idx, true);
});
addEventListener('keyup', (e) => {
  const idx = HID_TO_IDX[DOM_TO_HID[e.code]];
  if (idx !== undefined) kb.press(idx, false);
});
addEventListener('blur', () => KEY_INDEXES.forEach((i) => kb.press(i, false)));

if (hidSupported()) {
  navigator.hid.addEventListener('disconnect', (e) => {
    if (transport && e.device === transport.dev) disconnect();
  });
  navigator.hid.addEventListener('connect', async (e) => {
    if (!transport) connect(e.device);
  });
}

renderChrome();
paintIdle();
requestAnimationFrame(() => document.body.classList.add('booted'));
if (new URLSearchParams(location.search).has('demo')) {
  import('./mock.js').then((m) => connect(m.createMockDevice()));
} else if (hidSupported()) knownDevice().then((d) => d && connect(d)).catch(() => {});
