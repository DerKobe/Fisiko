// Animated 3D attack arrows: flat ribbon arrows arcing (like a thrown stone)
// from the selected territory to each possible target. The chosen target's
// arrow turns red and stays until the battle is over.
import * as THREE from 'three';
import { BOARD_W } from './board3d.js';
import { animate, Ease } from '../tween.js';

const STYLES = {
  option: { color: new THREE.Color('#ffc845'), flow: new THREE.Color('#fff6d0') },
  locked: { color: new THREE.Color('#e3261c'), flow: new THREE.Color('#ffb48a') },
};
// Ribbon shaft: wide flat band with a little thickness.
const WIDTH = 0.27;
const THICK = 0.07;
// Flat arrowhead with swept-back barbs.
const HEAD_LEN = 0.55;
const HEAD_W = 0.68;
const BARB = 0.13;
const CLIP_X = BOARD_W / 2 + 0.05; // arcs crossing the map edge vanish under the frame
const UP = new THREE.Vector3(0, 1, 0);

// Parabolic arc between two points.
class ArcCurve extends THREE.Curve {
  constructor(a, b, height) {
    super();
    this.a = a;
    this.b = b;
    this.height = height;
  }

  getPoint(t, target = new THREE.Vector3()) {
    return target.lerpVectors(this.a, this.b, t).setY(this.a.y + (this.b.y - this.a.y) * t + 4 * this.height * t * (1 - t));
  }
}

// Box-section ribbon swept along the first `sEnd` world units of `curve`.
// `side` is the horizontal unit vector across the ribbon; uv.x = distance along it.
function ribbonGeometry(curve, length, sEnd, side) {
  const n = Math.max(2, Math.ceil(sEnd * 10));
  const rings = [];
  for (let i = 0; i <= n; i++) {
    const s = (sEnd * i) / n;
    const u = Math.min(1, s / length);
    const t = curve.getTangentAt(u);
    rings.push({ s, p: curve.getPointAt(u), t, nrm: new THREE.Vector3().crossVectors(side, t).normalize() });
  }
  const pos = [];
  const nor = [];
  const uv = [];
  const corner = (r, a, b) => r.p.clone().addScaledVector(side, (a * WIDTH) / 2).addScaledVector(r.nrm, (b * THICK) / 2);
  // Quad a-b-c-d (cyclic), wound so its face points along `facing`.
  const quad = (v, normals, us, facing) => {
    const geomN = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0]));
    const order = geomN.dot(facing) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const k of order) {
      pos.push(v[k].x, v[k].y, v[k].z);
      nor.push(normals[k].x, normals[k].y, normals[k].z);
      uv.push(us[k], 0);
    }
  };
  for (let i = 0; i < n; i++) {
    const r0 = rings[i];
    const r1 = rings[i + 1];
    const us = [r0.s, r0.s, r1.s, r1.s];
    const neg = (v) => v.clone().negate();
    const sideN = [side, side, side, side];
    // top, bottom, right, left faces
    quad([corner(r0, -1, 1), corner(r0, 1, 1), corner(r1, 1, 1), corner(r1, -1, 1)], [r0.nrm, r0.nrm, r1.nrm, r1.nrm], us, r0.nrm);
    quad([corner(r0, -1, -1), corner(r0, 1, -1), corner(r1, 1, -1), corner(r1, -1, -1)], [neg(r0.nrm), neg(r0.nrm), neg(r1.nrm), neg(r1.nrm)], us, neg(r0.nrm));
    quad([corner(r0, 1, 1), corner(r0, 1, -1), corner(r1, 1, -1), corner(r1, 1, 1)], sideN, us, side);
    quad([corner(r0, -1, 1), corner(r0, -1, -1), corner(r1, -1, -1), corner(r1, -1, 1)], sideN.map(neg), us, neg(side));
  }
  // End caps
  for (const [r, sign] of [
    [rings[0], -1],
    [rings[n], 1],
  ]) {
    const f = r.t.clone().multiplyScalar(sign);
    quad([corner(r, -1, 1), corner(r, 1, 1), corner(r, 1, -1), corner(r, -1, -1)], [f, f, f, f], [r.s, r.s, r.s, r.s], f);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// Flat arrowhead in local space: +x forward (tip at HEAD_LEN), +y across, +z up.
// The base joins the shaft at x = 0; the barbs sweep back behind it.
const headGeometry = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(HEAD_LEN, 0);
  shape.lineTo(-BARB, HEAD_W / 2);
  shape.lineTo(0, WIDTH / 2);
  shape.lineTo(0, -WIDTH / 2);
  shape.lineTo(-BARB, -HEAD_W / 2);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: THICK, bevelEnabled: false });
  g.translate(0, 0, -THICK / 2);
  return g;
})();

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uFlow;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uBoost;
  uniform float uPulse;
  uniform float uClipX;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    if (abs(vWorld.x) > uClipX) discard;
    #ifdef HEAD
      float chevron = 0.0;
      float fadeIn = 1.0;
    #else
      // Bright bands travelling from source to target (uv.x = distance along the arrow).
      float s = fract(vUv.x / 0.7 - uTime * 1.3);
      float chevron = smoothstep(0.0, 0.18, s) * (1.0 - smoothstep(0.3, 0.55, s));
      float fadeIn = smoothstep(0.0, 0.3, vUv.x);
    #endif
    vec3 n = normalize(vNormal);
    float light = 0.5 + 0.55 * max(dot(n, normalize(vec3(-0.3, 1.0, 0.4))), 0.0);
    vec3 col = mix(uColor, uFlow, chevron * 0.9) * light;
    col *= 1.0 + uBoost * 0.9 + uPulse * 0.22 * sin(uTime * 7.0);
    gl_FragColor = vec4(col, uOpacity * fadeIn);
    #include <colorspace_fragment>
  }
`;

function makeMaterial(head) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    defines: head ? { HEAD: '' } : {},
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: STYLES.option.color.clone() },
      uFlow: { value: STYLES.option.flow.clone() },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uBoost: { value: 0 },
      uPulse: { value: 0 },
      uClipX: { value: CLIP_X },
    },
  });
}

export class ArrowManager {
  constructor(board, armies) {
    this.board = board;
    this.armies = armies;
    this.root = new THREE.Group();
    board.scene.add(this.root);
    this.from = -1;
    this.arrows = new Map(); // target territory -> arrow
    this.hover = -1;
    this.dying = new Set();
  }

  // Gold arrows from `from` to every possible target.
  options(from, targets) {
    if (from !== this.from) this.clear();
    this.from = from;
    for (const [to, arrow] of this.arrows) if (!targets.includes(to)) this.remove(to, arrow);
    targets.forEach((to, i) => {
      const arrow = this.arrows.get(to) || this.create(from, to, i * 0.05);
      arrow.target = 0;
    });
  }

  // A single red arrow for the chosen target; stays until cleared.
  lock(from, to) {
    if (from !== this.from) this.clear();
    this.from = from;
    for (const [t, arrow] of this.arrows) if (t !== to) this.remove(t, arrow);
    (this.arrows.get(to) || this.create(from, to, 0)).target = 1;
  }

  clear() {
    for (const [t, arrow] of this.arrows) this.remove(t, arrow);
    this.from = -1;
  }

  setHover(t) {
    this.hover = t;
  }

  create(from, to, delay) {
    const a = this.armies.terr[from].group.position;
    const b = this.armies.terr[to].group.position;
    // Connections across the map edge (Alaska <-> Kamchatka): the arrow dives
    // into the frame on one side and rises out of it on the opposite side.
    const wrap = Math.abs(b.x - a.x) > BOARD_W / 2;
    let segments;
    if (wrap) {
      const side = Math.sign(a.x - b.x); // +1: target lies beyond the right edge
      const far = b.clone().setX(b.x + side * BOARD_W);
      const edgeX = side * (BOARD_W / 2);
      const t = (edgeX - a.x) / (far.x - a.x);
      const z = a.z + (far.z - a.z) * t;
      const edgeY = Math.min(a.y, b.y) + 0.08;
      segments = [
        { p: a, q: new THREE.Vector3(edgeX, edgeY, z), head: false, trimEnd: false },
        { p: new THREE.Vector3(-edgeX, edgeY, z), q: b, head: true, trimStart: false },
      ];
    } else {
      segments = [{ p: a, q: b, head: true }];
    }
    const arrow = { to, parts: [], target: 0, mix: 0, boost: 0, progress: 0, opacity: 1, alive: true };
    for (const { p, q, head: withHead, trimStart = true, trimEnd = true } of segments) {
      const dir = new THREE.Vector3().subVectors(q, p).setY(0);
      const dist = dir.length();
      dir.normalize();
      // Start just outside the source's figurines, end just short of the target's.
      const start = trimStart ? p.clone().addScaledVector(dir, Math.min(0.35, dist * 0.15)).setY(p.y + 0.3) : p.clone();
      const end = trimEnd ? q.clone().addScaledVector(dir, -Math.min(0.5, dist * 0.2)).setY(q.y + 0.38) : q.clone();
      const curve = new ArcCurve(start, end, Math.min(3.2, 0.3 + dist * 0.22));
      const shaft = new THREE.Mesh(new THREE.BufferGeometry(), makeMaterial(false));
      shaft.renderOrder = 4;
      shaft.visible = false;
      this.root.add(shaft);
      let head = null;
      if (withHead) {
        head = new THREE.Mesh(headGeometry, makeMaterial(true));
        head.renderOrder = 4;
        head.visible = false;
        this.root.add(head);
      }
      // The arc lies in a vertical plane, so "across the ribbon" is constant.
      const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
      arrow.parts.push({ curve, length: curve.getLength(), side, shaft, head, built: -1 });
    }
    this.arrows.set(to, arrow);
    animate(0.55, (e) => (arrow.progress = e), Ease.outCubic, delay);
    return arrow;
  }

  remove(to, arrow) {
    this.arrows.delete(to);
    arrow.alive = false;
    this.dying.add(arrow);
    const o0 = arrow.opacity;
    animate(0.25, (e) => (arrow.opacity = o0 * (1 - e)), Ease.inQuad).then(() => {
      this.dying.delete(arrow);
      for (const { shaft, head } of arrow.parts) {
        this.root.remove(shaft);
        shaft.geometry.dispose();
        shaft.material.dispose();
        if (head) {
          this.root.remove(head);
          head.material.dispose();
        }
      }
    });
  }

  update(dt, time) {
    const all = [...this.arrows.values(), ...this.dying];
    const frameT = new THREE.Vector3();
    const frameN = new THREE.Vector3();
    const basis = new THREE.Matrix4();
    for (const arrow of all) {
      // Smooth colour change between gold (option) and red (locked).
      arrow.mix += (arrow.target - arrow.mix) * (1 - Math.exp(-10 * dt));
      const hovered = arrow.alive && arrow.to === this.hover && arrow.target === 0;
      arrow.boost += ((hovered ? 1 : 0) - arrow.boost) * (1 - Math.exp(-12 * dt));
      // Each segment of a wrapped arrow grows in turn.
      const n = arrow.parts.length;
      arrow.parts.forEach((part, k) => {
        const { curve, length, side, shaft, head } = part;
        const p = Math.max(0, Math.min(1, arrow.progress * n - k));
        // The arrow grows from the source: rebuild the shaft up to the current
        // tip, with the head riding on its end.
        const tipS = p * length;
        const shaftEnd = head ? tipS - HEAD_LEN : tipS;
        if (Math.abs(p - part.built) > 1e-3) {
          part.built = p;
          shaft.geometry.dispose();
          shaft.geometry = shaftEnd > 0.02 ? ribbonGeometry(curve, length, shaftEnd, side) : new THREE.BufferGeometry();
        }
        shaft.visible = shaftEnd > 0.02;
        // Shadows only once fully drawn.
        shaft.castShadow = p >= 1;
        if (head) {
          head.castShadow = p >= 1;
          head.visible = tipS > HEAD_LEN * 0.6;
          const u = Math.max(0, shaftEnd) / length;
          curve.getPointAt(u, head.position);
          curve.getTangentAt(u, frameT);
          frameN.crossVectors(side, frameT).normalize();
          // local x -> along the arrow, y -> across, z -> ribbon normal
          basis.makeBasis(frameT, side.clone().negate(), frameN);
          head.quaternion.setFromRotationMatrix(basis);
          head.scale.setScalar(1 + arrow.mix * 0.12 + arrow.boost * 0.25 + arrow.mix * 0.05 * Math.sin(time * 7));
        }
        for (const mat of head ? [shaft.material, head.material] : [shaft.material]) {
          const uni = mat.uniforms;
          uni.uColor.value.copy(STYLES.option.color).lerp(STYLES.locked.color, arrow.mix);
          uni.uFlow.value.copy(STYLES.option.flow).lerp(STYLES.locked.flow, arrow.mix);
          uni.uTime.value = time;
          uni.uOpacity.value = arrow.opacity * Math.min(1, 0.85 + 0.15 * Math.max(arrow.mix, arrow.boost));
          uni.uBoost.value = arrow.boost;
          uni.uPulse.value = arrow.mix;
        }
      });
    }
  }
}
