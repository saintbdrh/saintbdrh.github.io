import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fk, solveOne, solveHover, pickAndPlace, workspaceSection, inLimits,
  EFFECTIVE_L45, NOMINAL_L45, LINKS,
} from '../src/scripts/lab/ik.ts';

const close = (a: number, b: number, eps = 1e-6, msg = '') =>
  assert.ok(Math.abs(a - b) < eps, `${msg} expected ${b}, got ${a}`);

test('fk at the zero pose reaches straight out at shoulder height', () => {
  const p = fk({ q1: 0, q2: 0, q3: 0, q4: 0 }, NOMINAL_L45);
  close(p.x, LINKS.L2 + LINKS.L3 + NOMINAL_L45);
  close(p.y, 0);
  close(p.z, LINKS.L1);
  close(p.pitch, 0);
});

test('fk with the arm straight up', () => {
  const p = fk({ q1: 30, q2: 90, q3: 0, q4: 0 }, EFFECTIVE_L45);
  close(p.x, 0, 1e-9);
  close(p.z, LINKS.L1 + LINKS.L2 + LINKS.L3 + EFFECTIVE_L45);
});

test('every IK candidate round-trips through FK, on both wrist models', () => {
  let checked = 0;
  for (const L45 of [EFFECTIVE_L45, NOMINAL_L45]) {
    for (let x = 60; x <= 200; x += 20) {
      for (let y = -100; y <= 100; y += 25) {
        for (let z = 60; z <= 200; z += 20) {
          for (const pitch of [-80, -50, -20, 0]) {
            const s = solveOne(x, y, z, pitch, L45);
            for (const c of s.candidates) {
              const p = fk(c, L45);
              close(p.x, x, 1e-6, 'x'); close(p.y, y, 1e-6, 'y'); close(p.z, z, 1e-6, 'z');
              close(p.pitch, pitch, 1e-6, 'pitch');
              checked++;
            }
          }
        }
      }
    }
  }
  assert.ok(checked > 500, `only ${checked} candidates checked`);
});

test('selected solution respects joint limits and prefers q2, q3 >= 0', () => {
  const s = solveOne(140, 30, 110, -50);
  assert.equal(s.ok, true);
  assert.ok(s.joints && inLimits(s.joints));
  const both = s.candidates.filter((c) => c.inLimits && c.q2 >= 0 && c.q3 >= 0);
  if (both.length) assert.ok(s.joints!.q2 >= 0 && s.joints!.q3 >= 0);
});

test('unreachable targets report D outside [-1, 1]', () => {
  const s = solveOne(900, 0, 90, 0);
  assert.equal(s.ok, false);
  assert.ok(s.D > 1);
});

test('hover solver falls back to the thesis pitch list', () => {
  const s = solveHover(150, 50, 112, 10);
  assert.equal(s.ok, true);
  assert.ok([10, -80, -70, -60, -50].includes(s.pitch));
});

test('the thesis pick-and-place waypoints are all solvable', () => {
  for (const w of pickAndPlace(150, 50)) {
    const s = solveHover(w.x, w.y, w.z, w.pitch);
    assert.equal(s.ok, true, `${w.label}: ${s.msg}`);
  }
});

test('workspace section only contains reachable points', () => {
  const pts = workspaceSection(-50, EFFECTIVE_L45, 10);
  assert.ok(pts.length > 50);
  for (const p of pts.slice(0, 200)) {
    const s = solveOne(p.r, 0, p.z, -50, EFFECTIVE_L45);
    assert.ok(s.candidates.length > 0);
  }
});
