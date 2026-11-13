import { h, segmented, slider, toggle, button, busy, fmt, group, row, stat, column } from '../ui.js';
import { OP, MODE } from '../proto.js';
import { KEY_INDEXES, LIMITS, baseHid, HID_TO_IDX, FN_KEY } from '../layout.js';
import { HID, describe } from '../keys.js';
import { createPicker } from './picker.js';
import { t } from '../i18n.js';

const SWITCHES = [
  [0, 'Gateron / 炫光'], [1, 'Akko Jade / 磁玉'], [2, 'Jade Pro / 磁玉pro'], [3, 'Jade Gaming / 磁玉gaming'],
  [4, 'TTC 天王'], [5, 'TTC 万磁王'],
];
const SVG = 'http://www.w3.org/2000/svg';
const s = (tag, attrs, ...kids) => {
  const el = document.createElementNS(SVG, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  el.append(...kids);
  return el;
};
const keyLabel = (idx) => (idx === FN_KEY ? 'Fn' : HID[baseHid(idx)]?.label ?? '');

// Side view of one key: a keycap riding a rail, next to a ruler with every
// threshold drawn on it. Scale: 0 mm (top) .. 4 mm (bottom).
function travelDiagram() {
  const TOP = 40;
  const BOT = 232;
  const MAX = 4;
  const y = (mm) => TOP + (Math.min(MAX, Math.max(0, mm)) / MAX) * (BOT - TOP);
  const RX = 214; // ruler x
  const Z0 = 236; // zone start
  const Z1 = 504; // zone end
  const svg = s('svg', { viewBox: '0 0 520 262', class: 'travel', role: 'img' });

  const ruler = s('g', { class: 'tv-ruler' });
  for (let mm = 0; mm <= MAX + 1e-9; mm += 0.25) {
    const major = Math.abs(mm - Math.round(mm)) < 1e-9;
    ruler.append(s('line', { x1: RX, x2: RX + (major ? 10 : 5), y1: y(mm), y2: y(mm) }));
    if (major) ruler.append(s('text', { x: RX - 8, y: y(mm) + 4, 'text-anchor': 'end' }, String(mm)));
  }
  ruler.append(s('text', { x: RX - 8, y: TOP - 18, 'text-anchor': 'end', class: 'small' }, 'mm'));

  const dzTop = s('rect', { x: Z0, width: Z1 - Z0, rx: 3, class: 'tv-dz' });
  const dzBot = s('rect', { x: Z0, width: Z1 - Z0, rx: 3, class: 'tv-dz' });
  const rel = s('line', { x1: Z0, x2: Z1, class: 'tv-rel' });
  const act = s('line', { x1: Z0, x2: Z1, class: 'tv-act' });
  const actText = s('text', { x: Z1, 'text-anchor': 'end', class: 'strong' });
  const relText = s('text', { x: Z1, 'text-anchor': 'end' });
  const dzTopText = s('text', { x: Z0 + 6, class: 'small' });
  const dzBotText = s('text', { x: Z0 + 6, class: 'small' });
  const rtDown = s('line', { x1: Z0 + 10, x2: Z0 + 10, class: 'tv-rt' });
  const rtUp = s('line', { x1: Z0 + 22, x2: Z0 + 22, class: 'tv-rt up' });
  const rtText = s('text', { x: Z1, 'text-anchor': 'end', class: 'accent' });
  const rtGroup = s('g', { class: 'tv-rt-g' }, rtDown, rtUp, rtText);

  // rail, keycap and switch plate on the left
  const rail = s('line', { x1: 100, x2: 100, y1: TOP - 30, y2: BOT, class: 'tv-rail' });
  const plate = s('rect', { x: 40, y: BOT + 4, width: 120, height: 8, rx: 4, class: 'tv-plate' });
  const cap = s('g', { class: 'tv-cap' },
    s('rect', { x: 50, y: TOP - 30, width: 100, height: 30, rx: 9, class: 'tv-capbody' }),
    s('rect', { x: 64, y: TOP - 24, width: 72, height: 10, rx: 5, class: 'tv-capdish' }),
  );
  const guide = s('line', { x1: 154, x2: RX - 4, y1: TOP, y2: TOP, class: 'tv-guide' });
  const readout = s('text', { x: 100, y: BOT + 28, 'text-anchor': 'middle', class: 'strong' }, '0.00 mm');
  svg.append(dzTop, dzBot, ruler, rel, act, rtGroup, actText, relText, dzTopText, dzBotText, rail, plate, guide, cap, readout);

  let idleTimer = 0;
  const place = (mm) => {
    cap.style.transform = `translateY(${y(mm) - TOP}px)`;
    guide.style.transform = `translateY(${y(mm) - TOP}px)`;
    readout.textContent = fmt(mm) + ' mm';
  };
  place(0);

  return {
    el: svg,
    // v: {act, rel, rtp, rtr, dzt, dzb, fire}
    update(v, { preview = false } = {}) {
      const ya = y(v.act);
      act.setAttribute('y1', ya);
      act.setAttribute('y2', ya);
      actText.setAttribute('y', ya - 8);
      actText.textContent = t('actuation') + ' ' + fmt(v.act);
      rel.style.opacity = relText.style.opacity = v.fire ? 0 : 1;
      const yr = y(v.rel);
      rel.setAttribute('y1', yr);
      rel.setAttribute('y2', yr);
      relText.setAttribute('y', yr + (Math.abs(yr - ya) < 18 ? 18 : -8));
      relText.textContent = t('release') + ' ' + fmt(v.rel);
      dzTop.setAttribute('y', TOP);
      dzTop.setAttribute('height', Math.max(0, y(v.dzt) - TOP));
      dzTopText.setAttribute('y', TOP + 13);
      dzTopText.textContent = v.dzt >= 0.12 ? t('dzTop') : '';
      dzBot.setAttribute('y', y(MAX - v.dzb));
      dzBot.setAttribute('height', Math.max(0, BOT - y(MAX - v.dzb)));
      dzBotText.setAttribute('y', BOT - 4);
      dzBotText.textContent = v.dzb >= 0.12 ? t('dzBottom') : '';
      rtGroup.style.opacity = v.fire ? 1 : 0;
      rtDown.setAttribute('y1', ya + 4);
      rtDown.setAttribute('y2', y(v.act + v.rtp));
      rtUp.setAttribute('y1', ya + 4);
      rtUp.setAttribute('y2', y(v.act + v.rtr));
      rtText.setAttribute('y', ya + 19);
      rtText.textContent = 'RT  ↓ ' + fmt(v.rtp) + '   ↑ ' + fmt(v.rtr);
      if (preview) {
        place(v.act);
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => place(0), 900);
      }
    },
    live(mm) {
      clearTimeout(idleTimer);
      cap.classList.add('live');
      guide.classList.add('live');
      place(mm);
    },
    rest() {
      cap.classList.remove('live');
      guide.classList.remove('live');
      place(0);
    },
  };
}

export function perfView(ctx) {
  const { kb, dev, state } = ctx;
  const step = dev.step;
  const sel = state.perfSel ?? (state.perfSel = new Set());
  let he = null;
  let draft = {};
  let live = false;
  let pickPartner = false;
  const subMaps = [null, null, null, null];

  const mm = (raw) => raw / step;
  const first = () => sel.values().next().value;

  // ---- toolbar: selection helpers + live view
  // single mode: a click selects one key and zooms in on it
  // multi mode: clicks/drags toggle keys, no zoom (bulk editing)
  let multi = state.perfMulti ?? false;
  const pill = h('button', { type: 'button', class: 'board-pill' });
  pill.addEventListener('click', () => setMulti(!multi));
  document.querySelector('.board')?.append(pill);
  function renderPill() {
    kb.dragSelect = multi; // multi-select paints with drag, single mode rotates
    pill.textContent = multi ? t('multiDone') : t('multiSelect');
    pill.classList.toggle('on', multi);
    pill.hidden = !multi && sel.size === 0;
  }
  function setMulti(on) {
    multi = state.perfMulti = on;
    if (on) ctx.board?.unfocus();
    else if (sel.size) {
      const keep = first();
      sel.clear();
      sel.add(keep);
      syncSel();
      ctx.board?.focus(keep, part);
    }
    renderPill();
  }
  const quick = (label, fn) => button(label, () => { fn(); multi = state.perfMulti = sel.size > 1; ctx.board?.unfocus(); syncSel(); renderPill(); }, 'seg-btn');
  // which switch part the 3D exploded view highlights
  let part = 'stem';
  const bindPart = (el, which) => {
    const go = () => {
      part = which;
      ctx.board?.setPart(which);
    };
    el.addEventListener('pointerdown', go);
    el.addEventListener('focusin', go);
  };
  const liveBtn = button(t('liveOn'), () => setLive(!live), 'chip-btn');
  ctx.toolbar.append(
    h('div', { class: 'btn-group' },
      quick(t('selAll'), () => KEY_INDEXES.forEach((i) => sel.add(i))),
      quick(t('selWasd'), () => { sel.clear(); [26, 4, 22, 7].forEach((hid) => sel.add(HID_TO_IDX[hid])); }),
      quick(t('selInvert'), () => KEY_INDEXES.forEach((i) => (sel.has(i) ? sel.delete(i) : sel.add(i)))),
      quick(t('selNone'), () => sel.clear()),
    ),
    liveBtn,
  );

  // ---- controls
  const L = LIMITS;
  const onAny = (k) => (v) => {
    draft[k] = v;
    dirty();
    diagram.update(values(), { preview: k === 'act' || k === 'rel' });
  };
  const sAct = slider({ label: t('actuation'), ...L.act, value: L.act.def, onInput: onAny('act') });
  const sRel = slider({ label: t('release'), ...L.act, value: L.act.def, onInput: onAny('rel') });
  const tRt = toggle(t('rapid'), false, (v) => { draft.fire = v; renderRt(); dirty(); diagram.update(values()); });
  const sRtp = slider({ label: t('rtPress'), ...L.rt, value: 0.15, onInput: onAny('rtp') });
  const sRtr = slider({ label: t('rtRelease'), ...L.rt, value: 0.15, onInput: onAny('rtr') });
  const sDzt = slider({ label: t('dzTop'), ...L.dz, value: 0.3, onInput: onAny('dzt') });
  const sDzb = slider({ label: t('dzBottom'), ...L.dz, value: 0.3, onInput: onAny('dzb') });
  if (!dev.topDeadzone) sDzt.hidden = true;
  const rtBox = h('div', { class: 'collapse' }, sRtp, sRtr);

  const modeSeg = segmented(
    [[MODE.normal, t('mNormal')], [MODE.dks, t('mDks')], [MODE.mt, t('mMt')], [MODE.tglHold, t('mTgl')], [MODE.snap, t('mSnap')]],
    MODE.normal,
    (v) => {
      draft.mode = v;
      if (v === MODE.tglHold && cur('mode') === MODE.tglTap) draft.mode = MODE.tglTap;
      renderMode();
      dirty();
    },
  );
  const modeBox = h('div', { class: 'mode-box' });
  const modeHelp = h('p', { class: 'li-sub help' });

  const swSel = h('select', { class: 'select' }, SWITCHES.map(([v, n]) => h('option', { value: v }, n)));
  swSel.addEventListener('change', () => { draft.sw = Number(swSel.value); dirty(); });

  const applyBtn = button(t('apply'), apply, 'primary wide');
  const hintRow = h('div', { class: 'callout' }, h('span', { class: 'callout-dot' }), h('span', null, t('selectKeys')));

  const diagram = travelDiagram();
  const modeGroup = group(t('mode'), h('div', { class: 'li stack' }, modeSeg, modeHelp), modeBox);
  const dzGroup = group(t('deadzones'), sDzt, sDzb);
  const left = column(group(t('travel'), h('div', { class: 'travel-wrap' }, diagram.el)), modeGroup);
  const rightBody = column(
    group(t('trigger'), sAct, sRel),
    group(null, tRt, rtBox),
    dzGroup,
    group(null, row(t('switchType'), swSel)),
  );
  const editable = [rightBody, modeGroup];
  [[sAct, 'stem'], [sRel, 'stem'], [tRt, 'sensor'], [sRtp, 'sensor'], [sRtr, 'sensor'], [sDzt, 'spring'], [sDzb, 'spring'], [swSel, 'housing'], [modeSeg, 'stem']].forEach(([el, w]) => bindPart(el, w));
  // keep columns even: deadzones move left when there is room
  left.append(dzGroup);
  const right = column(hintRow, rightBody, applyBtn);
  const cols = h('div', { class: 'cols' }, left, right);
  ctx.panel.append(cols);

  // ---- state helpers
  function cur(field, idx = first()) {
    if (field in draft) return draft[field];
    if (idx === undefined || !he) return undefined;
    const m = he.mode[idx];
    switch (field) {
      case 'mode': return m & 127;
      case 'fire': return (m & 128) !== 0;
      case 'act': return mm(he.act[idx]);
      case 'rel': return mm(he.rel[idx]);
      case 'rtp': return mm(he.rtp[idx]);
      case 'rtr': return mm(he.rtr[idx]);
      case 'dzb': return mm(he.dzb[idx]);
      case 'dzt': return mm(he.dzt[idx]);
      case 'dks': return mm(he.dks[idx]);
      case 'mt': return he.mt[idx] * 10;
      case 'snap': return he.snap[idx];
      case 'sw': return he.sw[idx];
    }
  }
  const mixed = (field) => {
    if (field in draft) return false;
    const v = cur(field);
    for (const i of sel) if (cur(field, i) !== v) return true;
    return false;
  };
  // values shown in the diagram: selection, or the most common key config
  function REP() {
    return HID_TO_IDX[4] ?? KEY_INDEXES[0]; // the A key
  }
  function values() {
    const idx = first() ?? REP();
    const g = (f) => cur(f, idx) ?? 0;
    return { act: g('act'), rel: g('rel'), rtp: g('rtp'), rtr: g('rtr'), dzt: g('dzt'), dzb: g('dzb'), fire: !!g('fire') };
  }

  function dirty() {
    const n = Object.keys(draft).length;
    applyBtn.disabled = !n || !sel.size;
    applyBtn.textContent = sel.size ? t('applyN', { n: sel.size }) : t('apply');
  }

  function renderRt() {
    const on = !!cur('fire');
    rtBox.classList.toggle('closed', !on);
    sRel.classList.toggle('disabled', on);
  }

  const HELP = {
    [MODE.normal]: 'helpNormal', [MODE.dks]: 'helpDks', [MODE.mt]: 'helpMt',
    [MODE.tglHold]: 'helpTgl', [MODE.tglTap]: 'helpTgl', [MODE.snap]: 'helpSnap',
  };

  function renderMode() {
    const m = cur('mode') ?? 0;
    modeSeg.set(m === MODE.tglTap ? MODE.tglHold : m);
    modeHelp.textContent = t(HELP[m] || 'helpNormal');
    modeBox.textContent = '';
    const idx = first();
    if (idx === undefined) return;
    if ((m === MODE.dks || m === MODE.mt) && !subMaps[3]) {
      loadSub().then(() => renderMode());
      modeBox.append(h('div', { class: 'skeleton' }));
      return;
    }
    if (m === MODE.dks) {
      const sDks = slider({ label: t('dksTravel'), ...L.act, value: cur('dks') || 3.0, onInput: (v) => ((draft.dks = v), dirty()) });
      modeBox.append(sDks, h('div', { class: 'li stack' }, dksGrid(idx)));
    } else if (m === MODE.mt) {
      const sMt = slider({ label: t('mtTime'), min: 100, max: 1000, step: 10, unit: 'ms', digits: 0, value: cur('mt') || 200, onInput: (v) => ((draft.mt = v), dirty()) });
      modeBox.append(sMt, slotRow(0, t('mtHold')), slotRow(1, t('mtTap')));
    } else if (m === MODE.tglHold || m === MODE.tglTap) {
      modeBox.append(row(t('tglTrigger'), segmented([[MODE.tglHold, t('tglHold')], [MODE.tglTap, t('tglTap')]], m, (v) => { draft.mode = v; dirty(); }, 'small')));
    } else if (m === MODE.snap) {
      const p = cur('snap');
      const label = pickPartner ? t('snapPick') : p ? keyLabel(p) : '—';
      modeBox.append(row(t('snapPartner'), button(label, () => { pickPartner = !pickPartner; renderMode(); }, pickPartner ? 'live' : '')));
    }
  }

  // DKS: 4 actions x 4 stages, 2 bits each (0 off, 1 tap, 2 hold, 3 hold+)
  function dksGrid(idx) {
    const grid = h('div', { class: 'dks' });
    grid.append(h('span'), ...['dksS1', 'dksS2', 'dksS3', 'dksS4'].map((k) => h('span', { class: 'dks-h' }, t(k))));
    for (let a = 0; a < 4; a++) {
      const code = subMaps[a] ? Array.from(subMaps[a].subarray(idx * 4, idx * 4 + 4)) : [0, 0, 0, 0];
      grid.append(button(describe(code, t).label, () => openSlot(a), 'cap slot'));
      for (let st = 0; st < 4; st++) {
        const cell = h('button', { type: 'button', class: 'dks-c', 'aria-label': t('dksAction', { n: a + 1 }) });
        const read = () => ((draft.dksModes?.[a] ?? he.dksModes[a * 128 + idx]) >> (st * 2)) & 3;
        cell.dataset.v = read();
        cell.onclick = () => {
          draft.dksModes ??= [0, 1, 2, 3].map((k) => he.dksModes[k * 128 + idx]);
          const v = (read() + 1) & 3;
          draft.dksModes[a] = (draft.dksModes[a] & ~(3 << (st * 2))) | (v << (st * 2));
          cell.dataset.v = v;
          dirty();
        };
        grid.append(cell);
      }
    }
    return grid;
  }

  function slotRow(a, label) {
    const idx = first();
    const code = subMaps[a] ? Array.from(subMaps[a].subarray(idx * 4, idx * 4 + 4)) : [0, 0, 0, 0];
    return row(label, button(describe(code, t).label, () => openSlot(a), 'cap slot'));
  }

  // Sub-layer action editing (DKS / Mod-Tap). Writes the key's sub-layer map.
  function openSlot(a) {
    const close = () => {
      sheet.classList.add('out');
      setTimeout(() => sheet.remove(), 220);
    };
    const pick = createPicker(async (code) => {
      const idx = first();
      if (await busy(() => dev.setKey(state.profile, idx, code, a))) subMaps[a]?.set(code, idx * 4);
      close();
      renderMode();
    }, { macros: false });
    const sheet = h('div', { class: 'sheet' },
      h('div', { class: 'sheet-head' }, h('h3', null, t('dksAction', { n: a + 1 })), button('×', close, 'quiet icon')),
      pick,
    );
    document.body.append(sheet);
  }

  function syncControls() {
    const any = sel.size > 0;
    for (const el of [...editable, dzGroup]) el.classList.toggle('inactive', !any);
    hintRow.classList.toggle('closed', any);
    if (!he) return dirty();
    diagram.update(values());
    // with nothing selected, show the representative key's values (read-only)
    const rep = any ? first() : REP();
    const v = (f) => cur(f, rep);
    sAct.set(v('act'), any && mixed('act'));
    sRel.set(v('rel'), any && mixed('rel'));
    tRt.set(v('fire'));
    sRtp.set(v('rtp'), any && mixed('rtp'));
    sRtr.set(v('rtr'), any && mixed('rtr'));
    sDzt.set(v('dzt'), any && mixed('dzt'));
    sDzb.set(v('dzb'), any && mixed('dzb'));
    swSel.value = v('sw') ?? 0;
    if (!any) {
      rtBox.classList.toggle('closed', !v('fire'));
      renderMode();
      return dirty();
    }
    renderRt();
    renderMode();
    dirty();
  }

  function paint() {
    if (!he) return;
    let rt = 0;
    let sum = 0;
    for (const idx of KEY_INDEXES) {
      const m = he.mode[idx] & 127;
      const fire = he.mode[idx] & 128;
      const act = mm(he.act[idx]);
      if (fire) rt++;
      sum += act;
      const tag = m === MODE.dks ? 'DKS' : m === MODE.mt ? 'MT' : m === MODE.snap ? 'SNAP' : m === MODE.tglHold || m === MODE.tglTap ? 'TGL' : fmt(act);
      kb.set(idx, {
        label: keyLabel(idx),
        sub: !sel.size || sel.has(idx) ? tag : '', // only the selection shows values
        cls: [sel.has(idx) ? 'sel' : '', fire ? 'rt' : '', m ? 'special' : ''].join(' '),
        fill: live ? undefined : Math.min(1, act / 3.4).toFixed(3),
      });
    }
    ctx.info(
      [stat(t('selected'), String(sel.size), sel.size ? 'accent' : ''), stat(t('avgAct'), fmt(sum / KEY_INDEXES.length) + ' mm')],
      [stat('Rapid Trigger', rt + ' / ' + KEY_INDEXES.length), stat(t('precision'), (1 / step).toFixed(2) + ' mm')],
    );
  }

  function syncSel() {
    draft = {};
    pickPartner = false;
    paint();
    syncControls();
  }

  async function apply() {
    if (!sel.size || !he) return;
    const next = {
      mode: he.mode.slice(), act: he.act.slice(), rel: he.rel.slice(), rtp: he.rtp.slice(), rtr: he.rtr.slice(),
      dzb: he.dzb.slice(), dzt: he.dzt.slice(), dks: he.dks.slice(), mt: he.mt.slice(), snap: he.snap.slice(), sw: he.sw.slice(),
    };
    const raw = (v) => Math.round(v * step);
    const dksKeys = [];
    for (const i of sel) {
      const mode = 'mode' in draft ? draft.mode : next.mode[i] & 127;
      const fire = 'fire' in draft ? draft.fire : (next.mode[i] & 128) !== 0;
      next.mode[i] = mode | (fire ? 128 : 0);
      if ('act' in draft) next.act[i] = raw(draft.act);
      if ('rel' in draft) next.rel[i] = raw(draft.rel);
      if ('rtp' in draft) next.rtp[i] = raw(draft.rtp);
      if ('rtr' in draft) next.rtr[i] = raw(draft.rtr);
      if ('dzb' in draft) next.dzb[i] = raw(draft.dzb);
      if ('dzt' in draft) next.dzt[i] = raw(draft.dzt);
      if ('dks' in draft) next.dks[i] = raw(draft.dks);
      if ('mt' in draft) next.mt[i] = Math.round(draft.mt / 10);
      if ('sw' in draft) next.sw[i] = draft.sw;
      if (mode === MODE.dks && draft.dksModes) dksKeys.push(i);
    }
    if (draft.snap !== undefined) {
      const a = first();
      const b = draft.snap;
      next.mode[a] = MODE.snap | (next.mode[a] & 128);
      next.mode[b] = MODE.snap | (next.mode[b] & 128);
      next.snap[a] = b;
      next.snap[b] = a;
    }
    const plan = [
      [OP.MODE, 'mode'], [OP.ACT, 'act'], [OP.REL, 'rel'], [OP.RT_PRESS, 'rtp'], [OP.RT_REL, 'rtr'],
      [OP.DZ_BOTTOM, 'dzb'], [OP.DKS_TRAVEL, 'dks'], [OP.MT_TIME, 'mt'], [OP.SNAP, 'snap'],
      ...(dev.topDeadzone ? [[OP.DZ_TOP, 'dzt']] : []),
    ].filter(([, k]) => next[k].some((v, i) => v !== he[k][i]));
    const swChanged = next.sw.some((v, i) => v !== he.sw[i]);
    applyBtn.classList.add('working');
    const ok = await busy(async () => {
      for (let p = 0; p < plan.length; p++) {
        const [op, k] = plan[p];
        await dev.setOp(op, next[k], p === plan.length - 1 && !dksKeys.length && !swChanged);
      }
      for (let n = 0; n < dksKeys.length; n++) {
        await dev.setOpKey(OP.DKS_STAGE, dksKeys[n], draft.dksModes, n === dksKeys.length - 1 && !swChanged);
      }
      if (swChanged) await dev.setOp(OP.SWITCH, next.sw, true);
      await dev.t.settle(150);
    });
    applyBtn.classList.remove('working');
    if (!ok) return;
    Object.assign(he, next);
    for (const i of dksKeys) for (let a = 0; a < 4; a++) he.dksModes[a * 128 + i] = draft.dksModes[a];
    kb.flash([...sel, ...(draft.snap !== undefined ? [draft.snap] : [])]);
    draft = {};
    paint();
    syncControls();
  }

  // ---- live travel
  let liveLoop = null;
  function setLive(on) {
    live = on;
    liveBtn.textContent = on ? t('liveOff') : t('liveOn');
    liveBtn.classList.toggle('on', on);
    kb.root.classList.toggle('live', on);
    kb.root.classList.toggle('gauge', !on);
    if (!on) diagram.rest();
    if (on && !liveLoop) {
      liveLoop = (async () => {
        while (live) {
          try {
            const v = await dev.liveTravel();
            for (const idx of KEY_INDEXES) kb.set(idx, { fill: Math.min(1, v[idx] / step / 4).toFixed(3) });
            const focus = first() ?? KEY_INDEXES.reduce((a, b) => (v[b] > v[a] ? b : a), KEY_INDEXES[0]);
            if (live) diagram.live(v[focus] / step);
          } catch {
            await new Promise((r) => setTimeout(r, 300));
          }
        }
        liveLoop = null;
        paint();
      })();
    }
  }

  let subLoading = null;
  function loadSub() {
    subLoading ||= (async () => {
      for (let a = 0; a < 4; a++) subMaps[a] = await ctx.keymap(state.profile, a);
    })();
    return subLoading;
  }

  async function load() {
    ctx.loading(true);
    try {
      he = await ctx.he();
    } finally {
      ctx.loading(false);
    }
    paint();
    syncControls();
  }

  kb.root.classList.add('gauge');
  renderPill();
  load();
  return {
    onKey(type, idx, e, mode) {
      if (pickPartner && type === 'down') {
        if (idx !== first()) draft.snap = idx;
        pickPartner = false;
        dirty();
        renderMode();
        return;
      }
      if (type === 'down') {
        if (multi) {
          const add = !sel.has(idx);
          add ? sel.add(idx) : sel.delete(idx);
          syncSel();
          renderPill();
          return add;
        }
        // single: replace the selection, or clear it when the same key is hit again
        const same = sel.size === 1 && sel.has(idx);
        sel.clear();
        if (!same) sel.add(idx);
        syncSel();
        renderPill();
        same ? ctx.board?.unfocus() : ctx.board?.focus(idx, part);
        return null;
      }
      if (type === 'drag' && multi) {
        mode ? sel.add(idx) : sel.delete(idx);
        syncSel();
        renderPill();
      }
    },
    destroy() {
      live = false;
      kb.dragSelect = false;
      pill.remove();
      ctx.board?.unfocus();
      kb.root.classList.remove('gauge', 'live');
      document.querySelector('.sheet')?.remove();
    },
  };
}
