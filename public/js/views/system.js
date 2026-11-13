import { h, segmented, slider, toggle, button, busy, confirmDialog, group, row, stat, column } from '../ui.js';
import { RATES } from '../proto.js';
import { KEY_INDEXES, baseHid, MODELS, FN_KEY } from '../layout.js';
import { HID } from '../keys.js';
import { t } from '../i18n.js';

const hz = (r) => (r >= 1000 ? r / 1000 + 'K' : String(r));
const ver = (v) => (v ? 'v' + (v >> 8) + '.' + (v & 255).toString().padStart(2, '0') : '—');
const keyLabel = (idx) => (idx === FN_KEY ? 'Fn' : HID[baseHid(idx)]?.label ?? '');

function ring(pct) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('class', 'ring');
  svg.innerHTML = `<circle cx="32" cy="32" r="${r}" class="ring-bg"/><circle cx="32" cy="32" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c}" transform="rotate(-90 32 32)"/>`;
  requestAnimationFrame(() => requestAnimationFrame(() => svg.lastChild.setAttribute('stroke-dashoffset', c * (1 - pct / 100))));
  return svg;
}

export function systemView(ctx) {
  const { kb, dev, state, transport } = ctx;
  const left = column();
  const right = column();
  ctx.panel.append(h('div', { class: 'cols' }, left, right));
  let cal = 0; // 0 idle, 1 settling, 2 pressing
  let calStats = null;

  const paintCaps = () => {
    for (const idx of KEY_INDEXES) {
      const done = calStats?.done.has(idx);
      kb.set(idx, { label: keyLabel(idx), sub: '', cls: cal === 2 ? (done ? 'done' : 'todo') : '', fill: cal === 2 ? undefined : 0 });
    }
  };
  paintCaps();

  async function load() {
    ctx.loading(true);
    try {
      state.rate ??= await dev.getRate();
      state.opts ??= await dev.getOptions();
      state.sleep ??= await dev.getSleep();
    } finally {
      ctx.loading(false);
    }
    render();
  }

  function info() {
    ctx.info(
      [stat(t('rate'), hz(state.rate) + ' Hz', 'accent'), stat(t('conn'), transport.dongle ? t('dongle') : t('wired'))],
      [stat(t('battery'), transport.dongle ? transport.status.battery + '%' : '—'), stat('ID', String(dev.id))],
    );
  }

  function render() {
    const o = state.opts;
    const s = state.sleep;
    const saveOpts = () => busy(() => dev.setOptions(o));
    let sleepTimer = 0;
    const saveSleep = () => {
      clearTimeout(sleepTimer);
      sleepTimer = setTimeout(() => busy(() => dev.setSleep(s)), 250);
    };
    const minSlider = (key, label) =>
      slider({
        label, min: 1, max: 60, step: 1, unit: t('minutes'), digits: 0, value: Math.round(s[key] / 60),
        onChange: (v) => {
          s[key] = v * 60;
          saveSleep();
        },
      });

    left.append(
      group(t('rate'),
        h('div', { class: 'li stack' },
          segmented([...RATES].reverse().map((r) => [r, hz(r)]), state.rate, (r) => {
            state.rate = r;
            info();
            busy(() => dev.setRate(r));
          }),
          h('span', { class: 'li-sub' }, t('rateSub')),
        ),
      ),
      group(t('sleep'),
        h('div', { class: 'li pair' }, minSlider('rf', t('sleepRf')), minSlider('bt', t('sleepBt'))),
        h('div', { class: 'li pair' }, minSlider('rfDeep', t('sleepRfDeep')), minSlider('btDeep', t('sleepBtDeep'))),
      ),
      group(t('keyboardGrp'),
        toggle(t('wasd'), o.wasdSwap, (v) => ((o.wasdSwap = v), saveOpts())),
        toggle(t('guard'), o.guard, (v) => ((o.guard = v), saveOpts())),
        h('div', { class: 'li stack' },
          h('div', { class: 'li-text' }, h('span', { class: 'li-label' }, t('rtStab')), h('span', { class: 'li-sub' }, t('rtStabSub'))),
          segmented([0, 25, 50, 75, 100, 125].map((v) => [v, String(v)]), o.rtStab, (v) => ((o.rtStab = v), saveOpts()), 'small'),
        ),
      ),
    );

    const bat = transport.dongle ? transport.status.battery : 100;
    const stats = transport.stats;
    right.append(
      group(null,
        h('div', { class: 'device-hero' },
          h('div', { class: 'ring-wrap' }, ring(bat), h('span', { class: 'ring-val' }, transport.dongle ? bat + '%' : 'USB')),
          h('div', null,
            h('div', { class: 'device-name' }, MODELS[dev.id] || 'MonsGeek'),
            h('div', { class: 'li-sub' }, (transport.dongle ? t('dongle') : t('wired')) + ' · ' + hz(state.rate) + ' Hz'),
          ),
        ),
      ),
      group(t('colorway'),
        h('div', { class: 'li stack' },
          segmented([['black', t('cwBlack')], ['white', t('cwWhite')], ['misty', 'Misty']], (() => { try { return localStorage.getItem('colorway') || 'black'; } catch { return 'black'; } })(), (v) => {
            try { localStorage.setItem('colorway', v); } catch {}
            dispatchEvent(new Event('colorway'));
          }),
          h('span', { class: 'li-sub' }, t('colorwaySub')),
        ),
        row(t('legendSet'), segmented([['tr', 'TR Q'], ['us', 'US']], (() => { try { return localStorage.getItem('legendSet') || (document.documentElement.lang === 'tr' ? 'tr' : 'us'); } catch { return 'us'; } })(), (v) => {
          try { localStorage.setItem('legendSet', v); } catch {}
          dispatchEvent(new Event('colorway'));
        }, 'small')),
        row(t('legendPos'), segmented([['top', t('legendTop')], ['side', t('legendSide')]], (() => { try { return localStorage.getItem('legendPos') || 'top'; } catch { return 'top'; } })(), (v) => {
          try { localStorage.setItem('legendPos', v); } catch {}
          dispatchEvent(new Event('colorway'));
        }, 'small'), { sub: t('legendPosSub') }),
      ),
      group(t('device'),
        row('ID', h('span', { class: 'li-value' }, String(dev.id))),
        row(t('fw'), h('span', { class: 'li-value' }, 'USB ' + ver(dev.usb) + (dev.rf ? ' · RF ' + ver(dev.rf) : ''))),
        row(t('precision'), h('span', { class: 'li-value' }, (1 / dev.step).toFixed(3) + ' mm')),
        row(t('latency'), h('span', { class: 'li-value' }, stats.cmds ? (stats.ms / stats.cmds).toFixed(1) + ' ms' : '—')),
      ),
      calibrationGroup(),
      group(null, (() => {
        const r = row(t('reset'), null, { sub: t('resetBody'), cls: 'action danger' });
        r.addEventListener('click', async () => {
          if (!(await confirmDialog(t('reset'), t('resetBody'), t('resetGo')))) return;
          if (await busy(() => dev.factoryReset())) ctx.invalidate();
        });
        return r;
      })()),
    );
    info();
  }

  function calibrationGroup() {
    const bar = h('i', { class: 'progress-fill' });
    const prog = h('div', { class: 'meter' }, bar);
    const msg = h('span', { class: 'li-sub' }, t('calSub'));
    const btn = button(t('calStart'), toggleCal, 'small');
    const box = group(t('calibrate'), row(t('calRow'), btn, { sub: msg }), h('div', { class: 'li stack collapse closed' }, prog));
    const progRow = box.querySelector('.collapse');

    async function toggleCal() {
      if (cal === 0) {
        cal = 1;
        btn.disabled = true;
        msg.textContent = t('calRest');
        const ok = await busy(async () => {
          await dev.calibrate('min', true);
          await new Promise((r) => setTimeout(r, 2000));
          await dev.calibrate('min', false);
          await dev.calibrate('max', true);
        }, null);
        btn.disabled = false;
        if (!ok) {
          cal = 0;
          msg.textContent = t('calSub');
          return;
        }
        cal = 2;
        calStats = { done: new Set(), min: {}, max: {} };
        btn.textContent = t('calFinish');
        btn.classList.add('primary');
        msg.textContent = t('calPress');
        progRow.classList.remove('closed');
        paintCaps();
        (async () => {
          while (cal === 2) {
            try {
              const v = await dev.liveTravel();
              for (const idx of KEY_INDEXES) {
                const mmv = v[idx] / dev.step;
                calStats.min[idx] = Math.min(calStats.min[idx] ?? mmv, mmv);
                calStats.max[idx] = Math.max(calStats.max[idx] ?? mmv, mmv);
                if (calStats.max[idx] - calStats.min[idx] > 1.2) calStats.done.add(idx);
                kb.set(idx, { fill: Math.min(1, mmv / 4).toFixed(3) });
              }
              const pct = (calStats.done.size / KEY_INDEXES.length) * 100;
              bar.style.transform = `scaleX(${pct / 100})`;
              msg.textContent = t('calProgress', { n: calStats.done.size, total: KEY_INDEXES.length });
              paintCaps();
            } catch {
              await new Promise((r) => setTimeout(r, 300));
            }
          }
        })();
      } else if (cal === 2) {
        cal = 0;
        await busy(() => dev.calibrate('max', false), t('calDone'));
        btn.textContent = t('calStart');
        btn.classList.remove('primary');
        msg.textContent = t('calSub');
        progRow.classList.add('closed');
        calStats = null;
        paintCaps();
      }
    }
    return box;
  }

  load();
  return {
    onKey() {},
    destroy() {
      if (cal) {
        cal = 0;
        dev.calibrate('max', false).catch(() => {});
      }
    },
  };
}
