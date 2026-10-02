// Procedural road: sections (motorway / B-road / dirt), gas stations, crossroads,
// and the chunked ground geometry. Distance along the road is `d`; world z = -d.
import * as THREE from 'three';
import * as M from './models.js';

export const CH = 60; // chunk length
export const BAYW = 10; // gas station forecourt width
const STEP = 3;
const BLEND = 60;
const SIDE = 170;
const SH = 1.4;
const STATION_LEN = 90;

const C = (hex) => new THREE.Color(hex);
export const TYPES = {
  motorway: { name: 'Motorway', half: 11, curv: 0.45, road: C(0x3d434b), shoulder: C(0x8b9096), ground: C(0x4f8a3c) },
  broad: { name: 'B-Road', half: 7, curv: 1.0, road: C(0x4b4e52), shoulder: C(0x71804f), ground: C(0x5b9440) },
  dirt: { name: 'Dirt Track', half: 5.5, curv: 1.25, road: C(0x9c7648), shoulder: C(0x806b46), ground: C(0xb99c64) },
};
export const LANES = {
  motorway: [-8.25, -2.75, 2.75, 8.25],
  broad: [-3.5, 3.5],
  dirt: [-2.3, 2.3],
};

const WHITE = C(0xe8e8e2);
const YELLOW = C(0xe2b93b);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const markMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

export class Track {
  constructor() {
    this.sections = [];
    this.stations = [];
    this.crossings = [];
    this.nextStation = 0;
    this.add('broad', 960);
  }

  get end() { return this.sections[this.sections.length - 1].end; }

  add(type, len) {
    const first = this.sections.length === 0;
    const start = first ? -200 : this.end;
    const sec = { type, start, end: start + len };
    this.sections.push(sec);
    if (first) {
      // The run always begins on a gas station forecourt.
      this.stations.push({ start: 10, end: 10 + STATION_LEN });
      this.nextStation = rand(1300, 1600);
    } else if (this.nextStation < sec.end - 200) {
      const s = Math.max(this.nextStation, sec.start + 90);
      this.stations.push({ start: s, end: s + STATION_LEN });
      this.nextStation = s + STATION_LEN + rand(1300, 1700);
    }
    if (type !== 'dirt') {
      const n = Math.random() < 0.5 ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const d = sec.start + (len * (i + 1)) / (n + 1) + rand(-40, 40);
        if (d > 300 && !this.nearStation(d, 180)) this.crossings.push({ d, fire: Math.random() < 0.55 });
      }
    }
  }

  extend(to) {
    while (this.end < to) {
      const last = this.sections[this.sections.length - 1].type;
      const options = Object.keys(TYPES).filter((t) => t !== last);
      this.add(options[(Math.random() * options.length) | 0], rand(650, 1000));
    }
  }

  prune(d) {
    while (this.sections.length > 2 && this.sections[0].end < d - 300) this.sections.shift();
    while (this.stations.length && this.stations[0].end < d - 400) this.stations.shift();
    while (this.crossings.length && this.crossings[0].d < d - 300) this.crossings.shift();
  }

  info(d) {
    const S = this.sections;
    let i = 0;
    while (i < S.length - 1 && d >= S[i].end) i++;
    const s = S[i];
    const A = TYPES[s.type];
    const n = S[i + 1];
    let t = 0;
    let B = A;
    let type = s.type;
    if (n && d > s.end - BLEND) {
      t = smooth((d - (s.end - BLEND)) / BLEND);
      B = TYPES[n.type];
      if (t >= 0.5) type = n.type;
    }
    return { A, B, t, type, half: lerp(A.half, B.half, t), curv: lerp(A.curv, B.curv, t) };
  }

  // 0 around gas stations so forecourts sit on a straight.
  straighten(d) {
    let f = 1;
    for (const s of this.stations) {
      f *= 1 - smooth((d - (s.start - 180)) / 160) * (1 - smooth((d - (s.end + 20)) / 160));
    }
    return f;
  }

  cx(d) {
    return this.info(d).curv * this.straighten(d) * (8 * Math.sin(d * 0.011) + 4 * Math.sin(d * 0.027 + 1.7));
  }

  slope(d) { return (this.cx(d + 1) - this.cx(d - 1)) / 2; }

  bay(d) {
    for (const s of this.stations) {
      if (d > s.start && d < s.end) {
        return BAYW * smooth((d - s.start) / 18) * (1 - smooth((d - (s.end - 18)) / 18));
      }
    }
    return 0;
  }

  stationAt(d) { return this.stations.find((s) => d > s.start && d < s.end) || null; }
  nearStation(d, pad) { return this.stations.some((s) => d > s.start - pad && d < s.end + pad); }
  crossingAt(d, pad) { return this.crossings.find((c) => Math.abs(c.d - d) < pad) || null; }
  nearCrossing(d, pad) { return !!this.crossingAt(d, pad); }
  nextStationAhead(d) { return this.stations.find((s) => s.start > d) || null; }
  nextCrossingAhead(d) { return this.crossings.find((c) => c.d > d) || null; }

  buildChunk(k) {
    const d0 = k * CH;
    const n = CH / STEP;
    const pos = [];
    const col = [];
    const mpos = [];
    const mcol = [];

    const quad = (P, K, x0a, x1a, za, x0b, x1b, zb, y, c) => {
      P.push(x0a, y, za, x1a, y, za, x1b, y, zb, x0a, y, za, x1b, y, zb, x0b, y, zb);
      for (let i = 0; i < 6; i++) K.push(c.r, c.g, c.b);
    };

    const rows = [];
    for (let j = 0; j <= n; j++) {
      const d = d0 + j * STEP;
      const inf = this.info(d);
      const cx = this.cx(d);
      const bay = this.bay(d);
      const band = (k * n + j) % 4 < 2 ? 1.0 : 0.94;
      rows.push({
        z: -d, cx, half: inf.half, bay, type: inf.type, idx: k * n + j,
        L: cx - inf.half, R: cx + inf.half + bay,
        road: inf.A.road.clone().lerp(inf.B.road, inf.t),
        sh: inf.A.shoulder.clone().lerp(inf.B.shoulder, inf.t),
        gr: inf.A.ground.clone().lerp(inf.B.ground, inf.t).multiplyScalar(band),
      });
    }

    for (let j = 0; j < n; j++) {
      const a = rows[j];
      const b = rows[j + 1];
      quad(pos, col, a.cx - SIDE, a.L - SH, a.z, b.cx - SIDE, b.L - SH, b.z, 0, a.gr);
      quad(pos, col, a.L - SH, a.L, a.z, b.L - SH, b.L, b.z, 0, a.sh);
      quad(pos, col, a.L, a.R, a.z, b.L, b.R, b.z, 0, a.road);
      quad(pos, col, a.R, a.R + SH, a.z, b.R, b.R + SH, b.z, 0, a.sh);
      quad(pos, col, a.R + SH, a.cx + SIDE, a.z, b.R + SH, b.cx + SIDE, b.z, 0, a.gr);

      if (a.type === 'dirt') continue;
      const line = (offA, offB, w, c) =>
        quad(mpos, mcol, a.cx + offA - w / 2, a.cx + offA + w / 2, a.z, b.cx + offB - w / 2, b.cx + offB + w / 2, b.z, 0.03, c);
      const dash = a.idx % 3 === 0;
      line(-a.half + 0.45, -b.half + 0.45, 0.24, WHITE);
      if (a.bay < 0.5 || a.idx % 2 === 0) line(a.half - 0.45, b.half - 0.45, 0.24, WHITE);
      if (a.type === 'motorway') {
        line(-0.2, -0.2, 0.15, YELLOW);
        line(0.2, 0.2, 0.15, YELLOW);
        if (dash) {
          line(-a.half / 2, -b.half / 2, 0.2, WHITE);
          line(a.half / 2, b.half / 2, 0.2, WHITE);
        }
      } else if (dash) {
        line(0, 0, 0.2, WHITE);
      }
    }

    const group = new THREE.Group();

    // cross streets
    for (const c of this.crossings) {
      if (c.d < d0 || c.d >= d0 + CH) continue;
      const cx = this.cx(c.d);
      const inf = this.info(c.d);
      const roadC = inf.A.road.clone().lerp(inf.B.road, inf.t);
      quad(pos, col, cx - SIDE, cx + SIDE, -(c.d - 6), cx - SIDE, cx + SIDE, -(c.d + 6), 0.015, roadC);
      for (let x = -SIDE; x < SIDE; x += 9) {
        if (Math.abs(x + 1.75) < inf.half + 2.5) continue;
        quad(mpos, mcol, cx + x, cx + x + 3.5, -(c.d - 0.12), cx + x, cx + x + 3.5, -(c.d + 0.12), 0.03, WHITE);
      }
    }

    const mk = (P, K, mat) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(K, 3));
      const nrm = new Float32Array(P.length);
      for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      group.add(m);
      return g;
    };
    const geos = [mk(pos, col, groundMat)];
    if (mpos.length) geos.push(mk(mpos, mcol, markMat));

    // scenery
    for (let i = 0; i < 11; i++) {
      const d = d0 + rand(0, CH);
      const side = Math.random() < 0.5 ? -1 : 1;
      if (side > 0 && this.nearStation(d, 12)) continue;
      if (this.nearCrossing(d, 11)) continue;
      const inf = this.info(d);
      const cx = this.cx(d);
      const dist = SH + 2.5 + Math.random() * Math.random() * 60;
      const x = side < 0 ? cx - inf.half - dist : cx + inf.half + this.bay(d) + dist;
      let o;
      if (inf.type === 'dirt') o = Math.random() < 0.65 ? M.rock() : M.cactus();
      else o = Math.random() < 0.78 ? M.tree() : M.bush();
      o.position.set(x, 0, -d);
      group.add(o);
    }

    for (const s of this.stations) {
      if (s.start < d0 || s.start >= d0 + CH) continue;
      const mid = (s.start + s.end) / 2;
      const st = M.station(s.end - s.start);
      st.position.set(this.cx(mid) + this.info(mid).half + BAYW + SH, 0, -mid);
      group.add(st);
    }

    return { k, group, dispose: () => geos.forEach((g) => g.dispose()) };
  }
}
