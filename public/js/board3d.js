// Real-time WebGL model of the FUN60 MAX, built procedurally with three.js.
// Proportions follow the product: a thin-bezel tray case, Cherry-profile
// caps with per-row height and angle, south-facing per-key LEDs, and
// side-printed shine-through legends on the cap front (black / white) or top
// dye-sub legends (Misty). It mirrors the DOM keyboard component: state comes
// from kb.keys[idx].c, pointer input goes back through kb.emit.
import * as THREE from '../vendor/three.module.min.js';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { GEOMETRY, KEY_INDEXES, WIDTH, HEIGHT, baseHid } from './layout.js';
import { HID } from './keys.js';
import { t as tr } from './i18n.js';
import { SWW, SWH, WHOLE, glareGeometry, glareDetailGeometry, glareMaterials, createExploded, loadSwitchModel } from './switch3d.js';

// ---- dimensions (1 unit = one 19.05 mm key pitch) ---------------------------
const GAP = 0.055; // gap between cap skirts
const BEV = 0.045;
const TAPER_X = 0.13; // top face inset per side
const TAPER_Z = 0.2;
const BEZEL = 0.16; // case rim around the key field
const RIM_H = 0.17; // rim height above the plate
const BASE_H = 0.72; // case body below the plate
const SWITCH_H = 0.2; // cap bottom above the plate
const PPU = 180; // label texture px per unit
const ELEV = 1.3; // near top-down, like a product shot
// Cherry profile by row (0 = number row): wall height, top slope (+ = front higher)
const ROW_H = [0.5, 0.43, 0.4, 0.41, 0.41];
const ROW_SLOPE = [-0.13, -0.06, 0, 0.07, 0.07];

// Physical legends.
const SHIFTED = { 30: '!', 31: '@', 32: '#', 33: '$', 34: '%', 35: '^', 36: '&', 37: '*', 38: '(', 39: ')', 45: '_', 46: '+', 47: '{', 48: '}', 49: '|', 51: ':', 52: '"', 53: '~', 54: '<', 55: '>', 56: '?' };
const WORDS = { 41: 'Esc', 42: 'Backspace', 43: 'Tab', 57: 'Caps Lock', 40: 'Enter', 225: 'Shift', 229: 'Shift', 224: 'Ctrl', 228: 'Ctrl', 227: 'Win', 226: 'Alt', 230: 'Alt', 101: 'Menu', 44: '' };
// Turkish Q keycaps on the ANSI board (what ships in TR).
const TR = {
  31: ['2', "'"], 32: ['3', '^'], 33: ['4', '+'], 36: ['7', '/'], 37: ['8', '('], 38: ['9', ')'], 39: ['0', '='],
  45: ['*', '?'], 46: ['-', '_'], 47: ['Ğ'], 48: ['Ü'], 49: [',', ';'], 51: ['Ş'], 52: ['İ'], 54: ['Ö'], 55: ['Ç'], 56: ['.', ':'],
};
// icon keys: drawn glyph + word
const ICON = { 42: 'back', 40: 'enter', 225: 'shift', 229: 'shift', 101: 'menu', 43: 'tab' };
export function getLegendSet() {
  try {
    return localStorage.getItem('legendSet') || (document.documentElement.lang === 'tr' ? 'tr' : 'us');
  } catch {
    return 'us';
  }
}
function legendOf(idx) {
  if (idx === 71) return { word: 'Fn' };
  const h = baseHid(idx);
  if (h in WORDS) return { word: WORDS[h], icon: ICON[h] };
  const us = HID[h]?.label ?? '';
  if (getLegendSet() === 'tr' && TR[h]) return TR[h].length > 1 ? { main: TR[h][0], shift: TR[h][1], us } : { main: TR[h][0], us };
  if (SHIFTED[h]) return { main: HID[h].label, shift: SHIFTED[h] };
  return { main: HID[h]?.label ?? '' };
}

export const COLORWAYS = {
  black: { style: 'print', glare: 1.25, capOpacity: 0.94, case: 0x111113, caseRough: 0.5, plate: 0x060607, cap: 0x0a0a0c, legend: '#f4f4f6', legendDim: 1, capRough: 0.3, clearcoat: 0.25, env: 0.45, brand: '#8f84e8' },
  white: { style: 'shine', case: 0xe7e7ea, caseRough: 0.55, plate: 0xd8d8dc, cap: 0xf3f3f5, legend: '#8e8e93', legendDim: 1, capRough: 0.62 },
  misty: {
    style: 'dye', case: 0x2a2a2d, caseRough: 0.6, plate: 0x111113, cap: 0x222224, accentCap: 0xb4601f,
    accentKeys: [1, 81, 41], legend: '#f2f2f4', legendDim: 1, capRough: 0.66,
  },
};

const UI = {
  light: { text: '#1d1d1f', muted: '#86868b', accent: '#0071e3', ok: 0x30b350, env: 0.9, sun: 1.6, shadow: 0.16 },
  dark: { text: '#f5f5f7', muted: '#a1a1a6', accent: '#2997ff', ok: 0x30d158, env: 0.8, sun: 1.7, shadow: 0.5 },
};
const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};

function rrect(w, h, r, s = new THREE.Shape()) {
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// Cherry-style cap: tapered extrusion with a per-row sloped top face.
const capCache = new Map();
function capGeometry(w, row) {
  const key = w + ':' + row;
  if (capCache.has(key)) return capCache.get(key);
  const H = ROW_H[row];
  const g = new THREE.ExtrudeGeometry(rrect(w - GAP - BEV * 2, 1 - GAP - BEV * 2, 0.07), {
    depth: H - BEV * 2,
    bevelEnabled: true,
    bevelThickness: BEV,
    bevelSize: BEV,
    bevelSegments: 3,
    curveSegments: 5,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, BEV, 0); // bottom at y = 0
  const p = g.attributes.position;
  const kx = TAPER_X / w;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = Math.max(0, Math.min(1, y / H));
    const e = t * t * (3 - 2 * t);
    const z = p.getZ(i);
    p.setX(i, p.getX(i) * (1 - kx * e * 2));
    const zt = z * (1 - TAPER_Z * e) - 0.02 * e;
    p.setZ(i, zt);
    p.setY(i, y + (zt + 0.02) * ROW_SLOPE[row] * e);
  }
  g.computeVertexNormals();
  capCache.set(key, g);
  return g;
}

// Soft LED falloff texture (radial, drawn once) for the south-facing glow.
// Light inside a translucent cap from its south LED: bright across the lower
// part, fading north, and centred horizontally (UV x is in key units, so a
// wide cap like the spacebar only lights up in the middle, over its LED).
function capGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const img = x.createImageData(128, 128);
  for (let j = 0; j < 128; j++) {
    const v = 1 - j / 127; // 0 = south edge
    const gy = 0.02 + 0.98 * Math.exp(-Math.pow(Math.max(0, v - 0.08) / 0.3, 2));
    for (let i = 0; i < 128; i++) {
      const u = i / 127;
      const gx = 0.03 + 0.97 * Math.exp(-Math.pow((u - 0.5) / 0.27, 2));
      const val = Math.round(255 * Math.min(1, gx * gy));
      const o = (j * 128 + i) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = val;
      img.data[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.offset.set(0.5, 0.5);
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const img = x.createImageData(128, 128);
  for (let j = 0; j < 128; j++) {
    for (let i = 0; i < 128; i++) {
      const dx = (i - 63.5) / 64;
      const dy = (j - 63.5) / 64;
      const d = Math.min(1, Math.hypot(dx, dy));
      const v = Math.pow(1 - d, 2.2);
      const o = (j * 128 + i) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(v * 255);
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function parseColor(s) {
  if (!s || s === 'transparent') return null;
  if (s[0] === '#') return { c: new THREE.Color(s), a: 1 };
  const m = s.match(/rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[/,]\s*([\d.]+))?/);
  if (!m) return null;
  return { c: new THREE.Color(m[1] / 255, m[2] / 255, m[3] / 255), a: m[4] === undefined ? 1 : Number(m[4]) };
}

export function supports3D() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

export function getLegendPos() {
  try {
    return localStorage.getItem('legendPos') || 'top';
  } catch {
    return 'top';
  }
}

export function getColorway() {
  try {
    return localStorage.getItem('colorway') || 'black';
  } catch {
    return 'black';
  }
}

export function mountBoard3D(kb, host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'gl';
  host.append(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const aniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(11, 2, 0.1, 500);
  const target = new THREE.Vector3(0, 0.15, 0.2);

  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-4, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 6, bottom: -6 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.015;
  sun.layers.enableAll(); // lights both the board (layer 0) and the focused switch (layer 1)
  scene.add(sun);

  // Depth-of-field: the focused switch renders sharp on a second transparent
  // canvas (layer 1); the board canvas below gets a CSS blur that grows with the explode.
  const fgCanvas = document.createElement('canvas');
  fgCanvas.className = 'gl gl-fg';
  host.append(fgCanvas);
  const fg = new THREE.WebGLRenderer({ canvas: fgCanvas, antialias: true, alpha: true });
  fg.setPixelRatio(renderer.getPixelRatio());
  fg.toneMapping = THREE.NeutralToneMapping;
  const fgEnv = new THREE.PMREMGenerator(fg).fromScene(new RoomEnvironment(), 0.04).texture;
  const boardEnv = scene.environment;
  let fgShown = false;
  function setLayer(obj, l) {
    obj.traverse((o) => o.layers.set(l));
  }
  function renderFg(e) {
    if (e <= 0.001) {
      if (fgShown) {
        fg.clear();
        fgShown = false;
        canvas.style.filter = '';
      }
      return;
    }
    fgShown = true;
    canvas.style.filter = still ? '' : 'blur(' + (e * 3).toFixed(2) + 'px) brightness(' + (1 - e * 0.15).toFixed(3) + ')';
    scene.environment = fgEnv;
    camera.layers.set(1);
    fg.render(scene, camera);
    camera.layers.set(0);
    scene.environment = boardEnv;
  }

  // ---- case: low tray with a thin rim -----------------------------------------
  const rig = new THREE.Group();
  const board = new THREE.Group();
  board.rotation.x = 0.065; // typing angle
  rig.add(board);
  scene.add(rig);

  const OW = WIDTH + BEZEL * 2;
  const OD = HEIGHT + BEZEL * 2;
  const caseMat = new THREE.MeshPhysicalMaterial({ metalness: 0, roughness: 0.6, clearcoat: 0.08 });
  const plateMat = new THREE.MeshStandardMaterial({ metalness: 0.2, roughness: 0.8 });
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(rrect(OW - 0.04, OD - 0.04, 0.16), { depth: BASE_H, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 8 }),
    caseMat,
  );
  body.geometry.rotateX(-Math.PI / 2);
  body.position.y = -BASE_H - 0.02;
  const rimShape = rrect(OW - 0.04, OD - 0.04, 0.16);
  rimShape.holes.push(new THREE.Path(rrect(WIDTH + 0.02, HEIGHT + 0.02, 0.06).getPoints(40).reverse()));
  const rim = new THREE.Mesh(
    new THREE.ExtrudeGeometry(rimShape, { depth: RIM_H - 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 8 }),
    caseMat,
  );
  rim.geometry.rotateX(-Math.PI / 2);
  rim.position.y = 0.02;
  for (const m of [body, rim]) {
    m.castShadow = true;
    m.receiveShadow = true;
    board.add(m);
  }
  // MONSGEEK wordmark (purple) on the right of the case front, like the product
  const BRAND_W = 1.9;
  const brandMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0 });
  const brand = new THREE.Mesh(new THREE.PlaneGeometry(BRAND_W, BRAND_W * (64 / 447)), brandMat);
  brand.position.set(OW / 2 - 0.35 - BRAND_W / 2, -BASE_H * 0.42, OD / 2 + 0.003);
  board.add(brand);
  new THREE.TextureLoader().load('/monsgeek-wordmark.png', (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso;
    const img = tex.image;
    brand.geometry.dispose();
    brand.geometry = new THREE.PlaneGeometry(BRAND_W, BRAND_W * (img.height / img.width));
    brandMat.map = tex;
    brandMat.opacity = 1;
    brandMat.needsUpdate = true;
    needs = true;
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH + 0.05, HEIGHT + 0.05), plateMat);
  plate.rotation.x = -Math.PI / 2;
  plate.position.y = 0.001;
  plate.receiveShadow = true;
  board.add(plate);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.ShadowMaterial({ opacity: 0.2 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -BASE_H - 0.06;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- keys ---------------------------------------------------------------------
  const glowTex = glowTexture();
  const capGlow = capGlowTexture();
  const glowGeo = new THREE.PlaneGeometry(1, 1);
  const keys = new Map();
  const caps = [];
  const makeTex = (w, h) => {
    const c = document.createElement('canvas');
    c.width = Math.max(8, Math.round(w * PPU));
    c.height = Math.max(8, Math.round(h * PPU));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = aniso;
    return { c, ctx: c.getContext('2d'), tex };
  };
  const glowMat = () =>
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });

  // Akko Glare magnetic switches under every cap (clear mint top housing,
  // light-pipe lens, mint stem). Instanced: 61 switches, six draw calls.
  const N = KEY_INDEXES.length;
  const SG = glareGeometry();
  const SM = glareMaterials();
  const inst = (geo, mat) => {
    const im = new THREE.InstancedMesh(geo, mat, N);
    im.castShadow = !mat.transparent;
    im.receiveShadow = true;
    board.add(im);
    return im;
  };
  const swBody = inst(SG.body, SM.stem);
  const swCrossA = inst(SG.crossA, SM.stem);
  const swCrossB = inst(SG.crossB, SM.stem);
  const swTop = inst(SG.top, SM.top);
  const swLens = inst(SG.lens, SM.lens);
  const leds = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.03, 0.09), new THREE.MeshBasicMaterial({ toneMapped: false }), N);
  board.add(leds);
  const m4 = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const black = new THREE.Color(0x111111);
  let swIndex = 0;

  for (const idx of KEY_INDEXES) {
    const g = GEOMETRY[idx];
    const row = g.y;
    const H = ROW_H[row];
    const si = swIndex++;
    const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.66, metalness: 0, clearcoatRoughness: 0.35, emissiveMap: capGlow });
    const cap = new THREE.Mesh(capGeometry(g.w, row), mat);
    cap.castShadow = true;
    cap.receiveShadow = true;
    cap.userData.idx = idx;
    const x = g.x + g.w / 2 - WIDTH / 2;
    const z = g.y + 0.5 - HEIGHT / 2;
    swTop.setMatrixAt(si, m4.makeTranslation(x, 0, z));
    swLens.setMatrixAt(si, m4);
    leds.setMatrixAt(si, m4.makeTranslation(x, SWH * 0.42, z + SWW / 2 + 0.004));
    leds.setColorAt(si, black);
    // light pool inside the cap, just behind the front wall (seen through clear caps)
    const bloom = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 }));
    bloom.scale.set(Math.min(g.w, 1.6) * 0.62, 0.42, 1);
    bloom.position.set(x, SWH * 0.55, z + 0.3);
    board.add(bloom);
    const holder = new THREE.Group();
    holder.position.set(x, SWITCH_H, z);
    holder.add(cap);

    // top face decal (live driver info + Misty legends), follows the row slope
    const topW = g.w - GAP - TAPER_X * 2 - 0.12;
    const topD = (1 - GAP) * (1 - TAPER_Z) - 0.12;
    const top = makeTex(topW, topD);
    const topMat = new THREE.MeshBasicMaterial({ map: top.tex, transparent: true, depthWrite: false, toneMapped: false });
    const topMesh = new THREE.Mesh(new THREE.PlaneGeometry(topW, topD), topMat);
    topMesh.rotation.x = -Math.PI / 2 + Math.atan(-ROW_SLOPE[row]);
    topMesh.position.set(0, H + 0.006, -0.02);
    cap.add(topMesh);
    const leg = makeTex(topW, topD);
    const legMat = new THREE.MeshBasicMaterial({ map: leg.tex, transparent: true, depthWrite: false, toneMapped: false });
    const legMesh = new THREE.Mesh(topMesh.geometry, legMat);
    legMesh.rotation.copy(topMesh.rotation);
    legMesh.position.copy(topMesh.position);
    legMesh.position.y -= 0.001;
    cap.add(legMesh);

    // front wall legend (side-printed, lit by the south LED)
    const zBot = (1 - GAP) / 2;
    const zTop = zBot * (1 - TAPER_Z) - 0.02;
    const yTop = H + zTop * ROW_SLOPE[row];
    const lean = Math.atan2(zBot - zTop, yTop);
    const frontW = topW + 0.04;
    const frontH = 0.17;
    const front = makeTex(frontW, frontH);
    const frontMat = new THREE.MeshBasicMaterial({ map: front.tex, transparent: true, depthWrite: false, toneMapped: false });
    const frontMesh = new THREE.Mesh(new THREE.PlaneGeometry(frontW, frontH), frontMat);
    frontMesh.rotation.x = -lean;
    const fy = yTop * 0.46;
    frontMesh.position.set(0, fy, zBot - (zBot - zTop) * (fy / yTop) + 0.004);
    cap.add(frontMesh);

    // South-facing LED: a strong pool at the front edge of the switch, plus a
    // faint halo that leaks around the other sides of the cap.
    const led = new THREE.Mesh(glowGeo, glowMat());
    led.rotation.x = -Math.PI / 2;
    led.scale.set(Math.min(g.w, 1.4) * 0.95, 0.62, 1);
    led.position.set(x, 0.004, z + 0.36);
    board.add(led);
    const halo = new THREE.Mesh(glowGeo, glowMat());
    halo.rotation.x = -Math.PI / 2;
    halo.scale.set(g.w + 0.3, 1.3, 1);
    halo.position.set(x, 0.003, z + 0.12);
    board.add(halo);

    board.add(holder);
    caps.push(cap);
    keys.set(idx, {
      idx, si, x, z, bloom, g, row, cap, mat, holder, top, topMesh, leg, legMat, legMesh, front, frontMat, led, halo,
      legend: legendOf(idx), y: 0, ty: 0, flash: 0, hover: false, down: false,
    });
  }

  function placeStem(k) {
    const mtx = k.hidden ? zero : m4.makeTranslation(k.x, k.y, k.z);
    for (const im of [swBody, swCrossA, swCrossB]) {
      im.setMatrixAt(k.si, mtx);
      im.instanceMatrix.needsUpdate = true;
    }
  }
  function hideSwitch(k, hide) {
    k.hidden = hide;
    const mtx = hide ? zero : m4.makeTranslation(k.x, 0, k.z);
    swTop.setMatrixAt(k.si, mtx);
    swLens.setMatrixAt(k.si, mtx);
    swTop.instanceMatrix.needsUpdate = swLens.instanceMatrix.needsUpdate = true;
    placeStem(k);
  }
  for (const k of keys.values()) placeStem(k);
  swTop.instanceMatrix.needsUpdate = swLens.instanceMatrix.needsUpdate = true;
  leds.instanceMatrix.needsUpdate = true;

  // ---- appearance -----------------------------------------------------------------
  let CW = COLORWAYS[getColorway()] || COLORWAYS.black;
  let U = UI[isDark() ? 'dark' : 'light'];
  const tmp = new THREE.Color();
  const accent = new THREE.Color();
  const has = (k, c) => (' ' + (kb.keys.get(k.idx).c.cls || '') + ' ').includes(' ' + c + ' ');
  const gauge = () => kb.root.classList.contains('gauge');
  const font = (px, w = 600) => `${w} ${px}px Inter, "Helvetica Neue", Arial, sans-serif`;

  function applyLook() {
    U = UI[isDark() ? 'dark' : 'light'];
    CW = COLORWAYS[getColorway()] || COLORWAYS.black;
    caseMat.color.setHex(CW.case);
    caseMat.roughness = CW.caseRough;
    plateMat.color.setHex(CW.plate);
    scene.environmentIntensity = U.env * (CW.env ?? 1);
    sun.intensity = U.sun;
    ground.material.opacity = U.shadow;
    accent.set(U.accent);
    for (const k of keys.values()) {
      k.legend = legendOf(k.idx);
      k.mat.roughness = CW.capRough;
      k.mat.clearcoat = CW.clearcoat || 0;
      // translucent caps let the switch underneath show through
      const see = CW.capOpacity ?? 1;
      if (k.mat.transparent !== see < 1) k.mat.needsUpdate = true;
      k.mat.transparent = see < 1;
      k.mat.opacity = see;
      drawFront(k);
      drawLegend(k);
      drawTop(k);
      paintKey(k);
    }
    needs = true;
  }
  const sidePrint = () => CW.style !== 'dye' && getLegendPos() === 'side';

  // Physical legend on the top face: shine-through (lit by the LED) or dye-sub.
  // Small vector glyphs used on modifier caps (Backspace, Enter, Shift, Menu).
  function icon(x, kind, cx, cy, sz) {
    x.save();
    x.translate(cx, cy);
    x.lineWidth = sz * 0.13;
    x.lineJoin = 'round';
    x.lineCap = 'round';
    x.beginPath();
    if (kind === 'back') {
      x.moveTo(sz * 0.5, 0);
      x.lineTo(-sz * 0.45, 0);
      x.moveTo(-sz * 0.15, -sz * 0.3);
      x.lineTo(-sz * 0.48, 0);
      x.lineTo(-sz * 0.15, sz * 0.3);
      x.stroke();
    } else if (kind === 'enter') {
      x.moveTo(sz * 0.45, -sz * 0.4);
      x.lineTo(sz * 0.45, sz * 0.05);
      x.lineTo(-sz * 0.45, sz * 0.05);
      x.moveTo(-sz * 0.18, -sz * 0.22);
      x.lineTo(-sz * 0.48, sz * 0.05);
      x.lineTo(-sz * 0.18, sz * 0.32);
      x.stroke();
    } else if (kind === 'shift') {
      x.moveTo(0, -sz * 0.5);
      x.lineTo(sz * 0.48, 0);
      x.lineTo(sz * 0.2, 0);
      x.lineTo(sz * 0.2, sz * 0.45);
      x.lineTo(-sz * 0.2, sz * 0.45);
      x.lineTo(-sz * 0.2, 0);
      x.lineTo(-sz * 0.48, 0);
      x.closePath();
      x.stroke();
    } else if (kind === 'tab') {
      // |<-  ->|
      x.moveTo(-sz * 0.5, -sz * 0.42);
      x.lineTo(-sz * 0.5, -sz * 0.02);
      x.moveTo(sz * 0.4, -sz * 0.22);
      x.lineTo(-sz * 0.45, -sz * 0.22);
      x.moveTo(-sz * 0.25, -sz * 0.38);
      x.lineTo(-sz * 0.45, -sz * 0.22);
      x.lineTo(-sz * 0.25, -sz * 0.06);
      x.moveTo(sz * 0.5, sz * 0.02);
      x.lineTo(sz * 0.5, sz * 0.42);
      x.moveTo(-sz * 0.4, sz * 0.22);
      x.lineTo(sz * 0.45, sz * 0.22);
      x.moveTo(sz * 0.25, sz * 0.06);
      x.lineTo(sz * 0.45, sz * 0.22);
      x.lineTo(sz * 0.25, sz * 0.38);
      x.stroke();
    } else if (kind === 'menu') {
      x.lineWidth = sz * 0.1;
      x.strokeRect(-sz * 0.4, -sz * 0.45, sz * 0.8, sz * 0.9);
      for (const yy of [-0.2, 0, 0.2]) {
        x.moveTo(-sz * 0.22, sz * yy);
        x.lineTo(sz * 0.22, sz * yy);
      }
      x.stroke();
    }
    x.restore();
  }

  // Physical legend on the top face, laid out like the real caps: single
  // characters top-centre, shifted pairs stacked, modifiers with an icon.
  function drawLegend(k) {
    const { c, ctx: x } = k.leg;
    const W = c.width;
    const Hh = c.height;
    x.clearRect(0, 0, W, Hh);
    const L = k.legend;
    const physical = L.word !== undefined ? L.word : L.main;
    if (!sidePrint() && (physical || L.icon)) {
      const ink = CW.style === 'shine' ? '#ffffff' : CW.legend;
      x.fillStyle = ink;
      x.strokeStyle = ink;
      x.textBaseline = 'middle';
      const left = PPU * 0.06;
      x.textAlign = 'left';
      if (L.icon === 'menu') {
        icon(x, 'menu', left + PPU * 0.1, Hh * 0.3, PPU * 0.17);
      } else if (L.icon === 'tab') {
        icon(x, 'tab', left + PPU * 0.1, Hh * 0.24, PPU * 0.16);
        x.font = font(PPU * 0.11, 650);
        x.fillText(L.word, left, Hh * 0.6);
      } else if (L.word !== undefined) {
        const sz = PPU * 0.11;
        x.font = font(sz, 650);
        const iw = L.icon ? sz * 1.45 : 0;
        if (L.icon) icon(x, L.icon, left + sz * 0.55, Hh * 0.3, sz * 1.1);
        x.fillText(L.word, left + iw, Hh * 0.3, W - left - iw - PPU * 0.04);
      } else if (L.shift) {
        x.font = font(PPU * 0.16, 650);
        x.fillText(L.shift, left, Hh * 0.24);
        x.fillText(L.main, left, Hh * 0.6);
      } else {
        x.font = font(PPU * 0.21, 650);
        x.fillText(physical, left, Hh * 0.32);
      }
      x.textAlign = 'left';
    }
    k.leg.tex.needsUpdate = true;
  }

  function drawFront(k) {
    const { c, ctx: x } = k.front;
    x.clearRect(0, 0, c.width, c.height);
    k.frontMat.visible = sidePrint();
    const L = k.legend;
    const text = L.word !== undefined ? L.word.toUpperCase() : L.shift ? L.main + ' ' + L.shift : L.main;
    if (sidePrint() && text) {
      x.font = font(PPU * (L.word ? 0.1 : 0.13), 700);
      x.textBaseline = 'middle';
      x.textAlign = L.word ? 'left' : 'center';
      x.fillStyle = '#ffffff';
      x.fillText(text, L.word ? PPU * 0.04 : c.width / 2, c.height / 2, c.width - PPU * 0.06);
    }
    k.front.tex.needsUpdate = true;
  }

  function drawTop(k) {
    const st = kb.keys.get(k.idx).c;
    const { c, ctx: x } = k.top;
    const W = c.width;
    const Hh = c.height;
    x.clearRect(0, 0, W, Hh);
    const L = k.legend;
    // compare against the US name the driver reports, not the printed legend
    const physical = L.word !== undefined ? L.word : L.us ?? L.main;
    const shown = st.label || '';
    const same = (a) => shown === physical || (a && a.test(shown));
    const alias = { Backspace: /^Bksp$/, 'Caps Lock': /^Caps$/, Shift: /Shift$/, Ctrl: /Ctrl$/, Alt: /Alt$/, Win: /Win$/, Enter: /^Enter$/, Esc: /^Esc$/, '': /^Space$/ };
    const remap = shown && !same(alias[physical]);
    const pad = PPU * 0.05;
    if (remap || has(k, 'off')) {
      x.font = font(PPU * (shown.length > 4 ? 0.13 : 0.19), 650);
      x.textBaseline = 'top';
      x.fillStyle = has(k, 'off') ? U.muted : U.accent;
      x.fillText(has(k, 'off') ? '—' : shown, pad, pad, W - pad * 3);
    }
    k.legMesh.visible = !(remap || has(k, 'off'));
    if (st.sub) {
      // value badge: white pill + bold dark text, readable on lit or dark caps
      const fs = PPU * 0.16;
      x.font = font(fs, 750);
      const tw = Math.min(x.measureText(st.sub).width, W - pad * 2 - fs * 0.8);
      const bh = fs * 1.35;
      const by = Hh - bh - pad * 0.4;
      x.fillStyle = 'rgba(255,255,255,0.94)';
      x.beginPath();
      x.roundRect(pad * 0.6, by, tw + fs * 0.8, bh, bh / 2);
      x.fill();
      x.fillStyle = '#111113';
      x.textBaseline = 'middle';
      x.textAlign = 'left';
      x.fillText(st.sub, pad * 0.6 + fs * 0.4, by + bh / 2 + 1, tw);
    }
    if (has(k, 'mod') && !gauge()) {
      x.fillStyle = U.accent;
      x.beginPath();
      x.arc(W - PPU * 0.06, PPU * 0.06, PPU * 0.035, 0, Math.PI * 2);
      x.fill();
    }
    if (gauge()) {
      const f = Number(st.fill) || 0;
      const bw = PPU * 0.04;
      const bx = W - bw - PPU * 0.015;
      x.globalAlpha = 0.35;
      x.fillStyle = CW.cap > 0x888888 ? '#8e8e93' : '#a1a1a6';
      x.fillRect(bx, PPU * 0.04, bw, Hh - PPU * 0.08);
      x.globalAlpha = 1;
      x.fillStyle = U.accent;
      x.fillRect(bx, PPU * 0.04, bw, (Hh - PPU * 0.08) * f);
    }
    k.top.tex.needsUpdate = true;
  }

  function paintKey(k) {
    const st = kb.keys.get(k.idx).c;
    const led = parseColor(st.color);
    const m = k.mat;
    const accentCap = CW.accentCap && CW.accentKeys.includes(k.idx);
    m.color.setHex(accentCap ? CW.accentCap : CW.cap);
    m.emissive.setRGB(0, 0, 0);
    if (has(k, 'sel')) m.color.lerp(accent, 0.28);
    if (has(k, 'done')) m.color.lerp(tmp.setHex(U.ok), 0.4);
    if (k.down) m.color.lerp(accent, 0.25);
    m.emissiveIntensity = 1;
    k.frontMat.color.set(CW.legend).multiplyScalar(CW.legendDim);
    if (CW.style === 'shine') k.legMat.color.set(CW.legend).multiplyScalar(CW.legendDim);
    else k.legMat.color.setRGB(1, 1, 1);
    if (CW.style !== 'shine') k.frontMat.color.setRGB(1, 1, 1);
    if (led && led.a > 0.01) {
      // the south LED sits right behind the side-printed legend
      if (CW.style === 'shine') k.frontMat.color.lerp(tmp.copy(led.c).multiplyScalar(1.9), Math.min(1, led.a));
      if (CW.style === 'shine') k.legMat.color.lerp(tmp.copy(led.c).multiplyScalar(1.7), Math.min(1, led.a * 0.95));
      if (CW.cap > 0x888888) m.color.lerp(led.c, led.a * 0.1);
      if (CW.cap > 0x888888) m.emissive.copy(led.c).multiplyScalar(led.a * 0.03);
      // translucent caps: the LED lights the plastic from inside
      if (CW.glare) {
        m.emissive.copy(led.c);
        m.emissiveIntensity = led.a * CW.glare;
      }
      k.led.material.color.copy(led.c);
      k.led.material.opacity = Math.min(1, led.a * (CW.glare ? 0.3 : 1.25));
      k.halo.material.color.copy(led.c);
      k.halo.material.opacity = led.a * (CW.glare ? 0.08 : 0.55);
      leds.setColorAt(k.si, tmp.copy(led.c).multiplyScalar(0.4 + led.a * 1.4));
      k.bloom.material.color.copy(led.c);
      k.bloom.material.opacity = 0;
    } else {
      leds.setColorAt(k.si, black);
      k.bloom.material.opacity = 0;
      k.led.material.opacity = 0;
      k.halo.material.opacity = 0;
    }
    leds.instanceColor.needsUpdate = true;
    if (k.flash > 0) m.emissive.lerp(accent, k.flash * 0.5);
    const fill = Number(st.fill) || 0;
    const travel = !gauge() && fill > 0;
    k.ty = (k.hover ? 0.03 : 0) + (has(k, 'sel') ? 0.04 : 0) - (k.down ? 0.16 : 0) - (travel ? Math.min(1, fill) * 0.19 : 0);
  }

  const unsub = kb.subscribe((type, idx, what) => {
    const k = keys.get(idx);
    if (!k) return;
    if (type === 'set') {
      if (what === 'text') drawTop(k);
      paintKey(k);
    } else if (type === 'flash') k.flash = 1;
    else if (type === 'press') {
      k.down = what;
      paintKey(k);
    }
    needs = true;
  });
  const classWatch = new MutationObserver(() => {
    for (const k of keys.values()) {
      drawTop(k);
      paintKey(k);
    }
    needs = true;
  });
  classWatch.observe(kb.root, { attributes: true, attributeFilter: ['class'] });
  const themeWatch = new MutationObserver(applyLook);
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', applyLook);
  addEventListener('colorway', applyLook);

  // ---- camera + controls ------------------------------------------------------
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  // left drag rotates (also on keys); right drag always rotates
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.rotateSpeed = 0.6;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = 1.4;
  controls.minAzimuthAngle = -1.2;
  controls.maxAzimuthAngle = 1.2;
  controls.target.copy(target);

  let fitDist = 30;
  function fit() {
    // on-screen size (includes CSS zoom on large displays) so the canvas stays sharp
    const r = host.getBoundingClientRect();
    const w = r.width;
    const h = r.height;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    fg.setSize(w, h, false);
    camera.aspect = w / h;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const halfW = (OW + 0.5) / 2;
    const halfD = (OD * Math.sin(ELEV) + 1.1 * Math.cos(ELEV)) / 2 + 0.2;
    fitDist = Math.max(halfW / (tanV * camera.aspect), halfD / tanV);
    controls.minDistance = fitDist * 0.12;
    controls.maxDistance = fitDist * 1.7;
    camera.updateProjectionMatrix();
    needs = true;
  }
  const homePos = (d) => new THREE.Vector3(target.x, target.y + Math.sin(ELEV) * d, target.z + Math.cos(ELEV) * d);
  // Camera flights (home view, focus on a key).
  let flight = null;
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  function flyTo(pos, tgt, dur = 0.9) {
    intro = 1; // a flight always wins over the entrance dolly
    flight = { fp: camera.position.clone(), tp: pos, ft: controls.target.clone(), tt: tgt, t: 0, dur: still ? 0.001 : dur };
  }
  const goHome = () => flyTo(homePos(fitDist), target.clone(), 0.8);

  // ---- exploded switch (focus mode) -------------------------------------------
  const partNames = () => ({
    sensor: tr('pSensor'), bottom: tr('pBottom'), magnet: tr('pMagnet'), spring: tr('pSpring'), stem: tr('pStem'), housing: tr('pHousing'),
  });
  const DG = glareDetailGeometry();
  const xsw = createExploded(DG, SM, partNames());
  // the real switch model replaces the procedural one on first focus
  let modelReq = null;
  function loadModel() {
    modelReq ||= loadSwitchModel('/models/akko-switch/switch.gltf', SM, DG.lens)
      .then((m) => {
        xsw.useModel(m);
        setLayer(xsw.group, focusK ? 1 : 0);
        needs = true;
      })
      .catch((e) => console.warn('switch model unavailable', e));
  }
  board.add(xsw.group);
  let focusK = null;
  let explode = 0;
  let explodeTo = 0;
  const wp = new THREE.Vector3();
  function focus(idx, part) {
    const k = keys.get(idx);
    if (!k) return;
    if (focusK && focusK !== k) {
      // put the previous key back on its switch right away
      hideSwitch(focusK, false);
      focusK.lift = 0;
      focusK.holder.position.y = SWITCH_H + focusK.y;
      focusK.holder.visible = true;
      explode = 0; // the new switch flies apart from assembled
      xsw.update(0, 0);
    }
    if (focusK && focusK !== k) setLayer(focusK.holder, 0);
    focusK = k;
    hideSwitch(k, true);
    setLayer(k.holder, 1);
    if (WHOLE) k.holder.visible = false; // show the bare switch, like a product shot
    setLayer(xsw.group, 1);
    loadModel();
    xsw.group.position.set(k.x, 0, k.z);
    xsw.setNames(partNames(), isDark());
    xsw.setHot(part || null);
    explodeTo = 1;
    board.localToWorld(wp.set(k.x, WHOLE ? 1.78 : 2.05, k.z));
    const az = k.x < 0 ? -0.5 : 0.5; // look from the key's own side
    xsw.setYaw(az - 0.45); // face the camera, turned to show the right side (product shot)
    const d = (WHOLE ? 0.72 : 1.95) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    flyTo(new THREE.Vector3(wp.x + Math.sin(az) * Math.cos(0.42) * d, wp.y + Math.sin(0.42) * d, wp.z + Math.cos(az) * Math.cos(0.42) * d), wp.clone(), 1.1);
    needs = true;
  }
  function unfocus() {
    if (!focusK) return;
    focusK.holder.visible = true; // the cap drops back onto its switch
    explodeTo = 0;
    goHome();
  }


  // ---- input --------------------------------------------------------------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const ready = () => document.body.classList.contains('ready');
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(caps, false)[0];
    return hit ? hit.object.userData.idx : undefined;
  }
  let dragging = false;
  let lastIdx;
  let hovered;
  let interacting = false;
  const setHover = (idx) => {
    if (idx === hovered) return;
    if (hovered !== undefined) {
      const k = keys.get(hovered);
      k.hover = false;
      paintKey(k);
    }
    hovered = idx;
    if (idx !== undefined) {
      const k = keys.get(idx);
      k.hover = true;
      paintKey(k);
    }
    canvas.style.cursor = idx !== undefined ? 'pointer' : 'grab';
    needs = true;
  };
  // A press on a key is a click (select) unless the pointer travels: then it
  // is a rotation. Views that paint/select by dragging set kb.dragSelect.
  let pending = null;
  canvas.addEventListener('pointerdown', (e) => {
    interacting = true;
    flight = null;
    const idx = ready() && e.button === 0 ? pick(e) : undefined;
    if (idx === undefined) return;
    if (!kb.dragSelect) {
      pending = { idx, x: e.clientX, y: e.clientY, moved: false };
      return;
    }
    controls.enabled = false;
    dragging = true;
    lastIdx = idx;
    canvas.setPointerCapture(e.pointerId);
    kb.emit('down', idx, e);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pending && !pending.moved && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > 5) pending.moved = true;
    const idx = pick(e);
    if (dragging) {
      if (idx !== undefined && idx !== lastIdx) {
        lastIdx = idx;
        kb.emit('drag', idx, e);
      }
      return;
    }
    setHover(ready() ? idx : undefined);
  });
  const up = (e) => {
    if (pending && !pending.moved && e?.type === 'pointerup') {
      kb.emit('down', pending.idx, e);
      kb.endDrag();
    }
    pending = null;
    if (dragging) kb.endDrag();
    dragging = false;
    controls.enabled = true;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', () => setHover(undefined));
  canvas.addEventListener('dblclick', (e) => pick(e) === undefined && goHome());
  controls.addEventListener('start', () => {
    interacting = true;
    canvas.style.cursor = 'grabbing';
  });
  controls.addEventListener('end', () => (canvas.style.cursor = 'grab'));

  // ---- loop -----------------------------------------------------------------------
  let needs = true;
  let raf = 0;
  let last = performance.now();
  let intro = 0;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ro = new ResizeObserver(() => {
    fit();
    if (intro >= 1 && !interacting) camera.position.copy(homePos(fitDist));
  });
  ro.observe(host);

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let active = false;
    if (intro < 1 && !interacting) {
      intro = still ? 1 : Math.min(1, intro + dt / 1.6);
      const e = 1 - Math.pow(1 - intro, 4);
      camera.position.copy(homePos(fitDist * (1.35 - 0.35 * e)));
      controls.target.copy(target);
      active = true;
    } else intro = 1;

    const swayTarget = ready() || still ? 0 : Math.sin(now / 2600) * 0.3;
    const ny = rig.rotation.y + (swayTarget - rig.rotation.y) * (1 - Math.exp(-dt * (ready() ? 6 : 2)));
    if (Math.abs(ny - rig.rotation.y) > 1e-5) {
      rig.rotation.y = ny;
      active = true;
    }
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / flight.dur);
      const e = ease(flight.t);
      camera.position.lerpVectors(flight.fp, flight.tp, e);
      controls.target.lerpVectors(flight.ft, flight.tt, e);
      if (flight.t >= 1) flight = null;
      active = true;
    }
    // explode / reassemble the focused switch; its cap rides on top
    if (focusK) {
      const ns = explode + (explodeTo - explode) * (1 - Math.exp(-dt * (explodeTo ? 4.2 : 6)));
      explode = Math.abs(ns - explodeTo) < 0.002 ? explodeTo : ns;
      xsw.update(explode, now / 1000);
      focusK.lift = explode * xsw.capLift;
      focusK.holder.position.y = SWITCH_H + focusK.y + focusK.lift;
      if (explode === 0 && explodeTo === 0) {
        setLayer(focusK.holder, 0);
        focusK.holder.visible = true;
        hideSwitch(focusK, false);
        focusK.lift = 0;
        focusK = null;
        xsw.update(0, 0);
      }
      active = true;
    }
    if (controls.update()) active = true;
    const s = 1 - Math.exp(-dt * 28);
    for (const k of keys.values()) {
      if (Math.abs(k.ty - k.y) > 1e-4) {
        k.y += (k.ty - k.y) * s;
        k.holder.position.y = SWITCH_H + k.y + (k.lift || 0);
        placeStem(k);
        active = true;
      }
      if (k.flash > 0) {
        k.flash = Math.max(0, k.flash - dt * 1.6);
        paintKey(k);
        active = true;
      }
    }
    if (active || needs) {
      renderer.render(scene, camera);
      renderFg(focusK ? explode : 0);
      needs = false;
    }
  }

  Promise.all([document.fonts?.load('600 20px Inter', 'ĞÜŞİÖÇ'), document.fonts?.ready]).then(() => {
    for (const k of keys.values()) {
      drawFront(k);
      drawLegend(k);
      drawTop(k);
    }
    needs = true;
  });
  applyLook();
  fit();
  camera.position.copy(homePos(fitDist * (still ? 1 : 1.35)));
  controls.update();
  raf = requestAnimationFrame(frame);
  host.classList.add('three');

  return {
    home: goHome,
    focus,
    unfocus,
    setPart(part) {
      xsw.setHot(part || null);
      needs = true;
    },
    destroy() {
      cancelAnimationFrame(raf);
      unsub();
      classWatch.disconnect();
      themeWatch.disconnect();
      mq.removeEventListener('change', applyLook);
      removeEventListener('colorway', applyLook);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      canvas.remove();
      fg.dispose();
      fgCanvas.remove();
      host.classList.remove('three');
    },
  };
}
