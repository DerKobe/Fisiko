// Physically simulated 3D dice (cannon-es). The attacker can shake the dice
// in hand, aim with the mouse and fling them across the board.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BOARD_W, BOARD_Y } from '../board/board3d.js';
import { animate, Ease, wait } from '../tween.js';
import { sfx } from '../audio.js';

const SIZE = 0.62;
const HALF = SIZE / 2;
const HAND_H = 2.0;
const GRAVITY = -62;
// BoxGeometry material order: +x, -x, +y, -y, +z, -z
const FACE_VALUES = [1, 6, 2, 5, 3, 4];
const FACE_AXES = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];
const PIPS = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]],
};

const STYLES = {
  attacker: { body: ['#d3202a', '#8c0d14'], pip: '#fbf1dc', pipShadow: 'rgba(60,0,0,0.6)', one: '#fbf1dc' },
  defender: { body: ['#fbf6ea', '#d8ceb8'], pip: '#1c1c22', pipShadow: 'rgba(0,0,0,0.35)', one: '#1c1c22' },
};

const faceCache = new Map();
function faceTextures(style, value) {
  const key = `${style}-${value}`;
  if (faceCache.has(key)) return faceCache.get(key);
  const st = STYLES[style];
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, st.body[0]);
  g.addColorStop(1, st.body[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const b = document.createElement('canvas');
  b.width = b.height = S;
  const bctx = b.getContext('2d');
  bctx.fillStyle = '#fff';
  bctx.fillRect(0, 0, S, S);
  const r = value === 1 ? 30 : 22;
  for (const [x, y] of PIPS[value]) {
    const px = x * S;
    const py = y * S;
    ctx.beginPath();
    ctx.arc(px + 2, py + 3, r, 0, Math.PI * 2);
    ctx.fillStyle = st.pipShadow;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    const pg = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, 2, px, py, r);
    pg.addColorStop(0, st.pip);
    pg.addColorStop(1, value === 1 ? st.one : st.pip);
    ctx.fillStyle = pg;
    ctx.fill();
    const bg = bctx.createRadialGradient(px, py, 0, px, py, r * 1.1);
    bg.addColorStop(0, '#000');
    bg.addColorStop(0.85, '#333');
    bg.addColorStop(1, '#fff');
    bctx.fillStyle = bg;
    bctx.beginPath();
    bctx.arc(px, py, r * 1.1, 0, Math.PI * 2);
    bctx.fill();
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const bump = new THREE.CanvasTexture(b);
  const out = { map, bump };
  faceCache.set(key, out);
  return out;
}

function makeDie(style) {
  const geo = new RoundedBoxGeometry(SIZE, SIZE, SIZE, 4, SIZE * 0.14);
  const mats = FACE_VALUES.map((v) => {
    const { map, bump } = faceTextures(style, v);
    return new THREE.MeshPhysicalMaterial({
      map,
      bumpMap: bump,
      bumpScale: 2.5,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      emissive: new THREE.Color(0),
    });
  });
  const mesh = new THREE.Mesh(geo, mats);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function topValue(quat) {
  let best = -2;
  let val = 1;
  const v = new THREE.Vector3();
  FACE_AXES.forEach((axis, i) => {
    const y = v.copy(axis).applyQuaternion(quat).y;
    if (y > best) {
      best = y;
      val = FACE_VALUES[i];
    }
  });
  return { value: val, flatness: best };
}

export class DiceRoller {
  constructor(board, armies, ui = {}) {
    this.board = board;
    this.armies = armies;
    this.ui = ui; // { onSlowMo(bool), onPower(0..1) }
    this.scene = board.scene;
    this.timeScale = 1;
    this.active = null;
    this.pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.solver.iterations = 16;
    world.allowSleep = false;
    this.world = world;
    this.diceMat = new CANNON.Material('dice');
    this.floorMat = new CANNON.Material('floor');
    world.addContactMaterial(new CANNON.ContactMaterial(this.diceMat, this.floorMat, { friction: 0.42, restitution: 0.34 }));
    world.addContactMaterial(new CANNON.ContactMaterial(this.diceMat, this.diceMat, { friction: 0.12, restitution: 0.55 }));

    const floor = new CANNON.Body({ mass: 0, material: this.floorMat, shape: new CANNON.Plane() });
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    floor.position.set(0, BOARD_Y + 0.025, 0);
    world.addBody(floor);
    this.staticBodies = [];

    // Reticle under the hand while aiming.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.7, 48),
      new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 5;
    this.scene.add(ring);
    this.reticle = ring;
  }

  setupWalls() {
    if (this.walls) return;
    const BH = this.board.BH;
    // Inner faces of the gold moulding, which overhangs the map edge slightly.
    const hw = BOARD_W / 2 - 0.07;
    const hh = BH / 2 - 0.07;
    const defs = [
      [[-hw, 0, 0], [0, Math.PI / 2, 0]],
      [[hw, 0, 0], [0, -Math.PI / 2, 0]],
      [[0, 0, -hh], [0, 0, 0]],
      [[0, 0, hh], [0, Math.PI, 0]],
    ];
    defs.push([[0, BOARD_Y + 11, 0], [Math.PI / 2, 0, 0]]);
    this.walls = defs.map(([p, e]) => {
      const b = new CANNON.Body({ mass: 0, material: this.floorMat, shape: new CANNON.Plane() });
      b.position.set(...p);
      b.quaternion.setFromEuler(...e);
      this.world.addBody(b);
      return b;
    });
  }

  addFigureColliders() {
    for (const c of this.armies.colliders()) {
      const b = new CANNON.Body({ mass: 0, material: this.floorMat, shape: new CANNON.Box(new CANNON.Vec3(...c.half)) });
      b.position.set(c.pos.x, c.pos.y, c.pos.z);
      b.quaternion.setFromEuler(0, c.rotY, 0);
      this.world.addBody(b);
      this.staticBodies.push(b);
    }
  }

  clearColliders() {
    for (const b of this.staticBodies) this.world.removeBody(b);
    this.staticBodies = [];
  }

  setPointer(x, y) {
    this.pointer.x = x;
    this.pointer.y = y;
  }

  // --------------------------------------------------------------------------
  // Public flow: prepare -> (beginShake -> release) | autoThrow -> result
  // --------------------------------------------------------------------------
  prepare({ attackerDice, defenderDice, from, to, decisive = false, speed = 1, interactive = true }) {
    this.setupWalls();
    this.cleanupImmediate();
    const dice = [];
    for (let i = 0; i < attackerDice; i++) dice.push({ mesh: makeDie('attacker'), side: 'att' });
    for (let i = 0; i < defenderDice; i++) dice.push({ mesh: makeDie('defender'), side: 'def' });
    const toCam = new THREE.Vector3().subVectors(this.board.camera.position, to).setY(0).normalize();
    const battleDir = new THREE.Vector3().subVectors(to, from).setY(0);
    if (battleDir.lengthSq() < 1e-4) battleDir.set(1, 0, 0);
    battleDir.normalize();
    // Hand starts between the attacker and the camera.
    const handStart = from.clone().lerp(to, 0.2).addScaledVector(toCam, 1.1);
    handStart.y = BOARD_Y + HAND_H;
    this.clampToBoard(handStart, 1.2);
    const a = {
      dice,
      from: from.clone(),
      to: to.clone(),
      toCam,
      battleDir,
      decisive,
      speed,
      state: 'ready',
      hand: handStart.clone(),
      handHome: handStart.clone(),
      handVel: new THREE.Vector3(),
      power: 0,
      t: 0,
      rattleT: 0,
      slowmo: false,
      stillTime: 0,
      nudges: 0,
      elapsed: 0,
      interactive,
    };
    this.active = a;
    dice.forEach((d, i) => {
      d.spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      d.mesh.quaternion.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      d.mesh.scale.setScalar(0.001);
      this.scene.add(d.mesh);
      animate(0.35, (e) => d.mesh.scale.setScalar(Math.max(0.001, e)), Ease.outBack, i * 0.05);
      if (d.side === 'def') {
        const dStart = to.clone().addScaledVector(battleDir, 1.3).addScaledVector(toCam, -1.1);
        dStart.y = BOARD_Y + HAND_H * 0.8;
        this.clampToBoard(dStart, 1);
        d.home = dStart;
      }
    });
    // Place the dice in hand before anything can throw them.
    this.updateHand(0);
    return new Promise((resolve) => {
      a.resolve = resolve;
      if (!interactive) this.autoThrow();
    });
  }

  beginShake() {
    const a = this.active;
    if (!a || a.state !== 'ready') return;
    a.state = 'shaking';
    a.power = 0;
    // Aim relative to the press point, so pressing the Roll button doesn't
    // yank the dice underneath the panel.
    a.pressPointer = { ...this.pointer };
    a.pressHand = this.board.toScreen(a.hand);
  }

  release() {
    const a = this.active;
    if (!a || a.state !== 'shaking') return;
    this.throwDice(false);
  }

  autoThrow() {
    const a = this.active;
    if (!a || (a.state !== 'ready' && a.state !== 'shaking')) return;
    a.power = a.state === 'shaking' ? a.power : 0.35 + Math.random() * 0.3;
    this.throwDice(true);
  }

  cancel() {
    const a = this.active;
    if (!a) return;
    a.dice.forEach((d) => animate(0.25, (e) => d.mesh.scale.setScalar(Math.max(0.001, 1 - e)), Ease.inQuad).then(() => this.scene.remove(d.mesh)));
    this.reticle.material.opacity = 0;
    if (a.slowmo) {
      this.board.flying = false;
      this.ui.onSlowMo?.(false);
      this.timeScale = 1;
    }
    this.active = null;
    a.resolve?.(null);
  }

  // Screen rect not covered by HUD panels, shrunk by `pad` pixels.
  safeRect(pad = 0) {
    const s = this.ui.safeRect?.() || { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    return { left: s.left + pad, top: s.top + pad, right: s.right - pad, bottom: s.bottom - pad };
  }

  // Point on the horizontal plane at height y under a screen position that is
  // first clamped into the visible (uncovered) screen area.
  visibleOnPlane(screen, y) {
    const r = this.safeRect(100);
    const sx = Math.max(r.left, Math.min(r.right, screen.x));
    const sy = Math.max(r.top, Math.min(r.bottom, screen.y));
    const p = this.board.pointerOnPlane(sx, sy, y);
    return p ? this.clampToBoard(p, 0.8) : null;
  }

  // Keep the camera framed on a box around every die (slow-motion close-up).
  frameDice(a, dt) {
    const pad = HALF * 1.6;
    const pts = [];
    for (const d of a.dice) {
      const p = d.mesh.position;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pts.push(new THREE.Vector3(p.x + sx * pad, p.y + sy * pad, p.z + sz * pad));
    }
    const pose = this.board.fitPose(pts, this.safeRect(30), { minDist: 5.5, maxDist: 40 });
    this.board.trackPose(pose, dt, 5);
  }

  clampToBoard(v, margin) {
    const BH = this.board.BH;
    v.x = Math.max(-BOARD_W / 2 + margin, Math.min(BOARD_W / 2 - margin, v.x));
    v.z = Math.max(-BH / 2 + margin, Math.min(BH / 2 - margin, v.z));
    return v;
  }

  throwDice(auto) {
    const a = this.active;
    a.state = 'rolling';
    a.elapsed = 0;
    this.reticle.material.opacity = 0;
    this.ui.onPower?.(null);
    this.addFigureColliders();
    const toTarget = new THREE.Vector3().subVectors(a.to, a.hand).setY(0);
    const dist = toTarget.length();
    toTarget.normalize();
    let vel;
    if (auto || a.handVel.length() < 5) {
      const speed = Math.min(11, 3.2 + dist * 1.15) * (0.9 + a.power * 0.3);
      vel = toTarget.clone().multiplyScalar(speed);
    } else {
      vel = a.handVel.clone().setY(0).multiplyScalar(1.15);
      if (vel.length() > 18) vel.setLength(18);
      // Gently steer toward the battle so throws stay on target.
      vel.lerp(toTarget.clone().multiplyScalar(vel.length()), 0.25);
    }
    vel.y = 3 + a.power * 5;
    const spin = 14 + a.power * 26;
    sfx.whoosh();
    a.dice.forEach((d, i) => {
      let start;
      let v;
      if (d.side === 'att') {
        start = d.mesh.position.clone();
        v = vel.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2));
      } else {
        start = d.mesh.position.clone();
        const back = new THREE.Vector3().subVectors(a.to, start).setY(0);
        const len = back.length();
        v = back.normalize().multiplyScalar(2 + len * 1.2 + Math.random());
        v.y = 3 + Math.random() * 2;
      }
      const body = new CANNON.Body({
        mass: 1,
        material: this.diceMat,
        shape: new CANNON.Box(new CANNON.Vec3(HALF, HALF, HALF)),
        linearDamping: 0.22,
        angularDamping: 0.18,
      });
      body.position.set(start.x, start.y, start.z);
      const q = d.mesh.quaternion;
      body.quaternion.set(q.x, q.y, q.z, q.w);
      body.velocity.set(v.x, v.y, v.z);
      body.angularVelocity.set((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin);
      body.addEventListener('collide', (e) => {
        const iv = Math.abs(e.contact.getImpactVelocityAlongNormal());
        if (iv < 0.8) return;
        const other = e.body === body ? e.target : e.body;
        const isDie = a.dice.some((dd) => dd.body === other);
        const now = performance.now();
        if (now - (d.lastHit || 0) < 45) return;
        d.lastHit = now;
        if (isDie) sfx.diceClack(iv / 14);
        else sfx.diceHit(iv / 16);
        if (iv > 9 && !a.firstImpact) {
          a.firstImpact = true;
          this.board.addShake(0.35);
        }
      });
      this.world.addBody(body);
      d.body = body;
      d.mesh.scale.setScalar(1);
    });
  }

  // --------------------------------------------------------------------------
  update(realDt) {
    const a = this.active;
    if (!a) return;
    const dt = Math.min(0.05, realDt);
    a.t += dt;
    if (a.state === 'ready' || a.state === 'shaking') this.updateHand(dt);
    if (a.state === 'rolling') this.updateRolling(dt);
  }

  updateHand(dt) {
    const a = this.active;
    const shaking = a.state === 'shaking';
    // The hand always stays in the uncovered part of the screen. While shaking it
    // follows the mouse movement (relative to the press point) to aim.
    let goal;
    if (shaking && a.interactive) {
      goal = this.visibleOnPlane(
        { x: a.pressHand.x + (this.pointer.x - a.pressPointer.x), y: a.pressHand.y + (this.pointer.y - a.pressPointer.y) },
        BOARD_Y + HAND_H,
      );
    } else {
      goal = this.visibleOnPlane(this.board.toScreen(a.handHome), BOARD_Y + HAND_H);
    }
    if (goal) {
      const prev = a.hand.clone();
      if (dt === 0) a.hand.copy(goal);
      else a.hand.lerp(goal, 1 - Math.pow(shaking ? 0.0005 : 0.02, dt));
      if (shaking) {
        const inst = a.hand.clone().sub(prev).divideScalar(Math.max(dt, 1e-3));
        a.handVel.lerp(inst, 0.35);
        a.power = Math.min(1, a.power + dt * 0.45 + Math.min(inst.length(), 40) * dt * 0.02);
      }
    }
    if (shaking && a.interactive) this.ui.onPower?.(a.power);
    const intensity = shaking ? 0.35 + a.power * 0.65 : 0.12;
    const attackers = a.dice.filter((d) => d.side === 'att');
    attackers.forEach((d, i) => {
      const ang = a.t * (shaking ? 9 + a.power * 10 : 1.6) + (i / attackers.length) * Math.PI * 2;
      const r = shaking ? 0.32 + 0.1 * Math.sin(a.t * 23 + i) : 0.45;
      d.mesh.position.set(
        a.hand.x + Math.cos(ang) * r + (Math.random() - 0.5) * intensity * 0.16,
        a.hand.y + Math.sin(a.t * (shaking ? 21 : 2.4) + i * 1.7) * (shaking ? 0.22 : 0.12),
        a.hand.z + Math.sin(ang) * r + (Math.random() - 0.5) * intensity * 0.16,
      );
      const spinQ = new THREE.Quaternion().setFromAxisAngle(d.spin, dt * (shaking ? 12 + a.power * 22 : 1.5));
      d.mesh.quaternion.premultiply(spinQ);
      if (shaking && Math.random() < dt * 3) d.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    });
    a.dice
      .filter((d) => d.side === 'def')
      .forEach((d, i) => {
        const home = this.visibleOnPlane(this.board.toScreen(d.home), d.home.y) || d.home;
        d.mesh.position.set(home.x + i * 0.75 - 0.35, home.y + Math.sin(a.t * 2 + i) * 0.1, home.z);
        d.mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(d.spin, dt * 1.2));
      });
    // Rattle
    if (shaking) {
      a.rattleT -= dt;
      if (a.rattleT <= 0) {
        sfx.rattle(0.6 + a.power * 0.8);
        a.rattleT = 0.11 - a.power * 0.06 + Math.random() * 0.04;
      }
    }
    // Reticle on the board below the hand
    const rt = this.reticle;
    rt.position.set(a.hand.x, BOARD_Y + 0.08, a.hand.z);
    rt.material.opacity = shaking ? 0.55 : 0.25;
    rt.material.color.setHSL(0.12 - a.power * 0.12, 0.9, 0.6);
    rt.scale.setScalar(1 + (shaking ? Math.sin(a.t * 20) * 0.05 * a.power : 0));
  }

  updateRolling(dt) {
    const a = this.active;
    a.elapsed += dt;
    this.world.step(1 / 180, dt * this.timeScale * a.speed, 12);
    let allStill = true;
    let maxSpeed = 0;
    for (const d of a.dice) {
      const b = d.body;
      d.mesh.position.set(b.position.x, b.position.y, b.position.z);
      d.mesh.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      const sp = b.velocity.length();
      const av = b.angularVelocity.length();
      maxSpeed = Math.max(maxSpeed, sp);
      if (sp > 0.12 || av > 0.25) allStill = false;
      // Safety: a die that escaped gets pulled back onto the board.
      if (b.position.y < BOARD_Y - 1 || Math.abs(b.position.x) > BOARD_W / 2 + 1) {
        b.position.set(a.to.x, BOARD_Y + 2, a.to.z);
        b.velocity.set(0, 0, 0);
      }
    }
    // Dramatic slow motion as decisive dice come to rest.
    if (a.decisive && !a.slowmo && a.elapsed > 0.5 && maxSpeed < 7 && maxSpeed > 0.5) {
      a.slowmo = true;
      this.timeScale = 0.26;
      this.ui.onSlowMo?.(true);
      a.restorePose = this.board.currentPose();
      this.board.flying = true;
      sfx.heartbeat();
      setTimeout(() => this.active === a && sfx.heartbeat(), 900);
    }
    if (a.slowmo) this.frameDice(a, dt);
    a.stillTime = allStill ? a.stillTime + dt * this.timeScale * a.speed : 0;
    const timeout = a.elapsed > 9;
    if (a.stillTime > 0.3 || timeout) {
      // Cocked dice get a nudge (like re-rolling a leaning die).
      const cocked = a.dice.filter((d) => topValue(d.mesh.quaternion).flatness < 0.9);
      if (cocked.length && a.nudges < 4) {
        a.nudges++;
        a.stillTime = 0;
        for (const d of cocked) {
          d.body.velocity.set((Math.random() - 0.5) * 2, 4, (Math.random() - 0.5) * 2);
          d.body.angularVelocity.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
        }
        return;
      }
      this.finishRoll();
    }
  }

  async finishRoll() {
    const a = this.active;
    a.state = 'presenting';
    this.timeScale = 1;
    if (a.slowmo) this.ui.onSlowMo?.(false);
    for (const d of a.dice) {
      this.world.removeBody(d.body);
      d.value = topValue(d.mesh.quaternion).value;
    }
    this.clearColliders();
    const att = a.dice.filter((d) => d.side === 'att').sort((x, y) => y.value - x.value);
    const def = a.dice.filter((d) => d.side === 'def').sort((x, y) => y.value - x.value);
    await wait(0.35 / a.speed);
    if (a.restorePose) await this.board.flyTo(a.restorePose, 0.7);
    await this.present(att, def, a);
    a.att = att;
    a.def = def;
    a.resolve({ att: att.map((d) => d.value), def: def.map((d) => d.value) });
  }

  // Lift the dice into two facing rows above the battle so values are readable.
  async present(att, def, a) {
    const cam = this.board.camera;
    const camDir = new THREE.Vector3();
    cam.getWorldDirection(camDir);
    const fwd = camDir.clone().setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    // Present over the battle, where the camera is looking.
    const center = a.from.clone().lerp(a.to, 0.55);
    center.y = BOARD_Y + 1.5;
    const yaw = Math.atan2(-fwd.x, -fwd.z);
    const tilt = new THREE.Quaternion().setFromAxisAngle(right, 0.55);
    const rows = [
      [att, center.clone().addScaledVector(fwd, 0.5).setY(BOARD_Y + 1.85)],
      [def, center.clone().addScaledVector(fwd, -0.45).setY(BOARD_Y + 1.25)],
    ];
    const moves = [];
    // Shared columns so each attacker die sits right above the defender die it faces.
    const cols = Math.max(att.length, def.length);
    for (const [list, rowCenter] of rows) {
      list.forEach((d, i) => {
        const target = rowCenter.clone().addScaledVector(right, (i - (cols - 1) / 2) * 0.86);
        const axis = FACE_AXES[FACE_VALUES.indexOf(d.value)];
        const qFace = new THREE.Quaternion().setFromUnitVectors(axis, new THREE.Vector3(0, 1, 0));
        const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        const qTarget = tilt.clone().multiply(qYaw).multiply(qFace);
        const p0 = d.mesh.position.clone();
        const q0 = d.mesh.quaternion.clone();
        d.presentPos = target;
        moves.push(
          animate(
            0.6 / a.speed,
            (e) => {
              d.mesh.position.lerpVectors(p0, target, e);
              d.mesh.position.y += Math.sin(e * Math.PI) * 0.6;
              d.mesh.quaternion.slerpQuaternions(q0, qTarget, e);
            },
            Ease.inOutCubic,
            i * 0.05,
          ),
        );
      });
    }
    await Promise.all(moves);
  }

  // Glow winners, knock losers down; then clear the dice away.
  async showOutcome() {
    const a = this.active;
    if (!a) return;
    const pairs = Math.min(a.att.length, a.def.length);
    const glows = [];
    for (let i = 0; i < pairs; i++) {
      const attWins = a.att[i].value > a.def[i].value;
      const winner = attWins ? a.att[i] : a.def[i];
      const loser = attWins ? a.def[i] : a.att[i];
      const delay = i * 0.28;
      glows.push(
        animate(
          0.7 / a.speed,
          (e) => {
            const pulse = Math.sin(e * Math.PI);
            winner.mesh.material.forEach((m) => m.emissive.setRGB(0.55 * pulse, 0.42 * pulse, 0.08 * pulse));
            winner.mesh.scale.setScalar(1 + 0.18 * pulse);
          },
          Ease.linear,
          delay / a.speed,
        ),
      );
      const lp = loser.presentPos.clone();
      glows.push(
        animate(
          0.6 / a.speed,
          (e) => {
            loser.mesh.position.set(lp.x + Math.sin(e * 40) * 0.05 * (1 - e), lp.y - e * 0.35, lp.z);
            loser.mesh.material.forEach((m) => m.color.setScalar(1 - e * 0.55));
          },
          Ease.outQuad,
          (delay + 0.15) / a.speed,
        ),
      );
      setTimeout(() => sfx.clash(), ((delay + 0.1) / a.speed) * 1000);
    }
    // Unpaired dice fade a little.
    [...a.att.slice(pairs), ...a.def.slice(pairs)].forEach((d) => d.mesh.material.forEach((m) => m.color.setScalar(0.6)));
    await Promise.all(glows);
    await wait(0.45 / a.speed);
    await this.clear();
  }

  async clear() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    await Promise.all(
      a.dice.map((d, i) =>
        animate(
          0.3,
          (e) => {
            d.mesh.scale.setScalar(Math.max(0.001, 1 - e));
            d.mesh.position.y += 0.02;
          },
          Ease.inQuad,
          i * 0.03,
        ).then(() => {
          this.scene.remove(d.mesh);
          d.mesh.geometry.dispose();
          d.mesh.material.forEach((m) => m.dispose());
        }),
      ),
    );
  }

  cleanupImmediate() {
    if (!this.active) return;
    if (this.active.slowmo) {
      this.board.flying = false;
      this.ui.onSlowMo?.(false);
    }
    for (const d of this.active.dice) {
      this.scene.remove(d.mesh);
      if (d.body) this.world.removeBody(d.body);
    }
    this.clearColliders();
    this.active = null;
    this.timeScale = 1;
  }

  get state() {
    return this.active?.state || 'idle';
  }
}
