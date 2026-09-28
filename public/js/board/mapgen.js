// Pure (DOM-free) world map generator. Rasterises real country outlines into
// the 42 game territories and paints the vintage board artwork pixel by pixel.
// Runs inside a Web Worker in the browser and under Node for previews.
import { TERRITORIES, COUNTRY_MAP, TERRITORY_INDEX, CONTINENTS, CONTINENT_INDEX, NEIGHBORS } from '../data/world.js';
import { MOUNTAINS } from '../data/mountains.js';

export const WATER = 0;
export const NEUTRAL = 255;
export const PROJ = { lon0: -169, latMax: 82, latMin: -56 };

const D2R = Math.PI / 180;
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * D2R) / 2));
const Y_MAX = mercY(PROJ.latMax);
const Y_MIN = mercY(PROJ.latMin);
export const MAP_ASPECT = (2 * Math.PI) / (Y_MAX - Y_MIN);

export function projection(W) {
  const H = Math.round(W / MAP_ASPECT);
  const unit = W / 360; // pixels per degree of longitude
  return {
    W,
    H,
    unit,
    x: (lon) => ((lon < PROJ.lon0 ? lon + 360 : lon) - PROJ.lon0) * unit,
    y: (lat) => ((Y_MAX - mercY(lat)) / (Y_MAX - Y_MIN)) * H,
    lon: (x) => x / unit + PROJ.lon0,
    lat: (y) => (2 * Math.atan(Math.exp(Y_MAX - (y / H) * (Y_MAX - Y_MIN))) - Math.PI / 2) / D2R,
  };
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, v) => smooth(clamp01((v - a) / (b - a)));

// Tileable fBm value noise baked into a square tile, sampled with wrap-around.
function makeNoiseTile(size, seed, octaves = 5) {
  const rnd = mulberry32(seed);
  const out = new Float32Array(size * size);
  let amp = 0.5;
  let freq = 4;
  for (let o = 0; o < octaves; o++) {
    const lat = new Float32Array(freq * freq);
    for (let i = 0; i < lat.length; i++) lat[i] = rnd();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * freq;
      const iy = Math.floor(fy);
      const ty = smooth(fy - iy);
      const y0 = iy % freq;
      const y1 = (iy + 1) % freq;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * freq;
        const ix = Math.floor(fx);
        const tx = smooth(fx - ix);
        const x0 = ix % freq;
        const x1 = (ix + 1) % freq;
        const a = lat[y0 * freq + x0] + (lat[y0 * freq + x1] - lat[y0 * freq + x0]) * tx;
        const b = lat[y1 * freq + x0] + (lat[y1 * freq + x1] - lat[y1 * freq + x0]) * tx;
        out[y * size + x] += amp * (a + (b - a) * ty);
      }
    }
    amp *= 0.5;
    freq *= 2;
  }
  let mn = Infinity;
  let mx = -Infinity;
  for (const v of out) {
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) / (mx - mn);
  return { size, data: out };
}

function sampleNoise(tile, x, y) {
  const s = tile.size;
  const fx = ((x % s) + s) % s;
  const fy = ((y % s) + s) % s;
  const ix = fx | 0;
  const iy = fy | 0;
  const tx = fx - ix;
  const ty = fy - iy;
  const x1 = (ix + 1) % s;
  const y1 = (iy + 1) % s;
  const d = tile.data;
  const a = d[iy * s + ix] + (d[iy * s + x1] - d[iy * s + ix]) * tx;
  const b = d[y1 * s + ix] + (d[y1 * s + x1] - d[y1 * s + ix]) * tx;
  return a + (b - a) * ty;
}

// Even-odd scanline fill of a polygon given as rings of pixel coordinates.
function scanPolygon(rings, W, H, plot) {
  let ne = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const r of rings) {
    ne += r.length / 2;
    for (let i = 1; i < r.length; i += 2) {
      if (r[i] < minY) minY = r[i];
      if (r[i] > maxY) maxY = r[i];
    }
  }
  const yStart = Math.max(0, Math.ceil(minY - 0.5));
  const yEnd = Math.min(H - 1, Math.floor(maxY - 0.5));
  if (yEnd < yStart) return;
  const ex0 = new Float64Array(ne);
  const ey0 = new Float64Array(ne);
  const ex1 = new Float64Array(ne);
  const ey1 = new Float64Array(ne);
  let m = 0;
  for (const r of rings) {
    const n = r.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = r[2 * i];
      const ay = r[2 * i + 1];
      const bx = r[2 * j];
      const by = r[2 * j + 1];
      if (ay === by) continue;
      if (ay < by) {
        ex0[m] = ax; ey0[m] = ay; ex1[m] = bx; ey1[m] = by;
      } else {
        ex0[m] = bx; ey0[m] = by; ex1[m] = ax; ey1[m] = ay;
      }
      m++;
    }
  }
  const order = Array.from({ length: m }, (_, i) => i).sort((a, b) => ey0[a] - ey0[b]);
  let next = 0;
  const active = [];
  const xs = [];
  for (let y = yStart; y <= yEnd; y++) {
    const sy = y + 0.5;
    while (next < m && ey0[order[next]] <= sy) active.push(order[next++]);
    xs.length = 0;
    let w = 0;
    for (let k = 0; k < active.length; k++) {
      const e = active[k];
      if (ey1[e] <= sy) continue;
      active[w++] = e;
      xs.push(ex0[e] + ((sy - ey0[e]) * (ex1[e] - ex0[e])) / (ey1[e] - ey0[e]));
    }
    active.length = w;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k] - 0.5));
      const xb = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = xa; x <= xb; x++) plot(x, y);
    }
  }
}

// Exact Euclidean distance transform (Felzenszwalb & Huttenlocher).
// grid: 0 at feature pixels, INF elsewhere. Result: squared distances, in place.
const INF = 1e20;
function edt(grid, W, H) {
  const n = Math.max(W, H);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const pass = (len) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      const dq = q - v[k];
      d[q] = dq * dq + f[v[k]];
    }
  };
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = grid[y * W + x];
    pass(H);
    for (let y = 0; y < H; y++) grid[y * W + x] = d[y];
  }
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) f[x] = grid[row + x];
    pass(W);
    for (let x = 0; x < W; x++) grid[row + x] = d[x];
  }
}

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

function rgbToHsl([r, g, b]) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]) {
  if (s === 0) return [l, l, l];
  const hue = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
}

// Per-territory fill colours: continent hue, neighbouring territories get distinct shades.
export function territoryColors() {
  const shades = [0, 0.075, -0.06, 0.035, -0.025];
  const shadeOf = new Array(TERRITORIES.length).fill(-1);
  TERRITORIES.forEach((t, i) => {
    const used = new Set(NEIGHBORS[i].filter((n) => TERRITORIES[n].c === t.c).map((n) => shadeOf[n]));
    let s = 0;
    while (used.has(s)) s++;
    shadeOf[i] = s;
  });
  return TERRITORIES.map((t, i) => {
    const [h, s, l] = rgbToHsl(hexToRgb(CONTINENTS[CONTINENT_INDEX[t.c]].color));
    return hslToRgb([h + (shadeOf[i] % 2 ? 0.012 : -0.008), s * (shadeOf[i] === 2 ? 0.9 : 1), l + shades[shadeOf[i] % shades.length]]);
  });
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------
export function generateMap(world, W, progress = () => {}) {
  const P = projection(W);
  const { H, unit } = P;
  const N = W * H;
  const ids = new Uint8Array(N);

  // Seeds in pixel space.
  const seeds = TERRITORIES.map((t) => t.seeds.map(([lon, lat]) => [P.x(lon), P.y(lat)]));
  const nearestSeed = (x, y, tids) => {
    let best = -1;
    let bd = Infinity;
    for (const t of tids) {
      for (const [sx, sy] of seeds[t]) {
        const d = (x - sx) * (x - sx) + (y - sy) * (y - sy);
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
    }
    return [best, Math.sqrt(bd) / unit];
  };

  progress(0.05, 'rasterize');
  for (const country of world.countries) {
    const list = COUNTRY_MAP[country.name];
    const tids = list ? list.map((id) => TERRITORY_INDEX[id]) : null;
    const shapes = country.polys.map((poly) => {
      const rings = poly.map((ring) => {
        let maxLon = -Infinity;
        for (let i = 0; i < ring.length; i += 2) if (ring[i] > maxLon) maxLon = ring[i];
        // Rings entirely west of the map edge wrap to the far east; rings that
        // straddle the antimeridian (Chukotka) only wrap their western points.
        const shiftAll = maxLon < PROJ.lon0 + 0.5;
        const shiftWest = maxLon > 90;
        const out = new Float64Array(ring.length);
        for (let i = 0; i < ring.length; i += 2) {
          const shift = shiftAll || (shiftWest && ring[i] < PROJ.lon0) ? 360 : 0;
          out[i] = (ring[i] + shift - PROJ.lon0) * unit;
          out[i + 1] = P.y(ring[i + 1]);
        }
        return out;
      });
      const outer = rings[0];
      let area = 0;
      let cx = 0;
      let cy = 0;
      const n = outer.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += outer[2 * i] * outer[2 * j + 1] - outer[2 * j] * outer[2 * i + 1];
        cx += outer[2 * i];
        cy += outer[2 * i + 1];
      }
      area = Math.abs(area / 2) / (unit * unit);
      return { rings, area, cx: cx / n, cy: cy / n };
    });
    // Countries shared by several territories: only the main landmass is split
    // pixel by pixel; islands go wholly to the territory nearest their centre.
    let largest = 0;
    shapes.forEach((sh, k) => {
      if (sh.area > shapes[largest].area) largest = k;
    });
    for (const [k, { rings, area, cx, cy }] of shapes.entries()) {
      let mode = NEUTRAL;
      if (tids) {
        const [t, dist] = nearestSeed(cx, cy, tids);
        if (area < 150 && dist > 22) mode = NEUTRAL;
        else if (tids.length === 1 || k !== largest) mode = t + 1;
        else mode = -1;
      }
      if (mode >= 0) {
        scanPolygon(rings, W, H, (x, y) => {
          ids[y * W + x] = mode;
        });
      } else {
        scanPolygon(rings, W, H, (x, y) => {
          ids[y * W + x] = nearestSeed(x, y, tids)[0] + 1;
        });
      }
    }
  }

  // Remove tiny specks (single pixels) that make borders noisy.
  progress(0.3, 'distances');
  const grid = new Float32Array(N);
  const coast = new Uint8Array(N); // water: distance to land, land: distance to water
  for (let i = 0; i < N; i++) grid[i] = ids[i] ? 0 : INF;
  edt(grid, W, H);
  for (let i = 0; i < N; i++) if (!ids[i]) coast[i] = Math.min(255, Math.sqrt(grid[i]));
  for (let i = 0; i < N; i++) grid[i] = ids[i] ? INF : 0;
  edt(grid, W, H);
  for (let i = 0; i < N; i++) if (ids[i]) coast[i] = Math.min(255, Math.sqrt(grid[i]));

  // Territory borders (and continent borders) as features.
  progress(0.45, 'borders');
  const contBorder = new Uint8Array(N);
  const touch = new Map();
  const contOf = (id) => (id >= 1 && id <= TERRITORIES.length ? CONTINENT_INDEX[TERRITORIES[id - 1].c] : -1);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const a = ids[i];
      let feature = false;
      if (x + 1 < W) {
        const b = ids[i + 1];
        if (a !== b) {
          feature = true;
          grid[i + 1] = 0;
          if (a && b && a !== NEUTRAL && b !== NEUTRAL) {
            const k = a < b ? a * 256 + b : b * 256 + a;
            touch.set(k, (touch.get(k) || 0) + 1);
            if (contOf(a) !== contOf(b)) contBorder[i] = contBorder[i + 1] = 1;
          }
        }
      }
      if (y + 1 < H) {
        const b = ids[i + W];
        if (a !== b) {
          feature = true;
          grid[i + W] = 0;
          if (a && b && a !== NEUTRAL && b !== NEUTRAL) {
            const k = a < b ? a * 256 + b : b * 256 + a;
            touch.set(k, (touch.get(k) || 0) + 1);
            if (contOf(a) !== contOf(b)) contBorder[i] = contBorder[i + W] = 1;
          }
        }
      }
      if (feature) grid[i] = 0;
      else if (grid[i] !== 0) grid[i] = INF;
    }
  }
  // grid currently holds zeros at features; everything else must be INF.
  edt(grid, W, H);
  const inner = new Uint8Array(N);
  const nT = TERRITORIES.length;
  const best = new Float32Array(nT + 1);
  const bestIdx = new Int32Array(nT + 1).fill(-1);
  const pixCount = new Int32Array(nT + 1);
  const sumX = new Float64Array(nT + 1);
  const sumY = new Float64Array(nT + 1);
  for (let i = 0; i < N; i++) {
    const a = ids[i];
    if (!a) continue;
    const d = Math.sqrt(grid[i]);
    inner[i] = Math.min(255, d);
    if (a !== NEUTRAL) {
      pixCount[a]++;
      sumX[a] += i % W;
      sumY[a] += (i / W) | 0;
      if (d > best[a]) {
        best[a] = d;
        bestIdx[a] = i;
      }
    }
  }

  const touching = [];
  for (const [k, count] of touch) if (count >= 3) touching.push([(k >> 8) - 1, (k & 255) - 1]);

  const anchors = TERRITORIES.map((t, ti) => {
    const i = bestIdx[ti + 1];
    return { x: i % W, y: (i / W) | 0, radius: best[ti + 1], pixels: pixCount[ti + 1] };
  });

  // Label positions: roomy spot below the army anchor.
  const labels = anchors.map((a, ti) => {
    const tid = ti + 1;
    const off = W / 40; // ~1 board unit
    let bestScore = -Infinity;
    let pos = { x: a.x, y: a.y + off * 0.62 };
    for (let dy = off * 0.42; dy <= off * 1.1; dy += off * 0.08) {
      for (let dx = -off * 0.5; dx <= off * 0.5; dx += off * 0.1) {
        const x = Math.round(a.x + dx);
        const y = Math.round(a.y + dy);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        if (ids[i] !== tid) continue;
        const score = Math.min(inner[i], off * 0.35) - Math.abs(dx) * 0.08 - Math.abs(dy - off * 0.6) * 0.05;
        if (score > bestScore) {
          bestScore = score;
          pos = { x, y };
        }
      }
    }
    return pos;
  });

  // -------------------------------------------------------------------------
  // Relief: height field at half resolution.
  // -------------------------------------------------------------------------
  progress(0.6, 'relief');
  const W2 = W >> 1;
  const H2 = H >> 1;
  const height = new Float32Array(W2 * H2);
  const noiseA = makeNoiseTile(256, 7, 6);
  const noiseB = makeNoiseTile(256, 21, 5);
  const noiseC = makeNoiseTile(128, 99, 4);
  for (let y = 0; y < H2; y++) {
    for (let x = 0; x < W2; x++) {
      const i = y * 2 * W + x * 2;
      if (!ids[i]) continue;
      const cd = coast[i] / 2;
      const n = sampleNoise(noiseA, x * 0.35, y * 0.35);
      height[y * W2 + x] = 0.22 + 0.22 * smoothstep(0, 9, cd) + 0.12 * n * smoothstep(0, 14, cd);
    }
  }
  const mountain = new Float32Array(W2 * H2);
  const u2 = unit / 2;
  for (const range of MOUNTAINS) {
    const pts = range.pts.map(([lon, lat]) => [P.x(lon) / 2, P.y(lat) / 2, lat]);
    for (let s = 0; s + 1 < pts.length; s++) {
      const [ax, ay, alat] = pts[s];
      const [bx, by, blat] = pts[s + 1];
      if (Math.abs(ax - bx) > W2 / 2) continue;
      const wpx = (range.w * u2) / Math.cos(((alat + blat) / 2) * D2R);
      const pad = wpx * 2.2;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - pad));
      const x1 = Math.min(W2 - 1, Math.ceil(Math.max(ax, bx) + pad));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - pad));
      const y1 = Math.min(H2 - 1, Math.ceil(Math.max(ay, by) + pad));
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy || 1;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
          const px = ax + t * dx - x;
          const py = ay + t * dy - y;
          const d2 = (px * px + py * py) / (wpx * wpx);
          if (d2 > 4.8) continue;
          const k = y * W2 + x;
          const ridge = 1 - Math.abs(sampleNoise(noiseB, x * 0.9, y * 0.9) * 2 - 1);
          const v = range.h * Math.exp(-d2 * 1.6) * (0.35 + 0.65 * ridge * ridge);
          if (v > mountain[k]) mountain[k] = v;
        }
      }
    }
  }
  for (let k = 0; k < W2 * H2; k++) {
    if (height[k] > 0) {
      const x = k % W2;
      const y = (k / W2) | 0;
      const fine = sampleNoise(noiseC, x * 1.7, y * 1.7);
      height[k] += mountain[k] * (0.75 + 0.5 * fine) * 0.9;
    }
  }

  // Normal map (tangent space, v pointing up the image) from the height field.
  progress(0.7, 'normals');
  const normal = new Uint8ClampedArray(W2 * H2 * 4);
  const strength = 7 * (W / 2048);
  for (let y = 0; y < H2; y++) {
    for (let x = 0; x < W2; x++) {
      const k = y * W2 + x;
      const hl = height[y * W2 + Math.max(0, x - 1)];
      const hr = height[y * W2 + Math.min(W2 - 1, x + 1)];
      const hu = height[Math.max(0, y - 1) * W2 + x];
      const hd = height[Math.min(H2 - 1, y + 1) * W2 + x];
      let nx = (hl - hr) * strength;
      let ny = (hd - hu) * strength;
      const len = Math.hypot(nx, ny, 1);
      normal[k * 4] = ((nx / len) * 0.5 + 0.5) * 255;
      normal[k * 4 + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      normal[k * 4 + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      normal[k * 4 + 3] = 255;
    }
  }

  // Displacement map at quarter resolution (blurred height).
  const W4 = W >> 2;
  const H4 = H >> 2;
  let disp = new Float32Array(W4 * H4);
  for (let y = 0; y < H4; y++) {
    for (let x = 0; x < W4; x++) {
      const a = height[2 * y * W2 + 2 * x];
      const b = height[2 * y * W2 + Math.min(W2 - 1, 2 * x + 1)];
      const c = height[Math.min(H2 - 1, 2 * y + 1) * W2 + 2 * x];
      const d = height[Math.min(H2 - 1, 2 * y + 1) * W2 + Math.min(W2 - 1, 2 * x + 1)];
      disp[y * W4 + x] = (a + b + c + d) / 4;
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const tmp = new Float32Array(W4 * H4);
    for (let y = 0; y < H4; y++) {
      for (let x = 0; x < W4; x++) {
        let s = 0;
        let c = 0;
        for (let o = -1; o <= 1; o++) {
          const xx = x + o;
          if (xx >= 0 && xx < W4) {
            s += disp[y * W4 + xx];
            c++;
          }
        }
        tmp[y * W4 + x] = s / c;
      }
    }
    for (let y = 0; y < H4; y++) {
      for (let x = 0; x < W4; x++) {
        let s = 0;
        let c = 0;
        for (let o = -1; o <= 1; o++) {
          const yy = y + o;
          if (yy >= 0 && yy < H4) {
            s += tmp[yy * W4 + x];
            c++;
          }
        }
        disp[y * W4 + x] = s / c;
      }
    }
  }
  const dispBytes = new Uint8ClampedArray(W4 * H4 * 4);
  let maxH = 0;
  for (const v of disp) if (v > maxH) maxH = v;
  for (let k = 0; k < W4 * H4; k++) {
    const v = (disp[k] / maxH) * 255;
    dispBytes[k * 4] = dispBytes[k * 4 + 1] = dispBytes[k * 4 + 2] = v;
    dispBytes[k * 4 + 3] = 255;
  }

  // -------------------------------------------------------------------------
  // Paint the base artwork.
  // -------------------------------------------------------------------------
  progress(0.78, 'paint');
  const tcol = territoryColors();
  const color = new Uint8ClampedArray(N * 4);
  const deep = hexToRgb('#123a52');
  const mid = hexToRgb('#23607a');
  const shallow = hexToRgb('#5a9aa6');
  const ripple = hexToRgb('#a9d0cf');
  const ink = hexToRgb('#2b1d12');
  const neutralCol = hexToRgb('#c2b491');
  const paper = makeNoiseTile(256, 3, 6);
  const fibres = makeNoiseTile(64, 11, 3);
  const rowLat = new Float32Array(H);
  for (let y = 0; y < H; y++) rowLat[y] = P.lat(y + 0.5);
  const gridStep = 20;
  const lx = -0.55;
  const ly = -0.6;
  for (let y = 0; y < H; y++) {
    const lat = rowLat[y];
    const latLine = Math.abs(lat / gridStep - Math.round(lat / gridStep));
    const pxPerDegLat = (unit / Math.cos(lat * D2R));
    const onLat = latLine * gridStep * pxPerDegLat < 0.8;
    const vy = (y / H) * 2 - 1;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const a = ids[i];
      const pn = sampleNoise(paper, x * 0.25, y * 0.25);
      const fn = sampleNoise(fibres, x * 0.9, y * 0.9);
      let r;
      let g;
      let b;
      if (!a) {
        const d = coast[i];
        const t = Math.exp(-d / 26);
        const t2 = Math.exp(-d / 90);
        r = deep[0] + (mid[0] - deep[0]) * t2;
        g = deep[1] + (mid[1] - deep[1]) * t2;
        b = deep[2] + (mid[2] - deep[2]) * t2;
        r += (shallow[0] - r) * t;
        g += (shallow[1] - g) * t;
        b += (shallow[2] - b) * t;
        // Engraved coastal ripple lines
        for (const k of [5, 11, 19, 30, 44]) {
          const dd = Math.abs(d - k * (W / 4096));
          if (dd < 1.1) {
            const s = (1 - dd / 1.1) * 0.32 * (1 - k / 56);
            r += (ripple[0] - r) * s;
            g += (ripple[1] - g) * s;
            b += (ripple[2] - b) * s;
          }
        }
        // Graticule
        const lon = x / unit + PROJ.lon0;
        const lonLine = Math.abs(lon / gridStep - Math.round(lon / gridStep)) * gridStep * unit;
        if ((lonLine < 0.8 || onLat) && d > 3) {
          r += 0.07;
          g += 0.08;
          b += 0.07;
        }
        const m = 0.9 + 0.16 * pn + 0.05 * fn;
        r *= m;
        g *= m;
        b *= m;
      } else {
        const cd = coast[i];
        const bd = inner[i];
        let base = a === NEUTRAL ? neutralCol : tcol[a - 1];
        r = base[0];
        g = base[1];
        b = base[2];
        // Relief hill-shading baked in lightly.
        const hx = x >> 1;
        const hy = y >> 1;
        if (hx > 0 && hy > 0 && hx < W2 - 1 && hy < H2 - 1) {
          const k = hy * W2 + hx;
          const sx = (height[k + 1] - height[k - 1]) * 3 * (W / 2048);
          const sy = (height[k + W2] - height[k - W2]) * 3 * (W / 2048);
          const shade = Math.max(0.8, Math.min(1.15, 1 + (sx * lx + sy * ly) * 0.45 + mountain[k] * 0.06));
          r *= shade;
          g *= shade;
          b *= shade;
        }
        const m = 0.86 + 0.2 * pn + 0.07 * fn;
        r *= m;
        g *= m;
        b *= m;
        // Inner shadow along the coastline
        if (cd < 12) {
          const f = 0.74 + 0.26 * (cd / 12);
          r *= f;
          g *= f;
          b *= f;
        }
        // Territory border lines and soft inner edge
        if (a !== NEUTRAL && bd < cd - 0.5) {
          const thick = contBorder[i] ? 2.6 : 1.5;
          if (bd < 9) {
            const f = 0.9 + 0.1 * (bd / 9);
            r *= f;
            g *= f;
            b *= f;
          }
          if (bd < thick) {
            const s = contBorder[i] ? 0.92 : 0.75 * (1 - bd / thick) + 0.1;
            r += (ink[0] - r) * s;
            g += (ink[1] - g) * s;
            b += (ink[2] - b) * s;
          }
        }
        // Inked coastline
        if (cd < 1.6) {
          const s = 0.85 * (1 - cd / 1.6) + 0.1;
          r += (ink[0] - r) * s;
          g += (ink[1] - g) * s;
          b += (ink[2] - b) * s;
        }
      }
      // Aged-paper vignette toward the board edges
      const vx = (x / W) * 2 - 1;
      const v = 1 - 0.28 * Math.pow(Math.max(Math.abs(vx), Math.abs(vy)), 6) - 0.1 * (vx * vx + vy * vy) * 0.5;
      const sep = 0.08;
      const lum = r * 0.3 + g * 0.59 + b * 0.11;
      r = (r + (lum * 1.08 - r) * sep) * v;
      g = (g + (lum * 0.98 - g) * sep) * v;
      b = (b + (lum * 0.8 - b) * sep) * v;
      const o = i * 4;
      color[o] = r * 255;
      color[o + 1] = g * 255;
      color[o + 2] = b * 255;
      color[o + 3] = 255;
    }
  }
  progress(0.95, 'done');

  return {
    W,
    H,
    ids,
    color,
    normal,
    normalW: W2,
    normalH: H2,
    disp: dispBytes,
    dispW: W4,
    dispH: H4,
    anchors,
    labels,
    touching,
  };
}
