// Classic mode: a flat top-down presentation in the spirit of the 1982 C64
// original — play area on the left, black instrument panel on the right —
// drawn with crisp vector shapes at full resolution rather than C64 pixels.
import { BAYW } from './road.js';

// Logical layout (scaled to fit the stage): 320 x 200, play area 240 wide.
const W = 320;
const H = 200;
const PW = 240;
const K = 3.6; // screen units per world unit
const CAR_Y = 150; // where the player's car sits on screen

const COL = {
  border: '#1b1612',
  grass: '#5db540',
  grassDark: '#57ad3c',
  road: '#a6a6a6',
  roadDark: '#8f8f8f',
  dirt: '#8c5a2b',
  dirtDark: '#73481f',
  kerb: '#000',
  white: '#f4f4f4',
  panel: '#000',
  green: '#5fd84a',
  orange: '#e88d2a',
  red: '#e33b2f',
  cyan: '#6ee3e0',
  yellow: '#f2e24a',
};
const FONT = "'Press Start 2P', monospace";

const roadColor = (type) => (type === 'dirt' ? COL.dirt : COL.road);
const hash = (n) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };

export function renderClassic(canvas, G) {
  const { S, track } = G;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  if (!cw || !ch) return;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }
  const ctx = canvas.getContext('2d');
  const s = Math.min(cw / W, ch / H);
  const ox = (cw - W * s) / 2;
  const oy = (ch - H * s) / 2;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COL.border;
  ctx.fillRect(0, 0, cw, ch);
  ctx.setTransform(dpr * s, 0, 0, dpr * s, ox * dpr, oy * dpr);

  const sx = (wx) => PW / 2 + wx * K;
  const sy = (wd) => CAR_Y - (wd - S.d) * K;

  // ---------------- play area
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, PW, H);
  ctx.clip();

  const dTop = S.d + (CAR_Y + 4) / K;
  const dBot = S.d - (H - CAR_Y + 4) / K;
  const STEP = 2;
  const d0 = Math.floor(dBot / STEP) * STEP;

  // grass with faint bands so speed reads even on a straight
  ctx.fillStyle = COL.grass;
  ctx.fillRect(0, 0, PW, H);
  ctx.fillStyle = COL.grassDark;
  for (let d = d0; d < dTop; d += STEP * 4) ctx.fillRect(0, sy(d + STEP * 2), PW, STEP * 2 * K);

  // cross streets
  for (const c of track.crossings) {
    if (c.d < dBot - 8 || c.d > dTop + 8) continue;
    ctx.fillStyle = roadColor(track.info(c.d).type);
    ctx.fillRect(0, sy(c.d + 6), PW, 12 * K);
    ctx.fillStyle = COL.kerb;
    ctx.fillRect(0, sy(c.d + 6), PW, 0.8);
    ctx.fillRect(0, sy(c.d - 6) - 0.8, PW, 0.8);
    ctx.fillStyle = COL.white;
    for (let x = -90; x < 90; x += 8) ctx.fillRect(sx(x), sy(c.d) - 0.5, 4 * K, 1);
  }

  // road surface, row by row
  const rows = [];
  for (let d = d0; d <= dTop + STEP; d += STEP) {
    const inf = track.info(d);
    const cx = track.cx(d);
    rows.push({ d, cx, half: inf.half, bay: track.bay(d), type: inf.type, L: cx - inf.half, R: cx + inf.half + track.bay(d) });
  }
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    ctx.fillStyle = roadColor(a.type);
    ctx.beginPath();
    ctx.moveTo(sx(a.L), sy(a.d) + 0.5);
    ctx.lineTo(sx(a.R), sy(a.d) + 0.5);
    ctx.lineTo(sx(b.R), sy(b.d) - 0.5);
    ctx.lineTo(sx(b.L), sy(b.d) - 0.5);
    ctx.closePath();
    ctx.fill();
  }
  // kerbs
  for (const side of ['L', 'R']) {
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i];
      const b = rows[i + 1];
      if (track.crossingAt(a.d, 6)) continue;
      ctx.strokeStyle = COL.kerb;
      if (a.type === 'dirt') {
        // speckled edge like the original dirt track
        for (let j = 0; j < 3; j++) {
          const t = hash(a.d * 7 + j * 31 + (side === 'L' ? 0 : 500));
          const u = hash(a.d * 3 + j * 17 + (side === 'L' ? 9 : 99));
          const x = a[side] + (side === 'L' ? -1 : 1) * (u * 2.2);
          ctx.fillStyle = COL.kerb;
          ctx.fillRect(sx(x) - 0.8, sy(a.d + t * STEP) - 0.8, 1.6, 1.6);
        }
      } else {
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(sx(a[side]), sy(a.d));
        ctx.lineTo(sx(b[side]), sy(b.d));
        ctx.stroke();
      }
    }
  }
  // lane markings
  ctx.strokeStyle = COL.white;
  ctx.lineWidth = 1.1;
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    if (a.type === 'dirt') continue;
    const on = Math.floor(a.d / STEP) % 3 === 0;
    if (!on) continue;
    const offs = a.type === 'motorway' ? [-a.half / 2, 0, a.half / 2] : [0];
    for (const off of offs) {
      ctx.beginPath();
      ctx.moveTo(sx(a.cx + off), sy(a.d));
      ctx.lineTo(sx(b.cx + off), sy(b.d));
      ctx.stroke();
    }
  }

  // gas stations: pumps and sign on the forecourt
  for (const st of track.stations) {
    if (st.end < dBot || st.start > dTop) continue;
    const mid = (st.start + st.end) / 2;
    const inf = track.info(mid);
    const edge = track.cx(mid) + inf.half + BAYW;
    // a lighter concrete apron so the forecourt reads as a place to stop
    ctx.fillStyle = '#bdbdbd';
    ctx.beginPath();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.bay <= 0.01) continue;
      ctx.rect(sx(r.cx + r.half + 0.3), sy(r.d) - STEP * K, r.bay * K - 0.3 * K, STEP * K + 0.5);
    }
    ctx.fill();
    for (let i = -1; i <= 1; i++) {
      const px = sx(edge - 1.6);
      const py = sy(mid + i * 6);
      ctx.fillStyle = COL.cyan;
      ctx.fillRect(px - 1.5, py - 2.5, 3, 5);
      ctx.fillStyle = COL.green;
      ctx.fillRect(px - 1.5, py - 1, 3, 1);
    }
    const gx = sx(edge + 4);
    const gy = sy(mid + 8);
    ctx.fillStyle = COL.kerb;
    ctx.fillRect(gx - 10, gy - 7, 20, 14);
    ctx.fillStyle = COL.white;
    ctx.font = `6px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GAS', gx, gy + 0.5);
  }

  // hazards
  for (const o of G.obstacles) {
    if (o.dead || o.d < dBot || o.d > dTop) continue;
    drawHazard(ctx, o, sx(o.x), sy(o.d), S.time);
  }

  // traffic
  for (const c of G.traffic) {
    if (c.d < dBot - 5 || c.d > dTop + 5) continue;
    drawVehicle(ctx, sx(c.x), sy(c.d), Math.atan(track.slope(c.d)), c.hw, c.hl, c.color, c.kind, S.time);
  }
  for (const c of G.crossers) {
    if (c.d < dBot - 5 || c.d > dTop + 5) continue;
    drawVehicle(ctx, sx(c.x), sy(c.d), c.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 1.0, c.hl, c.fire ? COL.red : c.color, c.fire ? 'fire' : c.kind, S.time);
  }

  // player
  const blink = S.invuln > 0 && Math.floor(S.time * 10) % 2 === 0;
  if (!blink) {
    const px = sx(S.x);
    const py = sy(S.d);
    if (S.sub === 'crash') {
      drawRacer(ctx, px, py, S.time * 11);
      const r = (1 - Math.max(0, S.subT) / 2.3) * 14;
      ctx.fillStyle = COL.yellow;
      ctx.globalAlpha = Math.max(0, S.subT / 2.3);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      const yaw = -Math.atan2(S.vx + (S.erratic > 0 ? Math.sin(S.time * 19) * 3 : 0), Math.max(S.v, 9)) * 0.9;
      drawRacer(ctx, px, py, -yaw + (S.oil > 0 ? Math.sin(S.time * 14) * 0.5 : 0));
    }
    if (S.sub === 'tyre') {
      ctx.fillStyle = COL.white;
      ctx.beginPath();
      ctx.arc(px + 5, py + 3, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // ---------------- instrument panel
  ctx.fillStyle = COL.panel;
  ctx.fillRect(PW, 0, W - PW, H);
  const cxp = PW + (W - PW) / 2;
  gauge(ctx, cxp, 4, 'MPH', S.v / G.VMAX, ['0', '40', '80']);

  // odometer
  const miles = Math.max(0, (S.d - G.START_D) / G.MILE);
  const digits = String(Math.floor(miles * 10)).padStart(7, '0').slice(-7);
  ctx.font = `6px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 7; i++) {
    const bx = PW + 6 + i * 9.7;
    ctx.fillStyle = i === 6 ? COL.red : COL.white;
    ctx.fillRect(bx, 50, 9, 10);
    ctx.fillStyle = i === 6 ? COL.white : '#000';
    ctx.fillText(digits[i], bx + 4.5, 55.5);
  }

  // spare tyre + lives
  ctx.fillStyle = S.spare ? COL.orange : '#3a2a14';
  ctx.beginPath();
  ctx.arc(PW + 12, 70, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COL.panel;
  ctx.beginPath();
  ctx.arc(PW + 12, 70, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COL.orange;
  ctx.font = `7px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('x'.repeat(Math.max(0, S.lives - 1)), PW + 19, 70.5);

  // warning lamps
  const flash = Math.floor(S.time * 4) % 2 === 0;
  lamp(ctx, PW + 10, 84, 'TEMP', !S.radiator && flash, COL.red);
  lamp(ctx, PW + 44, 84, 'OIL', S.temp > 85 && !flash, COL.yellow);
  lamp(ctx, PW + 10, 94, 'FUEL', S.fuel < 18 && flash, COL.red);
  lamp(ctx, PW + 44, 94, 'BATT', S.batt < 18 && flash, COL.red);

  gauge(ctx, cxp, 104, 'FUEL', S.fuel / 100, ['E', '', 'F'], true);
  gauge(ctx, cxp, 152, 'GEN', S.batt / 100, ['-', '', '+'], true);

  // best distance in the bottom-left corner of the panel area
  ctx.fillStyle = COL.white;
  ctx.font = `4px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(`BEST ${G.best.toFixed(1)}`, cxp, 197);
}

function lamp(ctx, x, y, label, on, color) {
  ctx.fillStyle = on ? color : '#2a2a2a';
  ctx.fillRect(x - 4, y - 3, 6, 6);
  ctx.fillStyle = on ? color : '#6a6a6a';
  ctx.font = `4px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + 4, y + 0.5);
}

function gauge(ctx, cx, y, label, frac, labels, lowRed) {
  const w = 42;
  const h = 40;
  const x = cx - w / 2;
  ctx.fillStyle = COL.green;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = COL.white;
  ctx.fillRect(x + 2, y + 2, w - 4, h - 12);
  // dial
  const gx = cx;
  const gy = y + 24;
  const r = 16;
  if (lowRed) {
    ctx.strokeStyle = COL.red;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(gx, gy, r - 1.5, Math.PI, Math.PI * 1.2);
    ctx.stroke();
  }
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(gx, gy, r, Math.PI, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI + (Math.PI * i) / 8;
    const len = i % 4 === 0 ? 3.5 : 2;
    ctx.beginPath();
    ctx.moveTo(gx + Math.cos(a) * r, gy + Math.sin(a) * r);
    ctx.lineTo(gx + Math.cos(a) * (r - len), gy + Math.sin(a) * (r - len));
    ctx.stroke();
  }
  ctx.fillStyle = '#000';
  ctx.font = `3.5px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  labels.forEach((l, i) => {
    if (!l) return;
    const a = Math.PI + (Math.PI * i) / (labels.length - 1);
    ctx.fillText(l, gx + Math.cos(a) * (r - 7), gy + Math.sin(a) * (r - 7) + 0.5);
  });
  const a = Math.PI + Math.PI * Math.max(0, Math.min(1, frac));
  ctx.strokeStyle = COL.red;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(gx, gy);
  ctx.lineTo(gx + Math.cos(a) * (r - 2), gy + Math.sin(a) * (r - 2));
  ctx.stroke();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(gx, gy, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COL.panel;
  ctx.font = `6px ${FONT}`;
  ctx.fillText(label, cx, y + h - 5);
}

function drawRacer(ctx, x, y, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const u = K; // one world unit
  // wheels
  ctx.fillStyle = '#111';
  for (const [wx, wy] of [[-1.0, -1.35], [1.0, -1.35], [-1.05, 1.3], [1.05, 1.3]]) ctx.fillRect(wx * u - 1.1, wy * u - 1.6, 2.2, 3.2);
  // axles
  ctx.fillStyle = '#333';
  ctx.fillRect(-1.0 * u, -1.35 * u - 0.4, 2.0 * u, 0.8);
  ctx.fillRect(-1.05 * u, 1.3 * u - 0.4, 2.1 * u, 0.8);
  // body
  ctx.fillStyle = COL.orange;
  ctx.beginPath();
  ctx.moveTo(-0.3 * u, -2.4 * u);
  ctx.lineTo(0.3 * u, -2.4 * u);
  ctx.lineTo(0.55 * u, 0.2 * u);
  ctx.lineTo(0.45 * u, 2.1 * u);
  ctx.lineTo(-0.45 * u, 2.1 * u);
  ctx.lineTo(-0.55 * u, 0.2 * u);
  ctx.closePath();
  ctx.fill();
  // cockpit + helmet
  ctx.fillStyle = '#222';
  ctx.fillRect(-0.35 * u, 0.1 * u, 0.7 * u, 1.0 * u);
  ctx.fillStyle = COL.white;
  ctx.beginPath();
  ctx.arc(0, 0.6 * u, 0.28 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawVehicle(ctx, x, y, rot, hw, hl, color, kind, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const u = K;
  const w = hw * 2 * u;
  const l = hl * 2 * u;
  ctx.fillStyle = '#111';
  for (const [wx, wy] of [[-hw, -hl + 0.9], [hw, -hl + 0.9], [-hw, hl - 0.9], [hw, hl - 0.9]]) ctx.fillRect(wx * u - 1, wy * u - 1.5, 2, 3);
  ctx.fillStyle = color;
  ctx.fillRect(-w / 2, -l / 2, w, l);
  if (kind === 'fire') {
    ctx.fillStyle = COL.white;
    ctx.fillRect(-w / 2, -l / 2 + 3, w, 1.2);
    ctx.fillStyle = '#ccc';
    ctx.fillRect(-1, -l / 2 + 6, 2, l - 9);
    for (let i = 0; i < 5; i++) ctx.fillRect(-2.2, -l / 2 + 7 + i * (l - 11) / 4, 4.4, 0.8);
    ctx.fillStyle = Math.floor(time * 6) % 2 ? COL.red : '#3b8bff';
    ctx.fillRect(-2, -l / 2 + 1, 4, 1.6);
  } else if (kind === 'truck') {
    ctx.fillStyle = '#e4e4e4';
    ctx.fillRect(-w / 2 + 0.6, -l / 2 + 5, w - 1.2, l - 6);
    ctx.fillStyle = '#20303c';
    ctx.fillRect(-w / 2 + 1, -l / 2 + 1, w - 2, 1.4);
  } else {
    ctx.fillStyle = '#20303c';
    ctx.fillRect(-w / 2 + 0.8, -l / 2 + 2.2, w - 1.6, 1.6);
    ctx.fillRect(-w / 2 + 0.8, l / 2 - 3.2, w - 1.6, 1.4);
  }
  ctx.restore();
}

function drawHazard(ctx, o, x, y, time) {
  const u = K;
  switch (o.kind) {
    case 'oil':
      ctx.fillStyle = '#0a0a0a';
      ctx.beginPath();
      ctx.ellipse(x, y, 1.2 * u, 1.0 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 1.0 * u, y + 0.5 * u, 0.45 * u, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'patch':
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(x - 1.3 * u, y - 1.7 * u, 2.6 * u, 3.4 * u);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(x - 1.3 * u, y - 1.7 * u, 2.6 * u, 3.4 * u);
      break;
    case 'pothole':
      ctx.fillStyle = '#5a5146';
      ctx.beginPath();
      ctx.arc(x, y, 1.0 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0b0b0b';
      ctx.beginPath();
      ctx.arc(x + 0.1 * u, y, 0.7 * u, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'glass':
      ctx.fillStyle = COL.cyan;
      for (let i = 0; i < 9; i++) {
        const a = hash(o.d + i * 3) * 6.28;
        const r = hash(o.d * 2 + i) * 0.8 * u;
        ctx.fillRect(x + Math.cos(a) * r - 0.6, y + Math.sin(a) * r - 0.6, 1.3, 1.3);
      }
      break;
    case 'nails':
      ctx.strokeStyle = '#d9dde2';
      ctx.lineWidth = 0.6;
      for (let i = 0; i < 8; i++) {
        const a = hash(o.d + i * 5) * 6.28;
        const r = hash(o.d * 3 + i) * 0.7 * u;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        const b = hash(i * 11 + o.d) * 6.28;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(b) * 1.6, py + Math.sin(b) * 1.6);
        ctx.stroke();
      }
      break;
    case 'log':
      ctx.fillStyle = '#6f4421';
      ctx.fillRect(x - 1.5 * u, y - 0.4 * u, 3.0 * u, 0.8 * u);
      ctx.fillStyle = '#d2a56d';
      ctx.fillRect(x - 1.5 * u, y - 0.3 * u, 0.6, 0.6 * u);
      ctx.fillRect(x + 1.5 * u - 0.6, y - 0.3 * u, 0.6, 0.6 * u);
      break;
    case 'boulder': {
      ctx.fillStyle = '#8d8a84';
      ctx.beginPath();
      ctx.arc(x, y, 1.05 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6c6963';
      const a = o.vr ? time * o.vr * 0.9 : 0;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 0.4 * u, y + Math.sin(a) * 0.4 * u, 0.45 * u, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}
