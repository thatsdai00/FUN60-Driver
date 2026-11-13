import { h, segmented, toggle, button, busy, toast, group, row, stat, column } from '../ui.js';
import { encodeMacro, decodeMacro } from '../proto.js';
import { HID, DOM_TO_HID, describe } from '../keys.js';
import { KEY_INDEXES, baseHid, FN_KEY } from '../layout.js';
import { t } from '../i18n.js';

const MOUSE = { 240: 'LMB', 241: 'RMB', 242: 'MMB', 243: 'M4', 244: 'M5' };
const evName = (e) => (e.t === 'mouse' ? MOUSE[e.code] : HID[e.code]?.name ?? '0x' + e.code.toString(16));
const evLabel = (e) => (e.t === 'mouse' ? MOUSE[e.code] : HID[e.code]?.label ?? '?');
const keyLabel = (idx) => (idx === FN_KEY ? 'Fn' : HID[baseHid(idx)]?.label ?? '');
const TYPES = () => [t('mtRepeat'), t('mtToggle'), t('mtHeld')];

// Piano-roll: one lane per key, a bar from key-down to key-up.
function timeline(events) {
  const wrap = h('div', { class: 'timeline' });
  if (!events.length) return wrap;
  let tm = 0;
  const open = new Map();
  const bars = [];
  const lanes = [];
  for (const e of events) {
    const id = e.t + e.code;
    if (!lanes.includes(id)) lanes.push(id);
    if (e.down) open.set(id, { e, t0: tm });
    else if (open.has(id)) {
      bars.push({ ...open.get(id), t1: tm });
      open.delete(id);
    }
    tm += e.delay;
  }
  for (const [, o] of open) bars.push({ ...o, t1: tm });
  const total = Math.max(tm, 1);
  wrap.style.setProperty('--lanes', lanes.length);
  for (const id of lanes) {
    const lane = h('div', { class: 'lane' });
    const ev = events.find((e) => e.t + e.code === id);
    lane.append(h('span', { class: 'lane-name' }, evLabel(ev)));
    const track = h('div', { class: 'lane-track' });
    bars.filter((b) => b.e.t + b.e.code === id).forEach((b, n) => {
      track.append(h('i', { style: `--a:${(b.t0 / total).toFixed(4)};--b:${(Math.max(b.t1 - b.t0, total * 0.012) / total).toFixed(4)};--n:${n}` }));
    });
    lane.append(track);
    wrap.append(lane);
  }
  wrap.append(h('div', { class: 'tl-axis' }, h('span', null, '0'), h('span', null, Math.round(total) + ' ms')));
  return wrap;
}

export function macroView(ctx) {
  const { kb, dev, state } = ctx;
  let slot = state.macroSlot ?? 0;
  let macro = { repeat: 1, events: [] };
  let rec = false;
  let assigning = false;
  let assignType = 0;
  let keymap = null;
  let fixed = false;

  const slots = h('div', { class: 'slots' });
  const assignedBox = h('div', { class: 'group-box' });
  const tlHost = h('div', { class: 'li stack' });
  const list = h('ol', { class: 'events' });
  const title = h('span', { class: 'editor-title' });
  const meta = h('span', { class: 'li-sub' });
  const repeatIn = h('input', { type: 'number', min: 1, max: 65535, value: 1, class: 'input num' });
  repeatIn.addEventListener('change', () => (macro.repeat = Math.max(1, Number(repeatIn.value) || 1)));
  const recBtn = button(t('record'), () => (rec ? stopRec() : startRec()), 'rec');
  const fixedIn = h('input', { type: 'number', min: 1, max: 65535, value: 20, class: 'input num' });
  fixedIn.disabled = true;
  const fixedT = toggle(t('fixedDelay'), false, (v) => {
    fixed = v;
    fixedIn.disabled = !v;
  });
  const assignBtn = button(t('assign'), () => {
    assigning = !assigning;
    assignBtn.classList.toggle('live', assigning);
    assignBtn.textContent = assigning ? t('assignPick') : t('assign');
  }, 'primary wide');

  ctx.panel.append(
    h('div', { class: 'cols' },
      column(
        group(t('slots'), h('div', { class: 'li stack' }, slots)),
        h('section', { class: 'group' }, h('h4', { class: 'group-title' }, t('assigned')), assignedBox),
        group(t('playback'),
          row(t('repeat'), repeatIn),
          fixedT,
          row(t('delay'), h('span', { class: 'unit-input' }, fixedIn, 'ms')),
          row(t('trigger'), segmented([[0, t('mtRepeat')], [1, t('mtToggle')], [2, t('mtHeld')]], 0, (v) => (assignType = v), 'small')),
        ),
      ),
      column(
        group(null,
          h('div', { class: 'li editor-head' }, h('div', { class: 'li-text' }, title, meta), recBtn),
          tlHost,
          h('div', { class: 'li stack' }, list),
        ),
        h('div', { class: 'btn-row' }, button(t('save'), save), button(t('clearMacro'), clear, 'danger')),
        assignBtn,
      ),
    ),
  );

  function assignedKeys() {
    const out = [];
    if (keymap) for (const idx of KEY_INDEXES) if (keymap[idx * 4] === 9) out.push({ idx, m: keymap[idx * 4 + 2], type: keymap[idx * 4 + 1] });
    return out;
  }

  function renderSlots() {
    slots.textContent = '';
    const used = new Set(assignedKeys().map((a) => a.m));
    for (let i = 0; i < 50; i++) {
      const b = h('button', { type: 'button', class: 'slot-cell' + (i === slot ? ' on' : '') + (used.has(i) ? ' used' : '') }, String(i + 1));
      b.onclick = () => select(i);
      slots.append(b);
    }
    assignedBox.textContent = '';
    const list = assignedKeys();
    if (!list.length) assignedBox.append(row(t('none'), null, { sub: t('assignedSub') }));
    for (const a of list) {
      const r = row(t('macro') + ' ' + (a.m + 1), h('span', { class: 'li-value' }, h('kbd', null, keyLabel(a.idx)), ' · ' + TYPES()[a.type]), { cls: 'tap' });
      r.onclick = () => select(a.m);
      assignedBox.append(r);
    }
    ctx.info(
      [stat(t('macro'), String(slot + 1), 'accent'), stat(t('events'), String(macro.events.length))],
      [stat(t('assigned'), String(list.length)), stat(t('slots'), '50')],
    );
  }

  function renderList() {
    title.textContent = t('macro') + ' ' + (slot + 1);
    const total = macro.events.reduce((a, e) => a + e.delay, 0);
    meta.textContent = macro.events.length ? t('eventsN', { n: macro.events.length }) + ' · ' + total + ' ms' : t('empty');
    repeatIn.value = macro.repeat;
    tlHost.replaceChildren(timeline(macro.events));
    tlHost.hidden = !macro.events.length;
    list.textContent = '';
    if (!macro.events.length) {
      list.append(h('li', { class: 'empty' }, rec ? t('recording') : t('macroHint')));
    }
    macro.events.forEach((e, i) => {
      const d = h('input', { type: 'number', min: 1, max: 65535, value: e.delay, class: 'input num small' });
      d.addEventListener('change', () => {
        e.delay = Math.max(1, Number(d.value) || 1);
        tlHost.replaceChildren(timeline(macro.events));
      });
      list.append(
        h('li', { class: e.down ? 'dn' : 'up' },
          h('span', { class: 'ev-dir' }, e.down ? '↓' : '↑'),
          h('span', { class: 'ev-key' }, evName(e)),
          h('span', { class: 'ev-delay' }, d, 'ms'),
          button('×', () => {
            macro.events.splice(i, 1);
            renderList();
          }, 'quiet icon'),
        ),
      );
    });
    list.scrollTop = list.scrollHeight;
    ctx.info(
      [stat(t('macro'), String(slot + 1), 'accent'), stat(t('events'), String(macro.events.length))],
      [stat(t('assigned'), String(assignedKeys().length)), stat(t('slots'), '50')],
    );
  }

  let last = 0;
  const down = new Set();
  const onKey = (e) => {
    const hid = DOM_TO_HID[e.code];
    if (!hid) return;
    e.preventDefault();
    e.stopPropagation();
    const isDown = e.type === 'keydown';
    if (isDown && down.has(hid)) return;
    isDown ? down.add(hid) : down.delete(hid);
    const now = performance.now();
    if (macro.events.length) macro.events[macro.events.length - 1].delay = Math.max(1, Math.round(now - last));
    last = now;
    macro.events.push({ t: 'key', code: hid, down: isDown, delay: 10 });
    renderList();
  };
  function startRec() {
    macro.events = [];
    rec = true;
    down.clear();
    recBtn.textContent = t('stop');
    recBtn.classList.add('on');
    addEventListener('keydown', onKey, true);
    addEventListener('keyup', onKey, true);
    renderList();
  }
  function stopRec() {
    rec = false;
    removeEventListener('keydown', onKey, true);
    removeEventListener('keyup', onKey, true);
    recBtn.textContent = t('record');
    recBtn.classList.remove('on');
    renderList();
  }

  async function select(i) {
    if (rec) stopRec();
    slot = state.macroSlot = i;
    renderSlots();
    ctx.loading(true);
    try {
      macro = decodeMacro(await dev.getMacro(i));
    } catch {
      macro = { repeat: 1, events: [] };
    } finally {
      ctx.loading(false);
    }
    renderList();
  }

  async function save() {
    if (rec) stopRec();
    const events = fixed ? macro.events.map((e) => ({ ...e, delay: Number(fixedIn.value) || 1 })) : macro.events;
    let bytes;
    try {
      bytes = encodeMacro(events, macro.repeat);
    } catch (e) {
      toast(e.message, 'err');
      return false;
    }
    return busy(() => dev.setMacro(slot, bytes));
  }

  async function clear() {
    macro.events = [];
    renderList();
    await busy(() => dev.setMacro(slot, new Uint8Array(256)));
  }

  function paint() {
    if (!keymap) return;
    for (const idx of KEY_INDEXES) {
      const c = Array.from(keymap.subarray(idx * 4, idx * 4 + 4));
      const d = describe(c, t);
      kb.set(idx, { label: d.kind === 'macro' ? d.label : keyLabel(idx), sub: d.kind === 'macro' ? keyLabel(idx) : '', cls: d.kind === 'macro' ? 'special mod' : '' });
    }
  }

  (async () => {
    ctx.loading(true);
    try {
      keymap = await ctx.keymap(state.profile, 0);
    } finally {
      ctx.loading(false);
    }
    paint();
    renderSlots();
    select(slot);
  })();

  return {
    async onKey(type, idx) {
      if (type !== 'down' || !assigning) return;
      assigning = false;
      assignBtn.classList.remove('live');
      assignBtn.textContent = t('assign');
      if (!(await save())) return;
      const code = [9, assignType, slot, 0];
      if (await busy(() => dev.setKey(state.profile, idx, code, 0))) {
        keymap.set(code, idx * 4);
        paint();
        renderSlots();
        kb.flash([idx]);
      }
    },
    destroy() {
      if (rec) stopRec();
    },
  };
}
