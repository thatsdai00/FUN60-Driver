import { h, segmented, slider, toggle, button, busy, group, row, stat, column } from '../ui.js';
import { LIGHT } from '../proto.js';
import { KEY_INDEXES, HID_TO_IDX, baseHid, FN_KEY } from '../layout.js';
import { HID, DOM_TO_HID } from '../keys.js';
import { createFx } from '../fx.js';
import { t } from '../i18n.js';

// FUN60 effect catalogue (firmware light layout "Te"). `p` = mini preview pattern.
const EFFECTS = [
  ['Off', 'lOff', { speed: false, rgb: false, p: 'off' }],
  ['AlwaysOn', 'lAlwaysOn', { speed: false, p: 'static' }],
  ['Breath', 'lBreath', { p: 'all' }],
  ['Neon', 'lNeon', { rgb: false, p: 'all' }],
  ['Wave', 'lWave', { options: [[0, 'oRight'], [1, 'oLeft'], [2, 'oDown'], [3, 'oUp']], p: 'x' }],
  ['Meteor', 'lMeteor', { p: 'x' }],
  ['Train', 'lTrain', { p: 'x' }],
  ['Snake', 'lSnake', { options: [[0, 'oZig'], [1, 'oLoop']], p: 'snake' }],
  ['RainDown', 'lRainDown', { p: 'y' }],
  ['Raindrop', 'lRaindrop', { p: 'rand' }],
  ['Converge', 'lConverge', { p: '-y' }],
  ['SineWave', 'lSineWave', { p: 'x' }],
  ['Kaleidoscope', 'lKaleidoscope', { options: [[0, 'oOut'], [1, 'oIn']], p: 'r' }],
  ['LineWave', 'lLineWave', { p: 'r' }],
  ['CircleWave', 'lCircleWave', { options: [[0, 'oCcw'], [1, 'oCw']], p: 'ang' }],
  ['Dazzle', 'lDazzle', { p: 'xy' }],
  ['Ripple', 'lRipple', { p: 'r', react: true }],
  ['Laser', 'lLaser', { p: 'x', react: true }],
  ['PressAction', 'lPressAction', { p: 'rand', react: true }],
  ['PressActionOff', 'lPressActionOff', { p: 'rand', react: true }],
  ['Fireworks', 'lFireworks', { options: [[0, 'oRight'], [1, 'oLeft']], p: 'r' }],
];
const SWATCHES = [0xffffff, 0xff3b30, 0xff9500, 0xffcc00, 0x34c759, 0x00c7be, 0x007aff, 0x5856d6, 0xaf52de, 0xff2d55];
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const num = (s) => parseInt(s.slice(1), 16);
const keyLabel = (idx) => (idx === FN_KEY ? 'Fn' : HID[baseHid(idx)]?.label ?? '');

// 5x3 dot preview; each pattern turns into per-dot animation delays.
function dots(p) {
  const wrap = h('span', { class: 'dots' + (p === 'static' ? ' static' : p === 'off' ? ' off' : '') });
  const snake = [0, 1, 2, 3, 4, 9, 8, 7, 6, 5, 10, 11, 12, 13, 14];
  for (let n = 0; n < 15; n++) {
    const x = n % 5;
    const y = Math.floor(n / 5);
    const r = Math.hypot((x - 2) / 1.4, y - 1);
    const d = {
      x, y: y * 1.6, '-y': (2 - y) * 1.6, r: r * 1.5, all: 0, snake: snake.indexOf(n) * 0.45,
      rand: ((n * 7) % 11) * 0.55, ang: ((Math.atan2(y - 1, x - 2) + Math.PI) / (Math.PI * 2)) * 6, xy: (x + y) * 0.9,
    }[p] ?? 0;
    wrap.append(h('i', { style: `--dl:${(d * 0.16).toFixed(2)}s` }));
  }
  return wrap;
}

export function lightView(ctx) {
  const { kb, dev, state } = ctx;
  let L = null;
  let tab = state.lightTab ?? 'effect';
  let slot = 0;
  let pic = null;
  let brush = 0x007aff;
  let timer = 0;
  const fx = createFx(kb);

  ctx.toolbar.append(
    segmented([['effect', t('effect')], ['perkey', t('perKey')]], tab, (v) => {
      tab = state.lightTab = v;
      render();
    }),
  );

  const body = h('div');
  ctx.panel.append(body);

  const spec = (mode) => {
    const e = EFFECTS.find(([k]) => LIGHT[k] === mode);
    return { speed: true, rgb: true, options: null, name: e ? t(e[1]) : t('lUserPicture'), ...(e?.[2] || {}) };
  };

  function info() {
    const sp = spec(L.mode);
    ctx.info(
      [stat(t('effect'), tab === 'perkey' ? t('perKey') + ' ' + (slot + 1) : sp.name, 'accent')],
      [stat(t('brightness'), L.bright + '/4'), stat(t('speed'), sp.speed ? L.speed + '/4' : '—')],
    );
  }

  function push() {
    clearTimeout(timer);
    fx.set(L);
    info();
    timer = setTimeout(() => busy(() => dev.setLight(L), null), 90);
  }

  function swatchRow(value, onPick, { off = false } = {}) {
    const wrap = h('div', { class: 'swatches' });
    const hexIn = h('input', { class: 'input hex', value: hex(value).toUpperCase(), maxlength: 7, spellcheck: 'false', 'aria-label': 'HEX' });
    const picker = h('input', { type: 'color', value: hex(value), class: 'swatch custom', title: t('custom') });
    const all = [...(off ? [0] : []), ...SWATCHES];
    const btns = all.map((c) => {
      const b = h('button', { type: 'button', class: 'swatch' + (off && c === 0 ? ' none' : ''), style: `--c:${hex(c)}`, title: c ? hex(c) : t('erase') });
      b.onclick = () => choose(c);
      return [c, b];
    });
    function choose(c, from) {
      onPick(c);
      btns.forEach(([v, b]) => b.classList.toggle('on', v === c));
      if (from !== 'hex') hexIn.value = hex(c).toUpperCase();
      if (from !== 'picker' && c) picker.value = hex(c);
    }
    picker.addEventListener('input', () => choose(num(picker.value), 'picker'));
    hexIn.addEventListener('change', () => {
      const m = /^#?([0-9a-f]{6})$/i.exec(hexIn.value.trim());
      if (m) choose(parseInt(m[1], 16), 'hex');
      else hexIn.value = hex(value).toUpperCase();
    });
    btns.forEach(([v, b]) => b.classList.toggle('on', v === value));
    wrap.append(...btns.map((x) => x[1]), picker);
    wrap.hexIn = hexIn;
    return wrap;
  }

  function renderEffect() {
    const grid = h('div', { class: 'tiles' });
    for (const [key, label, opt] of EFFECTS) {
      const mode = LIGHT[key];
      const b = h('button', { type: 'button', class: 'tile' + (L.mode === mode ? ' on' : '') }, dots(opt.p), h('span', null, t(label)));
      if (opt.react) b.append(h('i', { class: 'tile-tag', title: t('reactive') }));
      b.onclick = () => {
        L.mode = mode;
        const s = spec(mode);
        if (s.options && !s.options.some(([v]) => v === L.option)) L.option = s.options[0][0];
        grid.querySelectorAll('.tile').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        renderControls();
        fx.start();
        push();
      };
      grid.append(b);
    }
    const look = h('div', { class: 'group-box' });
    const colorBox = h('div', { class: 'group-box' });
    const colorGroup = h('section', { class: 'group' }, h('h4', { class: 'group-title' }, t('color')), colorBox);
    function renderControls() {
      const s = spec(L.mode);
      look.textContent = '';
      colorBox.textContent = '';
      const off = L.mode === LIGHT.Off;
      look.append(slider({ label: t('brightness'), min: 0, max: 4, step: 1, value: L.bright, unit: '', digits: 0, onInput: (v) => ((L.bright = v), push()) }));
      if (s.speed) look.append(slider({ label: t('speed'), min: 0, max: 4, step: 1, value: L.speed, unit: '', digits: 0, onInput: (v) => ((L.speed = v), push()) }));
      if (s.options) look.append(row(t('direction'), segmented(s.options.map(([v, k]) => [v, t(k)]), L.option, (v) => ((L.option = v), push()), 'small')));
      if (s.react) look.append(row(t('reactive'), null, { sub: t('reactiveSub') }));
      look.classList.toggle('inactive', off);
      colorGroup.hidden = !s.rgb || off;
      if (!s.rgb || off) return;
      const sw = swatchRow(L.rgb, (c) => {
        L.rgb = c;
        if (L.dazzle) {
          L.dazzle = false;
          rb.set(false);
          sw.classList.remove('disabled');
        }
        push();
      });
      const rb = toggle(t('rainbow'), L.dazzle, (v) => {
        L.dazzle = v;
        sw.classList.toggle('disabled', v);
        push();
      });
      sw.classList.toggle('disabled', L.dazzle);
      colorBox.append(rb, h('div', { class: 'li stack' }, sw), row(t('custom'), sw.hexIn));
    }
    renderControls();
    body.append(
      h('div', { class: 'stack-lg' },
        group(t('effect'), h('div', { class: 'li stack' }, grid)),
        h('div', { class: 'cols' },
          column(h('section', { class: 'group' }, h('h4', { class: 'group-title' }, t('look')), look)),
          column(colorGroup),
        ),
      ),
    );
    fx.set(L);
    if (L.mode === LIGHT.UserPicture) {
      // the board is showing a saved per-key pattern: preview that pattern
      slot = L.option;
      loadPic();
    } else fx.start();
  }

  async function renderPerKey() {
    fx.stop();
    const slotSeg = segmented([0, 1, 2, 3, 4].map((i) => [i, String(i + 1)]), slot, async (v) => {
      slot = v;
      await loadPic();
      info();
    }, 'small');
    const sw = swatchRow(brush, (c) => (brush = c), { off: true });
    const save = button(t('saveApply'), async () => {
      const ok = await busy(async () => {
        await dev.setPicture(slot, pic);
        Object.assign(L, { mode: LIGHT.UserPicture, option: slot });
        await dev.setLight(L);
      });
      if (ok) kb.flash(KEY_INDEXES);
    }, 'primary wide');
    body.append(
      h('div', { class: 'cols' },
        column(
          group(t('slot'), row(t('pattern'), slotSeg, { sub: t('patternSub') })),
          group(t('tools'),
            row(t('fillAll'), button(t('fill'), () => { KEY_INDEXES.forEach((i) => setPx(i, brush)); paint(); }, 'small')),
            row(t('clear'), button(t('clear'), () => { KEY_INDEXES.forEach((i) => setPx(i, 0)); paint(); }, 'small')),
          ),
        ),
        column(group(t('brush'), h('div', { class: 'li stack' }, sw), row(t('custom'), sw.hexIn)), h('div', { class: 'spacer' }), save),
      ),
    );
    await loadPic();
  }

  async function loadPic() {
    ctx.loading(true);
    try {
      pic = new Uint8Array(await dev.getPicture(slot));
    } finally {
      ctx.loading(false);
    }
    paint();
  }

  function setPx(idx, c) {
    pic[idx * 3] = (c >> 16) & 255;
    pic[idx * 3 + 1] = (c >> 8) & 255;
    pic[idx * 3 + 2] = c & 255;
  }

  function paint() {
    if (!L) return;
    for (const idx of KEY_INDEXES) {
      const p = { label: keyLabel(idx), sub: '', cls: 'lit', fill: 0 };
      if (pic && (tab === 'perkey' || L.mode === LIGHT.UserPicture)) {
        const c = (pic[idx * 3] << 16) | (pic[idx * 3 + 1] << 8) | pic[idx * 3 + 2];
        p.color = c ? hex(c) : 'transparent';
      }
      kb.set(idx, p);
    }
    info();
  }

  function render() {
    kb.dragSelect = tab === 'perkey'; // painting drags across keys
    body.textContent = '';
    if (!L) return;
    paint();
    tab === 'effect' ? renderEffect() : renderPerKey();
  }

  const onKeydown = (e) => {
    const idx = HID_TO_IDX[DOM_TO_HID[e.code]];
    if (idx !== undefined && !e.repeat) fx.press(idx);
  };
  addEventListener('keydown', onKeydown);

  (async () => {
    ctx.loading(true);
    try {
      L = state.light ??= await dev.getLight();
    } finally {
      ctx.loading(false);
    }
    render();
  })();

  return {
    onKey(type, idx) {
      if (tab === 'effect') {
        if (type === 'down') fx.press(idx);
        return;
      }
      if (!pic) return;
      if (type === 'down' || type === 'drag') {
        setPx(idx, brush);
        paint();
      }
    },
    destroy() {
      clearTimeout(timer);
      kb.dragSelect = false;
      fx.destroy();
      removeEventListener('keydown', onKeydown);
    },
  };
}
