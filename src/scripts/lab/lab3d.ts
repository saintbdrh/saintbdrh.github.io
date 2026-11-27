/**
 * Engineering Lab: interactive view of the DOFBOT chain driven by ik.ts.
 * Control logic (ik.ts) is pure; this file only reads inputs and draws.
 * Thesis axes (x forward, y left, z up) map to three.js as (x, z, -y).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  fk, chain, solveOne, solveHover, pickAndPlace, workspaceSection,
  type Joints, type Solution, EFFECTIVE_L45,
} from './ik';

const S = 0.01; // 1 three unit = 100 mm
const W3 = (x: number, y: number, z: number) => new THREE.Vector3(x * S, z * S, -y * S);

export function createLab(root: HTMLElement, reduced: boolean) {
  const canvas = root.querySelector<HTMLCanvasElement>('#lab-canvas')!;
  const status = root.querySelector<HTMLElement>('#lab-status')!;
  const read = (k: string) => root.querySelector<HTMLElement>(`[data-r="${k}"]`)!;
  const ikIn = root.querySelector<HTMLFieldSetElement>('#lab-ik-inputs')!;
  const fkIn = root.querySelector<HTMLFieldSetElement>('#lab-fk-inputs')!;
  const wristSel = root.querySelector<HTMLSelectElement>('#lab-wrist')!;
  const wsBox = root.querySelector<HTMLInputElement>('#lab-ws')!;
  const frBox = root.querySelector<HTMLInputElement>('#lab-frames')!;
  const ghBox = root.querySelector<HTMLInputElement>('#lab-ghost')!;
  const runBtn = root.querySelector<HTMLButtonElement>('#lab-run')!;
  const resetBtn = root.querySelector<HTMLButtonElement>('#lab-reset')!;
  const val = (fs: HTMLElement, k: string) => Number(fs.querySelector<HTMLInputElement>(`[data-k="${k}"]`)!.value);
  const setVal = (fs: HTMLElement, k: string, v: number) => {
    const inp = fs.querySelector<HTMLInputElement>(`[data-k="${k}"]`)!;
    inp.value = String(Math.round(v));
    syncOut(inp);
  };
  function syncOut(inp: HTMLInputElement) {
    const out = inp.parentElement!.querySelector('output')!;
    const unit = out.dataset.unit || '';
    const v = Number(inp.value);
    out.textContent = `${v < 0 ? '−' : ''}${Math.abs(v)}${unit === '°' ? '°' : ' ' + unit}`;
  }

  // ------------------------------------------------------------ scene
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setClearColor(new THREE.Color('#0c0f11'), 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
  camera.position.set(3.3, 2.5, 3.6);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0.9, 0.95, 0);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = !reduced;
  controls.minPolarAngle = 0.2;
  controls.maxPolarAngle = 1.5;
  controls.touches = { ONE: null as unknown as THREE.TOUCH, TWO: THREE.TOUCH.ROTATE };

  const C = {
    text: new THREE.Color('#F2F2EF'), dim: new THREE.Color('#8E949A'), rule: new THREE.Color('#2a3036'),
    accent: new THREE.Color('#91B7C7'), x: new THREE.Color('#C9958A'), y: new THREE.Color('#9DB894'), z: new THREE.Color('#91B7C7'),
  };

  // ground grid, 50 mm squares, 400 x 400 mm
  const grid = new THREE.GridHelper(4, 8, C.rule, C.rule);
  grid.position.set(1, 0, 0);
  scene.add(grid);

  const lineMat = (c: THREE.Color, o = 1) => new THREE.LineBasicMaterial({ color: c, transparent: o < 1, opacity: o });
  const link = (c: THREE.Color, o = 1) => {
    const g = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 6 }, () => new THREE.Vector3()));
    return new THREE.Line(g, lineMat(c, o));
  };
  const arm = link(C.text);
  const ghost = link(C.dim, 0.45);
  scene.add(arm, ghost);

  const jointGeo = new THREE.SphereGeometry(0.045, 20, 12);
  const jointMat = new THREE.MeshBasicMaterial({ color: C.text });
  const jointsM = Array.from({ length: 5 }, () => { const m = new THREE.Mesh(jointGeo, jointMat); scene.add(m); return m; });
  const toolMat = new THREE.MeshBasicMaterial({ color: C.accent });
  const tool = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 12), toolMat);
  scene.add(tool);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.12, 40, 1, true), new THREE.MeshBasicMaterial({ color: C.rule, side: THREE.DoubleSide }));
  base.position.y = 0.06;
  scene.add(base);

  // gripper jaws
  const jaws = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 6 }, () => new THREE.Vector3())), lineMat(C.accent));
  scene.add(jaws);

  // target marker
  const target = new THREE.Group();
  const ringGeo = new THREE.RingGeometry(0.07, 0.08, 40);
  const tRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: C.accent, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
  tRing.rotation.x = -Math.PI / 2;
  target.add(tRing);
  const drop = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineDashedMaterial({ color: C.accent, dashSize: 0.04, gapSize: 0.04, transparent: true, opacity: 0.5 }));
  scene.add(target, drop);

  // frames
  const frames = new THREE.Group();
  const frameAt = () => {
    const g = new THREE.Group();
    const mk = (d: THREE.Vector3, c: THREE.Color) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), d]), lineMat(c));
    g.add(mk(new THREE.Vector3(0.28, 0, 0), C.x), mk(new THREE.Vector3(0, 0, -0.28), C.y), mk(new THREE.Vector3(0, 0.28, 0), C.z));
    return g;
  };
  const baseFrame = frameAt();
  baseFrame.scale.setScalar(1.6);
  scene.add(baseFrame);
  const jointFrames = Array.from({ length: 4 }, () => { const f = frameAt(); frames.add(f); return f; });
  scene.add(frames);

  // workspace section
  const wsGeo = new THREE.BufferGeometry();
  const ws = new THREE.Points(wsGeo, new THREE.PointsMaterial({ color: C.accent, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.22 }));
  scene.add(ws);
  let wsKey = '';

  // ------------------------------------------------------------ state
  let mode: 'ik' | 'fk' = 'ik';
  let L45 = EFFECTIVE_L45;
  let shown: Joints = { q1: 18, q2: 60, q3: -70, q4: -40 };
  let goal: Joints = { ...shown };
  let grip = 1, gripGoal = 1;
  let seq: { t0: number; i: number; steps: ReturnType<typeof pickAndPlace>; } | null = null;
  let last: Solution | null = null;

  const fmt = (v: number, u = '') => `${v < -0.005 ? '−' : ''}${Math.abs(v).toFixed(1)}${u}`;

  function drawChain(line: THREE.Line, j: Joints) {
    const pts = chain(j, L45);
    const q1 = THREE.MathUtils.degToRad(j.q1);
    const pos = line.geometry.attributes.position as THREE.BufferAttribute;
    const vs = pts.map((p) => W3(p.r * Math.cos(q1), p.r * Math.sin(q1), p.z));
    for (let i = 0; i < 6; i++) { const v = vs[Math.min(i, vs.length - 1)]; pos.setXYZ(i, v.x, v.y, v.z); }
    pos.needsUpdate = true;
    line.geometry.computeBoundingSphere();
    return vs;
  }

  function solve() {
    if (mode === 'ik') {
      const x = val(ikIn, 'x'), y = val(ikIn, 'y'), z = val(ikIn, 'z'), p = val(ikIn, 'pitch');
      const s = solveOne(x, y, z, p, L45);
      last = s;
      target.position.copy(W3(x, y, z));
      (drop.geometry.attributes.position as THREE.BufferAttribute).setXYZ(0, target.position.x, 0, target.position.z);
      (drop.geometry.attributes.position as THREE.BufferAttribute).setXYZ(1, target.position.x, target.position.y, target.position.z);
      drop.geometry.attributes.position.needsUpdate = true;
      drop.computeLineDistances();
      if (s.ok && s.joints) {
        goal = s.joints;
        status.textContent = `Solved on the ${s.branch} branch at pitch ${fmt(s.pitch, '°')}.`;
        status.dataset.state = 'ok';
      } else {
        status.textContent = s.candidates.length
          ? 'Reachable, but no elbow branch stays within the joint limits. Showing the closest pose.'
          : `Out of reach at this pitch: D = ${s.D.toFixed(3)}, outside [−1, 1].`;
        status.dataset.state = 'warn';
        if (s.candidates.length) goal = s.candidates[0];
      }
      const other = s.candidates.find((c) => !s.joints || c.branch !== s.branch);
      ghost.visible = ghBox.checked && !!other;
      if (other) drawChain(ghost, other);
    } else {
      goal = { q1: val(fkIn, 'q1'), q2: val(fkIn, 'q2'), q3: val(fkIn, 'q3'), q4: val(fkIn, 'q4') };
      last = null;
      ghost.visible = false;
      const p = fk(goal, L45);
      status.textContent = `Forward kinematics: tool at (${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)}) mm.`;
      status.dataset.state = 'ok';
    }
    target.visible = drop.visible = mode === 'ik';
    // workspace section for the current pitch, rotated into the arm plane
    const pitch = mode === 'ik' ? (last?.pitch ?? val(ikIn, 'pitch')) : fk(goal, L45).pitch;
    const key = `${Math.round(pitch)}|${L45}`;
    if (key !== wsKey) {
      wsKey = key;
      const pts = workspaceSection(Math.round(pitch), L45, 4);
      const arr = new Float32Array(pts.length * 3);
      pts.forEach((p, i) => { arr[i * 3] = p.r * S; arr[i * 3 + 1] = p.z * S; arr[i * 3 + 2] = 0; });
      wsGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      wsGeo.computeBoundingSphere();
    }
    ws.visible = wsBox.checked;
    frames.visible = frBox.checked;
    kick();
  }

  function render(j: Joints) {
    const vs = drawChain(arm, j);
    vs.slice(1, 4).forEach((v, i) => jointsM[i].position.copy(v));
    jointsM[3].position.copy(vs[0]); jointsM[4].visible = false;
    tool.position.copy(vs[4]);
    ws.rotation.y = THREE.MathUtils.degToRad(j.q1);
    // frames at shoulder, elbow, wrist, tool: x along the link, z the joint axis
    const q1 = THREE.MathUtils.degToRad(j.q1);
    const angs = [j.q2, j.q2 + j.q3, j.q2 + j.q3 + j.q4, j.q2 + j.q3 + j.q4];
    [1, 2, 3, 4].forEach((k, i) => {
      const f = jointFrames[i];
      f.position.copy(vs[k]);
      f.rotation.set(0, q1, THREE.MathUtils.degToRad(angs[i]), 'YZX');
    });
    // jaws along the tool direction
    const phi = THREE.MathUtils.degToRad(j.q2 + j.q3 + j.q4);
    const dir = new THREE.Vector3(Math.cos(phi) * Math.cos(q1), Math.sin(phi), -Math.cos(phi) * Math.sin(q1));
    const side = new THREE.Vector3(Math.sin(q1), 0, Math.cos(q1));
    const open = 0.03 + 0.04 * grip;
    const tp = vs[4];
    const pos = jaws.geometry.attributes.position as THREE.BufferAttribute;
    const a = tp.clone().addScaledVector(side, open), b = tp.clone().addScaledVector(side, -open);
    const set = (i: number, v: THREE.Vector3) => pos.setXYZ(i, v.x, v.y, v.z);
    set(0, a); set(1, a.clone().addScaledVector(dir, 0.12));
    set(2, b); set(3, b.clone().addScaledVector(dir, 0.12));
    set(4, a); set(5, b);
    pos.needsUpdate = true;
    // readout
    const p = fk(j, L45);
    read('q1').textContent = fmt(j.q1, '°'); read('q2').textContent = fmt(j.q2, '°');
    read('q3').textContent = fmt(j.q3, '°'); read('q4').textContent = fmt(j.q4, '°');
    read('x').textContent = fmt(p.x, ' mm'); read('y').textContent = fmt(p.y, ' mm');
    read('z').textContent = fmt(p.z, ' mm'); read('pitch').textContent = fmt(p.pitch, '°');
    read('branch').textContent = mode === 'ik' && last?.branch ? last.branch : j.q3 >= 0 ? 'elbow-down' : 'elbow-up';
    read('D').textContent = mode === 'ik' && last ? last.D.toFixed(3) : '–';
  }

  // ------------------------------------------------------------ loop
  let raf = 0, lastT = performance.now(), visible = false;
  function kick() {
    if (!visible) { const r = canvas.getBoundingClientRect(); visible = r.bottom > 0 && r.top < innerHeight; }
    if (!raf && visible) raf = requestAnimationFrame(tick);
  }
  function tick(now: number) {
    raf = 0;
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    if (seq) stepSequence(now);
    const k = reduced ? 1 : 1 - Math.exp(-dt * 7);
    let moving = false;
    (['q1', 'q2', 'q3', 'q4'] as const).forEach((q) => {
      const d = goal[q] - shown[q];
      if (Math.abs(d) > 0.01) moving = true;
      shown[q] += d * k;
    });
    grip += (gripGoal - grip) * k;
    if (Math.abs(gripGoal - grip) > 0.01) moving = true;
    render(shown);
    const orbiting = controls.update();
    renderer.render(scene, camera);
    if (moving || seq || orbiting) kick();
  }

  function stepSequence(now: number) {
    if (!seq) return;
    const dwell = reduced ? 400 : 1300;
    const i = Math.floor((now - seq.t0) / dwell);
    if (i >= seq.steps.length) {
      seq = null; runBtn.disabled = false;
      status.textContent = 'Sequence complete: picked at (150, 50), placed at (120, −40).';
      return;
    }
    if (i !== seq.i) {
      seq.i = i;
      const w = seq.steps[i];
      const s = solveHover(w.x, w.y, w.z, w.pitch, EFFECTIVE_L45);
      gripGoal = w.grip;
      if (s.ok && s.joints) goal = s.joints;
      target.visible = drop.visible = true;
      target.position.copy(W3(w.x, w.y, w.z));
      status.textContent = `${w.label}: (${w.x}, ${w.y}, ${w.z}) mm, pitch ${w.pitch}°${s.ok ? `, ${s.branch}` : ' — no solution'}.`;
    }
  }

  // ------------------------------------------------------------ inputs
  root.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach((inp) => {
    syncOut(inp);
    inp.addEventListener('input', () => { syncOut(inp); if (seq) return; solve(); });
  });
  root.querySelectorAll<HTMLInputElement>('input[name="lab-mode"]').forEach((r) => r.addEventListener('change', () => {
    mode = r.value as 'ik' | 'fk';
    ikIn.hidden = mode !== 'ik';
    fkIn.hidden = mode !== 'fk';
    // carry the current pose across so the switch never jumps
    if (mode === 'fk') (['q1', 'q2', 'q3', 'q4'] as const).forEach((q) => setVal(fkIn, q, shown[q]));
    else { const p = fk(shown, L45); setVal(ikIn, 'x', p.x); setVal(ikIn, 'y', p.y); setVal(ikIn, 'z', p.z); setVal(ikIn, 'pitch', p.pitch); }
    solve();
  }));
  wristSel.addEventListener('change', () => { L45 = Number(wristSel.value); solve(); });
  [wsBox, frBox, ghBox].forEach((b) => b.addEventListener('change', solve));
  runBtn.addEventListener('click', () => {
    if (mode !== 'ik') root.querySelector<HTMLInputElement>('input[name="lab-mode"][value="ik"]')!.click();
    wristSel.value = String(EFFECTIVE_L45); L45 = EFFECTIVE_L45;
    runBtn.disabled = true;
    seq = { t0: performance.now(), i: -1, steps: pickAndPlace(150, 50) };
    kick();
  });
  resetBtn.addEventListener('click', () => {
    seq = null; runBtn.disabled = false; gripGoal = 1;
    [['x', 150], ['y', 50], ['z', 112], ['pitch', -50]].forEach(([k, v]) => setVal(ikIn, k as string, v as number));
    solve();
  });
  controls.addEventListener('change', kick);

  // ------------------------------------------------------------ size and visibility
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    kick();
  }
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; if (visible) { lastT = performance.now(); kick(); } }).observe(canvas);
  resize();
  const r0 = canvas.getBoundingClientRect();
  visible = r0.bottom > 0 && r0.top < innerHeight;
  solve();
}
