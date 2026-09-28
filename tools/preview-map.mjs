// Renders the generated board artwork to a PNG for visual tuning and reports
// mismatches between the drawn borders and the game's adjacency list.
// Usage: node tools/preview-map.mjs [width]
import { writeFileSync } from 'node:fs';
import { encodePng } from './png.mjs';
import { buildWorld } from '../server.js';
import { generateMap } from '../public/js/board/mapgen.js';
import { TERRITORIES, ADJACENCY, TERRITORY_INDEX } from '../public/js/data/world.js';

const W = Number(process.argv[2]) || 2048;
const t0 = Date.now();
const map = generateMap(buildWorld(), W, (p, m) => console.log(`${(p * 100).toFixed(0)}% ${m} ${Date.now() - t0}ms`));
console.log(`generated ${map.W}x${map.H} in ${Date.now() - t0}ms`);

const img = new Uint8ClampedArray(map.color);
const dot = (x, y, r, c) => {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const xx = Math.round(x + dx);
      const yy = Math.round(y + dy);
      if (xx < 0 || yy < 0 || xx >= map.W || yy >= map.H) continue;
      const o = (yy * map.W + xx) * 4;
      img.set(c, o);
    }
};
map.anchors.forEach((a) => dot(a.x, a.y, 4, [255, 255, 255]));
map.labels.forEach((a) => dot(a.x, a.y, 3, [255, 0, 255]));
writeFileSync(new URL('./out-board.png', import.meta.url), encodePng(map.W, map.H, img));
writeFileSync(new URL('./out-normal.png', import.meta.url), encodePng(map.normalW, map.normalH, map.normal));

const key = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;
const touching = new Set(map.touching.map(([a, b]) => key(a, b)));
const adj = new Set();
for (const [a, list] of Object.entries(ADJACENCY)) for (const b of list) adj.add(key(TERRITORY_INDEX[a], TERRITORY_INDEX[b]));
const name = (k) => k.split('-').map((i) => TERRITORIES[i].id).join(' <-> ');
console.log('Adjacent, not touching (sea lanes):', [...adj].filter((k) => !touching.has(k)).map(name));
console.log('Touching but NOT adjacent:', [...touching].filter((k) => !adj.has(k)).map(name));
console.log('Anchor radius:', map.anchors.map((a, i) => `${TERRITORIES[i].id}:${a.radius.toFixed(0)}`).join(' '));
