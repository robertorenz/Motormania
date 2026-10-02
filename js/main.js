// Motormania 2.5D — game loop, rules, HUD.
import * as THREE from 'three';
import { Track, TYPES, LANES, CH } from './road.js';
import * as M from './models.js';
import { Sound } from './audio.js';

const VMAX = 36; // world units / second == 80 mph
const MILE = 500; // world units per mile
const START_D = 48;
const DAY_LEN = 6000;
const CROSS_SPAN = 220;

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

const params = new URLSearchParams(location.search);
const DEMO = params.has('demo'); // autopilot, used for screenshots
const FORCE_TOD = params.get('tod');

// ---------------------------------------------------------------- renderer
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true, preserveDrawingBuffer: DEMO });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd0ee);
scene.fog = new THREE.Fog(0x9fd0ee, 120, 215);

const camera = new THREE.PerspectiveCamera(40, 1, 2, 420);

const hemi = new THREE.HemisphereLight(0xffffff, 0x6b7a55, 1.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 85, bottom: -65, near: 1, far: 220 });
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

const headlight = new THREE.SpotLight(0xfff0c8, 0, 95, 0.5, 0.55, 0);
scene.add(headlight, headlight.target);

const car = M.playerCar();
scene.add(car);

const SKY_DAY = new THREE.Color(0x9fd0ee);
const SKY_DUSK = new THREE.Color(0xe39a62);
const SKY_NIGHT = new THREE.Color(0x060a13);
const SUN_DAY = new THREE.Color(0xfff1dc);
const SUN_NIGHT = new THREE.Color(0x7f9cd6);

function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 0.9 ? 56 : 40;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(stage);

// ---------------------------------------------------------------- state
const sound = new Sound();
let track;
const chunks = new Map();
let obstacles = [];
let traffic = [];
let crossers = [];
const debris = [];
for (let i = 0; i < 36; i++) {
  const m = M.debris();
  m.visible = false;
  scene.add(m);
  debris.push({ m, v: new THREE.Vector3(), life: 0 });
}

const S = {};
let mode = 'menu'; // menu | play | paused | over
let best = 0;
try { best = parseFloat(localStorage.getItem('motormania.best')) || 0; } catch { /* storage unavailable */ }

const keys = { gas: false, brake: false, left: false, right: false };

function resetState() {
  Object.assign(S, {
    d: START_D, x: 0, v: 0, vx: 0, steer: 0, camX: 0, time: 0, shake: 0,
    fuel: 100, batt: 100, temp: 45, radiator: true, spare: true, lives: 5,
    erratic: 0, oil: 0, slow: 0, invuln: 0,
    sub: null, subT: 0, cause: '', servicing: false, serviceDone: false,
    nextTraffic: 260, lowFuelBeep: 0, stationHint: null, lastType: '',
  });
}

function clearWorld() {
  for (const c of chunks.values()) { scene.remove(c.group); c.dispose(); }
  chunks.clear();
  for (const list of [obstacles, traffic, crossers]) for (const o of list) scene.remove(o.mesh);
  obstacles = [];
  traffic = [];
  crossers = [];
  debris.forEach((p) => { p.life = 0; p.m.visible = false; });
}

function newGame() {
  clearWorld();
  track = new Track();
  resetState();
  S.x = track.info(S.d).half + 5; // parked on the forecourt
  S.camX = S.x;
  car.rotation.set(0, 0, 0);
  car.visible = true;
  updateChunks(true);
  updateHud(true);
}

// ---------------------------------------------------------------- world streaming
function updateChunks(all) {
  track.extend(S.d + 900);
  const k0 = Math.floor((S.d - 80) / CH);
  const k1 = Math.floor((S.d + 240) / CH);
  for (let k = k0; k <= k1; k++) {
    if (chunks.has(k)) continue;
    const c = track.buildChunk(k);
    scene.add(c.group);
    chunks.set(k, c);
    populate(k);
    if (!all) break; // at most one new chunk per frame
  }
  for (const [k, c] of chunks) {
    if (k < k0) { scene.remove(c.group); c.dispose(); chunks.delete(k); }
  }
  track.prune(S.d);
}

const OB = {
  oil: { rx: 1.2, rz: 1.1, make: M.oil },
  patch: { rx: 1.3, rz: 1.7, make: M.patch },
  pothole: { rx: 0.8, rz: 0.8, make: M.pothole },
  glass: { rx: 0.8, rz: 0.8, make: M.glass },
  nails: { rx: 0.7, rz: 0.7, make: M.nails },
  log: { rx: 1.5, rz: 0.4, make: M.log },
  boulder: { rx: 1.0, rz: 1.0, make: M.boulder },
};
const MIX = {
  motorway: ['oil', 'oil', 'oil', 'patch', 'patch', 'patch', 'glass', 'glass', 'nails', 'nails', 'log'],
  broad: ['pothole', 'pothole', 'pothole', 'patch', 'patch', 'glass', 'glass', 'oil', 'oil', 'log', 'log', 'nails'],
  dirt: ['pothole', 'pothole', 'pothole', 'log', 'log', 'log', 'nails', 'boulder', 'boulder', 'roll', 'roll', 'roll'],
};

function addObstacle(kind, d, x) {
  const def = OB[kind];
  const mesh = def.make();
  mesh.position.set(x, 0, -d);
  scene.add(mesh);
  const o = { kind, d, x, rx: def.rx, rz: def.rz, mesh, hit: false, vr: 0, active: false };
  obstacles.push(o);
  return o;
}

function populate(k) {
  const d0 = k * CH;
  if (d0 + CH < 200) return;
  const miles = (S.d - START_D) / MILE;
  const n = Math.floor(1.3 + Math.min(3, miles * 0.22) + Math.random() * 1.3);
  for (let i = 0; i < n; i++) {
    const d = d0 + rand(0, CH);
    if (d < 230 || track.nearStation(d, 25) || track.nearCrossing(d, 24)) continue;
    const inf = track.info(d);
    const cx = track.cx(d);
    const kind = pick(MIX[inf.type]);
    if (kind === 'roll') {
      const side = Math.random() < 0.5 ? -1 : 1;
      const o = addObstacle('boulder', d, cx + side * (inf.half + 12));
      o.vr = -side * rand(5, 8);
    } else {
      addObstacle(kind, d, cx + rand(-(inf.half - 1.6), inf.half - 1.6));
    }
  }
  for (const c of track.crossings) {
    if (c.d >= d0 && c.d < d0 + CH && !c.built) makeCrossers(c);
  }
}

function makeCrossers(c) {
  c.built = true;
  const cx = track.cx(c.d);
  const fireLane = c.fire ? (Math.random() < 0.5 ? 0 : 1) : -1;
  [{ dd: -3, dir: 1 }, { dd: 3, dir: -1 }].forEach((lane, li) => {
    const fire = li === fireLane;
    const count = fire ? 1 : 2 + ((Math.random() * 2) | 0);
    const speed = fire ? 21 : rand(10, 15);
    const phase0 = rand(0, CROSS_SPAN);
    for (let i = 0; i < count; i++) {
      const mesh = fire ? M.fireEngine() : Math.random() < 0.25 ? M.truck() : M.sedan();
      mesh.rotation.y = (-lane.dir * Math.PI) / 2;
      scene.add(mesh);
      crossers.push({
        mesh, cx, d: c.d + lane.dd, dir: lane.dir, speed, fire,
        phase: phase0 + (i * CROSS_SPAN) / count + rand(-8, 8), hl: mesh.userData.hl, x: 0,
      });
    }
  });
}

function spawnTraffic() {
  const d = S.d + 165;
  const inf = track.info(d);
  const off = pick(LANES[inf.type]);
  const speed = inf.type === 'dirt' ? rand(9, 15) : rand(12, 23);
  if (traffic.some((c) => Math.abs(c.d - d) < 10 && c.off === off)) return;
  const mesh = inf.type !== 'dirt' && Math.random() < 0.22 ? M.truck() : M.sedan();
  scene.add(mesh);
  traffic.push({ mesh, d, off, v: speed, x: 0, hl: mesh.userData.hl, hw: mesh.userData.hw });
}

// ---------------------------------------------------------------- HUD
function polar(a, r) {
  const t = ((a - 90) * Math.PI) / 180;
  return [60 + r * Math.cos(t), 64 + r * Math.sin(t)];
}
function arc(a0, a1, r) {
  const [x0, y0] = polar(a0, r);
  const [x1, y1] = polar(a1, r);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}
function buildDial(id, title, labels, zone) {
  let s = `<svg viewBox="0 0 120 112" role="img" aria-label="${title}">`;
  s += `<path d="${arc(-120, 120, 44)}" fill="none" stroke="#2a3f57" stroke-width="5" stroke-linecap="round"/>`;
  if (zone) s += `<path d="${arc(zone[0], zone[1], 44)}" fill="none" stroke="${zone[2]}" stroke-width="5" stroke-linecap="round"/>`;
  labels.forEach((l, i) => {
    const a = -120 + (240 * i) / (labels.length - 1);
    const [x0, y0] = polar(a, 36);
    const [x1, y1] = polar(a, 41);
    const [tx, ty] = polar(a, 26);
    s += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#e8eef5" stroke-width="1.6"/>`;
    s += `<text x="${tx}" y="${ty + 3.5}" text-anchor="middle" font-size="10" font-weight="600" fill="#8fa3b8">${l}</text>`;
  });
  s += `<g id="n-${id}"><path d="M60 64 L57.6 64 L60 24 L62.4 64 Z" fill="#e5484d"/></g>`;
  s += `<circle cx="60" cy="64" r="5" fill="#e8eef5"/>`;
  s += `<text x="60" y="104" text-anchor="middle" font-size="10" font-weight="700" letter-spacing="2" fill="#e8eef5">${title}</text></svg>`;
  $('dial-' + id).innerHTML = s;
}
buildDial('speed', 'MPH', ['0', '20', '40', '60', '80']);
buildDial('fuel', 'FUEL', ['E', '', '½', '', 'F'], [-120, -80, '#e5484d']);
buildDial('gen', 'GEN', ['−', '', '', '', '+'], [-120, -80, '#e5484d']);
buildDial('temp', 'TEMP', ['C', '', '', '', 'H'], [80, 120, '#e5484d']);

const needle = (id, f) => $('n-' + id).setAttribute('transform', `rotate(${(-120 + 240 * clamp(f, 0, 1)).toFixed(1)} 60 64)`);
const fmt = (m) => m.toFixed(1).padStart(5, '0');
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function setClass(id, v) { if (hudCache[id + 'c'] !== v) { hudCache[id + 'c'] = v; $(id).className = v; } }

function updateHud(force) {
  needle('speed', S.v / VMAX);
  needle('fuel', S.fuel / 100);
  needle('gen', S.batt / 100);
  needle('temp', (S.temp - 30) / 70);
  setClass('dial-fuel', S.fuel < 18 ? 'dial alert' : 'dial');
  setClass('dial-gen', S.batt < 18 ? 'dial alert' : 'dial');
  setClass('dial-temp', S.temp > 82 ? 'dial alert' : 'dial');
  const miles = (S.d - START_D) / MILE;
  setText('odo', fmt(miles));
  setText('best', fmt(Math.max(best, miles)));
  if (force || hudCache.lives !== S.lives) {
    hudCache.lives = S.lives;
    $('lives').innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < S.lives ? '' : 'off'}"></i>`).join('');
  }
  setText('spare', S.spare ? 'READY' : 'USED');
  setClass('spare', S.spare ? 'lamp on' : 'lamp bad');
  setText('rad', S.radiator ? 'OK' : 'LEAKING');
  setClass('rad', S.radiator ? 'lamp on' : 'lamp bad');
}

let toastTimer = 0;
function toast(msg, kind = '', ms = 2200) {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = kind; }, ms);
}
function notice(msg) {
  const el = $('notice');
  if (msg) { setText('notice', msg); el.classList.add('show'); } else el.classList.remove('show');
}

// ---------------------------------------------------------------- modals
function openModal(id) {
  document.querySelectorAll('.modal').forEach((m) => m.classList.toggle('open', m.id === id));
}
function closeModals() { document.querySelectorAll('.modal').forEach((m) => m.classList.remove('open')); }
const modalOpen = (id) => $(id).classList.contains('open');

function start() {
  sound.init();
  newGame();
  closeModals();
  mode = 'play';
  toast('Go! Pull out onto the road', 'good', 2600);
}
function pause() {
  if (mode !== 'play') return;
  mode = 'paused';
  sound.engine(0, false);
  sound.siren(0, 0);
  openModal('modal-pause');
}
function resume() {
  if (mode !== 'paused') return;
  closeModals();
  mode = 'play';
}

const CAUSES = {
  car: 'Crashed into another car',
  cross: 'Hit by cross traffic',
  fire: 'Hit by the fire engine',
  boulder: 'Flattened by a boulder',
  edge: 'Ran off the road',
  fuel: 'Out of gas',
  battery: 'Battery flat',
  overheat: 'Engine overheated',
  tyre: 'Flat tyre and no spare',
};

function gameOver() {
  mode = 'over';
  sound.engine(0, false);
  sound.siren(0, 0);
  const miles = (S.d - START_D) / MILE;
  const record = miles > best;
  if (record) {
    best = miles;
    try { localStorage.setItem('motormania.best', String(best)); } catch { /* storage unavailable */ }
  }
  $('overCause').textContent = CAUSES[S.cause] || 'Out of lives';
  $('overMiles').textContent = miles.toFixed(1);
  $('overBest').textContent = best.toFixed(1);
  $('overNote').textContent = record && miles > 0 ? 'New personal best!' : 'Five lives, as many miles as you can.';
  openModal('modal-over');
}

$('btnStart').onclick = start;
$('btnAgain').onclick = start;
$('btnRestart').onclick = start;
$('btnResume').onclick = resume;
$('btnPause').onclick = () => (mode === 'paused' ? resume() : pause());
$('btnSound').onclick = toggleSound;
let aboutReturn = null;
function openAbout() {
  aboutReturn = mode === 'menu' ? 'modal-start' : mode === 'over' ? 'modal-over' : 'modal-pause';
  if (mode === 'play') pause();
  openModal('modal-about');
}
$('btnAbout').onclick = openAbout;
document.querySelectorAll('[data-open="modal-about"]').forEach((b) => (b.onclick = openAbout));
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => openModal(aboutReturn)));

function toggleSound() {
  sound.setMuted(!sound.muted);
  $('btnSound').textContent = 'Sound: ' + (sound.muted ? 'Off' : 'On');
}

// ---------------------------------------------------------------- input
const KEYMAP = {
  ArrowUp: 'gas', KeyW: 'gas', ArrowDown: 'brake', KeyS: 'brake',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
window.addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code];
  if (k) { keys[k] = true; e.preventDefault(); return; }
  if (e.repeat) return;
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (modalOpen('modal-about')) openModal(aboutReturn);
    else if (mode === 'play') pause();
    else if (mode === 'paused') resume();
  } else if (e.code === 'KeyM') toggleSound();
  else if (e.code === 'Enter' || e.code === 'Space') {
    if (e.target instanceof HTMLButtonElement) return; // let the focused button handle it
    if (modalOpen('modal-start') || modalOpen('modal-over')) start();
    else if (modalOpen('modal-pause')) resume();
    e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

document.querySelectorAll('#touch button').forEach((b) => {
  const k = b.dataset.key;
  const set = (v) => (e) => { e.preventDefault(); keys[k] = v; b.classList.toggle('down', v); };
  b.addEventListener('pointerdown', set(true));
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, set(false));
  b.addEventListener('contextmenu', (e) => e.preventDefault());
});

// ---------------------------------------------------------------- rules
function explode() {
  for (const p of debris) {
    p.life = rand(0.7, 1.4);
    p.m.visible = true;
    p.m.position.set(S.x, 0.8, -S.d);
    p.v.set(rand(-9, 9), rand(5, 14), rand(-9, 9) - S.v * 0.25);
  }
}

function loseLife(cause) {
  if (S.sub === 'crash' || S.sub === 'stall' || DEMO) return;
  S.lives--;
  S.cause = cause;
  S.servicing = false;
  const stalled = cause === 'fuel' || cause === 'battery' || cause === 'overheat' || cause === 'tyre';
  S.sub = stalled ? 'stall' : 'crash';
  S.subT = stalled ? 2.0 : 2.3;
  if (stalled) sound.stall();
  else { sound.crash(); explode(); S.shake = 1; }
  toast(CAUSES[cause] + (S.lives > 0 ? ` — ${S.lives} ${S.lives === 1 ? 'life' : 'lives'} left` : ''), 'bad', 2400);
}

function respawn() {
  if (S.lives <= 0) { gameOver(); return; }
  S.sub = null;
  S.x = track.cx(S.d);
  S.v = 0;
  S.vx = 0;
  S.steer = 0;
  S.erratic = 0;
  S.oil = 0;
  S.slow = 0;
  S.invuln = 3;
  S.radiator = true;
  S.temp = 45;
  if (S.cause === 'fuel') S.fuel = 50;
  S.batt = Math.max(S.batt, S.cause === 'battery' ? 60 : 35);
  car.rotation.set(0, 0, 0);
  obstacles = obstacles.filter((o) => {
    const clear = o.d > S.d - 8 && o.d < S.d + 50;
    if (clear) scene.remove(o.mesh);
    return !clear;
  });
  traffic = traffic.filter((c) => {
    const clear = Math.abs(c.d - S.d) < 28;
    if (clear) scene.remove(c.mesh);
    return !clear;
  });
}

function puncture() {
  sound.hiss();
  if (!S.spare) { loseLife('tyre'); return; }
  S.spare = false;
  S.sub = 'tyre';
  S.subT = 3;
  S.v = 0;
  S.vx = 0;
  toast('Flat tyre! Fitting the spare…', 'warn', 2900);
}

function hitObstacle(o) {
  switch (o.kind) {
    case 'oil':
      if (S.oil <= 0) {
        if (Math.abs(S.vx) < 2.5) S.vx = (Math.random() < 0.5 ? -1 : 1) * 5;
        sound.skid();
        toast('Oil slick — skidding!', 'warn', 1400);
      }
      S.oil = 1.2;
      o.hit = true;
      break;
    case 'patch':
      if (S.slow <= 0) toast('Tar patch — slowing', 'warn', 1200);
      S.slow = 0.35;
      break;
    case 'pothole':
      S.erratic = 3.5;
      S.shake = 0.5;
      sound.thud();
      toast('Pothole — steering knocked out!', 'warn', 1600);
      o.hit = true;
      break;
    case 'glass':
    case 'nails':
      o.hit = true;
      scene.remove(o.mesh);
      o.dead = true;
      puncture();
      break;
    case 'log':
      o.hit = true;
      sound.thud();
      S.shake = 0.6;
      S.v *= 0.6;
      if (S.radiator) toast('Radiator damaged — find a gas station', 'bad', 2600);
      else S.temp += 8;
      S.radiator = false;
      break;
    case 'boulder':
      loseLife('boulder');
      break;
  }
}

function autopilot() {
  const ahead = track.cx(S.d + 10);
  const dx = ahead - S.x;
  keys.left = dx < -0.4;
  keys.right = dx > 0.4;
  keys.gas = S.v < VMAX * 0.78;
  keys.brake = false;
  S.fuel = Math.max(S.fuel, 62);
  S.batt = Math.max(S.batt, 80);
}

function drive(dt) {
  const inf = track.info(S.d);
  const cx = track.cx(S.d);
  const station = track.stationAt(S.d);
  const crossing = track.crossingAt(S.d, 6);

  const engineOK = S.fuel > 0 && S.batt > 0;
  let vmax = VMAX;
  if (S.slow > 0) vmax *= 0.45;
  if (S.temp > 85) vmax *= 0.7;

  if (keys.gas && engineOK) S.v += 10 * (1 - Math.pow(S.v / VMAX, 2)) * dt;
  else S.v -= 1.6 * dt;
  if (keys.brake) S.v -= 24 * dt;
  if (S.v > vmax) S.v = Math.max(vmax, S.v - 34 * dt);
  S.v = Math.max(0, S.v);

  const target = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  S.steer += (target - S.steer) * Math.min(1, dt * 12);
  if (S.oil > 0) {
    S.oil -= dt;
  } else {
    S.vx = S.steer * (3 + 0.42 * S.v) * Math.min(1, S.v / 4);
  }
  let vx = S.vx;
  if (S.erratic > 0) {
    S.erratic -= dt;
    vx += (Math.sin(S.time * 19) + Math.sin(S.time * 31.7)) * 4.2 * Math.min(1, S.v / 10);
  }
  S.x += vx * dt;
  S.d += S.v * dt;
  if (S.slow > 0) S.slow -= dt;
  if (S.invuln > 0) S.invuln -= dt;

  // --- service on a station forecourt
  const inBay = station && S.x > cx + inf.half + 0.8;
  if (inBay && S.v < 1.5 && !keys.gas) {
    if (!S.servicing) { S.servicing = true; S.serviceDone = false; }
    S.v = 0;
    S.fuel = Math.min(100, S.fuel + 28 * dt);
    S.batt = Math.min(100, S.batt + 28 * dt);
    S.temp = Math.max(45, S.temp - 30 * dt);
    S.radiator = true;
    S.spare = true;
    if (!S.serviceDone) {
      if (S.fuel >= 100 && S.batt >= 100 && S.temp <= 46) {
        S.serviceDone = true;
        if (S.d > START_D + 1) { sound.ding(); toast('All set — back on the road!', 'good'); }
      } else if (S.d > START_D + 1) toast('Servicing: fuel · battery · radiator · spare', 'good', 500);
    }
  } else {
    S.servicing = false;
    // --- consumables
    S.fuel -= dt * (0.3 + 1.1 * (S.v / VMAX)) * (keys.gas ? 1 : 0.6);
    if (S.v >= VMAX * 0.7) S.batt = Math.min(100, S.batt + 5 * dt);
    else S.batt -= 1.9 * dt;
    if (S.radiator) S.temp += (45 - S.temp) * Math.min(1, dt * 0.8);
    else S.temp += dt * (0.5 + 1.2 * (S.v / VMAX));
    S.fuel = Math.max(0, S.fuel);
    S.batt = Math.max(0, S.batt);
    if (S.temp >= 100) return loseLife('overheat');
    if (S.batt <= 0) return loseLife('battery');
    if (S.fuel <= 0 && S.v < 0.5) return loseLife('fuel');
    if (S.fuel < 18 || S.batt < 18) {
      S.lowFuelBeep -= dt;
      if (S.lowFuelBeep <= 0) { S.lowFuelBeep = 1.1; sound.warn(); }
    }
  }

  // --- road edges
  const L = cx - inf.half;
  const R = cx + inf.half + track.bay(S.d);
  if (crossing) {
    if (Math.abs(S.x - cx) > inf.half + 14) return loseLife('edge');
  } else if (S.x - 0.85 < L || S.x + 0.85 > R) {
    return loseLife('edge');
  }

  if (S.invuln > 0 || DEMO) return;

  // --- hazards
  for (const o of obstacles) {
    if (o.hit && o.kind !== 'patch') continue;
    if (Math.abs(o.x - S.x) < o.rx + 0.85 && Math.abs(o.d - S.d) < o.rz + 1.9) {
      hitObstacle(o);
      if (S.sub) return;
    }
  }
  for (const c of traffic) {
    if (Math.abs(c.x - S.x) < c.hw + 0.85 && Math.abs(c.d - S.d) < c.hl + 1.9) return loseLife('car');
  }
  for (const c of crossers) {
    if (Math.abs(c.x - S.x) < c.hl + 0.85 && Math.abs(c.d - S.d) < 1.0 + 1.9) return loseLife(c.fire ? 'fire' : 'cross');
  }
}

function updateWorld(dt) {
  // rolling boulders
  for (const o of obstacles) {
    if (!o.vr) continue;
    if (!o.active && o.d - S.d < 85) {
      o.active = true;
      if (o.d > S.d) toast('Avalanche!', 'warn', 1500);
    }
    if (o.active) {
      o.x += o.vr * dt;
      o.mesh.position.x = o.x;
      o.mesh.userData.inner.rotation.z -= (o.vr * dt) / 1.1;
      if (Math.abs(o.x - track.cx(o.d)) > 30) o.dead = true;
    }
  }
  obstacles = obstacles.filter((o) => {
    if (o.dead || o.d < S.d - 40) { scene.remove(o.mesh); return false; }
    return true;
  });

  // traffic
  if (S.d > S.nextTraffic) {
    spawnTraffic();
    const type = track.info(S.d + 165).type;
    const gap = type === 'motorway' ? rand(45, 105) : type === 'broad' ? rand(85, 165) : rand(140, 240);
    const miles = (S.d - START_D) / MILE;
    S.nextTraffic = S.d + gap * Math.max(0.55, 1 - miles * 0.04);
  }
  for (const c of traffic) {
    let v = c.v;
    // don't rear-end the player or each other
    if (c.d < S.d && S.d - c.d < c.hl + 9 && Math.abs(c.x - S.x) < 2.4) v = Math.min(v, S.v * 0.9);
    for (const o of traffic) {
      if (o !== c && o.off === c.off && o.d > c.d && o.d - c.d < 9) v = Math.min(v, o.v);
    }
    c.d += v * dt;
    c.x = track.cx(c.d) + c.off;
    c.mesh.position.set(c.x, 0, -c.d);
    c.mesh.rotation.y = -Math.atan(track.slope(c.d));
  }
  traffic = traffic.filter((c) => {
    if (c.d < S.d - 45 || c.d > S.d + 280) { scene.remove(c.mesh); return false; }
    return true;
  });

  // cross traffic
  let siren = 0;
  for (const c of crossers) {
    const u = (((c.phase + c.speed * S.time) % CROSS_SPAN) + CROSS_SPAN) % CROSS_SPAN;
    c.x = c.cx + c.dir * (u - CROSS_SPAN / 2);
    c.mesh.position.set(c.x, 0, -c.d);
    if (c.fire) {
      c.mesh.userData.beacon.material.color.setHex(Math.floor(S.time * 6) % 2 ? 0xff2a1f : 0x2b7fff);
      siren = Math.max(siren, clamp(1 - Math.abs(c.d - S.d) / 150, 0, 1));
    }
  }
  crossers = crossers.filter((c) => {
    if (c.d < S.d - 45) { scene.remove(c.mesh); return false; }
    return true;
  });
  sound.siren(siren, S.time);

  // notices
  const st = track.nextStationAhead(S.d);
  const cr = track.nextCrossingAhead(S.d);
  if (track.stationAt(S.d) && S.d > 110 && !S.servicing) notice('Gas station — pull in and stop');
  else if (cr && cr.d - S.d < 190) notice('Crossroads ahead');
  else if (st && st.start - S.d < 330) notice('Gas station ahead ▸ keep right');
  else notice('');

  const type = TYPES[track.info(S.d).type].name;
  if (type !== S.lastType) { S.lastType = type; setText('roadTag', type); }
}

function update(dt) {
  S.time += dt;
  if (DEMO) autopilot();

  if (S.sub === 'crash' || S.sub === 'stall') {
    S.subT -= dt;
    S.v = Math.max(0, S.v - (S.sub === 'crash' ? 40 : 12) * dt);
    S.d += S.v * dt;
    if (S.sub === 'crash') car.rotation.y += 11 * dt * clamp(S.subT / 2.3, 0, 1);
    if (S.subT <= 0) respawn();
  } else if (S.sub === 'tyre') {
    S.subT -= dt;
    if (S.subT <= 0) { S.sub = null; S.invuln = 1; toast('Spare fitted — no more spares!', 'good'); }
  } else {
    drive(dt);
  }
  if (mode !== 'play') return;

  updateChunks(false);
  updateWorld(dt);
  sound.engine(S.v / VMAX, S.sub !== 'crash' && S.sub !== 'stall' && S.fuel > 0);
}

// ---------------------------------------------------------------- per-frame visuals
function nightness() {
  if (FORCE_TOD === 'night') return 1;
  if (FORCE_TOD === 'dusk') return 0.5;
  if (FORCE_TOD === 'day') return 0;
  const p = (((S.d + 600) % DAY_LEN) + DAY_LEN) % DAY_LEN / DAY_LEN;
  if (p < 0.5) return 0;
  if (p < 0.62) return (p - 0.5) / 0.12;
  if (p < 0.9) return 1;
  return 1 - (p - 0.9) / 0.1;
}

const sky = new THREE.Color();
function present(dt) {
  const z = -S.d;

  // player car
  car.position.set(S.x, S.sub === 'crash' ? Math.abs(Math.sin(S.subT * 6)) * 0.6 : 0, z);
  if (S.sub !== 'crash') {
    const yaw = -Math.atan2(S.vx + (S.erratic > 0 ? Math.sin(S.time * 19) * 3 : 0), Math.max(S.v, 9)) * 0.9;
    car.rotation.y += (yaw + (S.oil > 0 ? Math.sin(S.time * 14) * 0.5 : 0) - car.rotation.y) * Math.min(1, dt * 14);
  }
  car.visible = !(S.invuln > 0 && Math.floor(S.time * 10) % 2 === 0) || mode !== 'play';
  for (const w of car.userData.wheels) w.rotation.x -= (S.v * dt) / 0.5;

  // debris
  for (const p of debris) {
    if (p.life <= 0) continue;
    p.life -= dt;
    p.v.y -= 24 * dt;
    p.m.position.addScaledVector(p.v, dt);
    if (p.m.position.y < 0.15) { p.m.position.y = 0.15; p.v.y *= -0.4; p.v.x *= 0.7; p.v.z *= 0.7; }
    p.m.rotation.x += dt * 9;
    p.m.rotation.y += dt * 7;
    p.m.material.opacity = clamp(p.life * 2, 0, 1);
    if (p.life <= 0) p.m.visible = false;
  }

  // camera — a tilted top-down view that keeps the original's long look ahead
  S.camX += (S.x - S.camX) * Math.min(1, dt * 5);
  S.shake = Math.max(0, S.shake - dt * 2.2);
  const sh = S.shake * 0.6;
  camera.position.set(S.camX + rand(-sh, sh), 31 + rand(-sh, sh), z + 30);
  camera.lookAt(S.camX, 0, z - 22);

  // light
  const n = nightness();
  if (n < 0.5) sky.copy(SKY_DAY).lerp(SKY_DUSK, n * 2);
  else sky.copy(SKY_DUSK).lerp(SKY_NIGHT, (n - 0.5) * 2);
  scene.background.copy(sky);
  scene.fog.color.copy(sky);
  hemi.intensity = lerp(1.7, 0.2, n);
  sun.intensity = lerp(2.6, 0.22, n);
  sun.color.copy(SUN_DAY).lerp(SUN_NIGHT, n);
  sun.position.set(S.camX - 38, 62, z + 6);
  sun.target.position.set(S.camX, 0, z - 34);
  const lamps = S.sub === 'crash' || S.sub === 'stall' ? 0.25 : clamp(S.batt / 22, 0.12, 1);
  headlight.intensity = n > 0.12 ? lerp(0, 11, n) * lamps : 0;
  headlight.position.set(S.x, 2.4, z - 1.5);
  headlight.target.position.set(S.x + S.vx * 0.5, 0, z - 48);

  updateHud(false);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- main loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (mode === 'play') update(dt);
  present(mode === 'play' ? dt : 0);
  requestAnimationFrame(frame);
}

resize();
newGame();
if (DEMO) {
  closeModals();
  mode = 'play';
  // fast-forward so a screenshot lands somewhere interesting
  const skip = parseFloat(params.get('skip')) || 0;
  for (let t = 0; t < skip && mode === 'play'; t += 1 / 30) { update(1 / 30); for (let i = 0; i < 3; i++) updateChunks(false); }
}
if (params.has('debug')) {
  // manual stepping for automated tests: __mm.step(seconds)
  window.__mm = {
    S, keys,
    get mode() { return mode; },
    get track() { return track; },
    step(sec) { for (let t = 0; t < sec && mode === 'play'; t += 1 / 60) update(1 / 60); present(0); },
  };
}
requestAnimationFrame(frame);
