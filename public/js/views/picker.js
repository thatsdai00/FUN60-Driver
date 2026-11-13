// Shared action picker (keymap, DKS / Mod-Tap action slots).
import { h, segmented } from '../ui.js';
import { HID, ACTIONS, KEY_GROUPS, keyCode, comboCode } from '../keys.js';
import { t, getLang } from '../i18n.js';

const GROUPS = ['gKeys', 'gMedia', 'gMouse', 'gFunc', 'gDevice', 'gMacro'];
const MODS = [[224, 'Ctrl'], [225, 'Shift'], [226, 'Alt'], [227, 'Win']];
const low = (s) => s.toLocaleLowerCase(getLang() === 'tr' ? 'tr' : 'en');

export function createPicker(onPick, { macros = true } = {}) {
  let group = 'gKeys';
  let macroType = 0;
  let query = '';
  const mods = new Set();
  const body = h('div', { class: 'picker-body' });

  const search = h('input', { type: 'search', class: 'search', placeholder: t('searchPh'), spellcheck: 'false' });
  search.addEventListener('input', () => {
    query = low(search.value.trim());
    render();
  });

  const modRow = h(
    'div',
    { class: 'chips' },
    MODS.map(([code, label]) => {
      const b = h('button', { type: 'button', class: 'chip' }, '+' + label);
      b.addEventListener('click', () => {
        if (mods.has(code)) mods.delete(code);
        else if (mods.size < 2) mods.add(code);
        b.classList.toggle('on', mods.has(code));
      });
      return b;
    }),
  );
  const groups = GROUPS.filter((g) => macros || g !== 'gMacro');
  const tabs = segmented(groups.map((g) => [g, t(g)]), group, (g) => {
    group = g;
    query = '';
    search.value = '';
    render();
  }, 'small');

  const keyCap = (hid) => {
    const b = h('button', { type: 'button', class: 'cap', title: HID[hid].name }, HID[hid].label);
    b.onclick = () => {
      const code = mods.size ? comboCode([...mods], hid) : keyCode(hid);
      const name = [...mods].map((m) => HID[m].label).concat(HID[hid].name).join(' + ');
      onPick(code, name);
    };
    return b;
  };
  const named = (label, name, code) => {
    const b = h('button', { type: 'button', class: 'cap named' }, h('b', null, label), h('span', null, name));
    b.onclick = () => onPick(code, name);
    return b;
  };
  const actionName = (a) => (a.name[0] === '@' ? t(a.name.slice(1)) : a.name);

  function render() {
    body.textContent = '';
    tabs.classList.toggle('none', !!query);
    modRow.hidden = !!query || group !== 'gKeys';
    if (query) {
      const keys = Object.values(HID).filter((k) => low(k.name).includes(query) || low(k.label) === query);
      const acts = ACTIONS.filter((a) => low(actionName(a)).includes(query) || low(a.label).includes(query));
      const items = [
        ...keys.map((k) => named(k.label, k.name, keyCode(k.code))),
        ...acts.map((a) => named(a.label, actionName(a), a.code)),
      ].slice(0, 48);
      body.append(items.length ? h('div', { class: 'caps wide' }, items) : h('p', { class: 'muted center' }, t('noResults')));
      return;
    }
    if (group === 'gKeys') {
      for (const [name, list] of Object.entries(KEY_GROUPS)) {
        body.append(h('div', { class: 'pick-sec' }, h('span', { class: 'label' }, t(name)), h('div', { class: 'caps' }, list.map(keyCap))));
      }
    } else if (group === 'gMacro') {
      const typeSeg = segmented([[0, t('mtRepeat')], [1, t('mtToggle')], [2, t('mtHeld')]], macroType, (v) => (macroType = v), 'small');
      body.append(
        h('div', { class: 'pick-sec' }, typeSeg),
        h('div', { class: 'caps grid10' }, [...Array(50)].map((_, i) => {
          const b = h('button', { type: 'button', class: 'cap' }, 'M' + (i + 1));
          b.onclick = () => onPick([9, macroType, i, 0], t('macro') + ' ' + (i + 1));
          return b;
        })),
      );
    } else {
      const g = { gMedia: 'media', gMouse: 'mouse', gFunc: 'func', gDevice: 'device' }[group];
      body.append(h('div', { class: 'caps wide' }, ACTIONS.filter((a) => a.g === g).map((a) => named(a.label, actionName(a), a.code))));
    }
  }
  render();
  return h('div', { class: 'picker' }, search, tabs, modRow, body);
}
