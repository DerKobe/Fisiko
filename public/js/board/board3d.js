// The 3D table scene: wooden table, framed relief board, lights, camera,
// territory highlight shader and pointer picking.
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { animate, Ease } from '../tween.js';

export const BOARD_W = 40;
export const BOARD_Y = 0.62;
const DISP_SCALE = 0.16;
const MAX_T = 64;

function woodTexture(size, base, dark, light, seed = 1, planks = 0) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // Grain: many long wavy strokes.
  for (let i = 0; i < 900; i++) {
    const y = rnd() * size;
    const amp = 2 + rnd() * 8;
    const freq = 0.002 + rnd() * 0.01;
    const ph = rnd() * 10;
    ctx.strokeStyle = rnd() < 0.55 ? dark : light;
    ctx.globalAlpha = 0.04 + rnd() * 0.12;
    ctx.lineWidth = 0.5 + rnd() * 2.5;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 8) {
      const yy = y + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 3.1 + ph * 2) * amp * 0.3;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // Knots
  for (let i = 0; i < 3; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    for (let r = 3; r < 30; r += 3) {
      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 3, r, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (planks) {
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#1a0f07';
    ctx.lineWidth = 3;
    for (let k = 1; k < planks; k++) {
      ctx.beginPath();
      ctx.moveTo(0, (k * size) / planks);
      ctx.lineTo(size, (k * size) / planks);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

export class BoardScene {
  constructor(container) {
    this.container = container;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0d0906');
    scene.fog = new THREE.Fog('#0d0906', 45, 110);
    this.scene = scene;

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.45;

    const camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.1, 300);
    camera.position.set(0, 32, 24);
    this.camera = camera;

    const controls = new MapControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 5;
    controls.maxDistance = 48;
    controls.maxPolarAngle = 1.12;
    controls.minPolarAngle = 0.05;
    controls.minAzimuthAngle = -0.9;
    controls.maxAzimuthAngle = 0.9;
    controls.zoomSpeed = 1.2;
    controls.target.set(0, BOARD_Y, 1);
    this.controls = controls;

    this.setupLights();
    this.setupTable();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.shake = 0;

    window.addEventListener('resize', () => this.resize());
  }

  setupLights() {
    const hemi = new THREE.HemisphereLight('#fff1dc', '#2a1c10', 0.55);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight('#ffe6c2', 2.4);
    key.position.set(-14, 34, 16);
    key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096);
    const sc = key.shadow.camera;
    sc.left = -26;
    sc.right = 26;
    sc.top = 18;
    sc.bottom = -18;
    sc.near = 5;
    sc.far = 90;
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.03;
    key.shadow.radius = 3;
    this.scene.add(key);
    this.keyLight = key;
    const fill = new THREE.DirectionalLight('#9fb6ff', 0.35);
    fill.position.set(20, 18, -10);
    this.scene.add(fill);
    const rim = new THREE.PointLight('#ffb366', 30, 60, 1.6);
    rim.position.set(0, 14, -22);
    this.scene.add(rim);
  }

  setupTable() {
    const tex = woodTexture(1024, '#4a2c17', '#2a170a', '#7a4a26', 7, 6);
    tex.repeat.set(4, 4);
    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 220),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0.02, color: '#b89a82' }),
    );
    table.rotation.x = -Math.PI / 2;
    table.receiveShadow = true;
    this.scene.add(table);
  }

  // Build the board from generated map data and the painted canvas.
  buildBoard(map, boardCanvas) {
    this.map = map;
    const BW = BOARD_W;
    const BH = (BW * map.H) / map.W;
    this.BH = BH;

    // Frame
    const frameTex = woodTexture(512, '#3b1f0e', '#1d0e05', '#6a3a1a', 3);
    const frameMat = new THREE.MeshStandardMaterial({ map: frameTex, roughness: 0.45, metalness: 0.05, color: '#caa088' });
    const goldMat = new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 1, roughness: 0.38 });
    // Kept just below the map surface so it never shadows the map itself.
    const baseTop = BOARD_Y - 0.03;
    const base = new THREE.Mesh(new THREE.BoxGeometry(BW + 2.6, baseTop, BH + 2.6), frameMat);
    base.position.y = baseTop / 2;
    base.castShadow = true;
    base.receiveShadow = true;
    this.scene.add(base);
    // Rails sit on the base (no gap) and meet at the corners without overlapping.
    const railH = 0.26;
    const railTop = BOARD_Y + railH;
    const rails = [
      [BW + 2.6, BH / 2 + 0.65, 1.3, 0],
      [BW + 2.6, -(BH / 2 + 0.65), 1.3, 0],
      [1.3, 0, BH, BW / 2 + 0.65],
      [1.3, 0, BH, -(BW / 2 + 0.65)],
    ];
    for (const [w, z, d, x] of rails) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, railTop - baseTop, d), frameMat);
      m.position.set(x, (railTop + baseTop) / 2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    }
    // Gold moulding: overlaps the map edge, stands proud of the wood and is
    // sunk into the rails, so none of its faces share a plane with other
    // surfaces (which caused z-fighting flicker). Side pieces stop exactly at
    // the inner face of the long pieces instead of overlapping them.
    const inset = 0.06;
    const depth = 0.2;
    const bottom = BOARD_Y - 0.02;
    const top = railTop + 0.035;
    const trimH = top - bottom;
    const outerW = BW / 2 - inset + depth;
    const innerH = BH / 2 - inset;
    const trims = [
      [outerW * 2, depth, 0, innerH + depth / 2],
      [outerW * 2, depth, 0, -(innerH + depth / 2)],
      [depth, innerH * 2 - 0.004, BW / 2 - inset + depth / 2, 0],
      [depth, innerH * 2 - 0.004, -(BW / 2 - inset + depth / 2), 0],
    ];
    for (const [w, d, x, z] of trims) {
      const m = new THREE.Mesh(new RoundedBoxGeometry(w, trimH, d, 3, 0.03), goldMat);
      m.position.set(x, bottom + trimH / 2, z);
      m.receiveShadow = true;
      this.scene.add(m);
    }
    // Gold corner studs
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.12, 24), goldMat);
        stud.position.set(sx * (BW / 2 + 0.65), railTop + 0.05, sz * (BH / 2 + 0.65));
        stud.castShadow = true;
        this.scene.add(stud);
      }

    // Textures
    const tex = new THREE.CanvasTexture(boardCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.boardTexture = tex;
    const nCanvas = document.createElement('canvas');
    nCanvas.width = map.normalW;
    nCanvas.height = map.normalH;
    nCanvas.getContext('2d').putImageData(new ImageData(map.normal, map.normalW, map.normalH), 0, 0);
    const normalTex = new THREE.CanvasTexture(nCanvas);
    normalTex.anisotropy = 8;
    const dCanvas = document.createElement('canvas');
    dCanvas.width = map.dispW;
    dCanvas.height = map.dispH;
    dCanvas.getContext('2d').putImageData(new ImageData(map.disp, map.dispW, map.dispH), 0, 0);
    const dispTex = new THREE.CanvasTexture(dCanvas);

    const idTex = new THREE.DataTexture(map.ids, map.W, map.H, THREE.RedFormat, THREE.UnsignedByteType);
    idTex.magFilter = idTex.minFilter = THREE.NearestFilter;
    idTex.generateMipmaps = false;
    idTex.needsUpdate = true;
    this.ownerData = new Uint8Array(MAX_T * 4);
    this.stateData = new Uint8Array(MAX_T * 4);
    this.ownerTex = new THREE.DataTexture(this.ownerData, MAX_T, 1, THREE.RGBAFormat);
    this.stateTex = new THREE.DataTexture(this.stateData, MAX_T, 1, THREE.RGBAFormat);
    for (const t of [this.ownerTex, this.stateTex]) {
      t.magFilter = t.minFilter = THREE.NearestFilter;
      t.needsUpdate = true;
    }
    this.uniforms = {
      uIdMap: { value: idTex },
      uOwner: { value: this.ownerTex },
      uState: { value: this.stateTex },
      uTexel: { value: new THREE.Vector2(1 / map.W, 1 / map.H) },
      uTime: { value: 0 },
      uTint: { value: 0.42 },
    };

    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      normalMap: normalTex,
      normalScale: new THREE.Vector2(1.1, 1.1),
      displacementMap: dispTex,
      displacementScale: DISP_SCALE,
      roughness: 0.74,
      metalness: 0,
    });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vBoardUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvBoardUv = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec2 vBoardUv;
uniform sampler2D uIdMap;
uniform sampler2D uOwner;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uTime;
uniform float uTint;
float wcId(vec2 uv) { return floor(texture2D(uIdMap, uv).r * 255.0 + 0.5); }`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
vec3 wcEmit = vec3(0.0);
{
  vec2 idUv = vec2(vBoardUv.x, 1.0 - vBoardUv.y);
  float tid = wcId(idUv);
  if (tid > 0.5 && tid < 254.5) {
    vec2 lu = vec2((tid + 0.5) / ${MAX_T}.0, 0.5);
    vec4 own = texture2D(uOwner, lu);
    vec4 st = texture2D(uState, lu);
    float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    vec3 tinted = own.rgb * (0.25 + 1.25 * lum);
    diffuseColor.rgb = mix(diffuseColor.rgb, tinted, own.a * uTint);
    float edge = 0.0;
    if (st.r + st.g + st.b > 0.0) {
      for (int k = 0; k < 8; k++) {
        float a = float(k) * 0.7853982;
        vec2 dir = vec2(cos(a), sin(a));
        edge += step(0.5, abs(wcId(idUv + dir * uTexel * 3.0) - tid)) * 0.1;
        edge += step(0.5, abs(wcId(idUv + dir * uTexel * 7.0) - tid)) * 0.06;
        edge += step(0.5, abs(wcId(idUv + dir * uTexel * 12.0) - tid)) * 0.03;
      }
      edge = clamp(edge * 1.6, 0.0, 1.0);
    }
    float pulse = 0.5 + 0.5 * sin(uTime * 4.5);
    diffuseColor.rgb += st.r * 0.07;
    wcEmit += st.r * vec3(1.0, 0.95, 0.8) * edge * 0.45;
    wcEmit += st.g * (vec3(1.0, 0.78, 0.25) * edge * (0.9 + 0.8 * pulse) + vec3(0.1, 0.075, 0.02) * (0.6 + 0.4 * pulse));
    wcEmit += st.b * (vec3(1.0, 0.22, 0.1) * edge * (0.55 + 0.9 * pulse) + vec3(0.07, 0.01, 0.0) * pulse);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum * 0.55), st.a * 0.6);
  }
}`,
        )
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += wcEmit;');
    };
    const geo = new THREE.PlaneGeometry(BW, BH, 640, Math.round((640 * BH) / BW));
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = BOARD_Y;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.boardMesh = mesh;

    const pick = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.y = BOARD_Y + 0.02;
    this.scene.add(pick);
    this.pickPlane = pick;
  }

  // --- coordinate helpers ---------------------------------------------------
  heightAtPixel(px, py) {
    const m = this.map;
    const x = Math.max(0, Math.min(m.dispW - 1, Math.round((px / m.W) * m.dispW)));
    const y = Math.max(0, Math.min(m.dispH - 1, Math.round((py / m.H) * m.dispH)));
    return (m.disp[(y * m.dispW + x) * 4] / 255) * DISP_SCALE;
  }

  pixelToWorld(px, py, target = new THREE.Vector3()) {
    const m = this.map;
    return target.set((px / m.W - 0.5) * BOARD_W, BOARD_Y + this.heightAtPixel(px, py), (py / m.H - 0.5) * this.BH);
  }

  worldToPixel(v) {
    const m = this.map;
    return [(v.x / BOARD_W + 0.5) * m.W, (v.z / this.BH + 0.5) * m.H];
  }

  territoryAtPixel(px, py) {
    const m = this.map;
    const x = Math.floor(px);
    const y = Math.floor(py);
    if (x < 0 || y < 0 || x >= m.W || y >= m.H) return -1;
    const id = m.ids[y * m.W + x];
    return id >= 1 && id < 255 ? id - 1 : -1;
  }

  anchorWorld(t) {
    const a = this.map.anchors[t];
    return this.pixelToWorld(a.x, a.y);
  }

  // Returns {territory, point} under the given client coordinates.
  pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.pickPlane)[0];
    if (!hit) return { territory: -1, point: null };
    const [px, py] = this.worldToPixel(hit.point);
    return { territory: this.territoryAtPixel(px, py), point: hit.point };
  }

  // Intersect the pointer ray with a horizontal plane at height y.
  pointerOnPlane(clientX, clientY, y) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), out) ? out : null;
  }

  // --- highlight state --------------------------------------------------------
  setOwnerColor(t, hex) {
    const o = (t + 1) * 4;
    if (!hex) {
      this.ownerData[o + 3] = 0;
    } else {
      const c = new THREE.Color(hex);
      this.ownerData[o] = c.r * 255;
      this.ownerData[o + 1] = c.g * 255;
      this.ownerData[o + 2] = c.b * 255;
      this.ownerData[o + 3] = 255;
    }
    this.ownerTex.needsUpdate = true;
  }

  setTint(v) {
    this.uniforms.uTint.value = v;
  }

  // flags: {hover, selected, target, dim}
  setHighlight(t, flags) {
    const o = (t + 1) * 4;
    this.stateData[o] = flags.hover ? 255 : 0;
    this.stateData[o + 1] = flags.selected ? 255 : 0;
    this.stateData[o + 2] = flags.target ? 255 : 0;
    this.stateData[o + 3] = flags.dim ? 255 : 0;
    this.stateTex.needsUpdate = true;
  }

  clearHighlights() {
    this.stateData.fill(0);
    this.stateTex.needsUpdate = true;
  }

  // --- camera -----------------------------------------------------------------
  overviewPose() {
    const aspect = this.camera.aspect;
    const fitW = BOARD_W / 2 / Math.tan(((this.camera.fov / 2) * Math.PI) / 180) / aspect;
    const fitH = (this.BH || 24) / 2 / Math.tan(((this.camera.fov / 2) * Math.PI) / 180);
    const dist = Math.min(46, Math.max(fitW, fitH) * 1.02 + 2);
    return { target: new THREE.Vector3(0, BOARD_Y, 0.9), dist, polar: 0.62, azimuth: 0 };
  }

  flyTo({ target, dist, polar = 0.7, azimuth = 0 }, duration = 1.2) {
    const startTarget = this.controls.target.clone();
    const offset = this.camera.position.clone().sub(startTarget);
    const sph = new THREE.Spherical().setFromVector3(offset);
    const s0 = { r: sph.radius, phi: sph.phi, theta: sph.theta };
    const s1 = { r: dist, phi: polar, theta: azimuth };
    let dTheta = s1.theta - s0.theta;
    if (dTheta > Math.PI) dTheta -= Math.PI * 2;
    if (dTheta < -Math.PI) dTheta += Math.PI * 2;
    this.flying = true;
    return animate(
      duration,
      (e) => {
        this.controls.target.lerpVectors(startTarget, target, e);
        const r = s0.r + (s1.r - s0.r) * e;
        const phi = s0.phi + (s1.phi - s0.phi) * e;
        const theta = s0.theta + dTheta * e;
        const off = new THREE.Vector3().setFromSpherical(new THREE.Spherical(r, phi, theta));
        this.camera.position.copy(this.controls.target).add(off);
        this.camera.lookAt(this.controls.target);
      },
      Ease.inOutCubic,
    ).then(() => {
      this.flying = false;
    });
  }

  // Client-pixel position of a world point.
  toScreen(v) {
    const p = v.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  // Camera pose (keeping the current viewing direction) whose view holds every
  // point inside the client rect `safe` ({left, top, right, bottom}).
  fitPose(points, safe, { minDist = 5, maxDist = 42 } = {}) {
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const rect = this.renderer.domElement.getBoundingClientRect();
    const test = this.camera.clone();
    const tmp = new THREE.Vector3();
    const extent = (target, dist) => {
      test.position.copy(target).addScaledVector(dir, dist);
      test.lookAt(target);
      test.updateMatrixWorld();
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const p of points) {
        tmp.copy(p).project(test);
        const sx = rect.left + ((tmp.x + 1) / 2) * rect.width;
        const sy = rect.top + ((1 - tmp.y) / 2) * rect.height;
        x0 = Math.min(x0, sx);
        x1 = Math.max(x1, sx);
        y0 = Math.min(y0, sy);
        y1 = Math.max(y1, sy);
      }
      return { x0, x1, y0, y1 };
    };
    const target = points.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(points.length);
    const safeW = safe.right - safe.left;
    const safeH = safe.bottom - safe.top;
    let dist = maxDist;
    for (let iter = 0; iter < 3; iter++) {
      // Closest distance at which the points' screen extent still fits the safe rect.
      let lo = minDist;
      let hi = maxDist;
      for (let k = 0; k < 18; k++) {
        const mid = (lo + hi) / 2;
        const e = extent(target, mid);
        if (e.x1 - e.x0 <= safeW && e.y1 - e.y0 <= safeH) hi = mid;
        else lo = mid;
      }
      dist = hi;
      // Pan so the points sit in the middle of the safe rect, not the screen.
      const e = extent(target, dist);
      const dx = (safe.left + safe.right) / 2 - (e.x0 + e.x1) / 2;
      const dy = (safe.top + safe.bottom) / 2 - (e.y0 + e.y1) / 2;
      const unitsPerPx = (2 * dist * Math.tan(((test.fov / 2) * Math.PI) / 180)) / rect.height;
      const right = new THREE.Vector3().setFromMatrixColumn(test.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(test.matrixWorld, 1);
      target.addScaledVector(right, -dx * unitsPerPx).addScaledVector(up, dy * unitsPerPx);
    }
    return { target, dist, dir };
  }

  // Ease the camera toward a fitted pose; call every frame while tracking.
  trackPose(pose, dt, stiffness = 5) {
    const k = 1 - Math.exp(-stiffness * dt);
    const curDist = this.camera.position.distanceTo(this.controls.target);
    this.controls.target.lerp(pose.target, k);
    const dist = curDist + (pose.dist - curDist) * k;
    this.camera.position.copy(this.controls.target).addScaledVector(pose.dir, dist);
    this.camera.lookAt(this.controls.target);
  }

  currentPose() {
    const sph = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.controls.target));
    return { target: this.controls.target.clone(), dist: sph.radius, polar: sph.phi, azimuth: sph.theta };
  }

  overview(duration = 1.2) {
    return this.flyTo(this.overviewPose(), duration);
  }

  addShake(amount) {
    this.shake = Math.min(1, this.shake + amount);
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  clampTarget() {
    const t = this.controls.target;
    const hw = BOARD_W / 2;
    const hh = (this.BH || 24) / 2;
    t.x = Math.max(-hw, Math.min(hw, t.x));
    t.z = Math.max(-hh, Math.min(hh + 2, t.z));
    t.y = BOARD_Y;
  }

  render(dt, time) {
    if (this.uniforms) this.uniforms.uTime.value = time;
    if (!this.flying) {
      this.controls.update();
      this.clampTarget();
    }
    let shakeOffset = null;
    if (this.shake > 0.001) {
      const s = this.shake * this.shake * 0.35;
      shakeOffset = new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      this.camera.position.add(shakeOffset);
      this.shake *= Math.pow(0.02, dt);
    }
    this.renderer.render(this.scene, this.camera);
    if (shakeOffset) this.camera.position.sub(shakeOffset);
  }
}
