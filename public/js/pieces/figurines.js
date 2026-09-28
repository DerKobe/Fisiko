// Procedurally modelled army figurines, merged into one geometry per type.
// Vertex colours carry shading (boots, belts, metal) under the player's colour.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const parts = [];
let current = null;

function begin() {
  current = [];
}

function add(geo, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], shade = 1 } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale),
  );
  g.applyMatrix4(m);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3).fill(shade);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  current.push(g);
}

function end() {
  const merged = mergeGeometries(current, false);
  current.forEach((g) => g.dispose());
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  parts.push(merged);
  return merged;
}

const cyl = (rt, rb, h, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sphere = (r, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function plinth(r = 0.27, sx = 1, sz = 1) {
  const pts = [
    [0, 0],
    [r - 0.01, 0],
    [r + 0.01, 0.012],
    [r + 0.012, 0.045],
    [r - 0.005, 0.062],
    [r - 0.03, 0.068],
    [0, 0.068],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  add(new THREE.LatheGeometry(pts, 36), { scale: [sx, 1, sz], shade: 0.78 });
}

// A limb between two points.
function limb(a, b, r0, r1, shade = 1) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = cyl(r1, r0, len, 10);
  const mid = va.clone().add(vb).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  add(g, { pos: mid.toArray(), rot: [e.x, e.y, e.z], shade });
  add(sphere(r1 * 1.02, 8, 6), { pos: vb.toArray(), shade });
}

function buildInfantry() {
  begin();
  plinth(0.24);
  // Boots and legs
  for (const s of [-1, 1]) {
    add(cyl(0.05, 0.058, 0.1), { pos: [s * 0.062, 0.118, 0.01], shade: 0.62 });
    add(box(0.075, 0.03, 0.12), { pos: [s * 0.062, 0.082, 0.03], shade: 0.62 });
    limb([s * 0.062, 0.16, 0], [s * 0.058, 0.4, 0], 0.048, 0.056, 0.92);
  }
  // Frock coat skirt, torso, belt
  add(new THREE.LatheGeometry([[0.001, 0.33], [0.155, 0.33], [0.13, 0.5], [0.001, 0.5]].map(([x, y]) => new THREE.Vector2(x, y)), 18), { scale: [1, 1, 0.8] });
  add(cyl(0.118, 0.132, 0.26, 18), { pos: [0, 0.62, 0], scale: [1, 1, 0.78] });
  add(new THREE.TorusGeometry(0.132, 0.018, 6, 20), { pos: [0, 0.51, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.8, 1], shade: 0.6 });
  add(box(0.028, 0.34, 0.02), { pos: [0, 0.63, 0.1], rot: [0, 0, 0.62], shade: 0.7 });
  add(box(0.028, 0.34, 0.02), { pos: [0, 0.63, 0.1], rot: [0, 0, -0.62], shade: 0.7 });
  add(sphere(0.02, 6, 4), { pos: [0, 0.63, 0.112], shade: 0.5 });
  // Epaulettes
  for (const s of [-1, 1]) add(sphere(0.055, 10, 6), { pos: [s * 0.13, 0.735, 0], scale: [1, 0.6, 1] });
  // Left arm hanging, right arm holding the musket
  limb([-0.14, 0.72, 0], [-0.165, 0.5, 0.02], 0.04, 0.045);
  add(sphere(0.035, 8, 6), { pos: [-0.168, 0.47, 0.02], shade: 0.85 });
  limb([0.14, 0.72, 0], [0.18, 0.56, 0.05], 0.04, 0.045);
  limb([0.18, 0.56, 0.05], [0.19, 0.63, 0.1], 0.036, 0.04);
  // Musket with bayonet (shouldered)
  add(cyl(0.017, 0.02, 0.62, 8), { pos: [0.2, 0.8, 0.09], rot: [0.08, 0, 0], shade: 0.55 });
  add(box(0.04, 0.16, 0.035), { pos: [0.2, 0.46, 0.065], rot: [0.08, 0, 0], shade: 0.55 });
  add(new THREE.ConeGeometry(0.011, 0.16, 6), { pos: [0.2, 1.18, 0.12], rot: [0.08, 0, 0], shade: 0.45 });
  // Head, shako with visor, cockade and plume
  add(cyl(0.04, 0.045, 0.06, 10), { pos: [0, 0.78, 0] });
  add(sphere(0.078, 16, 12), { pos: [0, 0.855, 0.005], shade: 0.95 });
  add(cyl(0.088, 0.078, 0.15, 18), { pos: [0, 0.98, 0] });
  add(cyl(0.091, 0.091, 0.015, 18), { pos: [0, 1.055, 0], shade: 0.7 });
  add(cyl(0.081, 0.081, 0.016, 18), { pos: [0, 0.912, 0], shade: 0.6 });
  add(box(0.13, 0.012, 0.07), { pos: [0, 0.905, 0.075], rot: [-0.35, 0, 0], shade: 0.55 });
  add(sphere(0.022, 8, 6), { pos: [0, 1.02, 0.085], shade: 0.75 });
  add(cyl(0.012, 0.018, 0.06, 8), { pos: [0, 1.09, 0.03], shade: 0.8 });
  add(sphere(0.03, 10, 8), { pos: [0, 1.135, 0.03], scale: [1, 1.4, 1] });
  // Backpack and bedroll
  add(box(0.2, 0.2, 0.08), { pos: [0, 0.63, -0.13], shade: 0.72 });
  add(cyl(0.036, 0.036, 0.24, 10), { pos: [0, 0.755, -0.13], rot: [0, 0, Math.PI / 2], shade: 0.85 });
  return end();
}

function buildCavalry() {
  begin();
  plinth(0.26, 1.45, 1);
  // Horse
  add(new THREE.CapsuleGeometry(0.115, 0.3, 6, 16), { pos: [0, 0.5, 0], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.82] });
  add(sphere(0.125, 14, 10), { pos: [0.17, 0.515, 0], scale: [1, 1, 0.8] });
  add(sphere(0.12, 14, 10), { pos: [-0.17, 0.52, 0], scale: [1, 1, 0.85] });
  limb([0.22, 0.55, 0], [0.33, 0.76, 0], 0.085, 0.06);
  add(new THREE.CapsuleGeometry(0.05, 0.13, 4, 12), { pos: [0.39, 0.765, 0], rot: [0, 0, 1.05], scale: [1, 1, 0.85] });
  add(sphere(0.042, 10, 8), { pos: [0.45, 0.72, 0], scale: [1.1, 0.9, 0.9], shade: 0.8 });
  for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.018, 0.06, 6), { pos: [0.33, 0.84, s * 0.025], rot: [s * 0.2, 0, -0.3] });
  add(box(0.03, 0.26, 0.018), { pos: [0.27, 0.72, 0], rot: [0, 0, -0.62], shade: 0.6 });
  // Legs: rear planted, one foreleg raised in a prance
  for (const s of [-1, 1]) {
    limb([-0.2, 0.47, s * 0.055], [-0.22, 0.26, s * 0.06], 0.045, 0.035);
    limb([-0.22, 0.26, s * 0.06], [-0.2, 0.085, s * 0.06], 0.032, 0.028);
    add(cyl(0.034, 0.038, 0.035, 10), { pos: [-0.2, 0.085, s * 0.06], shade: 0.55 });
  }
  limb([0.2, 0.46, 0.055], [0.21, 0.26, 0.06], 0.045, 0.034);
  limb([0.21, 0.26, 0.06], [0.2, 0.085, 0.06], 0.031, 0.027);
  add(cyl(0.034, 0.038, 0.035, 10), { pos: [0.2, 0.085, 0.06], shade: 0.55 });
  limb([0.2, 0.46, -0.055], [0.3, 0.37, -0.06], 0.045, 0.034);
  limb([0.3, 0.37, -0.06], [0.29, 0.25, -0.06], 0.031, 0.027);
  add(cyl(0.034, 0.038, 0.035, 10), { pos: [0.29, 0.24, -0.06], shade: 0.55 });
  // Tail
  limb([-0.28, 0.54, 0], [-0.36, 0.36, 0], 0.035, 0.018, 0.6);
  // Saddle cloth and saddle
  add(box(0.24, 0.02, 0.27), { pos: [-0.02, 0.605, 0], shade: 0.7 });
  add(box(0.16, 0.05, 0.16), { pos: [-0.02, 0.63, 0], shade: 0.62 });
  // Rider
  for (const s of [-1, 1]) {
    limb([-0.01, 0.66, s * 0.07], [0.06, 0.55, s * 0.13], 0.04, 0.04);
    limb([0.06, 0.55, s * 0.13], [0.04, 0.43, s * 0.13], 0.035, 0.038, 0.6);
  }
  add(cyl(0.078, 0.095, 0.25, 14), { pos: [-0.01, 0.78, 0], scale: [1, 1, 0.8] });
  add(new THREE.TorusGeometry(0.093, 0.014, 6, 16), { pos: [-0.01, 0.68, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.8, 1], shade: 0.6 });
  add(sphere(0.064, 14, 10), { pos: [0.0, 0.95, 0] });
  // Plumed helmet
  add(new THREE.SphereGeometry(0.07, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), { pos: [0, 0.97, 0], shade: 0.75 });
  add(box(0.16, 0.06, 0.018), { pos: [-0.01, 1.035, 0], shade: 0.9 });
  add(cyl(0.075, 0.075, 0.012, 14), { pos: [0, 0.97, 0], shade: 0.6 });
  // Left arm with reins, right arm raising a sabre
  limb([-0.02, 0.86, -0.08], [0.1, 0.74, -0.08], 0.032, 0.035);
  limb([-0.02, 0.87, 0.08], [0.08, 1.0, 0.13], 0.032, 0.035);
  limb([0.08, 1.0, 0.13], [0.14, 1.1, 0.13], 0.03, 0.032);
  add(box(0.018, 0.4, 0.035), { pos: [0.27, 1.25, 0.13], rot: [0, 0, -0.75], shade: 0.5 });
  add(box(0.06, 0.012, 0.05), { pos: [0.15, 1.12, 0.13], rot: [0, 0, -0.75], shade: 0.45 });
  return end();
}

function buildArtillery() {
  begin();
  plinth(0.26, 1.55, 1.15);
  // Spoked wheels on an axle
  for (const s of [-1, 1]) {
    const z = s * 0.175;
    add(new THREE.TorusGeometry(0.158, 0.02, 8, 28), { pos: [0.05, 0.235, z], shade: 0.82 });
    add(cyl(0.04, 0.04, 0.07, 12), { pos: [0.05, 0.235, z], rot: [Math.PI / 2, 0, 0], shade: 0.6 });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI;
      add(box(0.014, 0.3, 0.014), { pos: [0.05, 0.235, z], rot: [0, 0, a], shade: 0.8 });
    }
  }
  add(cyl(0.02, 0.02, 0.4, 10), { pos: [0.05, 0.235, 0], rot: [Math.PI / 2, 0, 0], shade: 0.55 });
  // Carriage cheeks and trail
  for (const s of [-1, 1]) add(box(0.55, 0.075, 0.03), { pos: [-0.14, 0.215, s * 0.07], rot: [0, 0, 0.33], shade: 0.75 });
  add(box(0.36, 0.05, 0.12), { pos: [-0.3, 0.13, 0], rot: [0, 0, 0.33], shade: 0.72 });
  add(box(0.09, 0.05, 0.14), { pos: [-0.44, 0.1, 0], shade: 0.65 });
  // Bronze barrel with reinforcing rings, muzzle swell and cascabel knob
  const profile = [
    [0.001, 0],
    [0.056, 0],
    [0.072, 0.02],
    [0.074, 0.09],
    [0.08, 0.1],
    [0.08, 0.12],
    [0.069, 0.13],
    [0.064, 0.3],
    [0.071, 0.31],
    [0.071, 0.33],
    [0.06, 0.34],
    [0.055, 0.52],
    [0.064, 0.54],
    [0.068, 0.58],
    [0.05, 0.6],
    [0.032, 0.6],
    [0.03, 0.56],
    [0.001, 0.56],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const elev = -Math.PI / 2 + 0.2;
  add(new THREE.LatheGeometry(profile, 22), { pos: [-0.2, 0.26, 0], rot: [0, 0, elev], shade: 0.95 });
  add(sphere(0.032, 10, 8), { pos: [-0.235, 0.253, 0], shade: 0.95 });
  add(cyl(0.022, 0.022, 0.2, 10), { pos: [0.02, 0.285, 0], rot: [Math.PI / 2, 0, 0], shade: 0.7 });
  // Stack of cannonballs
  for (const [x, y, z] of [
    [0.22, 0.11, 0.2],
    [0.3, 0.11, 0.2],
    [0.26, 0.11, 0.27],
    [0.26, 0.17, 0.225],
  ])
    add(sphere(0.043, 10, 8), { pos: [x, y, z], shade: 0.45 });
  return end();
}

let cache = null;
export function figurineGeometries() {
  if (!cache) cache = { infantry: buildInfantry(), cavalry: buildCavalry(), artillery: buildArtillery() };
  return cache;
}

const materials = new Map();
// Glossy painted-plastic material per player colour.
export function figurineMaterial(hex) {
  if (!materials.has(hex)) {
    materials.set(
      hex,
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(hex),
        vertexColors: true,
        roughness: 0.42,
        metalness: 0.05,
        clearcoat: 0.6,
        clearcoatRoughness: 0.28,
        sheen: 0.3,
        sheenColor: new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.5),
      }),
    );
  }
  return materials.get(hex);
}

// Split an army count into figurine types: artillery = 10, cavalry = 5, infantry = 1.
export function composition(n) {
  const art = Math.floor(n / 10);
  const cav = Math.floor((n % 10) / 5);
  const inf = n % 5;
  return [...Array(Math.min(art, 6)).fill('artillery'), ...Array(cav).fill('cavalry'), ...Array(inf).fill('infantry')];
}
