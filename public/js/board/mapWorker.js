// Generates the board rasters off the main thread.
import { generateMap } from './mapgen.js';

self.onmessage = async (e) => {
  try {
    const res = await fetch('/api/world');
    const world = await res.json();
    const out = generateMap(world, e.data.width, (p, stage) => self.postMessage({ type: 'progress', p, stage }));
    self.postMessage({ type: 'done', map: out }, [out.ids.buffer, out.color.buffer, out.normal.buffer, out.disp.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err?.stack || err) });
  }
};
