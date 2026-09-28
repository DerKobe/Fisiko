// Places and animates the army figurines, count badges and battle effects.
import * as THREE from 'three';
import { figurineGeometries, figurineMaterial, composition } from './figurines.js';
import { animate, Ease, wait } from '../tween.js';
import { sfx } from '../audio.js';

const FIG_SCALE = 0.5;
// Slot offsets (x, z) around the anchor; extra rows grow north, away from the name label.
const SLOTS = [
  [0, 0],
  [0.34, -0.04],
  [-0.34, -0.04],
  [0.17, -0.36],
  [-0.17, -0.36],
  [0.51, -0.36],
  [-0.51, -0.36],
  [0, -0.68],
  [0.34, -0.68],
  [-0.34, -0.68],
  [0.17, 0.3],
  [-0.17, 0.3],
  [0.51, 0.3],
  [-0.51, 0.3],
];

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

let puffTexture = null;
function getPuffTexture() {
  if (puffTexture) return puffTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.4, 'rgba(230,225,215,0.45)');
  g.addColorStop(1, 'rgba(200,195,185,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  puffTexture = new THREE.CanvasTexture(c);
  puffTexture.colorSpace = THREE.SRGBColorSpace;
  return puffTexture;
}

function badgeCanvas(count, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  drawBadge(c, count, color);
  return c;
}

function drawBadge(c, count, color) {
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  const col = new THREE.Color(color);
  const lum = col.r * 0.3 + col.g * 0.59 + col.b * 0.11;
  // Gold ring
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  const ring = ctx.createLinearGradient(0, 10, 0, 118);
  ring.addColorStop(0, '#fbe7a6');
  ring.addColorStop(0.5, '#c79a3c');
  ring.addColorStop(1, '#7a5518');
  ctx.fillStyle = ring;
  ctx.fill();
  // Player enamel
  ctx.beginPath();
  ctx.arc(64, 64, 45, 0, Math.PI * 2);
  const enamel = ctx.createRadialGradient(52, 46, 6, 64, 64, 48);
  enamel.addColorStop(0, `#${col.clone().lerp(new THREE.Color('#ffffff'), 0.35).getHexString()}`);
  enamel.addColorStop(1, `#${col.clone().multiplyScalar(0.7).getHexString()}`);
  ctx.fillStyle = enamel;
  ctx.fill();
  ctx.font = `800 ${count > 99 ? 40 : count > 9 ? 52 : 60}px "Cinzel", Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 7;
  ctx.strokeStyle = lum > 0.6 ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)';
  ctx.fillStyle = lum > 0.6 ? '#1b130a' : '#fff8e8';
  ctx.strokeText(String(count), 64, 68);
  ctx.fillText(String(count), 64, 68);
}

export class ArmyManager {
  constructor(board) {
    this.board = board;
    this.scene = board.scene;
    this.geos = figurineGeometries();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.terr = [];
    this.lastPlaceSound = 0;
  }

  init(count) {
    for (let t = 0; t < count; t++) {
      const anchor = this.board.anchorWorld(t);
      const group = new THREE.Group();
      group.position.copy(anchor);
      this.root.add(group);
      const canvas = badgeCanvas(0, '#888');
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      badge.renderOrder = 10;
      badge.scale.setScalar(0.5);
      badge.position.set(0, 1.0, 0);
      badge.visible = false;
      group.add(badge);
      const radius = this.board.map.anchors[t].radius / (this.board.map.W / 40);
      this.terr.push({ group, badge, canvas, tex, pieces: [], owner: null, count: 0, color: null, spread: radius < 0.35 ? 0.75 : 1 });
    }
  }

  slotFor(t, k, type) {
    const s = SLOTS[k % SLOTS.length];
    const spread = this.terr[t].spread;
    const wide = (type === 'artillery' ? 1.12 : 1) * 1.12;
    return new THREE.Vector3(s[0] * spread * wide, 0, s[1] * spread * 1.12);
  }

  makePiece(type, color, t, k) {
    const mesh = new THREE.Mesh(this.geos[type], figurineMaterial(color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.scale.setScalar(FIG_SCALE);
    const r = hash(t * 13 + k * 7.3);
    mesh.rotation.y = type === 'infantry' ? (r - 0.5) * 0.9 : -0.55 + (r - 0.5) * 0.7;
    mesh.userData.type = type;
    return mesh;
  }

  updateBadge(t) {
    const d = this.terr[t];
    drawBadge(d.canvas, d.count, d.color || '#888');
    d.tex.needsUpdate = true;
    d.badge.visible = d.count > 0;
    const rows = d.pieces.length > 7 ? 1.3 : 1.05;
    d.badge.position.y = rows;
  }

  // Sync a territory to (owner colour, count). Animates the difference.
  async set(t, color, count, { animated = true, drop = true } = {}) {
    const d = this.terr[t];
    const ownerChanged = d.color !== color;
    const want = composition(count);
    const removed = [];
    if (ownerChanged) {
      removed.push(...d.pieces);
      d.pieces = [];
    }
    // Match existing pieces by type; drop surplus, spawn the missing ones.
    const keep = [];
    const pool = [...d.pieces];
    const added = [];
    for (const type of want) {
      const idx = pool.findIndex((p) => p.userData.type === type);
      if (idx >= 0) keep.push(pool.splice(idx, 1)[0]);
      else {
        const m = this.makePiece(type, color, t, keep.length + added.length + (d.spawned = (d.spawned || 0) + 1));
        added.push(m);
        keep.push(m);
      }
    }
    removed.push(...pool);
    d.pieces = keep;
    d.color = color;
    d.count = count;
    this.updateBadge(t);
    // Order: artillery in the middle, cavalry, then infantry.
    const order = { artillery: 0, cavalry: 1, infantry: 2 };
    d.pieces.sort((a, b) => order[a.userData.type] - order[b.userData.type]);
    for (const m of removed) this.killPiece(t, m, animated);
    const promises = [];
    d.pieces.forEach((m, k) => {
      const slot = this.slotFor(t, k, m.userData.type);
      if (added.includes(m)) {
        d.group.add(m);
        if (animated && drop) {
          m.position.set(slot.x, 2.4, slot.z);
          m.scale.setScalar(FIG_SCALE * 0.4);
          const delay = added.indexOf(m) * 0.07;
          promises.push(
            animate(
              0.55,
              (e, raw) => {
                m.position.y = 2.4 * (1 - e);
                m.scale.setScalar(FIG_SCALE * (0.4 + 0.6 * Math.min(1, raw * 2)));
              },
              Ease.outBounce,
              delay,
            ),
          );
          const now = performance.now();
          if (now - this.lastPlaceSound > 60) {
            this.lastPlaceSound = now;
            setTimeout(() => sfx.place(), delay * 1000 + 220);
          }
        } else {
          m.position.copy(slot);
        }
      } else if (animated) {
        const from = m.position.clone();
        promises.push(animate(0.35, (e) => m.position.lerpVectors(from, slot, e), Ease.inOutQuad));
      } else {
        m.position.copy(slot);
      }
    });
    if (animated) {
      d.badge.scale.setScalar(0.72);
      promises.push(animate(0.4, (e) => d.badge.scale.setScalar(0.72 - 0.22 * e), Ease.outBack));
    }
    await Promise.all(promises);
  }

  killPiece(t, m, animated) {
    const d = this.terr[t];
    if (!animated) {
      d.group.remove(m);
      return;
    }
    const mat = m.material.clone();
    mat.transparent = true;
    m.material = mat;
    const dir = Math.random() * Math.PI * 2;
    const start = m.position.clone();
    const world = m.getWorldPosition(new THREE.Vector3());
    this.puff(world, 0.9);
    animate(
      0.8,
      (e) => {
        m.rotation.x = Math.cos(dir) * 1.45 * Math.min(1, e * 1.6);
        m.rotation.z = Math.sin(dir) * 1.45 * Math.min(1, e * 1.6);
        m.position.y = start.y + Math.sin(Math.min(1, e * 1.6) * Math.PI) * 0.25 - Math.max(0, e - 0.6) * 0.8;
        mat.opacity = 1 - Math.max(0, (e - 0.45) / 0.55);
      },
      Ease.linear,
    ).then(() => {
      d.group.remove(m);
      mat.dispose();
    });
  }

  puff(pos, size = 1, color = '#d9d2c4') {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: getPuffTexture(), color, transparent: true, depthWrite: false }));
      sp.position.copy(pos);
      sp.position.y += 0.15;
      this.scene.add(sp);
      const a = (i / n) * Math.PI * 2 + Math.random();
      const v = new THREE.Vector3(Math.cos(a), 0.6 + Math.random() * 0.8, Math.sin(a)).multiplyScalar(0.35 * size);
      const s0 = 0.15 * size;
      animate(
        0.9 + Math.random() * 0.5,
        (e) => {
          sp.position.addScaledVector(v, 0.016);
          sp.scale.setScalar(s0 + e * 0.7 * size);
          sp.material.opacity = 0.75 * (1 - e);
        },
        Ease.outQuad,
      ).then(() => {
        this.scene.remove(sp);
        sp.material.dispose();
      });
    }
  }

  // Burst of sparks/flash at a territory (artillery hit).
  flash(t, color = '#ffcc66') {
    const pos = this.terr[t].group.position.clone();
    const light = new THREE.PointLight(color, 25, 5, 2);
    light.position.copy(pos).add(new THREE.Vector3(0, 0.8, 0));
    this.scene.add(light);
    animate(0.5, (e) => (light.intensity = 25 * (1 - e)), Ease.outQuad).then(() => this.scene.remove(light));
  }

  // Floating text sprite (e.g. "-2", "+5") rising above a territory.
  floatText(t, text, color = '#ffe9a8', size = 1) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.font = '900 84px "Cinzel", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(20,10,0,0.85)';
    ctx.strokeText(text, 128, 66);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 66);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.renderOrder = 20;
    const base = this.terr[t].group.position.clone().add(new THREE.Vector3(0, 1.3, 0));
    sp.position.copy(base);
    this.scene.add(sp);
    return animate(
      1.6,
      (e) => {
        sp.position.y = base.y + e * 1.1;
        const s = size * (e < 0.15 ? (e / 0.15) * 1.2 : 1.2 - (e - 0.15) * 0.3);
        sp.scale.set(s * 1.2, s * 0.6, 1);
        sp.material.opacity = e > 0.7 ? 1 - (e - 0.7) / 0.3 : 1;
      },
      Ease.outQuad,
    ).then(() => {
      this.scene.remove(sp);
      tex.dispose();
      sp.material.dispose();
    });
  }

  // Figurines leap from one territory to another in an arc.
  async march(from, to, n, color) {
    const types = composition(n).slice(0, 3);
    const a = this.terr[from].group.position;
    const b = this.terr[to].group.position;
    const dist = a.distanceTo(b);
    const h = Math.min(3, 0.8 + dist * 0.25);
    sfx.whoosh();
    await Promise.all(
      types.map((type, k) => {
        const m = this.makePiece(type, color, to, 99 + k);
        const off = new THREE.Vector3((k - (types.length - 1) / 2) * 0.3, 0, 0);
        m.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x) + (type === 'infantry' ? Math.PI / 2 : 0);
        this.scene.add(m);
        return animate(
          0.7 + dist * 0.03,
          (e) => {
            m.position.lerpVectors(a, b, e).add(off);
            m.position.y += Math.sin(e * Math.PI) * h;
          },
          Ease.inOutQuad,
          k * 0.08,
        ).then(() => this.scene.remove(m));
      }),
    );
  }

  // Static colliders for the dice physics (world-space boxes).
  colliders() {
    const out = [];
    for (const d of this.terr) {
      for (const m of d.pieces) {
        const p = m.getWorldPosition(new THREE.Vector3());
        const type = m.userData.type;
        const half = type === 'artillery' ? [0.22, 0.16, 0.16] : type === 'cavalry' ? [0.2, 0.3, 0.1] : [0.09, 0.28, 0.09];
        out.push({ pos: p.add(new THREE.Vector3(0, half[1], 0)), half, rotY: m.rotation.y });
      }
    }
    return out;
  }

  pulse(t) {
    const g = this.terr[t].group;
    return animate(0.35, (e) => g.scale.setScalar(1 + Math.sin(e * Math.PI) * 0.15), Ease.linear);
  }

  wait(s) {
    return wait(s);
  }
}
