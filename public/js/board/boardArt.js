// Composes the final board texture: generated base painting plus vector
// overlays (sea lanes, names, compass rose, title cartouche, bonus legend).
import { TERRITORIES, ADJACENCY, TERRITORY_INDEX, CONTINENTS, CONTINENT_MEMBERS } from '../data/world.js';
import { t, tName, cName } from '../i18n.js';

const SERIF = '"Cinzel", "Trajan Pro", Georgia, serif';
const ITALIC = '"IM Fell English", "EB Garamond", Georgia, serif';

// Coast pixels of a territory (land next to water), subsampled.
function coastPixels(map, tid) {
  const { W, H, ids } = map;
  const out = [];
  const id = tid + 1;
  for (let y = 1; y < H - 1; y += 2) {
    for (let x = 1; x < W - 1; x += 2) {
      const i = y * W + x;
      if (ids[i] !== id) continue;
      if (!ids[i - 1] || !ids[i + 1] || !ids[i - W] || !ids[i + W]) out.push([x, y]);
    }
  }
  return out;
}

export function computeSeaLanes(map) {
  const touching = new Set(map.touching.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
  const pairs = [];
  for (const [a, list] of Object.entries(ADJACENCY)) {
    for (const b of list) {
      const i = TERRITORY_INDEX[a];
      const j = TERRITORY_INDEX[b];
      if (i < j && !touching.has(`${i}-${j}`)) pairs.push([i, j]);
    }
  }
  const coastCache = new Map();
  const coast = (i) => {
    if (!coastCache.has(i)) coastCache.set(i, coastPixels(map, i));
    return coastCache.get(i);
  };
  return pairs.map(([i, j]) => {
    const A = coast(i);
    const B = coast(j);
    const ia = TERRITORY_INDEX.alaska;
    const ik = TERRITORY_INDEX.kamchatka;
    if ((i === ia && j === ik) || (i === ik && j === ia)) {
      // Wraps around the edge of the world.
      const west = A.length && i === ia ? A : B;
      const east = i === ia ? B : A;
      const w = west.reduce((m, p) => (p[0] < m[0] ? p : m), [Infinity, 0]);
      const e = east.reduce((m, p) => (p[0] > m[0] ? p : m), [-Infinity, 0]);
      return { a: i, b: j, wrap: true, p1: w, p2: e };
    }
    let best = Infinity;
    let p1 = null;
    let p2 = null;
    const step = Math.max(1, Math.floor((A.length * B.length) / 4e6));
    for (let x = 0; x < A.length; x += step) {
      const [ax, ay] = A[x];
      for (const [bx, by] of B) {
        const d = (ax - bx) ** 2 + (ay - by) ** 2;
        if (d < best) {
          best = d;
          p1 = A[x];
          p2 = [bx, by];
        }
      }
    }
    return { a: i, b: j, p1, p2 };
  });
}

function dashedLane(ctx, pts, scale) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.setLineDash([12 * scale, 9 * scale]);
  ctx.strokeStyle = 'rgba(20, 30, 40, 0.55)';
  ctx.lineWidth = 7 * scale;
  ctx.beginPath();
  pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.strokeStyle = 'rgba(248, 236, 205, 0.95)';
  ctx.lineWidth = 3.4 * scale;
  ctx.stroke();
  ctx.restore();
}

function drawLanes(ctx, map, lanes, scale) {
  for (const lane of lanes) {
    if (!lane.p1 || !lane.p2) continue;
    if (lane.wrap) {
      const [wx, wy] = lane.p1;
      const [ex, ey] = lane.p2;
      dashedLane(ctx, [[wx, wy], [0, wy]], scale);
      dashedLane(ctx, [[ex, ey], [map.W, ey]], scale);
      continue;
    }
    const [x1, y1] = lane.p1;
    const [x2, y2] = lane.p2;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ext = 10 * scale;
    const ux = (x2 - x1) / (len || 1);
    const uy = (y2 - y1) / (len || 1);
    // Gentle arc for longer crossings.
    const mx = (x1 + x2) / 2 - uy * len * 0.12;
    const my = (y1 + y2) / 2 + ux * len * 0.12;
    const pts = [];
    const sx = x1 - ux * ext;
    const sy = y1 - uy * ext;
    const exx = x2 + ux * ext;
    const eyy = y2 + uy * ext;
    for (let k = 0; k <= 24; k++) {
      const s = k / 24;
      const bend = len > 60 * scale ? 1 : 0;
      const cx = bend ? mx : (sx + exx) / 2;
      const cy = bend ? my : (sy + eyy) / 2;
      pts.push([(1 - s) * (1 - s) * sx + 2 * (1 - s) * s * cx + s * s * exx, (1 - s) * (1 - s) * sy + 2 * (1 - s) * s * cy + s * s * eyy]);
    }
    dashedLane(ctx, pts, scale);
    for (const [x, y] of [lane.p1, lane.p2]) {
      ctx.beginPath();
      ctx.fillStyle = 'rgba(248, 236, 205, 0.95)';
      ctx.strokeStyle = 'rgba(20, 30, 40, 0.6)';
      ctx.lineWidth = 2 * scale;
      ctx.arc(x, y, 4.5 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

function splitLabel(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW || !text.includes(' ')) return [text];
  const words = text.split(' ');
  let bestSplit = 1;
  let bestDiff = Infinity;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(' ');
    const b = words.slice(k).join(' ');
    const d = Math.abs(ctx.measureText(a).width - ctx.measureText(b).width);
    if (d < bestDiff) {
      bestDiff = d;
      bestSplit = k;
    }
  }
  return [words.slice(0, bestSplit).join(' '), words.slice(bestSplit).join(' ')];
}

function drawLabels(ctx, map, scale) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  TERRITORIES.forEach((_, i) => {
    const pos = map.labels[i];
    const room = map.anchors[i].radius;
    const size = Math.round((room < 30 * scale ? 19 : 23) * scale);
    ctx.font = `700 ${size}px ${SERIF}`;
    const lines = splitLabel(ctx, tName(i).toUpperCase(), 210 * scale);
    lines.forEach((line, k) => {
      const y = pos.y + (k - (lines.length - 1) / 2) * size * 1.05;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(250, 238, 208, 0.75)';
      ctx.lineWidth = 5 * scale;
      ctx.strokeText(line, pos.x, y);
      ctx.fillStyle = '#26190e';
      ctx.fillText(line, pos.x, y);
    });
  });
}

function drawOceanNames(ctx, W, H, scale) {
  const names = t('oceans').split('|');
  const spots = [
    [0.075, 0.47],
    [0.37, 0.62],
    [0.665, 0.66],
    [0.93, 0.55],
  ];
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(214, 232, 226, 0.55)';
  ctx.font = `italic 400 ${Math.round(38 * scale)}px ${ITALIC}`;
  const labels = [names[0], names[1], names[2], names[0]];
  spots.forEach(([x, y], k) => {
    const text = labels[k].split('').join(String.fromCharCode(8202));
    ctx.fillText(text, x * W, y * H);
  });
  ctx.restore();
}

function drawCompass(ctx, cx, cy, r, scale) {
  ctx.save();
  ctx.translate(cx, cy);
  // Outer rings
  ctx.strokeStyle = 'rgba(236, 222, 186, 0.85)';
  ctx.lineWidth = 2.5 * scale;
  for (const rr of [r, r * 0.93, r * 0.6]) {
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    const l = k % 8 === 0 ? 0.14 : k % 4 === 0 ? 0.1 : 0.05;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.93, Math.sin(a) * r * 0.93);
    ctx.lineTo(Math.cos(a) * r * (0.93 - l), Math.sin(a) * r * (0.93 - l));
    ctx.stroke();
  }
  const point = (a, len, w, light, dark) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const px = -s;
    const py = c;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(c * len, s * len);
    ctx.lineTo(px * w, py * w);
    ctx.closePath();
    ctx.fillStyle = light;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(c * len, s * len);
    ctx.lineTo(-px * w, -py * w);
    ctx.closePath();
    ctx.fillStyle = dark;
    ctx.fill();
  };
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    point(a, r * 0.55, r * 0.07, 'rgba(236,222,186,0.9)', 'rgba(120,90,50,0.9)');
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 - Math.PI / 2;
    point(a, r * 0.9, r * 0.12, k === 0 ? '#e8c35a' : 'rgba(245,232,200,0.95)', k === 0 ? '#9a6b1c' : 'rgba(90,64,36,0.95)');
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = '#e8c35a';
  ctx.fill();
  ctx.font = `700 ${Math.round(r * 0.2)}px ${SERIF}`;
  ctx.fillStyle = 'rgba(245, 232, 200, 0.95)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const dirs = t('compass').split('');
  ctx.fillText(dirs[0], 0, -r * 1.12);
  ctx.fillText(dirs[1], r * 1.13, 0);
  ctx.fillText(dirs[2], 0, r * 1.13);
  ctx.fillText(dirs[3], -r * 1.13, 0);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function parchmentPanel(ctx, x, y, w, h, scale) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 24 * scale;
  ctx.shadowOffsetY = 6 * scale;
  roundRect(ctx, x, y, w, h, 14 * scale);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#efe0bb');
  g.addColorStop(1, '#d9c393');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = '#6b4a22';
  ctx.lineWidth = 4 * scale;
  roundRect(ctx, x + 8 * scale, y + 8 * scale, w - 16 * scale, h - 16 * scale, 9 * scale);
  ctx.stroke();
  ctx.lineWidth = 1.5 * scale;
  roundRect(ctx, x + 15 * scale, y + 15 * scale, w - 30 * scale, h - 30 * scale, 6 * scale);
  ctx.stroke();
  ctx.restore();
}

function drawCartouche(ctx, cx, cy, scale) {
  const w = 600 * scale;
  const h = 170 * scale;
  parchmentPanel(ctx, cx - w / 2, cy - h / 2, w, h, scale);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#3a2512';
  ctx.font = `900 ${Math.round(62 * scale)}px ${SERIF}`;
  const title = t('title').toUpperCase();
  let size = 62 * scale;
  while (ctx.measureText(title).width > w - 70 * scale && size > 20) {
    size -= 2;
    ctx.font = `900 ${Math.round(size)}px ${SERIF}`;
  }
  ctx.fillText(title, cx, cy - 18 * scale);
  ctx.font = `italic 400 ${Math.round(30 * scale)}px ${ITALIC}`;
  ctx.fillStyle = '#5a3b1c';
  ctx.fillText(t('mapSubtitle'), cx, cy + 40 * scale);
  ctx.restore();
}

function drawLegend(ctx, x, y, w, scale) {
  const rowH = 44 * scale;
  const h = 90 * scale + rowH * CONTINENTS.length;
  parchmentPanel(ctx, x, y, w, h, scale);
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#3a2512';
  ctx.textAlign = 'center';
  ctx.font = `700 ${Math.round(28 * scale)}px ${SERIF}`;
  ctx.fillText(t('legendTitle').toUpperCase(), x + w / 2, y + 48 * scale);
  CONTINENTS.forEach((c, i) => {
    const ry = y + 92 * scale + i * rowH;
    ctx.fillStyle = c.color;
    ctx.strokeStyle = '#3a2512';
    ctx.lineWidth = 2 * scale;
    roundRect(ctx, x + 34 * scale, ry - 13 * scale, 34 * scale, 26 * scale, 5 * scale);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2b1b0d';
    ctx.textAlign = 'left';
    ctx.font = `600 ${Math.round(25 * scale)}px ${SERIF}`;
    ctx.fillText(`${cName(i)} (${CONTINENT_MEMBERS[i].length})`, x + 84 * scale, ry);
    ctx.textAlign = 'right';
    ctx.font = `800 ${Math.round(28 * scale)}px ${SERIF}`;
    ctx.fillText(`+${c.bonus}`, x + w - 34 * scale, ry);
  });
  ctx.restore();
}

// Draw the whole board into `canvas` (sized W x H).
export function paintBoard(canvas, baseCanvas, map, lanes) {
  const ctx = canvas.getContext('2d');
  const { W, H } = map;
  const scale = W / 4096;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(baseCanvas, 0, 0);
  drawOceanNames(ctx, W, H, scale);
  drawLanes(ctx, map, lanes, scale);
  drawLabels(ctx, map, scale);
  drawCartouche(ctx, W * 0.1, H * 0.655, scale);
  drawCompass(ctx, W * 0.1, H * 0.85, 150 * scale, scale);
  drawLegend(ctx, W * 0.595, H * 0.795, W * 0.17, scale);
  // Double frame line along the edge.
  ctx.strokeStyle = 'rgba(40, 26, 12, 0.8)';
  ctx.lineWidth = 6 * scale;
  ctx.strokeRect(10 * scale, 10 * scale, W - 20 * scale, H - 20 * scale);
  ctx.lineWidth = 2 * scale;
  ctx.strokeRect(22 * scale, 22 * scale, W - 44 * scale, H - 44 * scale);
}
