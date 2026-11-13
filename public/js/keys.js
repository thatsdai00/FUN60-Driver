// HID usage names and the 4-byte key action codec used by the keymap.
//
// Action encodings (byte 0 = kind):
//   [0, m, k, k2]  plain key / combo (up to 3 HID usages)
//   [1, 0, b, x]   mouse button / wheel
//   [2, 0, u, 0]   system control (power / sleep / wake)
//   [3, 0, lo, hi] consumer control (media)
//   [8, 0, n, x]   profile switch
//   [9, t, i, 0]   macro i (t: 0 repeat, 1 toggle, 2 while held)
//   [10, n, x, 0]  keyboard function (Fn, win lock, ...)
//   [13, a, b, 0]  lighting control
//   [14, 0, ch, 0] connection channel

const H = {};
const def = (code, label, name = label) => (H[code] = { code, label, name });
'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((c, i) => def(4 + i, c));
'1234567890'.split('').forEach((c, i) => def(30 + i, c));
[
  [40, 'Enter'], [41, 'Esc'], [42, 'Bksp', 'Backspace'], [43, 'Tab'], [44, 'Space'],
  [45, '-'], [46, '='], [47, '['], [48, ']'], [49, '\\'], [50, '#', 'Non-US #'], [51, ';'],
  [52, "'"], [53, '`'], [54, ','], [55, '.'], [56, '/'], [57, 'Caps', 'Caps Lock'],
  [70, 'PrtSc', 'Print Screen'], [71, 'ScrLk', 'Scroll Lock'], [72, 'Pause'], [73, 'Ins', 'Insert'],
  [74, 'Home'], [75, 'PgUp', 'Page Up'], [76, 'Del', 'Delete'], [77, 'End'], [78, 'PgDn', 'Page Down'],
  [79, '→', 'Right'], [80, '←', 'Left'], [81, '↓', 'Down'], [82, '↑', 'Up'], [83, 'NumLk', 'Num Lock'],
  [84, 'N/', 'Num /'], [85, 'N*', 'Num *'], [86, 'N-', 'Num -'], [87, 'N+', 'Num +'], [88, 'NEnt', 'Num Enter'],
  [89, 'N1', 'Num 1'], [90, 'N2', 'Num 2'], [91, 'N3', 'Num 3'], [92, 'N4', 'Num 4'], [93, 'N5', 'Num 5'],
  [94, 'N6', 'Num 6'], [95, 'N7', 'Num 7'], [96, 'N8', 'Num 8'], [97, 'N9', 'Num 9'], [98, 'N0', 'Num 0'],
  [99, 'N.', 'Num .'], [100, '\\|', 'ISO \\'], [101, 'Menu'], [224, 'Ctrl', 'Left Ctrl'], [225, 'Shift', 'Left Shift'],
  [226, 'Alt', 'Left Alt'], [227, 'Win', 'Left Win'], [228, 'RCtrl', 'Right Ctrl'], [229, 'RShift', 'Right Shift'],
  [230, 'RAlt', 'Right Alt'], [231, 'RWin', 'Right Win'],
].forEach(([c, l, n]) => def(c, l, n));
for (let i = 1; i <= 12; i++) def(57 + i, 'F' + i);
for (let i = 13; i <= 24; i++) def(91 + i, 'F' + i);
export const HID = H;

// Browser KeyboardEvent.code -> HID usage (for live key test + macro rec).
export const DOM_TO_HID = (() => {
  const m = {};
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((c, i) => (m['Key' + c] = 4 + i));
  '1234567890'.split('').forEach((c, i) => (m['Digit' + c] = 30 + i));
  for (let i = 1; i <= 12; i++) m['F' + i] = 57 + i;
  for (let i = 13; i <= 24; i++) m['F' + i] = 91 + i;
  Object.assign(m, {
    Enter: 40, Escape: 41, Backspace: 42, Tab: 43, Space: 44, Minus: 45, Equal: 46,
    BracketLeft: 47, BracketRight: 48, Backslash: 49, Semicolon: 51, Quote: 52, Backquote: 53,
    Comma: 54, Period: 55, Slash: 56, CapsLock: 57, PrintScreen: 70, ScrollLock: 71, Pause: 72,
    Insert: 73, Home: 74, PageUp: 75, Delete: 76, End: 77, PageDown: 78, ArrowRight: 79,
    ArrowLeft: 80, ArrowDown: 81, ArrowUp: 82, NumLock: 83, NumpadDivide: 84, NumpadMultiply: 85,
    NumpadSubtract: 86, NumpadAdd: 87, NumpadEnter: 88, Numpad1: 89, Numpad2: 90, Numpad3: 91,
    Numpad4: 92, Numpad5: 93, Numpad6: 94, Numpad7: 95, Numpad8: 96, Numpad9: 97, Numpad0: 98,
    NumpadDecimal: 99, IntlBackslash: 100, ContextMenu: 101, ControlLeft: 224, ShiftLeft: 225,
    AltLeft: 226, MetaLeft: 227, ControlRight: 228, ShiftRight: 229, AltRight: 230, MetaRight: 231,
  });
  return m;
})();

// Non-HID actions. `g` = picker group. Labels are i18n keys when prefixed '@'.
export const ACTIONS = [
  // media
  { g: 'media', code: [3, 0, 205, 0], label: 'Play', name: '@play' },
  { g: 'media', code: [3, 0, 182, 0], label: 'Prev', name: '@prev' },
  { g: 'media', code: [3, 0, 181, 0], label: 'Next', name: '@next' },
  { g: 'media', code: [3, 0, 183, 0], label: 'Stop', name: '@stop' },
  { g: 'media', code: [3, 0, 226, 0], label: 'Mute', name: '@mute' },
  { g: 'media', code: [3, 0, 234, 0], label: 'Vol−', name: '@voldown' },
  { g: 'media', code: [3, 0, 233, 0], label: 'Vol+', name: '@volup' },
  { g: 'media', code: [3, 0, 112, 0], label: 'Bri−', name: '@bridown' },
  { g: 'media', code: [3, 0, 111, 0], label: 'Bri+', name: '@briup' },
  { g: 'media', code: [3, 0, 131, 1], label: 'Player', name: '@player' },
  { g: 'media', code: [3, 0, 146, 1], label: 'Calc', name: '@calc' },
  { g: 'media', code: [3, 0, 138, 1], label: 'Mail', name: '@mail' },
  { g: 'media', code: [3, 0, 148, 1], label: 'PC', name: '@mypc' },
  { g: 'media', code: [3, 0, 33, 2], label: 'Search', name: '@search' },
  { g: 'media', code: [3, 0, 35, 2], label: 'Home', name: '@webhome' },
  { g: 'media', code: [3, 0, 36, 2], label: 'Back', name: '@webback' },
  { g: 'media', code: [3, 0, 39, 2], label: 'Reload', name: '@refresh' },
  { g: 'media', code: [2, 0, 129, 0], label: 'Power', name: '@power' },
  { g: 'media', code: [2, 0, 130, 0], label: 'Sleep', name: '@sleep' },
  { g: 'media', code: [2, 0, 131, 0], label: 'Wake', name: '@wake' },
  // mouse
  { g: 'mouse', code: [1, 0, 240, 0], label: 'LMB', name: '@mleft' },
  { g: 'mouse', code: [1, 0, 241, 0], label: 'RMB', name: '@mright' },
  { g: 'mouse', code: [1, 0, 242, 0], label: 'MMB', name: '@mmiddle' },
  { g: 'mouse', code: [1, 0, 243, 0], label: 'M4', name: '@mback' },
  { g: 'mouse', code: [1, 0, 244, 0], label: 'M5', name: '@mfwd' },
  { g: 'mouse', code: [1, 0, 245, 1], label: 'W↑', name: '@wup' },
  { g: 'mouse', code: [1, 0, 245, 255], label: 'W↓', name: '@wdown' },
  // keyboard functions
  { g: 'func', code: [10, 1, 0, 0], label: 'Fn', name: 'Fn' },
  { g: 'func', code: [10, 3, 0, 0], label: 'WinLk', name: '@winlock' },
  { g: 'func', code: [8, 0, 1, 0], label: 'P+', name: '@profnext' },
  { g: 'func', code: [8, 0, 2, 0], label: 'P−', name: '@profprev' },
  { g: 'func', code: [8, 0, 3, 0], label: 'P⟳', name: '@profloop' },
  { g: 'func', code: [0, 0, 227, 15], label: 'Lock', name: '@lockpc' },
  { g: 'func', code: [0, 0, 227, 7], label: 'Desk', name: '@desktop' },
  { g: 'func', code: [0, 0, 227, 8], label: 'Files', name: '@explorer' },
  { g: 'func', code: [0, 224, 225, 41], label: 'TaskM', name: '@taskmgr' },
  { g: 'func', code: [0, 0, 224, 6], label: '^C', name: 'Ctrl+C' },
  { g: 'func', code: [0, 0, 224, 25], label: '^V', name: 'Ctrl+V' },
  { g: 'func', code: [0, 0, 224, 27], label: '^X', name: 'Ctrl+X' },
  // wireless + lighting (factory Fn layer)
  { g: 'device', code: [14, 0, 0, 0], label: 'BT1', name: 'Bluetooth 1' },
  { g: 'device', code: [14, 0, 1, 0], label: 'BT2', name: 'Bluetooth 2' },
  { g: 'device', code: [14, 0, 2, 0], label: 'BT3', name: 'Bluetooth 3' },
  { g: 'device', code: [14, 0, 5, 0], label: '2.4G', name: '2.4 GHz' },
  { g: 'device', code: [14, 0, 6, 0], label: 'USB', name: '@wired' },
  { g: 'device', code: [13, 1, 0, 0], label: 'L•', name: '@lmode' },
  { g: 'device', code: [13, 2, 1, 0], label: 'L+', name: '@lbriup' },
  { g: 'device', code: [13, 2, 2, 0], label: 'L−', name: '@lbridown' },
  { g: 'device', code: [13, 3, 1, 0], label: 'S−', name: '@lspddown' },
  { g: 'device', code: [13, 3, 2, 0], label: 'S+', name: '@lspdup' },
  { g: 'device', code: [13, 5, 0, 0], label: 'Hue', name: '@lcolor' },
  { g: 'device', code: [13, 5, 1, 0], label: 'L◐', name: '@lcolor2' },
];

const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
export const sameCode = eq;

export function describe(c, t) {
  if (!c[0] && !c[1] && !c[2] && !c[3]) return { label: '—', name: t('disabled'), kind: 'off' };
  if (!c[0] && !c[1] && c[2] === 3 && !c[3]) return { label: '—', name: t('disabled'), kind: 'off' };
  const a = ACTIONS.find((x) => eq(x.code, c));
  if (a) return { label: a.label, name: a.name[0] === '@' ? t(a.name.slice(1)) : a.name, kind: a.g };
  if (c[0] === 0) {
    const parts = [c[1], c[2], c[3]].filter(Boolean).map((h) => HID[h]);
    if (parts.every(Boolean)) {
      if (parts.length === 1) return { label: parts[0].label, name: parts[0].name, kind: 'key' };
      return {
        label: parts.map((p) => p.label).join('+'),
        name: parts.map((p) => p.name).join(' + '),
        kind: 'combo',
      };
    }
  }
  if (c[0] === 9) return { label: 'M' + (c[2] + 1), name: t('macro') + ' ' + (c[2] + 1), kind: 'macro', macro: c[2], mtype: c[1] };
  if (c[0] === 8) return { label: 'P' + (c[2] + 1), name: t('profile') + ' ' + (c[2] + 1), kind: 'func' };
  const hex = c.map((v) => v.toString(16).padStart(2, '0')).join('');
  return { label: '0x' + hex.slice(0, 4), name: '0x' + hex, kind: 'raw' };
}

export const keyCode = (hid) => [0, 0, hid, 0];
export const comboCode = (mods, key) => {
  const list = [...mods, key].filter(Boolean).slice(-3);
  while (list.length < 3) list.unshift(0);
  return [0, ...list];
};

// Picker groups for plain keys.
export const KEY_GROUPS = {
  letters: [...Array(26)].map((_, i) => 4 + i),
  digits: [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 45, 46, 47, 48, 49, 51, 52, 53, 54, 55, 56],
  fkeys: [...Array(12)].map((_, i) => 58 + i).concat([...Array(12)].map((_, i) => 104 + i)),
  nav: [41, 42, 43, 40, 44, 57, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 70, 71, 72, 101],
  mods: [224, 225, 226, 227, 228, 229, 230, 231],
  numpad: [83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100],
};
