import { h, segmented, busy, confirmDialog, group, row, stat, column } from '../ui.js';
import { describe, sameCode, HID, DOM_TO_HID, keyCode } from '../keys.js';
import { KEY_INDEXES, defaultBase, defaultFn, baseHid, FN_KEY } from '../layout.js';
import { createPicker } from './picker.js';
import { t } from '../i18n.js';

const LAYERS = ['base', 'fn0', 'fn1'];
const hexCode = (c) => c.map((v) => v.toString(16).padStart(2, '0')).join(' ').toUpperCase();

export function keymapView(ctx) {
  const { kb, dev, state } = ctx;
  let layer = state.keyLayer ?? 'base';
  let sel = state.keySel ?? 1;
  const maps = {}; // layer -> Uint8Array(512)
  let listening = null;

  const data = () => maps[layer];
  const codeIn = (l, idx) => (maps[l] ? Array.from(maps[l].subarray(idx * 4, idx * 4 + 4)) : null);
  const defIn = (l, idx) => (l === 'base' ? defaultBase(idx) : defaultFn(idx));
  const layerName = (l) => (l === 'base' ? t('base') : 'Fn ' + (Number(l[2]) + 1));

  // ---- toolbar
  const profSeg = segmented([0, 1, 2, 3].map((p) => [p, 'P' + (p + 1)]), state.profile, async (p) => {
    if (!(await busy(() => ctx.setProfile(p), null))) return profSeg.set(state.profile);
    delete maps.base;
    load();
  });
  const layerSeg = segmented(LAYERS.map((l) => [l, layerName(l)]), layer, (v) => setLayer(v));
  ctx.toolbar.append(profSeg, layerSeg);

  // ---- left column
  const heroCap = h('div', { class: 'hero-cap' });
  const heroName = h('div', { class: 'hero-name' });
  const heroCode = h('code', { class: 'mono-chip' });
  const heroDef = h('div', { class: 'li-sub' });
  const hero = h('div', { class: 'key-hero' }, heroCap, h('div', { class: 'key-hero-text' }, heroName, heroDef, heroCode));

  const layerRows = LAYERS.map((l) => {
    const val = h('span', { class: 'li-value' });
    const r = row(layerName(l), val, { cls: 'tap' });
    r.addEventListener('click', () => {
      layerSeg.set(l);
      setLayer(l);
    });
    return { l, r, val };
  });

  const listenRow = row(t('listen'), null, { cls: 'action' });
  listenRow.addEventListener('click', () => (listening ? stopListen() : startListen()));
  const resetRow = row(t('resetKey'), null, { cls: 'action' });
  resetRow.addEventListener('click', () => assign(defIn(layer, sel)));
  const disableRow = row(t('disable'), null, { cls: 'action' });
  disableRow.addEventListener('click', () => assign([0, 0, 0, 0]));
  const resetLayerRow = row(t('resetLayer'), null, { cls: 'action danger' });
  resetLayerRow.addEventListener('click', resetLayer);

  const left = column(
    group(null, hero),
    group(t('inLayers'), ...layerRows.map((x) => x.r)),
    group(t('actions'), listenRow, resetRow, disableRow),
    group(null, resetLayerRow),
  );
  const right = column(group(t('assignTo'), createPicker((code) => assign(code))));
  ctx.panel.append(h('div', { class: 'cols' }, left, right));

  function paint() {
    const d0 = data();
    if (!d0) return;
    let changed = 0;
    let macroKeys = 0;
    for (const idx of KEY_INDEXES) {
      const c = codeIn(layer, idx);
      const d = describe(c, t);
      const mod = !sameCode(c, defIn(layer, idx));
      if (mod) changed++;
      if (d.kind === 'macro') macroKeys++;
      const sub = layer === 'base' ? '' : HID[baseHid(idx)]?.label ?? (idx === FN_KEY ? 'Fn' : '');
      kb.set(idx, {
        label: d.label,
        sub,
        cls: [idx === sel ? 'sel' : '', mod ? 'mod' : '', d.kind === 'off' ? 'off' : ''].join(' '),
      });
    }
    const c = codeIn(layer, sel);
    const d = describe(c, t);
    if (heroCap.textContent !== d.label) {
      heroCap.textContent = d.label;
      heroCap.classList.toggle('long', d.label.length > 4);
      heroCap.classList.remove('pop');
      void heroCap.offsetWidth;
      heroCap.classList.add('pop');
    }
    heroName.textContent = d.name;
    heroDef.textContent = t('original') + ': ' + describe(defIn(layer, sel), t).name;
    heroCode.textContent = hexCode(c);
    for (const { l, r, val } of layerRows) {
      const lc = codeIn(l, sel);
      val.textContent = lc ? describe(lc, t).name : '…';
      r.classList.toggle('current', l === layer);
    }
    ctx.info(
      [stat(t('profile'), 'P' + (state.profile + 1)), stat(t('layer'), layerName(layer))],
      [stat(t('changed'), String(changed), changed ? 'accent' : ''), stat(t('macros'), String(macroKeys))],
    );
  }

  async function fetchLayer(l) {
    if (maps[l]) return;
    maps[l] = l === 'base' ? await ctx.keymap(state.profile, 0) : await ctx.fnmap(Number(l[2]));
  }

  async function load() {
    ctx.loading(true);
    try {
      await fetchLayer(layer);
      paint();
      for (const l of LAYERS) await fetchLayer(l); // fill the "in layers" list
    } finally {
      ctx.loading(false);
    }
    paint();
  }

  async function setLayer(l) {
    layer = state.keyLayer = l;
    if (!maps[l]) await load();
    paint();
  }

  async function assign(code) {
    const m = data();
    if (!m) return;
    const idx = sel;
    const prev = codeIn(layer, idx);
    if (sameCode(prev, code)) return;
    m.set(code, idx * 4);
    paint();
    const l = layer;
    const ok = await busy(() =>
      l === 'base' ? dev.setKey(state.profile, idx, code, 0) : dev.setFnKey(Number(l[2]), idx, code, 0),
    );
    if (!ok) {
      m.set(prev, idx * 4);
      return paint();
    }
    kb.flash([idx]);
  }

  async function resetLayer() {
    const ok = await confirmDialog(t('resetLayer'), t('resetLayerBody', { layer: layerName(layer) }), t('resetGo'));
    if (!ok) return;
    const m = new Uint8Array(512);
    for (const idx of KEY_INDEXES) m.set(defIn(layer, idx), idx * 4);
    const l = layer;
    if (await busy(() => (l === 'base' ? dev.setKeymap(state.profile, m, 0) : dev.setFn(Number(l[2]), m, 0)))) {
      maps[l].set(m);
      paint();
      kb.flash(KEY_INDEXES);
    }
  }

  function startListen() {
    listenRow.classList.add('live');
    listenRow.querySelector('.li-label').textContent = t('listening');
    listening = (e) => {
      const hid = DOM_TO_HID[e.code];
      if (!hid) return;
      e.preventDefault();
      e.stopPropagation();
      stopListen();
      assign(keyCode(hid));
    };
    addEventListener('keydown', listening, true);
  }
  function stopListen() {
    if (listening) removeEventListener('keydown', listening, true);
    listening = null;
    listenRow.classList.remove('live');
    listenRow.querySelector('.li-label').textContent = t('listen');
  }

  load();
  return {
    onKey(type, idx) {
      if (type !== 'down') return;
      sel = state.keySel = idx;
      paint();
    },
    destroy() {
      stopListen();
    },
  };
}
