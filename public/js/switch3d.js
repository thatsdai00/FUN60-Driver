// Akko Glare magnetic switch: shared geometry/materials for the instanced
// switches on the board, plus a detailed exploded-view model with labels.
import * as THREE from '../vendor/three.module.min.js';

export const SWW = 0.735; // 14 mm housing (1 unit = 19.05 mm)
export const SWH = 0.27; // top housing height above the plate
const RAISE = 1.18;
// WHOLE: show the assembled switch floating and turning; false = exploded parts
export const WHOLE = true;

const MINT = 0xd3f3e5; // opaque parts: very pale mint
const MINT_DEEP = 0x9ed8bf;

function taperedBox(w, h, d, top, r = 0.04) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 4 });
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / h;
    const f = 1 - (1 - top) * t;
    p.setX(i, p.getX(i) * f);
    p.setZ(i, p.getZ(i) * f);
  }
  g.computeVertexNormals();
  return g;
}

export function glareGeometry() {
  // top housing (clear mint), sits on the plate: y 0 .. SWH
  const top = taperedBox(SWW, SWH, SWW, 0.8);
  // light-pipe lens on the south half of the top housing
  const lens = new THREE.SphereGeometry(0.17, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  lens.scale(1.25, 0.75, 0.95);
  lens.translate(0, SWH - 0.03, 0.12);
  // stem: body + cross (cross axis goes into the cap)
  const body = new THREE.BoxGeometry(0.34, 0.12, 0.27);
  body.translate(0, SWH + 0.03, -0.02);
  const crossA = new THREE.BoxGeometry(0.215, 0.2, 0.062);
  crossA.translate(0, SWH + 0.17, -0.02);
  const crossB = new THREE.BoxGeometry(0.062, 0.2, 0.215);
  crossB.translate(0, SWH + 0.17, -0.02);
  // below the plate (exploded view only)
  const bottom = taperedBox(SWW, 0.2, SWW, 0.98);
  bottom.translate(0, -0.21, 0);
  const pin = new THREE.CylinderGeometry(0.035, 0.03, 0.12, 12);
  pin.translate(0, -0.27, 0);
  const magnet = new THREE.CylinderGeometry(0.075, 0.075, 0.1, 24);
  magnet.translate(0, 0.0, -0.02);
  const pts = [];
  const turns = 7;
  for (let i = 0; i <= turns * 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * 0.11, -0.16 + (i / (turns * 32)) * 0.36, Math.sin(a) * 0.11 - 0.02));
  }
  const spring = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 40, 0.011, 6, false);
  const pcb = new THREE.BoxGeometry(0.62, 0.03, 0.62);
  pcb.translate(0, -0.44, 0);
  const sensor = new THREE.BoxGeometry(0.16, 0.05, 0.12);
  sensor.translate(0, -0.4, -0.02);
  return { top, lens, body, crossA, crossB, bottom, pin, magnet, spring, pcb, sensor };
}

// Detailed Akko Glare switch (the floating / exploded model), proportioned
// after the product shot. y = 0 is the plate line (top of the bottom housing).
export function glareDetailGeometry() {
  // proportions measured off the Akko product shot (width 0.88 u, height
  // pin-excluded ~1.16 u): bottom 0.38, top housing 0.47 (0.1 skirt + 0.37
  // pyramid), stem 0.27 above the housing.
  const g = {};
  g.bottom = taperedBox(0.74, 0.38, 0.74, 1.08, 0.05);
  g.bottom.translate(0, -0.42, 0);
  g.rim = taperedBox(0.88, 0.04, 0.88, 1, 0.05);
  g.rim.translate(0, -0.04, 0);
  const notch = new THREE.Shape();
  notch.moveTo(-0.045, 0);
  notch.lineTo(0.045, 0);
  notch.lineTo(0, -0.15);
  notch.closePath();
  g.notches = mergeAll([-0.22, -0.1, 0.22].map((x) => {
    const n = new THREE.ExtrudeGeometry(notch, { depth: 0.02, bevelEnabled: false });
    n.translate(x, -0.08, 0.385);
    return n;
  }));
  g.pin = new THREE.CylinderGeometry(0.03, 0.02, 0.18, 14);
  g.pin.translate(0, -0.51, 0);
  // top housing: vertical skirt + steep pyramid
  const skirt = taperedBox(0.84, 0.1, 0.84, 1, 0.05);
  const pyr = taperedBox(0.84, 0.37, 0.84, 0.6, 0.05);
  pyr.translate(0, 0.1, 0);
  g.top = mergeAll([skirt, pyr]);
  g.topEdges = mergeAll([skirt, pyr]);
  const tabL = new THREE.BoxGeometry(0.03, 0.17, 0.24);
  tabL.translate(-0.435, 0.0, 0.04);
  const tabR = tabL.clone();
  tabR.translate(0.87, 0, 0);
  g.tabs = mergeAll([tabL, tabR]);
  // light-pipe lens: big clear dome on the left half of the front face
  g.lens = new THREE.SphereGeometry(0.2, 40, 24);
  g.lens.scale(1.1, 0.95, 0.36);
  g.lens.translate(-0.12, 0.25, 0.24);
  // stem: opaque column through the clear housing, cross on top
  g.column = new THREE.BoxGeometry(0.36, 0.56, 0.3);
  g.column.translate(0, 0.32, -0.02);
  g.crossA = new THREE.BoxGeometry(0.24, 0.14, 0.08);
  g.crossA.translate(0, 0.67, -0.02);
  g.crossB = new THREE.BoxGeometry(0.08, 0.14, 0.24);
  g.crossB.translate(0, 0.67, -0.02);
  g.magnet = new THREE.CylinderGeometry(0.07, 0.07, 0.09, 24);
  g.magnet.translate(0, 0.1, -0.02);
  const pts = [];
  for (let i = 0; i <= 6 * 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * 0.1, -0.36 + (i / (6 * 32)) * 0.5, Math.sin(a) * 0.1 - 0.02));
  }
  g.spring = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.009, 6, false);
  g.pcb = new THREE.BoxGeometry(0.7, 0.03, 0.7);
  g.pcb.translate(0, -0.66, 0);
  g.chip = new THREE.BoxGeometry(0.16, 0.05, 0.12);
  g.chip.translate(0, -0.62, -0.02);
  return g;
}

function mergeAll(list) {
  // tiny merge for non-indexed / indexed geometries with the same attributes
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const arrays = geos.map((g) => g.attributes[name]?.array).filter(Boolean);
    if (arrays.length !== geos.length) continue;
    const size = geos[0].attributes[name].itemSize;
    const total = arrays.reduce((n, a) => n + a.length, 0);
    const merged = new Float32Array(total);
    let o = 0;
    for (const a of arrays) {
      merged.set(a, o);
      o += a.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(merged, size));
  }
  return out;
}

export function glareMaterials() {
  return {
    top: new THREE.MeshPhysicalMaterial({ color: 0xb6ead5, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.4, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xf4fffb, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.42, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false }),
    notch: new THREE.MeshStandardMaterial({ color: 0x8fcbb3, roughness: 0.6 }),
    stem: new THREE.MeshStandardMaterial({ color: MINT, roughness: 0.5 }),
    bottom: new THREE.MeshStandardMaterial({ color: MINT, roughness: 0.55 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xcfd3d8, roughness: 0.25, metalness: 1 }),
    magnet: new THREE.MeshStandardMaterial({ color: 0x5b6068, roughness: 0.3, metalness: 0.9 }),
    pcb: new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.6 }),
    sensor: new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.4 }),
  };
}

// Text label sprite anchored on its left edge.
function labelSprite() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const s = new THREE.Sprite(mat);
  s.center.set(0, 0.5);
  s.scale.set(1.35, 0.25, 1);
  s.renderOrder = 10;
  s.draw = (text, hot, dark) => {
    const x = c.getContext('2d');
    x.clearRect(0, 0, 512, 96);
    x.font = `${hot ? 700 : 600} 44px Inter, "Helvetica Neue", Arial, sans-serif`;
    const w = x.measureText(text).width + 56;
    x.fillStyle = hot ? '#2997ff' : dark ? 'rgba(28,28,30,0.86)' : 'rgba(255,255,255,0.9)';
    x.beginPath();
    x.roundRect(6, 14, w, 68, 34);
    x.fill();
    x.fillStyle = hot ? '#ffffff' : dark ? '#f5f5f7' : '#1d1d1f';
    x.textBaseline = 'middle';
    x.fillText(text, 34, 50);
    tex.needsUpdate = true;
  };
  return s;
}

// Detailed single switch that can fly apart. Parts are listed bottom to top
// with how far each one rises at full explode.
// Real switch model (glTF, metres, Z-up). Baked into key units with the plate
// line (5 mm above the model's base) at y = 0, split into our part groups.
export async function loadSwitchModel(url, mats, lensGeo) {
  const { GLTFLoader } = await import('../vendor/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene.getObjectByName('base');
  if (!root) throw new Error('switch model: no base node');
  root.removeFromParent();
  root.position.set(0, 0, 0);
  root.scale.setScalar(1 / 0.01905); // metres -> key units (19.05 mm)
  root.updateMatrixWorld(true);
  const lift = -0.005 / 0.01905;
  const out = { bottom: [], housing: [], stem: [], spring: [] };
  const matFor = {
    bottom: new THREE.MeshPhysicalMaterial({ color: MINT, roughness: 0.45, clearcoat: 0.2 }),
    housing: mats.top,
    stem: mats.stem,
    spring: mats.metal,
  };
  root.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.name;
    const key = n.startsWith('base') ? 'bottom' : n.startsWith('cAP') ? 'housing' : n.startsWith('Push') ? 'stem' : n.includes('spring') ? 'spring' : null;
    if (!key) return; // copper leaves: the Glare is magnetic, no contacts
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    g.translate(0, lift, 0);
    g.computeVertexNormals();
    out[key].push(new THREE.Mesh(g, matFor[key]));
  });
  // Glare light-pipe lens on the front of the clear housing
  const box = new THREE.Box3();
  for (const m of out.housing) box.expandByObject(m);
  if (lensGeo && !box.isEmpty()) {
    const lens = new THREE.Mesh(lensGeo.clone(), mats.lens);
    lens.geometry.center();
    lens.geometry.scale(0.78, 0.78, 0.78);
    lens.position.set(-0.1, box.min.y + (box.max.y - box.min.y) * 0.74, box.max.z - 0.08);
    out.housing.push(lens);
  }
  for (const k in out) for (const m of out[k]) m.castShadow = true;
  out.bounds = {};
  for (const k in out) {
    if (k === 'bounds') continue;
    const b = new THREE.Box3();
    for (const m of out[k]) b.expandByObject(m);
    out.bounds[k] = b;
  }
  return out;
}

export function createExploded(geo, mats, names) {
  const group = new THREE.Group();
  group.visible = false;
  const mk = (g, m) => {
    const mesh = new THREE.Mesh(g, m.clone());
    mesh.castShadow = true;
    return mesh;
  };
  const parts = [
    { key: 'sensor', lift: -0.2, meshes: [mk(geo.pcb, mats.pcb), mk(geo.chip, mats.sensor)], y: -0.66 },
    { key: 'bottom', lift: 0, meshes: [mk(geo.bottom, mats.bottom), mk(geo.rim, mats.bottom), mk(geo.notches, mats.notch), mk(geo.pin, mats.bottom)], y: -0.22 },
    { key: 'spring', lift: 0.45, meshes: [mk(geo.spring, mats.metal)], y: -0.02 },
    { key: 'magnet', lift: 0.85, meshes: [mk(geo.magnet, mats.magnet)], y: 0.22 },
    { key: 'housing', lift: 1.25, meshes: [mk(geo.top, mats.top), mk(geo.tabs, mats.top), mk(geo.lens, mats.lens)], y: 0.24 },
    { key: 'stem', lift: 1.8, meshes: [mk(geo.column, mats.stem), mk(geo.crossA, mats.stem), mk(geo.crossB, mats.stem)], y: 0.6 },
  ];
  const accent = new THREE.Color(0x2997ff);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x7fcfb0, transparent: true, opacity: 0.9 });
  for (const p of parts) {
    p.node = new THREE.Group();
    p.node.add(...p.meshes);
    if (p.key === 'housing') p.node.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo.topEdges, 20), edgeMat), new THREE.LineSegments(new THREE.EdgesGeometry(geo.tabs, 20), edgeMat));
    p.label = labelSprite();
    p.label.position.set(0.62, p.y, 0);
    p.node.add(p.label);
    group.add(p.node);
  }
  let hot = null;
  let dark = true;
  let yaw = 0;
  const redraw = () => parts.forEach((p) => p.label.draw(names[p.key], p.key === hot || (hot === 'stem' && p.key === 'magnet'), dark));
  return {
    group,
    parts,
    capLift: WHOLE ? 2.3 : 3.1,
    setNames(n, isDark) {
      names = n;
      dark = isDark;
      redraw();
    },
    // replace the procedural parts with meshes from the real model
    useModel(m) {
      for (const p of parts) {
        if (!m[p.key]?.length) continue;
        for (const old of [...p.node.children]) if (old !== p.label) p.node.remove(old);
        p.meshes = m[p.key].map((x) => {
          x.material = x.material.clone();
          return x;
        });
        p.node.add(...p.meshes);
        const b = m.bounds[p.key];
        p.label.position.y = (b.min.y + b.max.y) / 2;
        p.label.position.x = Math.max(0.62, b.max.x + 0.12);
      }
    },
    setYaw(v) {
      yaw = v;
    },
    setHot(part) {
      hot = part;
      redraw();
    },
    // e: 0 assembled .. 1 exploded; t: seconds (for the highlight pulse)
    update(e, t) {
      group.visible = e > 0.001;
      group.position.y = (WHOLE ? 1.6 : RAISE) * e; // float above the board
      // assembled switch slowly turns so it reads as a real 3D object
      group.rotation.y = WHOLE ? yaw * Math.min(1, e * 1.4) : 0;
      for (const p of parts) {
        const on = p.key === hot || (!WHOLE && ((hot === 'stem' && p.key === 'magnet') || (hot === 'sensor' && p.key === 'magnet')));
        const bob = on && !WHOLE ? Math.sin(t * 3.2) * 0.05 * e : 0;
        p.node.position.y = (WHOLE ? 0 : p.lift) * e + bob;
        // assembled: internals stay hidden like the real (opaque-stem) switch
        p.node.visible = !(WHOLE && (p.key === 'spring' || p.key === 'magnet' || (p.key === 'sensor' && hot !== 'sensor')));
        const show = WHOLE ? p.key === hot : true;
        p.label.material.opacity = show ? Math.max(0, (e - 0.55) / 0.45) : 0;
        for (const m of p.meshes) {
          m.material.emissive?.setRGB(0.55, 1, 0.8).multiplyScalar(on ? 0.12 + Math.sin(t * 3.2) * 0.06 : 0);
        }
      }
    },
  };
}
