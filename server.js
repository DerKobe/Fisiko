import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import * as topojson from 'topojson-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

// Convert the Natural Earth topology once into compact country polygons
// (flat [lon, lat, ...] rings). The browser paints the game board from these.
export function buildWorld() {
  const file = path.join(__dirname, 'node_modules/world-atlas/countries-50m.json');
  const topo = JSON.parse(readFileSync(file, 'utf8'));
  const fc = topojson.feature(topo, topo.objects.countries);
  const round = (v) => Math.round(v * 100) / 100;
  const countries = [];
  for (const f of fc.features) {
    const name = f.properties?.name;
    if (!f.geometry || name === 'Antarctica') continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    countries.push({ name, polys: polys.map((rings) => rings.map((ring) => ring.flatMap(([lon, lat]) => [round(lon), round(lat)]))) });
  }
  return { countries };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = express();
  const worldGz = gzipSync(JSON.stringify(buildWorld()));
  app.get('/api/world', (req, res) => {
    res.set({ 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Cache-Control': 'public, max-age=3600' });
    res.send(worldGz);
  });
  // Browser modules served from node_modules (see the import map in index.html).
  app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three')));
  app.use('/vendor/cannon-es', express.static(path.join(__dirname, 'node_modules/cannon-es/dist')));
  app.use(express.static(path.join(__dirname, 'public')));
  app.listen(PORT, () => console.log(`World Conquest running at http://localhost:${PORT}`));
}
