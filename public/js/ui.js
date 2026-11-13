import { GEOMETRY, KEY_INDEXES, WIDTH, HEIGHT } from './layout.js';
import { t } from './i18n.js';

// ---- tiny DOM builder ------------------------------------------------------
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

export const fmt = (mm) => mm.toFixed(2);

// ---- controls --------------------------------------------------------------
export function segmented(items, value, onChange, cls = '') {
  const root = h('div', { class: 'seg ' + cls, role: 'tablist' });
  const thumb = h('i', { class: 'seg-thumb' });
  root.append(thumb);
  const btns = items.map(([v, label]) => {
    const b = h('button', { type: 'button', role: 'tab' }, label);
    b.addEventListener('click', () => {
      if (b.disabled) return;
      set(v);
      onChange(v);
    });
    root.append(b);
    return [v, b];
  });
  function set(v) {
    value = v;
    btns.forEach(([bv, b]) => b.setAttribute('aria-selected', bv === v));
    const i = btns.findIndex(([bv]) => bv === v);
    root.style.setProperty('--n', btns.length);
    root.style.setProperty('--i', Math.max(0, i));
    root.classList.toggle('none', i < 0);
  }
  set(value);
  root.set = set;
  root.get = () => value;
  return root;
}

export function slider({ label, min, max, step, value, unit = 'mm', digits = 2, onInput, onChange }) {
  const out = h('output', { class: 'num' });
  const input = h('input', { type: 'range', min, max, step, value });
  const track = h('div', { class: 'range' }, h('i', { class: 'range-fill' }), input);
  const show = () => {
    const v = Number(input.value);
    out.textContent = isNaN(v) ? '—' : v.toFixed(digits) + (unit ? ' ' + unit : '');
    track.style.setProperty('--p', ((v - min) / (max - min)).toFixed(4));
  };
  input.addEventListener('input', () => {
    show();
    onInput && onInput(Number(input.value));
  });
  input.addEventListener('change', () => onChange && onChange(Number(input.value)));
  show();
  const root = h('label', { class: 'field slider' }, h('span', { class: 'field-head' }, h('span', null, label), out), track);
  root.set = (v, mixed) => {
    track.classList.add('tween');
    input.value = v;
    show();
    if (mixed) out.textContent = t('mixed');
    setTimeout(() => track.classList.remove('tween'), 400);
  };
  root.get = () => Number(input.value);
  root.input = input;
  return root;
}

export function toggle(label, value, onChange) {
  const input = h('input', { type: 'checkbox', role: 'switch' });
  input.checked = !!value;
  input.addEventListener('change', () => onChange(input.checked));
  const root = h('label', { class: 'field toggle' }, h('span', null, label), input);
  root.set = (v) => (input.checked = !!v);
  root.get = () => input.checked;
  return root;
}

export function button(label, onClick, cls = '') {
  return h('button', { type: 'button', class: 'btn ' + cls, onclick: onClick }, label);
}

export function card(title, ...body) {
  return h('section', { class: 'card' }, title ? h('h3', null, title) : null, ...body);
}

// Settings-style grouped list: optional caption above a rounded box of rows.
export function group(title, ...rows) {
  return h(
    'section',
    { class: 'group' },
    title ? h('h4', { class: 'group-title' }, title) : null,
    h('div', { class: 'group-box' }, ...rows),
  );
}

// One list row: label (+ optional detail) on the left, control on the right.
export function row(label, control, { sub, stack, cls = '' } = {}) {
  return h(
    'div',
    { class: 'li ' + (stack ? 'stack ' : '') + cls },
    h('div', { class: 'li-text' }, h('span', { class: 'li-label' }, label), sub ? h('span', { class: 'li-sub' }, sub) : null),
    control ? h('div', { class: 'li-ctrl' }, control) : null,
  );
}

// Small labelled figure for the status strip.
export function stat(label, value, cls = '') {
  return h('span', { class: 'stat ' + cls }, h('b', null, value), h('span', null, label));
}

export function column(...kids) {
  return h('div', { class: 'col' }, ...kids);
}

// ---- toast -----------------------------------------------------------------
let toastHost;
export function toast(msg, kind = 'ok') {
  toastHost ||= document.getElementById('toasts');
  const el = h('div', { class: 'toast ' + kind, role: 'status' }, msg);
  toastHost.append(el);
  setTimeout(() => el.classList.add('out'), 1800);
  setTimeout(() => el.remove(), 2200);
}

export function confirmDialog(title, body, okLabel) {
  return new Promise((resolve) => {
    const dlg = h(
      'dialog',
      { class: 'dialog' },
      h('h3', null, title),
      h('p', null, body),
      h(
        'div',
        { class: 'row end' },
        button(t('cancel'), () => close(false)),
        button(okLabel, () => close(true), 'danger'),
      ),
    );
    const close = (v) => {
      dlg.classList.add('out');
      setTimeout(() => {
        dlg.close();
        dlg.remove();
        resolve(v);
      }, 140);
    };
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(false);
    });
    document.body.append(dlg);
    dlg.showModal();
  });
}

// Run an async device write with a busy state + toast. Resolves true/false.
let busyCount = 0;
export async function busy(fn, okMsg = t('saved')) {
  busyCount++;
  document.body.classList.add('busy');
  try {
    await fn();
    if (okMsg) toast(okMsg);
    return true;
  } catch (e) {
    console.error(e);
    toast(t('failed') + (e?.message ? ': ' + e.message : ''), 'err');
    return false;
  } finally {
    if (--busyCount === 0) document.body.classList.remove('busy');
  }
}

// ---- on-screen keyboard -----------------------------------------------------
export function createKeyboard(root) {
  root.textContent = '';
  root.style.setProperty('--cols', WIDTH);
  root.style.setProperty('--rows', HEIGHT);
  const keys = new Map();
  const frag = document.createDocumentFragment();
  for (const idx of KEY_INDEXES) {
    const g = GEOMETRY[idx];
    const el = h(
      'button',
      {
        type: 'button',
        class: 'key',
        'data-idx': idx,
        style: `--x:${g.x};--y:${g.y};--w:${g.w};--d:${(g.x + g.w / 2 + g.y * 0.5).toFixed(2)}`,
      },
      h('span', { class: 'k-fill' }),
      h('span', { class: 'k-l' }),
      h('span', { class: 'k-s' }),
    );
    const k = { el, fill: el.children[0], l: el.children[1], s: el.children[2], c: {} };
    keys.set(idx, k);
    frag.append(el);
  }
  root.append(frag);

  let handler = null;
  let dragging = false;
  let dragMode = null;
  const subs = new Set();
  const notify = (type, idx, what) => subs.forEach((fn) => fn(type, idx, what));
  // Single entry point for pointer input (DOM keys or the 3D board).
  function emit(type, idx, e) {
    if (!handler) return;
    if (type === 'down') {
      dragging = true;
      dragMode = handler('down', idx, e);
    } else if (type === 'drag' && dragging) handler('drag', idx, e, dragMode);
  }
  root.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.key');
    if (!el || !handler) return;
    e.preventDefault();
    emit('down', Number(el.dataset.idx), e);
  });
  root.addEventListener('pointerover', (e) => {
    const el = e.target.closest('.key');
    if (el) emit('drag', Number(el.dataset.idx), e);
  });
  addEventListener('pointerup', () => (dragging = false));
  root.addEventListener('keydown', (e) => {
    const el = e.target.closest('.key');
    if (el && handler && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      handler('down', Number(el.dataset.idx), e);
    }
  });

  return {
    root,
    keys,
    emit,
    endDrag() {
      dragging = false;
    },
    // fn(type, idx, what): type 'set' | 'flash' | 'press'
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    onPointer(fn) {
      handler = fn;
    },
    // Patch a key; only touches the DOM for values that changed.
    set(idx, { label, sub, cls, color, fill }) {
      const k = keys.get(idx);
      if (!k) return;
      const c = k.c;
      let text = false;
      let paint = false;
      if (label !== undefined && c.label !== label) {
        c.label = label;
        k.l.textContent = label;
        k.el.classList.toggle('long', label.length > 4);
        text = true;
      }
      if (sub !== undefined && c.sub !== sub) {
        k.s.textContent = c.sub = sub;
        text = true;
      }
      if (cls !== undefined && c.cls !== cls) {
        if (c.cls) k.el.classList.remove(...c.cls.split(' ').filter(Boolean));
        if (cls) k.el.classList.add(...cls.split(' ').filter(Boolean));
        c.cls = cls;
        text = true;
      }
      if (color !== undefined && c.color !== color) {
        c.color = color;
        k.el.style.setProperty('--kc', color || 'transparent');
        paint = true;
      }
      if (fill !== undefined && c.fill !== fill) {
        c.fill = fill;
        k.el.style.setProperty('--f', fill);
        paint = true;
      }
      if ((text || paint) && subs.size) notify('set', idx, text ? 'text' : 'paint');
    },
    clear() {
      for (const idx of keys.keys()) this.set(idx, { sub: '', cls: '', color: '', fill: 0 });
    },
    flash(idxs) {
      for (const i of idxs) {
        const el = keys.get(i)?.el;
        if (!el) continue;
        el.classList.remove('flash');
        void el.offsetWidth;
        el.classList.add('flash');
        notify('flash', i);
      }
    },
    press(idx, on) {
      const el = keys.get(idx)?.el;
      if (!el) return;
      el.classList.toggle('down', on);
      notify('press', idx, on);
    },
  };
}
