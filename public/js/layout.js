// FUN60 MAX physical layout (ANSI 61). Each key: [matrixIndex, widthU].
// Matrix index = column * 6 + row, same index addresses keymap (x4 bytes),
// HE arrays (x1/x2) and per-key RGB (x3).
export const ROWS = [
  [[1, 1], [7, 1], [13, 1], [19, 1], [25, 1], [31, 1], [37, 1], [43, 1], [49, 1], [55, 1], [61, 1], [67, 1], [73, 1], [79, 2]],
  [[2, 1.5], [8, 1], [14, 1], [20, 1], [26, 1], [32, 1], [38, 1], [44, 1], [50, 1], [56, 1], [62, 1], [68, 1], [74, 1], [80, 1.5]],
  [[3, 1.75], [9, 1], [15, 1], [21, 1], [27, 1], [33, 1], [39, 1], [45, 1], [51, 1], [57, 1], [63, 1], [69, 1], [81, 2.25]],
  [[4, 2.25], [16, 1], [22, 1], [28, 1], [34, 1], [40, 1], [46, 1], [52, 1], [58, 1], [64, 1], [70, 1], [76, 2.75]],
  [[5, 1.25], [17, 1.25], [23, 1.25], [41, 6.25], [65, 1.25], [71, 1.25], [77, 1.25], [83, 1.25]],
];
export const WIDTH = 15;
export const HEIGHT = 5;

// Factory base layer: matrix index -> HID usage (Fn key is [10,1,0,0]).
const BASE = {
  1: 41, 7: 30, 13: 31, 19: 32, 25: 33, 31: 34, 37: 35, 43: 36, 49: 37, 55: 38, 61: 39, 67: 45, 73: 46, 79: 42,
  2: 43, 8: 20, 14: 26, 20: 8, 26: 21, 32: 23, 38: 28, 44: 24, 50: 12, 56: 18, 62: 19, 68: 47, 74: 48, 80: 49,
  3: 57, 9: 4, 15: 22, 21: 7, 27: 9, 33: 10, 39: 11, 45: 13, 51: 14, 57: 15, 63: 51, 69: 52, 81: 40,
  4: 225, 16: 29, 22: 27, 28: 6, 34: 25, 40: 5, 46: 17, 52: 16, 58: 54, 64: 55, 70: 56, 76: 229,
  5: 224, 17: 227, 23: 226, 41: 44, 65: 230, 77: 101, 83: 228,
};
export const FN_KEY = 71;

// Factory Fn layer (Windows).
const FN = {
  1: [0, 0, 53, 0], 7: [0, 0, 58, 0], 13: [0, 0, 59, 0], 19: [0, 0, 60, 0], 25: [0, 0, 61, 0],
  31: [0, 0, 62, 0], 37: [0, 0, 63, 0], 43: [0, 0, 64, 0], 49: [0, 0, 65, 0], 55: [0, 0, 66, 0],
  61: [0, 0, 67, 0], 67: [0, 0, 68, 0], 73: [0, 0, 69, 0], 79: [0, 0, 76, 0],
  17: [10, 3, 0, 0], 20: [14, 0, 0, 0], 26: [14, 0, 1, 0], 32: [14, 0, 2, 0], 38: [14, 0, 5, 0],
  44: [14, 0, 6, 0], 28: [3, 0, 146, 1], 41: [10, 8, 0, 0], 50: [0, 0, 73, 0], 62: [0, 0, 70, 0],
  52: [3, 0, 226, 0], 57: [10, 12, 0, 0], 58: [3, 0, 234, 0], 64: [3, 0, 233, 0], 65: [10, 11, 0, 0],
  63: [13, 3, 1, 0], 68: [13, 2, 2, 0], 69: [13, 3, 2, 0], 70: [13, 5, 0, 0], 74: [13, 2, 1, 0],
  80: [13, 5, 1, 0], 81: [13, 1, 0, 0],
};

export const KEY_INDEXES = ROWS.flat().map((k) => k[0]);

export function defaultBase(idx) {
  if (idx === FN_KEY) return [10, 1, 0, 0];
  return BASE[idx] ? [0, 0, BASE[idx], 0] : [0, 0, 0, 0];
}
export function defaultFn(idx) {
  return FN[idx] ? [...FN[idx]] : [0, 0, 0, 0];
}
export const baseHid = (idx) => BASE[idx] || 0;

// HID usage -> matrix index (for live key test and Snap Tap pairing).
export const HID_TO_IDX = Object.fromEntries(Object.entries(BASE).map(([i, h]) => [h, Number(i)]));

// Supported firmware ids (FUN60 MAX variants).
export const MODELS = {
  2306: 'FUN60 MAX',
  3299: 'FUN60 MAX',
  3906: 'FUN60 MAX',
};

export const LIMITS = {
  act: { min: 0.1, max: 3.4, step: 0.01, def: 2.5 },
  rt: { min: 0.01, max: 2.5, step: 0.01, def: 1.5 },
  dz: { min: 0, max: 1, step: 0.01, def: 0.3 },
};

// Precomputed geometry: idx -> {x, y, w} in key units.
export const GEOMETRY = (() => {
  const g = {};
  ROWS.forEach((row, y) => {
    let x = 0;
    for (const [idx, w] of row) {
      g[idx] = { x, y, w };
      x += w;
    }
  });
  return g;
})();
