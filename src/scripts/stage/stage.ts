/**
 * The fixed WebGL stage behind the film: studio, robot, scroll-driven camera,
 * annotations. Presentation only; all choreography data lives in choreography.ts.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SHOTS, adapt, mix, smoother, type Shot } from './choreography';

const JOINTS = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'] as const;
const AXES = [
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0),
];
const BG = new THREE.Color('#080A0C');
const ACCENT = new THREE.Color('#91B7C7');

interface Beat { y: number; shot: string; el: HTMLElement }

export interface Stage {
  ready: Promise<void>;
  setActive(on: boolean): void;
  measure(): void;
  dispose(): void;
}

export function createStage(opts: {
  canvas: HTMLCanvasElement;
  overlay: SVGSVGElement;
  telemetry: HTMLElement | null;
  reduced: boolean;
  scrollY: () => number;
  onReady: () => void;
  onFail: () => void;
}): Stage {
  const { canvas, overlay, reduced } = opts;
  const small = Math.min(innerWidth, innerHeight) < 700;

  // ------------------------------------------------------------ renderer
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
  } catch {
    opts.onFail();
    return { ready: Promise.reject(new Error('webgl')), setActive() {}, measure() {}, dispose() {} };
  }
  const maxDpr = small ? 1.5 : 1.75;
  let dpr = Math.min(devicePixelRatio || 1, maxDpr);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(BG, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !small;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.4;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 40);

  // ------------------------------------------------------------ lights (studio)
  const key = new THREE.DirectionalLight(0xfff6ec, 2.6);
  key.position.set(2.4, 3.4, -2.0);
  key.castShadow = !small;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -1.4; key.shadow.camera.right = 1.4;
  key.shadow.camera.top = 1.8; key.shadow.camera.bottom = -0.6;
  key.shadow.camera.near = 1; key.shadow.camera.far = 9;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  key.shadow.radius = 6;
  key.target.position.set(0.3, 0.6, 0);
  scene.add(key, key.target);

  const rim = new THREE.SpotLight(0xc8dceb, 22, 9, Math.PI / 5, 0.9, 1.6);
  rim.position.set(-2.2, 2.6, 2.0);
  rim.target.position.set(0.4, 0.9, 0);
  scene.add(rim, rim.target);

  const rim2 = new THREE.SpotLight(0xdbe8f2, 10, 9, Math.PI / 6, 0.95, 1.6);
  rim2.position.set(-1.8, 1.4, -2.6);
  rim2.target.position.set(0.3, 0.8, 0);
  scene.add(rim2, rim2.target);

  const fill = new THREE.HemisphereLight(0xdfe8ee, 0x080a0c, 0.5);
  scene.add(fill);
  const lightLevels = [key.intensity, rim.intensity, rim2.intensity, fill.intensity];

  // ------------------------------------------------------------ floor: a pool of light fading into the page colour
  const floorMat = new THREE.ShaderMaterial({
    uniforms: {
      uBg: { value: BG.clone() },
      uPool: { value: new THREE.Color('#15191d') },
      uCenter: { value: new THREE.Vector2(0.35, 0.0) },
      uLight: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vXZ;
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vXZ = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uBg; uniform vec3 uPool; uniform vec2 uCenter; uniform float uLight;
      varying vec2 vXZ;
      void main(){
        float d = length(vXZ - uCenter);
        float pool = (1.0 - smoothstep(0.15, 2.4, d)) * uLight;
        gl_FragColor = vec4(mix(uBg, uPool, pool), 1.0);
        #include <colorspace_fragment>
      }`,
    toneMapped: false,
    depthWrite: true,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 72), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const shadowMat = new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.55 });
  const shadowPlane = new THREE.Mesh(new THREE.CircleGeometry(3, 48), shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.001;
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);

  // ------------------------------------------------------------ robot
  const joints: THREE.Object3D[] = [];
  const exploders: { o: THREE.Object3D; rest: THREE.Vector3; e: THREE.Vector3 }[] = [];
  const anchors = new Map<string, THREE.Object3D>();
  const fingers: THREE.Object3D[] = [];
  let model: THREE.Object3D | null = null;
  let mixer: THREE.AnimationMixer | null = null;
  const axisLines = new THREE.Group();
  scene.add(axisLines);

  const draco = new DRACOLoader().setDecoderPath('/draco/');
  const loader = new GLTFLoader().setDRACOLoader(draco);

  let resolveReady!: () => void;
  let rejectReady!: (e: unknown) => void;
  const ready = new Promise<void>((res, rej) => { resolveReady = res; rejectReady = rej; });

  loader.load(
    '/models/robot.glb',
    (gltf) => {
      const root = gltf.scene;
      model = root;
      if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__stage = { root, camera, THREE };
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = !small;
          m.receiveShadow = false;
          const mat = m.material as THREE.MeshStandardMaterial;
          mat.envMapIntensity = 1;
        }
        const ex = o.userData.explode as number[] | undefined;
        if (ex) exploders.push({ o, rest: o.position.clone(), e: new THREE.Vector3(ex[0], ex[1], ex[2]) });
        if (o.name.startsWith('A_')) anchors.set(o.name, o);
        if (o.name === 'FingerL' || o.name === 'FingerR') fingers.push(o);
      });
      for (const n of JOINTS) {
        const j = root.getObjectByName(n);
        if (!j) throw new Error(`missing ${n}`);
        joints.push(j);
      }
      // joint-axis overlay (Scene 03)
      const lineMat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0, depthTest: false });
      joints.forEach((j, i) => {
        const a = AXES[i].clone().multiplyScalar(0.32);
        const g = new THREE.BufferGeometry().setFromPoints([a.clone().negate(), a]);
        const line = new THREE.Line(g, lineMat);
        line.renderOrder = 10;
        j.add(line);
        axisLines.userData[`L${i}`] = line;
      });
      axisLines.userData.mat = lineMat;
      if (gltf.animations.length) {
        mixer = new THREE.AnimationMixer(root);
        mixer.clipAction(gltf.animations[0]).play();
      }
      scene.add(root);
      draco.dispose();
      measure();
      intro0 = performance.now();
      resolveReady();
      opts.onReady();
      requestFrame();
    },
    undefined,
    (err) => { opts.onFail(); rejectReady(err); },
  );

  // ------------------------------------------------------------ beats
  let beats: Beat[] = [];
  function measure() {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-shot]'));
    const sy = opts.scrollY();
    beats = els
      .map((el) => {
        const r = el.getBoundingClientRect();
        const focus = el.dataset.focus === 'top' ? r.top + Math.min(r.height, innerHeight) * 0.5 : r.top + r.height / 2;
        return { y: focus + sy - innerHeight / 2, shot: el.dataset.shot!, el };
      })
      .filter((b) => SHOTS[b.shot])
      .sort((a, b) => a.y - b.y);
    if (beats.length) beats[0].y = Math.min(beats[0].y, 0);
    resize();
  }

  // Anchor-relative shots: aim at a named part, orbit at (azimuth, elevation, distance).
  const fp = new THREE.Vector3();
  const focusCache = new Map<string, THREE.Object3D | null>();
  function R(s: Shot): Shot {
    if (!s.focus || !s.orbit || !model) return s;
    if (!focusCache.has(s.focus)) focusCache.set(s.focus, model.getObjectByName(s.focus) ?? null);
    const o = focusCache.get(s.focus);
    if (!o) return s;
    o.getWorldPosition(fp);
    const [az, el, d] = s.orbit;
    const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
    const off = s.focusOffset ?? [0, 0, 0];
    const t: [number, number, number] = [fp.x + off[0], fp.y + off[1], fp.z + off[2]];
    return { ...s, target: t, cam: [t[0] + Math.sin(a) * Math.cos(e) * d, t[1] + Math.sin(e) * d, t[2] + Math.cos(a) * Math.cos(e) * d] };
  }

  function shotAt(y: number): { shot: Shot; active: Beat | null; t: number } {
    if (!beats.length) return { shot: SHOTS.hero, active: null, t: 0 };
    if (y <= beats[0].y) return { shot: R(SHOTS[beats[0].shot]), active: beats[0], t: 0 };
    for (let i = 0; i < beats.length - 1; i++) {
      const a = beats[i], b = beats[i + 1];
      if (y <= b.y) {
        const t = (y - a.y) / Math.max(1, b.y - a.y);
        const near = t < 0.5 ? a : b;
        return { shot: mix(R(SHOTS[a.shot]), R(SHOTS[b.shot]), smoother(t)), active: near, t: Math.abs(t - (t < 0.5 ? 0 : 1)) };
      }
    }
    const last = beats[beats.length - 1];
    return { shot: R(SHOTS[last.shot]), active: last, t: 0 };
  }

  // ------------------------------------------------------------ input
  const pointer = new THREE.Vector2(), pointerS = new THREE.Vector2();
  const drag = { x: 0, s: 0, active: false, start: 0, base: 0 };
  function onPointer(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return;
    pointer.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
  }
  addEventListener('pointermove', (e) => { onPointer(e); requestFrame(); }, { passive: true });
  const hero = document.getElementById('top');
  const onDown = (e: PointerEvent) => { if (e.pointerType === 'mouse') return; drag.active = true; drag.start = e.clientX; drag.base = drag.x; };
  const onMove = (e: PointerEvent) => { if (!drag.active) return; drag.x = Math.max(-1, Math.min(1, drag.base + (e.clientX - drag.start) / (innerWidth * 0.6))); };
  const onUp = () => { drag.active = false; };
  hero?.addEventListener('pointerdown', onDown, { passive: true });
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerup', onUp, { passive: true });
  addEventListener('pointercancel', onUp, { passive: true });

  // ------------------------------------------------------------ sizing
  let W = 0, H = 0;
  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    if (w === W && h === H) return;
    W = w; H = h;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    overlay.setAttribute('viewBox', `0 0 ${W} ${H}`);
    requestFrame();
  }
  const ro = new ResizeObserver(() => { resize(); });
  ro.observe(canvas);

  // ------------------------------------------------------------ frame
  let active = true, raf = 0, last = performance.now(), intro0 = 0;
  let frameAvg = 16, slowFor = 0;
  const cur = { sph: new THREE.Spherical(), target: new THREE.Vector3(), init: false };
  const goalSph = new THREE.Spherical();
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion();
  const sph = new THREE.Spherical(), off = new THREE.Vector3(), tmp = new THREE.Vector3();
  let telemetryTick = 0;

  function requestFrame() { if (!raf && active) raf = requestAnimationFrame(frame); }

  function frame(now: number) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!joints.length) return;

    // adaptive resolution: step the pixel ratio down if frames run long
    frameAvg = frameAvg * 0.94 + (dt * 1000) * 0.06;
    if (frameAvg > 24 && dpr > 1) { slowFor += dt; if (slowFor > 1.5) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); slowFor = 0; } }
    else slowFor = 0;

    const y = opts.scrollY();
    const { shot: raw, active: beat } = shotAt(y);
    const shot = adapt(raw, W / H);

    // intro: lights rise, camera settles (exponential ease-out)
    const ti = reduced ? 1 : Math.min(1, (now - intro0) / 3200);
    const ease = 1 - Math.pow(1 - ti, 4);
    const light = reduced ? 1 : 1 - Math.pow(1 - Math.min(1, (now - intro0) / 2400), 3);
    key.intensity = lightLevels[0] * light;
    rim.intensity = lightLevels[1] * light;
    rim2.intensity = lightLevels[2] * light;
    fill.intensity = lightLevels[3] * light;
    floorMat.uniforms.uLight.value = light;

    // animation clip, then blend toward the scroll pose
    for (const x of exploders) x.o.position.copy(x.rest);
    mixer?.update(reduced ? 0 : dt);
    pointerS.lerp(pointer, 1 - Math.exp(-dt * 3));
    drag.s += (drag.x - drag.s) * (1 - Math.exp(-dt * 4));
    if (!drag.active) drag.x *= Math.exp(-dt * 2);
    const heroW = reduced ? 0 : shot.clip;
    joints.forEach((j, i) => {
      // qa: baked clip pose, plus a small reaction to the visitor's pointer
      // (base yaw and wrist pitch turn the wrist camera toward the cursor)
      qa.copy(j.quaternion);
      const react = i === 0 ? -pointerS.x * 7 : i === 4 ? pointerS.y * 6 : 0;
      if (react) qa.multiply(qc.setFromAxisAngle(AXES[i], THREE.MathUtils.degToRad(react)));
      // qb: the scroll pose
      qb.setFromAxisAngle(AXES[i], THREE.MathUtils.degToRad(shot.joints[i]));
      j.quaternion.copy(heroW >= 0.999 ? qa : heroW <= 0.001 ? qb : qa.slerp(qb, 1 - heroW));
    });
    if (shot.clip < 1) {
      for (const f of fingers) {
        const side = f.name === 'FingerL' ? 1 : -1;
        const target = 0.026 * side - 0.008 * side * shot.grip;
        f.position.z = THREE.MathUtils.lerp(f.position.z, -target, 1 - shot.clip);
      }
    }
    for (const x of exploders) x.o.position.addScaledVector(x.e, shot.explode);

    // camera: damped toward the shot, plus parallax and touch orbit
    const k = reduced || !cur.init ? 1 : 1 - Math.exp(-dt * 3.2);
    // damp in spherical coordinates about the target, so large moves orbit the
    // robot instead of cutting through it
    tmp.set(...shot.target);
    off.set(...shot.cam).sub(tmp);
    goalSph.setFromVector3(off);
    if (!cur.init) { cur.target.copy(tmp); cur.sph.copy(goalSph); cur.init = true; }
    cur.target.lerp(tmp, k);
    let dTheta = goalSph.theta - cur.sph.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
    cur.sph.theta += dTheta * k;
    cur.sph.phi += (goalSph.phi - cur.sph.phi) * k;
    cur.sph.radius += (goalSph.radius - cur.sph.radius) * k;
    sph.copy(cur.sph);
    sph.radius *= 1 + (1 - ease) * 0.45;
    sph.theta += (1 - ease) * 0.35;
    if (!reduced) {
      sph.theta += -pointerS.x * 0.07 + drag.s * 0.45;
      sph.phi = THREE.MathUtils.clamp(sph.phi + pointerS.y * 0.035, 0.35, 1.52);
    }
    off.setFromSpherical(sph);
    camera.position.copy(cur.target).add(off);
    camera.lookAt(cur.target);
    camera.fov = shot.fov;
    const fw = W, fh = H;
    camera.setViewOffset(fw, fh, -shot.shiftX * fw, shot.shiftY * fh, fw, fh);
    camera.updateProjectionMatrix();

    // joint-axis overlay
    const lm = axisLines.userData.mat as THREE.LineBasicMaterial | undefined;
    if (lm) lm.opacity = shot.axes * 0.85;

    renderer.render(scene, camera);
    drawOverlay(beat, shot);

    if (opts.telemetry && now - telemetryTick > 120) {
      telemetryTick = now;
      const out = joints.map((j, i) => {
        const a = AXES[i];
        const s2 = j.quaternion.x * a.x + j.quaternion.y * a.y + j.quaternion.z * a.z;
        const ang = THREE.MathUtils.radToDeg(2 * Math.atan2(s2, j.quaternion.w));
        return `${(ang < -0.05 ? '−' : '') + Math.abs(ang).toFixed(1)}°`;
      });
      opts.telemetry.querySelectorAll('[data-j]').forEach((el, i) => { el.textContent = out[i]; });
    }

    const settling = !reduced && (ti < 1 || light < 1);
    const moving = Math.abs(goalSph.radius - cur.sph.radius) + Math.abs(goalSph.phi - cur.sph.phi) > 1e-4 ||
      cur.target.distanceToSquared(tmp.set(...shot.target)) > 1e-7 ||
      pointerS.distanceToSquared(pointer) > 1e-6 || Math.abs(drag.s) > 1e-4;
    if (active && (heroW > 0.001 || settling || moving)) requestFrame();
  }

  // ------------------------------------------------------------ annotations (SVG overlay)
  const proj = new THREE.Vector3();
  function toScreen(o: THREE.Object3D) {
    o.getWorldPosition(proj).project(camera);
    return { x: (proj.x * 0.5 + 0.5) * W, y: (-proj.y * 0.5 + 0.5) * H, vis: proj.z < 1 };
  }
  const ring = overlay.querySelector<SVGCircleElement>('.ann-ring')!;
  const leader = overlay.querySelector<SVGPathElement>('.ann-line')!;
  const label = overlay.querySelector<SVGTextElement>('.ann-label')!;
  const axisLabels = Array.from(overlay.querySelectorAll<SVGTextElement>('.ann-axis'));
  let lastLabel = '';
  function drawOverlay(beat: Beat | null, shot: Shot) {
    const el = beat?.el;
    const anchorName = el?.dataset.anchor;
    let op = 0;
    if (el && anchorName && anchors.has(anchorName)) {
      const r = el.getBoundingClientRect();
      const c = r.top + r.height / 2;
      op = Math.max(0, 1 - Math.abs(c - H / 2) / (H * 0.42));
      const p = toScreen(anchors.get(anchorName)!);
      const textEl = el.querySelector<HTMLElement>('[data-ann-from]');
      const tr = textEl?.getBoundingClientRect();
      const fromX = tr ? tr.right + 28 : W * 0.4;
      const fromY = tr ? tr.top + tr.height / 2 : H / 2;
      const midX = Math.max(fromX + 24, p.x - 60);
      leader.setAttribute('d', `M${fromX} ${fromY}H${midX}L${p.x} ${p.y}`);
      ring.setAttribute('cx', String(p.x));
      ring.setAttribute('cy', String(p.y));
      const txt = el.dataset.part || '';
      if (txt !== lastLabel) { label.textContent = txt; lastLabel = txt; }
      label.setAttribute('x', String(p.x + 16));
      label.setAttribute('y', String(p.y - 14));
      if (W < 760) op = 0;
    }
    overlay.style.setProperty('--ann', op.toFixed(3));
    const ax = shot.axes;
    axisLabels.forEach((t, i) => {
      if (ax < 0.02 || !joints[i]) { t.style.opacity = '0'; return; }
      const line = axisLines.userData[`L${i}`] as THREE.Line;
      const end = new THREE.Vector3(...(AXES[i].toArray() as [number, number, number])).multiplyScalar(0.36);
      line.localToWorld(end);
      end.project(camera);
      t.setAttribute('x', String((end.x * 0.5 + 0.5) * W + 6));
      t.setAttribute('y', String((-end.y * 0.5 + 0.5) * H - 6));
      t.style.opacity = String(ax);
    });
  }

  function setActive(on: boolean) {
    if (on === active) return;
    active = on;
    if (on) { last = performance.now(); requestFrame(); }
    else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  function dispose() {
    setActive(false);
    ro.disconnect();
    removeEventListener('pointermove', onPointer);
    removeEventListener('pointermove', onMove);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
    });
    envTex.dispose(); pmrem.dispose(); renderer.dispose();
  }

  // keep rendering while scrolling even when nothing else moves
  addEventListener('scroll', () => requestFrame(), { passive: true });
  addEventListener('resize', () => { measure(); requestFrame(); });

  return { ready, setActive, measure, dispose };
}
