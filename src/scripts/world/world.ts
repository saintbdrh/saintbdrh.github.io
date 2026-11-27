/**
 * The single 3D world: a dark studio with the DOFBOT on its workspace mat,
 * a RealSense on a stand, coloured blocks and bins, and the project screens
 * floating in a ring. Scroll position drives one continuous camera path.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { Arm, HOME, blend, moveTime, toWorld, toThesis, type ArmPose } from './arm';
import { workspaceSection, solveHover, fk, EFFECTIVE_L45, NOMINAL_L45, pickAndPlace } from '../lab/ik';

const BG = new THREE.Color('#080A0C');
const ACCENT = new THREE.Color('#91B7C7');
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/* ------------------------------------------------------------------ shots */
interface Shot { target: THREE.Vector3; az: number; el: number; dist: number; fov: number; shiftX: number; shiftY: number; eye?: THREE.Vector3 }
const ROBOT = V(0.09, 0.16, 0);
const MAT_CENTER = V(0.15, 0.0, -0.02);

/* ------------------------------------------------------------------ task layout (thesis mm) */
const BLOCKS = [
  { id: 'amber', hue: 41, color: '#C9A46A', x: 168, y: -52 },
  { id: 'cyan', hue: 191, color: '#86AFBF', x: 182, y: 4 },
  { id: 'magenta', hue: 326, color: '#B98AA6', x: 165, y: 58 },
];
const BINS = [
  { id: 'amber', x: 70, y: 150 },
  { id: 'cyan', x: -5, y: 165 },
  { id: 'magenta', x: -80, y: 145 },
];
const BLOCK = 0.024;

export interface World { setActive(on: boolean): void; measure(): void; dispose(): void }

export function createWorld(opts: {
  canvas: HTMLCanvasElement;
  cssLayer: HTMLElement;
  overlay: SVGSVGElement;
  reduced: boolean;
  panels3d: boolean;
  scrollY: () => number;
  onReady: () => void;
  onFail: () => void;
}): World {
  const { canvas, overlay, reduced } = opts;
  const small = Math.min(innerWidth, innerHeight) < 700;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    opts.onFail();
    return { setActive() {}, measure() {}, dispose() {} };
  }
  let dpr = Math.min(devicePixelRatio || 1, small ? 1.5 : 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(BG, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = !small;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const css = new CSS3DRenderer({ element: opts.cssLayer });
  const scene = new THREE.Scene();
  const cssScene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.45;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 30);

  // ---------------------------------------------------------------- lights
  const key = new THREE.DirectionalLight(0xfff4ea, 2.4);
  key.position.set(0.7, 1.1, 0.6);
  key.target.position.set(0.1, 0.1, 0);
  key.castShadow = !small;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -0.5, right: 0.5, top: 0.5, bottom: -0.5, near: 0.2, far: 3 });
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.01;
  const rim = new THREE.SpotLight(0xcfe0ec, 6, 4, Math.PI / 5, 0.9, 1.4);
  rim.position.set(-0.8, 0.8, -0.7); rim.target.position.set(0.1, 0.15, 0);
  const fill = new THREE.HemisphereLight(0xdfe8ee, 0x080a0c, 0.55);
  scene.add(key, key.target, rim, rim.target, fill);
  const levels = [key.intensity, rim.intensity, fill.intensity];

  // ---------------------------------------------------------------- floor and workspace
  const floorMat = new THREE.ShaderMaterial({
    uniforms: { uBg: { value: BG.clone() }, uPool: { value: new THREE.Color('#171b20') }, uLight: { value: 0 } },
    vertexShader: 'varying vec2 v; void main(){ vec4 w = modelMatrix*vec4(position,1.); v = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform vec3 uBg; uniform vec3 uPool; uniform float uLight; varying vec2 v;
      void main(){ float d = length(v - vec2(0.08, 0.0)); float p = (1. - smoothstep(0.05, 1.4, d)) * uLight;
      gl_FragColor = vec4(mix(uBg, uPool, p), 1.);
      #include <colorspace_fragment>
      }`,
    toneMapped: false,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.2, 48), new THREE.ShadowMaterial({ opacity: 0.5 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.0012; shadow.receiveShadow = true;
  scene.add(shadow);

  const mat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.002, 0.42), new THREE.MeshStandardMaterial({ color: '#16191c', roughness: 0.8 }));
  mat.position.set(0.16, 0.001, 0);
  mat.receiveShadow = true;
  scene.add(mat);
  // AprilTag-style fiducials at the mat corners (stylised 6x6 bit patterns)
  const tagTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#e8e8e4'; g.fillRect(8, 8, 48, 48);
    g.fillStyle = '#000'; g.fillRect(14, 14, 36, 36);
    const bits = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0];
    g.fillStyle = '#e8e8e4';
    bits.forEach((b, i) => { if (b) g.fillRect(18 + (i % 4) * 7, 18 + Math.floor(i / 4) * 7, 7, 7); });
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const tagCorners = [[45, -190], [275, -190], [275, 190], [45, 190]].map(([x, y]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.03), new THREE.MeshBasicMaterial({ map: tagTex, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.copy(toWorld(x, y, 2.5));
    scene.add(m); return m;
  });

  // blocks and bins
  const blockGeo = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
  const blocks = BLOCKS.map((b) => {
    const m = new THREE.Mesh(blockGeo, new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.45, metalness: 0.0, transparent: true }));
    m.castShadow = !small;
    const home = toWorld(b.x, b.y, BLOCK * 500);
    m.position.copy(home);
    scene.add(m);
    return { ...b, mesh: m, home, held: false, sorted: false };
  });
  const binMat = new THREE.MeshStandardMaterial({ color: '#202428', roughness: 0.6, metalness: 0.2 });
  BINS.forEach((b) => {
    const g = new THREE.Group();
    const c = BLOCKS.find((k) => k.id === b.id)!.color;
    const w = 0.05, h = 0.03, t = 0.002;
    const wall = (sx: number, sz: number, px: number, pz: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), binMat); m.position.set(px, h / 2, pz); m.castShadow = !small; g.add(m);
    };
    wall(w, t, 0, w / 2); wall(w, t, 0, -w / 2); wall(t, w, w / 2, 0); wall(t, w, -w / 2, 0);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, t, w), new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
    base.position.y = t / 2; g.add(base);
    g.position.copy(toWorld(b.x, b.y, 0));
    scene.add(g);
  });

  // ---------------------------------------------------------------- lab overlays (target marker, workspace section)
  const target = new THREE.Mesh(new THREE.RingGeometry(0.008, 0.0095, 40), new THREE.MeshBasicMaterial({ color: ACCENT, side: THREE.DoubleSide, transparent: true, depthTest: false }));
  target.renderOrder = 20; target.visible = false; scene.add(target);
  const wsGeo = new THREE.BufferGeometry();
  const ws = new THREE.Points(wsGeo, new THREE.PointsMaterial({ color: ACCENT, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.25, depthWrite: false }));
  ws.visible = false; scene.add(ws);
  let wsKey = '';

  // ---------------------------------------------------------------- model
  let arm: Arm | null = null;
  let rsHead: THREE.Object3D | null = null;
  const draco = new DRACOLoader().setDecoderPath('/draco/');
  new GLTFLoader().setDRACOLoader(draco).load('/models/dofbot.glb', (gltf) => {
    const root = gltf.scene;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = !small; m.receiveShadow = !small; }
    });
    const rs = root.getObjectByName('RealSense');
    rsHead = root.getObjectByName('RealSenseHead') ?? null;
    if (rs) {
      // stand behind-left of the mat, head aimed at the workspace (thesis frame: x 20, y 230)
      rs.position.copy(toWorld(-20, 240, 0));
      rs.rotation.y = Math.atan2(-(MAT_CENTER.z - rs.position.z), MAT_CENTER.x - rs.position.x);
      if (rsHead) rsHead.rotation.z = -0.62;
    }
    scene.add(root);
    arm = new Arm(root);
    draco.dispose();
    measure();
    t0 = performance.now();
    opts.onReady();
    kick();
  }, undefined, () => opts.onFail());

  // ---------------------------------------------------------------- project screens (real DOM in 3D)
  const panelEls = Array.from(document.querySelectorAll<HTMLElement>('[data-panel]'));
  const panels: { id: string; obj: CSS3DObject | null; pos: THREE.Vector3; normal: THREE.Vector3; el: HTMLElement }[] = [];
  const RING_R = 0.95, RING_Y = 0.24;
  panelEls.forEach((el, i) => {
    const n = panelEls.length;
    const a = THREE.MathUtils.degToRad(-120 + (i * 240) / Math.max(1, n - 1)); // arc behind the robot
    const pos = V(Math.cos(a + Math.PI) * RING_R, RING_Y, Math.sin(a + Math.PI) * RING_R);
    const normal = V(-pos.x, 0, -pos.z).normalize(); // facing the robot
    let obj: CSS3DObject | null = null;
    if (opts.panels3d) {
      obj = new CSS3DObject(el);
      obj.position.copy(pos);
      obj.scale.setScalar(0.00062);
      obj.lookAt(pos.clone().add(normal));
      cssScene.add(obj);
    }
    panels.push({ id: el.id, obj, pos, normal, el });
  });

  function resolveShot(name: string): Shot {
    const base = { fov: 30, shiftX: 0, shiftY: 0 };
    switch (name) {
      case 'hero': return { ...base, target: V(0.1, 0.13, 0.02), az: 124, el: 14, dist: 0.78, shiftX: 0.2, shiftY: 0.04 };
      case 'vision': {
        const eye = rsHead ? rsHead.getWorldPosition(new THREE.Vector3()).add(V(0, 0.02, 0)) : V(-0.05, 0.39, -0.25);
        return { ...base, target: MAT_CENTER.clone(), az: 0, el: 0, dist: 0, fov: 42, eye };
      }
      case 'kinematics': return { ...base, target: V(0.08, 0.2, 0), az: 8, el: 6, dist: 1.0, shiftX: -0.2 };
      case 'lab': return { ...base, target: V(0.12, 0.15, 0), az: 30, el: 24, dist: 1.0, shiftX: -0.22 };
      case 'overview': return { ...base, target: V(0.05, 0.12, 0), az: 200, el: 40, dist: 2.4, fov: 34 };
      case 'contact': return { ...base, target: V(0.08, 0.17, 0), az: 150, el: 9, dist: 1.05, shiftX: 0.22 };
      default: {
        if (name.startsWith('panel:')) {
          const p = panels.find((x) => x.id === name.slice(6));
          if (p) {
            // stand between the robot and the screen, looking out at it
            const az = THREE.MathUtils.radToDeg(Math.atan2(p.normal.x, p.normal.z));
            return { ...base, target: p.pos.clone(), az, el: 3, dist: 0.8, fov: 38 };
          }
        }
        return resolveShot('hero');
      }
    }
  }

  // ---------------------------------------------------------------- beats
  interface Beat { y: number; shot: string; el: HTMLElement }
  let beats: Beat[] = [];
  function measure() {
    const sy = opts.scrollY();
    beats = Array.from(document.querySelectorAll<HTMLElement>('[data-shot]'))
      .map((el) => {
        const r = el.getBoundingClientRect();
        const c = el.dataset.focus === 'top' ? r.top + Math.min(r.height, innerHeight) / 2 : r.top + r.height / 2;
        return { y: c + sy - innerHeight / 2, shot: el.dataset.shot!, el };
      })
      .sort((a, b) => a.y - b.y);
    if (beats.length) beats[0].y = Math.min(beats[0].y, 0);
    resize();
  }

  // spherical camera state
  const sph = (s: Shot) => {
    if (s.eye) {
      const off = s.eye.clone().sub(s.target);
      return { t: s.target.clone(), r: off.length(), th: Math.atan2(off.x, off.z), ph: Math.acos(off.y / off.length()), fov: s.fov, sx: s.shiftX, sy: s.shiftY };
    }
    const az = THREE.MathUtils.degToRad(s.az), el = THREE.MathUtils.degToRad(s.el);
    return { t: s.target.clone(), r: s.dist, th: az, ph: Math.PI / 2 - el, fov: s.fov, sx: s.shiftX, sy: s.shiftY };
  };
  type S = ReturnType<typeof sph>;
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const smoother = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * t * (t * (t * 6 - 15) + 10); };
  function mixS(a: S, b: S, t: number): S {
    return {
      t: a.t.clone().lerp(b.t, t), r: a.r + (b.r - a.r) * t, th: a.th + wrap(b.th - a.th) * t, ph: a.ph + (b.ph - a.ph) * t,
      fov: a.fov + (b.fov - a.fov) * t, sx: a.sx + (b.sx - a.sx) * t, sy: a.sy + (b.sy - a.sy) * t,
    };
  }
  function goalAt(y: number): { s: S; beat: Beat | null; w: Map<string, number> } {
    const w = new Map<string, number>();
    if (!beats.length) return { s: sph(resolveShot('hero')), beat: null, w };
    let i = beats.findIndex((b) => b.y > y);
    if (i === -1) { const b = beats[beats.length - 1]; w.set(b.shot, 1); return { s: sph(resolveShot(b.shot)), beat: b, w }; }
    if (i === 0) { const b = beats[0]; w.set(b.shot, 1); return { s: sph(resolveShot(b.shot)), beat: b, w }; }
    const a = beats[i - 1], b = beats[i];
    const t = smoother((y - a.y) / Math.max(1, b.y - a.y));
    w.set(a.shot, (w.get(a.shot) ?? 0) + 1 - t);
    w.set(b.shot, (w.get(b.shot) ?? 0) + t);
    return { s: mixS(sph(resolveShot(a.shot)), sph(resolveShot(b.shot)), t), beat: t < 0.5 ? a : b, w };
  }

  // ---------------------------------------------------------------- task: sort blocks by hue (thesis method, live IK)
  type Step = { to: ArmPose; label: string; then?: () => void };
  let queue: Step[] = [];
  let seg: { from: ArmPose; to: ArmPose; t0: number; dur: number; step: Step } | null = null;
  let heldBlock: (typeof blocks)[number] | null = null;
  const heldLocal = new THREE.Matrix4();
  let taskLabel = 'Idle';

  function ik(x: number, y: number, z: number, grip: number, roll = 0): ArmPose | null {
    const s = arm!.solve(x, y, z, -70);
    if (!s.ok || !s.joints) return null;
    return { ...s.joints, roll, grip };
  }
  function planSort() {
    queue = [];
    for (const b of blocks) {
      if (b.sorted) continue;
      const bin = BINS.find((k) => k.id === b.id)!;
      const roll = -BLOCKS.find((k) => k.id === b.id)!.y * 0.15;
      const steps: [number, number, number, number, string, (() => void)?][] = [
        [b.x, b.y, 70, 0, 'Approach'],
        [b.x, b.y, 28, 0, 'Descend'],
        [b.x, b.y, 28, 1, 'Grasp', () => attach(b)],
        [b.x, b.y, 85, 1, 'Lift'],
        [bin.x, bin.y, 80, 1, 'Transfer'],
        [bin.x, bin.y, 55, 1, 'Lower'],
        [bin.x, bin.y, 55, 0, 'Release', () => release(b, bin)],
        [bin.x, bin.y, 85, 0, 'Retract'],
      ];
      for (const [x, y, z, g, label, then] of steps) {
        const p = ik(x, y, z, g, roll);
        if (p) queue.push({ to: p, label, then });
      }
    }
    queue.push({ to: { ...HOME }, label: 'Home', then: () => { resetAt = performance.now() + 1800; } });
  }
  let resetAt = 0;
  function attach(b: (typeof blocks)[number]) {
    heldBlock = b; b.held = true;
    arm!.tcp.updateWorldMatrix(true, false);
    heldLocal.copy(arm!.tcp.matrixWorld).invert().multiply(b.mesh.matrixWorld);
  }
  function release(b: (typeof blocks)[number], bin: (typeof BINS)[number]) {
    heldBlock = null; b.held = false; b.sorted = true;
    b.mesh.position.copy(toWorld(bin.x, bin.y, BLOCK * 500 + 2));
    b.mesh.quaternion.identity();
  }
  function resetBlocks() {
    blocks.forEach((b) => { b.sorted = false; b.held = false; b.mesh.position.copy(b.home); b.mesh.quaternion.identity(); (b.mesh.material as THREE.MeshStandardMaterial).opacity = 0; });
    fadeIn = performance.now();
  }
  let fadeIn = 0;

  // ---------------------------------------------------------------- lab mode (manual IK)
  const lab = {
    on: false, goal: null as ArmPose | null, effective: false,
    seq: null as null | { i: number; t: number; steps: ReturnType<typeof pickAndPlace> },
  };
  const labApi = {
    setTarget(x: number, y: number, z: number, pitch: number) {
      const L45 = lab.effective ? EFFECTIVE_L45 : NOMINAL_L45;
      const s = solveHover(x, y, z, pitch, L45);
      target.position.copy(toWorld(x, y, z));
      target.lookAt(camera.position);
      updateWorkspace(s.ok ? s.pitch : pitch, L45);
      if (s.ok && s.joints) lab.goal = { ...s.joints, roll: 0, grip: 0 };
      return s;
    },
    setJoints(q1: number, q2: number, q3: number, q4: number) {
      lab.goal = { q1, q2, q3, q4, roll: 0, grip: 0 };
      const L45 = lab.effective ? EFFECTIVE_L45 : NOMINAL_L45;
      const p = fk({ q1, q2, q3, q4 }, L45);
      target.position.copy(toWorld(p.x, p.y, p.z));
      updateWorkspace(p.pitch, L45);
      return p;
    },
    setEffective(on: boolean) { lab.effective = on; },
    runSequence(onStep: (label: string, ok: boolean) => void) {
      lab.effective = true;
      lab.seq = { i: -1, t: performance.now(), steps: pickAndPlace(150, 50) };
      (lab as unknown as { onStep: typeof onStep }).onStep = onStep;
    },
    pose: () => arm?.pose ?? HOME,
  };
  (window as unknown as { __labApi?: typeof labApi }).__labApi = labApi;
  document.dispatchEvent(new CustomEvent('lab-ready', { detail: labApi }));
  function updateWorkspace(pitch: number, L45: number) {
    const k = `${Math.round(pitch)}|${L45}`;
    if (k === wsKey) return;
    wsKey = k;
    const pts = workspaceSection(Math.round(pitch), L45, 4);
    const arr = new Float32Array(pts.length * 3);
    pts.forEach((p, i) => { arr[i * 3] = p.r / 1000; arr[i * 3 + 1] = p.z / 1000; arr[i * 3 + 2] = 0; });
    wsGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    wsGeo.computeBoundingSphere();
  }

  // ---------------------------------------------------------------- input
  const pointer = new THREE.Vector2(), pointerS = new THREE.Vector2();
  addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { pointer.set(e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1); kick(); } }, { passive: true });

  // ---------------------------------------------------------------- sizing
  let W = 0, H = 0;
  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    if (w === W && h === H) return;
    W = w; H = h;
    renderer.setSize(W, H, false);
    css.setSize(W, H);
    camera.aspect = W / H;
    overlay.setAttribute('viewBox', `0 0 ${W} ${H}`);
    kick();
  }
  new ResizeObserver(resize).observe(canvas);

  // ---------------------------------------------------------------- frame
  let active = true, raf = 0, last = performance.now(), t0 = 0, frameAvg = 16, slow = 0;
  const cur = { s: null as S | null };
  const tmp = new THREE.Vector3(), proj = new THREE.Vector3();
  function kick() { if (!raf && active) raf = requestAnimationFrame(frame); }

  function frame(now: number) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!arm) return;
    frameAvg = frameAvg * 0.94 + dt * 1000 * 0.06;
    if (frameAvg > 24 && dpr > 1) { slow += dt; if (slow > 1.5) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); slow = 0; } } else slow = 0;

    const { s: goal, beat, w } = goalAt(opts.scrollY());
    const labW = w.get('lab') ?? 0;
    lab.on = labW > 0.5;

    // intro: light rises, camera settles
    const ti = reduced ? 1 : Math.min(1, (now - t0) / 2800);
    const e = 1 - Math.pow(1 - ti, 4);
    key.intensity = levels[0] * e; rim.intensity = levels[1] * e; fill.intensity = levels[2] * e;
    floorMat.uniforms.uLight.value = e;

    // ---- arm
    if (lab.on) {
      if (heldBlock) { release(heldBlock, BINS.find((k) => k.id === heldBlock!.id)!); }
      queue = []; seg = null;
      if (lab.seq) {
        const i = Math.floor((now - lab.seq.t) / (reduced ? 500 : 1500));
        if (i >= lab.seq.steps.length) { lab.seq = null; (lab as unknown as { onStep?: (l: string, ok: boolean) => void }).onStep?.('Sequence complete', true); }
        else if (i !== lab.seq.i) {
          lab.seq.i = i;
          const wp = lab.seq.steps[i];
          const s = solveHover(wp.x, wp.y, wp.z, wp.pitch, EFFECTIVE_L45);
          if (s.ok && s.joints) lab.goal = { ...s.joints, roll: 0, grip: wp.grip ? 0 : 1 };
          target.position.copy(toWorld(wp.x, wp.y, wp.z));
          (lab as unknown as { onStep?: (l: string, ok: boolean) => void }).onStep?.(`${wp.label}: (${wp.x}, ${wp.y}, ${wp.z}) mm, pitch ${wp.pitch}°`, s.ok);
        }
      }
      if (lab.goal) {
        // exponential approach in joint space (servo-like settle)
        const k = reduced ? 1 : 1 - Math.exp(-dt * 5);
        const g = lab.goal, p = arm.pose;
        arm.apply({
          q1: p.q1 + (g.q1 - p.q1) * k, q2: p.q2 + (g.q2 - p.q2) * k, q3: p.q3 + (g.q3 - p.q3) * k,
          q4: p.q4 + (g.q4 - p.q4) * k, roll: p.roll + (g.roll - p.roll) * k, grip: p.grip + (g.grip - p.grip) * k,
        });
      }
      target.visible = true; ws.visible = true;
      ws.rotation.y = THREE.MathUtils.degToRad(arm.pose.q1);
    } else {
      target.visible = false; ws.visible = false; lab.goal = null;
      if (!reduced) {
        if (resetAt && now > resetAt) { resetAt = 0; resetBlocks(); }
        if (!seg && !queue.length && !resetAt && blocks.some((b) => !b.sorted)) planSort();
        if (!seg && queue.length) {
          const step = queue.shift()!;
          seg = { from: { ...arm.pose }, to: step.to, t0: now, dur: moveTime(arm.pose, step.to), step };
          taskLabel = step.label;
        }
        if (seg) {
          const t = (now - seg.t0) / seg.dur;
          arm.apply(blend(seg.from, seg.to, t));
          if (t >= 1) { seg.step.then?.(); seg = null; }
        }
      }
    }
    if (fadeIn) {
      const f = Math.min(1, (now - fadeIn) / 700);
      blocks.forEach((b) => { (b.mesh.material as THREE.MeshStandardMaterial).opacity = f; });
      if (f >= 1) fadeIn = 0;
    }
    if (heldBlock) {
      arm.tcp.updateWorldMatrix(true, false);
      tmp.set(0, 0, 0);
      const m = new THREE.Matrix4().multiplyMatrices(arm.tcp.matrixWorld, heldLocal);
      m.decompose(heldBlock.mesh.position, heldBlock.mesh.quaternion, tmp);
    }

    // ---- camera (damped in spherical coordinates around the target)
    pointerS.lerp(pointer, 1 - Math.exp(-dt * 3));
    if (!cur.s) cur.s = goal;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 3.2);
    cur.s = mixS(cur.s, goal, k);
    const c = cur.s;
    const heroish = (w.get('hero') ?? 0) + (w.get('contact') ?? 0);
    const th = c.th + (reduced ? 0 : -pointerS.x * 0.06 * heroish) + (1 - e) * 0.4;
    const ph = c.ph + (reduced ? 0 : pointerS.y * 0.03 * heroish);
    const r = c.r * (1 + (1 - e) * 0.5);
    camera.position.set(c.t.x + r * Math.sin(ph) * Math.sin(th), c.t.y + r * Math.cos(ph), c.t.z + r * Math.sin(ph) * Math.cos(th));
    camera.lookAt(c.t);
    camera.fov = c.fov;
    camera.setViewOffset(W, H, -c.sx * W, c.sy * H, W, H);
    camera.updateProjectionMatrix();

    // ---- screens: only the focused screen is fully present
    let inWork = 0;
    w.forEach((v, k) => { if (k.startsWith('panel:')) inWork += v; });
    panels.forEach((p) => {
      if (!p.obj) return;
      const wt = w.get(`panel:${p.id}`) ?? 0;
      const facing = camera.position.clone().sub(p.pos).normalize().dot(p.normal) > 0.2;
      const op = facing ? Math.min(1, 0.14 * inWork + Math.max(0, (wt - 0.15) / 0.85)) : 0;
      p.el.style.opacity = op.toFixed(3);
      p.el.style.pointerEvents = wt > 0.6 ? 'auto' : 'none';
      p.el.toggleAttribute('inert', wt < 0.6);
    });

    renderer.render(scene, camera);
    css.render(cssScene, camera);
    drawOverlay(w, beat);

    if (active) kick();
  }

  // ---------------------------------------------------------------- overlay: what the RealSense "sees", live joint readout
  const det = Array.from(overlay.querySelectorAll<SVGGElement>('.det'));
  const tags = Array.from(overlay.querySelectorAll<SVGRectElement>('.tag'));
  const readout = document.querySelectorAll<HTMLElement>('[data-live]');
  let readTick = 0;
  function toScreen(v: THREE.Vector3) { proj.copy(v).project(camera); return { x: (proj.x * 0.5 + 0.5) * W, y: (-proj.y * 0.5 + 0.5) * H }; }
  function drawOverlay(w: Map<string, number>, _beat: unknown) {
    const vis = w.get('vision') ?? 0;
    overlay.style.setProperty('--vision', vis.toFixed(3));
    if (vis > 0.01) {
      blocks.forEach((b, i) => {
        const g = det[i]; if (!g) return;
        const box = new THREE.Box3().setFromObject(b.mesh);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const cx of [box.min.x, box.max.x]) for (const cy of [box.min.y, box.max.y]) for (const cz of [box.min.z, box.max.z]) {
          const p = toScreen(tmp.set(cx, cy, cz)); x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
        }
        const pad = 6;
        const rect = g.querySelector('rect')!;
        rect.setAttribute('x', String(x0 - pad)); rect.setAttribute('y', String(y0 - pad));
        rect.setAttribute('width', String(x1 - x0 + 2 * pad)); rect.setAttribute('height', String(y1 - y0 + 2 * pad));
        const t = toThesis(b.mesh.position);
        const label = g.querySelector('text')!;
        label.setAttribute('x', String(x0 - pad)); label.setAttribute('y', String(y0 - pad - 6));
        label.textContent = `H ${b.hue}°  ${t.x.toFixed(0)}, ${t.y.toFixed(0)} mm`;
      });
      tags.forEach((r, i) => {
        const p = toScreen(tagCorners[i].position);
        r.setAttribute('x', String(p.x - 9)); r.setAttribute('y', String(p.y - 9));
      });
    }
    const now = performance.now();
    if (arm && now - readTick > 100) {
      readTick = now;
      const p = arm.pose;
      const tool = fk(p, NOMINAL_L45);
      const vals: Record<string, string> = {
        q1: p.q1.toFixed(1) + '°', q2: p.q2.toFixed(1) + '°', q3: p.q3.toFixed(1) + '°', q4: p.q4.toFixed(1) + '°',
        x: tool.x.toFixed(1) + ' mm', y: tool.y.toFixed(1) + ' mm', z: tool.z.toFixed(1) + ' mm', task: taskLabel,
      };
      readout.forEach((el) => { const v = vals[el.dataset.live!]; if (v !== undefined) el.textContent = v.replace('-', '−'); });
    }
  }

  function setActive(on: boolean) {
    if (on === active) return;
    active = on;
    if (on) { last = performance.now(); kick(); } else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  function dispose() {
    setActive(false);
    scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mt = m.material as THREE.Material | undefined; mt?.dispose?.(); });
    env.dispose(); pmrem.dispose(); renderer.dispose();
  }
  addEventListener('resize', () => { measure(); kick(); });
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__world = { scene, camera, THREE, get arm() { return arm; } };
  return { setActive, measure, dispose };
}
