// Low-poly model builders. Every vehicle faces -Z (the direction of travel).
import * as THREE from 'three';

const mats = new Map();
const geos = new Map();

function lam(color, opts) {
  const key = 'l' + color + (opts ? JSON.stringify(opts) : '');
  if (!mats.has(key)) mats.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  return mats.get(key);
}
function basic(color, opts) {
  const key = 'b' + color + (opts ? JSON.stringify(opts) : '');
  if (!mats.has(key)) mats.set(key, new THREE.MeshBasicMaterial({ color, ...opts }));
  return mats.get(key);
}
function geo(key, make) {
  if (!geos.has(key)) geos.set(key, make());
  return geos.get(key);
}

function mesh(g, m, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = shadow;
  return o;
}
function box(w, h, l, m, x, y, z, shadow) {
  return mesh(geo(`box${w},${h},${l}`, () => new THREE.BoxGeometry(w, h, l)), m, x, y, z, shadow);
}
// Cylinder with its axis along X, so rotation.x spins it like a wheel.
function wheelGeo(r, w) {
  return geo(`wh${r},${w}`, () => new THREE.CylinderGeometry(r, r, w, 16).rotateZ(Math.PI / 2));
}
function wheel(r, w, x, y, z) {
  const g = new THREE.Group();
  g.add(mesh(wheelGeo(r, w), lam(0x16181b)));
  g.add(mesh(wheelGeo(r * 0.5, w + 0.04), lam(0xb9bfc6), 0, 0, 0, false));
  g.position.set(x, y, z);
  return g;
}

const HEAD = 0xfff3c4;
const TAIL = 0xff2a1f;

export function playerCar() {
  const g = new THREE.Group();
  const red = lam(0xd62828);
  g.add(box(1.05, 0.5, 3.0, red, 0, 0.6, 0.1));
  g.add(box(0.8, 0.4, 1.0, red, 0, 0.55, -1.8));
  g.add(box(0.56, 0.3, 0.4, lam(0xd5d9de), 0, 0.52, -2.4));
  g.add(box(0.8, 0.45, 0.7, red, 0, 0.65, 1.75));
  g.add(box(0.7, 0.1, 0.9, lam(0x15171a), 0, 0.87, 0.55, false));
  g.add(mesh(geo('helmet', () => new THREE.SphereGeometry(0.27, 14, 10)), lam(0xf4f4f0), 0, 1.08, 0.6));
  g.add(box(0.72, 0.26, 0.06, lam(0x9fd3e6, { transparent: true, opacity: 0.7 }), 0, 0.98, 0.02, false));
  g.add(mesh(geo('roundel', () => new THREE.CylinderGeometry(0.3, 0.3, 0.03, 20)), lam(0xf4f4f0), 0, 0.77, -1.75, false));
  const pipe = geo('pipe', () => new THREE.CylinderGeometry(0.07, 0.07, 1.7, 8).rotateX(Math.PI / 2));
  g.add(mesh(pipe, lam(0xaab0b6), 0.6, 0.55, 0.95));
  g.add(mesh(pipe, lam(0xaab0b6), -0.6, 0.55, 0.95));
  g.add(box(1.9, 0.08, 0.08, lam(0x2a2d31), 0, 0.5, -1.35));
  g.add(box(1.9, 0.08, 0.08, lam(0x2a2d31), 0, 0.5, 1.3));
  const lamp = geo('lamp', () => new THREE.SphereGeometry(0.11, 10, 8));
  g.add(mesh(lamp, basic(HEAD), 0.33, 0.62, -2.3, false));
  g.add(mesh(lamp, basic(HEAD), -0.33, 0.62, -2.3, false));
  g.userData.wheels = [
    wheel(0.5, 0.42, 0.98, 0.5, -1.35), wheel(0.5, 0.42, -0.98, 0.5, -1.35),
    wheel(0.52, 0.46, 1.02, 0.52, 1.3), wheel(0.52, 0.46, -1.02, 0.52, 1.3),
  ];
  g.userData.wheels.forEach((w) => g.add(w));
  return g;
}

const CAR_COLORS = [0x2f6fb5, 0xe9c46a, 0x2a9d8f, 0xf2f2f2, 0x3a3f47, 0xe76f51, 0x4f9d4a, 0x1d3557];

function addLights(g, w, y, zFront, zRear) {
  g.add(box(0.36, 0.14, 0.06, basic(HEAD), w, y, zFront, false));
  g.add(box(0.36, 0.14, 0.06, basic(HEAD), -w, y, zFront, false));
  g.add(box(0.4, 0.14, 0.06, basic(TAIL), w, y, zRear, false));
  g.add(box(0.4, 0.14, 0.06, basic(TAIL), -w, y, zRear, false));
}

export function sedan() {
  const g = new THREE.Group();
  const c = lam(CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0]);
  g.add(box(1.8, 0.55, 4.1, c, 0, 0.62, 0));
  g.add(box(1.55, 0.48, 2.1, lam(0x1f2c38), 0, 1.13, 0.2));
  g.add(box(1.5, 0.06, 1.9, c, 0, 1.4, 0.2));
  for (const x of [0.9, -0.9]) for (const z of [1.3, -1.3]) g.add(wheel(0.38, 0.3, x, 0.38, z));
  addLights(g, 0.6, 0.7, -2.07, 2.07);
  g.userData.hl = 2.05;
  g.userData.hw = 0.9;
  return g;
}

export function truck() {
  const g = new THREE.Group();
  const c = lam(CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0]);
  g.add(box(1.95, 1.3, 1.4, c, 0, 1.05, -2.0));
  g.add(box(1.7, 0.5, 0.06, lam(0x1f2c38), 0, 1.35, -2.71, false));
  g.add(box(2.05, 1.8, 3.7, lam(0xdfe3e6), 0, 1.4, 0.75));
  for (const x of [0.95, -0.95]) for (const z of [2.0, -1.9]) g.add(wheel(0.45, 0.34, x, 0.45, z));
  addLights(g, 0.7, 0.75, -2.72, 2.62);
  g.userData.hl = 2.7;
  g.userData.hw = 1.0;
  return g;
}

export function fireEngine() {
  const g = new THREE.Group();
  const red = lam(0xc81d25);
  g.add(box(2.1, 1.5, 1.6, red, 0, 1.2, -2.5));
  g.add(box(1.85, 0.55, 0.06, lam(0x1f2c38), 0, 1.5, -3.31, false));
  g.add(box(2.1, 1.25, 4.6, red, 0, 1.08, 0.7));
  g.add(box(2.12, 0.16, 6.3, lam(0xf2f2f2), 0, 0.95, -0.1, false));
  g.add(box(0.12, 0.1, 4.8, lam(0xcfd4d9), 0.4, 1.86, 0.5));
  g.add(box(0.12, 0.1, 4.8, lam(0xcfd4d9), -0.4, 1.86, 0.5));
  for (let i = 0; i < 7; i++) g.add(box(0.8, 0.07, 0.08, lam(0xcfd4d9), 0, 1.86, -1.6 + i * 0.7, false));
  const beacon = box(1.0, 0.24, 0.34, new THREE.MeshBasicMaterial({ color: 0x2b7fff }), 0, 2.08, -2.5, false);
  g.add(beacon);
  for (const x of [1.0, -1.0]) for (const z of [2.1, -2.3]) g.add(wheel(0.5, 0.36, x, 0.5, z));
  addLights(g, 0.75, 0.8, -3.32, 3.02);
  g.userData.hl = 3.3;
  g.userData.hw = 1.05;
  g.userData.beacon = beacon;
  return g;
}

// ---------- hazards ----------

const flat = (r, seg = 22) => geo(`circ${r},${seg}`, () => new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2));

export function oil() {
  const g = new THREE.Group();
  g.add(mesh(flat(1.45), lam(0x1e4650, { transparent: true, opacity: 0.55 }), 0, 0.04, 0, false));
  g.add(mesh(flat(1.2), new THREE.MeshStandardMaterial({ color: 0x07080b, roughness: 0.12, metalness: 0.7 }), 0, 0.055, 0, false));
  g.add(mesh(flat(0.5), lam(0x07080b), 1.1, 0.05, 0.6, false));
  g.scale.set(1, 1, 0.8 + Math.random() * 0.4);
  g.rotation.y = Math.random() * 6.28;
  return g;
}

export function patch() {
  const g = new THREE.Group();
  const p = geo('patch', () => new THREE.PlaneGeometry(2.6, 3.4).rotateX(-Math.PI / 2));
  g.add(mesh(p, lam(0x15161a), 0, 0.045, 0, false));
  const edge = geo('patchEdge', () => new THREE.PlaneGeometry(2.9, 3.7).rotateX(-Math.PI / 2));
  g.add(mesh(edge, lam(0x6a6d70), 0, 0.035, 0, false));
  return g;
}

export function pothole() {
  const g = new THREE.Group();
  g.add(mesh(flat(1.0, 9), lam(0x77736b), 0, 0.04, 0, false));
  g.add(mesh(flat(0.72, 8), lam(0x0c0c0d), 0.05, 0.05, 0, false));
  g.rotation.y = Math.random() * 6.28;
  return g;
}

export function glass() {
  const g = new THREE.Group();
  const shard = geo('shard', () => new THREE.TetrahedronGeometry(0.26));
  const m = lam(0xc9f3ff, { emissive: 0x3d6a7a, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 12; i++) {
    const s = mesh(shard, m, (Math.random() - 0.5) * 1.6, 0.1, (Math.random() - 0.5) * 1.6, false);
    s.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    s.scale.setScalar(0.6 + Math.random() * 0.8);
    g.add(s);
  }
  return g;
}

export function nails() {
  const g = new THREE.Group();
  const nail = geo('nail', () => new THREE.ConeGeometry(0.06, 0.5, 6));
  const m = lam(0xe3e7eb, { emissive: 0x30343a });
  for (let i = 0; i < 10; i++) {
    const s = mesh(nail, m, (Math.random() - 0.5) * 1.4, 0.2, (Math.random() - 0.5) * 1.4, false);
    s.rotation.set((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2);
    g.add(s);
  }
  return g;
}

export function log() {
  const g = new THREE.Group();
  const body = geo('log', () => new THREE.CylinderGeometry(0.4, 0.4, 3.0, 10).rotateZ(Math.PI / 2));
  g.add(mesh(body, lam(0x6f4421), 0, 0.4, 0));
  const cap = geo('logcap', () => new THREE.CylinderGeometry(0.33, 0.33, 3.04, 10).rotateZ(Math.PI / 2));
  g.add(mesh(cap, lam(0xd2a56d), 0, 0.4, 0, false));
  return g;
}

export function boulder() {
  const g = new THREE.Group();
  const b = geo('boulder', () => new THREE.DodecahedronGeometry(1.15));
  const inner = mesh(b, lam(0x8d8a84, { flatShading: true }), 0, 1.0, 0);
  inner.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  g.add(inner);
  g.userData.inner = inner;
  return g;
}

// ---------- scenery ----------

export function tree() {
  const g = new THREE.Group();
  g.add(mesh(geo('trunk', () => new THREE.CylinderGeometry(0.25, 0.35, 1.6, 7)), lam(0x6b4a2b), 0, 0.8, 0));
  if (Math.random() < 0.6) {
    g.add(mesh(geo('cone1', () => new THREE.ConeGeometry(1.9, 3.2, 8)), lam(0x2f6b35), 0, 2.9, 0));
    g.add(mesh(geo('cone2', () => new THREE.ConeGeometry(1.35, 2.5, 8)), lam(0x3b8042), 0, 4.5, 0));
  } else {
    g.add(mesh(geo('crown', () => new THREE.IcosahedronGeometry(2.0, 0)), lam(0x3f8a3a, { flatShading: true }), 0, 3.2, 0));
  }
  g.scale.setScalar(0.8 + Math.random() * 0.7);
  g.rotation.y = Math.random() * 6.28;
  return g;
}

export function bush() {
  const g = new THREE.Group();
  g.add(mesh(geo('bush', () => new THREE.IcosahedronGeometry(0.9, 0)), lam(0x4c8f3f, { flatShading: true }), 0, 0.6, 0));
  g.scale.setScalar(0.7 + Math.random() * 0.8);
  return g;
}

export function rock() {
  const g = new THREE.Group();
  const r = mesh(geo('rock', () => new THREE.DodecahedronGeometry(1.0)), lam(0x9a8c74, { flatShading: true }), 0, 0.5, 0);
  r.rotation.set(Math.random() * 3, Math.random() * 3, 0);
  g.add(r);
  g.scale.set(0.6 + Math.random() * 1.6, 0.5 + Math.random() * 1.2, 0.6 + Math.random() * 1.6);
  return g;
}

export function cactus() {
  const g = new THREE.Group();
  const m = lam(0x4d8a57);
  g.add(mesh(geo('cac1', () => new THREE.CylinderGeometry(0.32, 0.36, 2.8, 8)), m, 0, 1.4, 0));
  g.add(box(0.9, 0.26, 0.26, m, 0.5, 1.5, 0));
  g.add(box(0.26, 0.9, 0.26, m, 0.85, 1.9, 0));
  g.add(box(0.8, 0.26, 0.26, m, -0.45, 1.1, 0));
  g.add(box(0.26, 0.7, 0.26, m, -0.75, 1.4, 0));
  g.scale.setScalar(0.8 + Math.random() * 0.6);
  g.rotation.y = Math.random() * 6.28;
  return g;
}

let gasSign;
function signTexture() {
  if (gasSign) return gasSign;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#f5a623';
  x.fillRect(0, 0, 256, 128);
  x.fillStyle = '#10202e';
  x.fillRect(8, 8, 240, 112);
  x.fillStyle = '#f5a623';
  x.font = 'bold 84px Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('GAS', 128, 68);
  gasSign = new THREE.CanvasTexture(c);
  gasSign.colorSpace = THREE.SRGBColorSpace;
  return gasSign;
}

// Built with x = 0 on the outer edge of the forecourt, extending toward +x.
// `len` is the forecourt length along the road.
export function station(len) {
  const g = new THREE.Group();
  const white = lam(0xf1f1ec);
  // canopy
  g.add(box(8, 0.45, 20, white, 4.6, 5.2, 0));
  g.add(box(8.1, 0.16, 20.1, lam(0xf5a623), 4.6, 4.92, 0, false));
  g.add(box(6.6, 0.05, 17, basic(0xfff6d8), 4.6, 4.82, 0, false));
  for (const x of [1.2, 8.0]) for (const z of [-8.5, 8.5]) g.add(box(0.4, 5, 0.4, white, x, 2.5, z));
  // pumps
  for (const z of [-5, 0, 5]) {
    g.add(box(0.9, 1.7, 0.7, lam(0xd62828), 1.3, 0.85, z));
    g.add(box(0.94, 0.3, 0.74, white, 1.3, 1.75, z, false));
    g.add(box(0.5, 0.4, 0.04, basic(0xcfeee9), 0.84, 1.2, z, false));
  }
  g.add(box(2.2, 0.2, 14, lam(0xb8bcc0), 1.3, 0.1, 0));
  // shop
  g.add(box(9, 4.2, 15, lam(0xe9e4d8), 15, 2.1, 0));
  g.add(box(9.6, 0.4, 15.6, lam(0x1f7f76), 15, 4.4, 0));
  g.add(box(0.06, 2.2, 9, basic(0xbfe9f5), 10.46, 1.7, 0, false));
  g.add(box(0.08, 2.6, 1.6, lam(0x24303a), 10.45, 1.3, 6, false));
  // apron
  const apron = geo('apron', () => new THREE.PlaneGeometry(12, 26).rotateX(-Math.PI / 2));
  const a = mesh(apron, lam(0x9a9d9f), 5.6, 0.02, 0, false);
  a.receiveShadow = true;
  g.add(a);
  // roadside sign at the approach end
  const z0 = len / 2 - 4;
  g.add(box(0.3, 8, 0.3, lam(0x4a4f55), 2.5, 4, z0));
  const sg = geo('sign', () => new THREE.PlaneGeometry(4.6, 2.3));
  g.add(mesh(sg, new THREE.MeshBasicMaterial({ map: signTexture() }), 2.5, 8.2, z0 + 0.2, false));
  g.add(box(4.8, 2.5, 0.2, lam(0x10202e), 2.5, 8.2, z0));
  return g;
}

export function debris() {
  const g = geo('debris', () => new THREE.BoxGeometry(0.34, 0.34, 0.34));
  const colors = [0xffb703, 0xfb5607, 0xffe08a, 0x55595f, 0xd62828];
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: colors[(Math.random() * colors.length) | 0], transparent: true }));
}
