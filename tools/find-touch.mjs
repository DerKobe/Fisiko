// Debug helper: where do two territories touch? node tools/find-touch.mjs a:b ...
import { buildWorld } from '../server.js';
import { generateMap, projection } from '../public/js/board/mapgen.js';
import { TERRITORY_INDEX } from '../public/js/data/world.js';
const W = 2048, map = generateMap(buildWorld(), W), P = projection(W);
const pairs = process.argv.slice(2).map((p) => p.split(':').map((id) => TERRITORY_INDEX[id] + 1));
for (const [a, b] of pairs) {
  const pts = [];
  for (let y = 0; y + 1 < map.H; y++) for (let x = 0; x + 1 < W; x++) {
    const i = y * W + x, u = map.ids[i], v = map.ids[i + 1], d = map.ids[i + W];
    if ((u === a && (v === b || d === b)) || (u === b && (v === a || d === a))) pts.push([P.lon(x).toFixed(1), P.lat(y).toFixed(1)]);
  }
  console.log(a, b, pts.length, pts.slice(0, 6).map((p) => p.join(',')).join(' | '));
}
