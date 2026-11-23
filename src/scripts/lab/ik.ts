/**
 * Geometric inverse kinematics for the Yahboom DOFBOT, ported from the thesis
 * code (github.com/saintbdrh/Vision-guided-robot-sorting, ik_core.py / config.py).
 *
 * Conventions (identical to the Python):
 *   q1  base yaw, atan2(y, x)
 *   q2  shoulder angle from the horizontal
 *   q3  elbow angle relative to the upper arm
 *   q4  wrist pitch relative to the forearm
 *   pitch (phi) = q2 + q3 + q4, tool angle from the horizontal, negative = tip down
 *   lengths in millimetres, angles in degrees
 *
 * Pure functions only: no DOM, no three.js. Tested in tests/ik.test.ts.
 */

export const LINKS = { L1: 90.0, L2: 83.0, L3: 83.0, L4: 79.6, L5: 102.7 } as const;

/** Wrist-to-tool length used by the thesis hover IK (USE_EFFECTIVE_WRIST = True). */
export const EFFECTIVE_L45 = 40.0;
/** Physical wrist-to-gripper length, L4 + L5. */
export const NOMINAL_L45 = LINKS.L4 + LINKS.L5;

export const LIMITS = {
  q1: [-135, 135],
  q2: [-40, 100],
  q3: [-135, 135],
  q4: [-160, 160],
} as const;

/** Pick-and-place constants from config.py. */
export const SEQUENCE = {
  approachZ: 112.0,
  pickZ: 105.0,
  liftZ: 118.0,
  pickPitch: -50.0,
  place: { x: 120.0, y: -40.0, z: 112.0, pitch: -50.0 },
  safe: { xMin: 60, xMax: 170, yMin: -100, yMax: 100 },
} as const;

export const HOVER_PITCH_FALLBACKS = [-80, -70, -60, -50] as const;

export interface Joints { q1: number; q2: number; q3: number; q4: number }
export interface Pose { x: number; y: number; z: number; pitch: number }
export type Branch = 'elbow-down' | 'elbow-up';
export interface Candidate extends Joints { branch: Branch; inLimits: boolean }
export interface Solution {
  ok: boolean;
  joints?: Joints;
  branch?: Branch;
  pitch: number;
  candidates: Candidate[];
  /** Normalised elbow cosine; outside [-1, 1] means the wrist centre is unreachable. */
  D: number;
  msg: string;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function inLimits(j: Joints): boolean {
  return (
    LIMITS.q1[0] <= j.q1 && j.q1 <= LIMITS.q1[1] &&
    LIMITS.q2[0] <= j.q2 && j.q2 <= LIMITS.q2[1] &&
    LIMITS.q3[0] <= j.q3 && j.q3 <= LIMITS.q3[1] &&
    LIMITS.q4[0] <= j.q4 && j.q4 <= LIMITS.q4[1]
  );
}

/** Forward kinematics: tool point and pitch for a joint vector. */
export function fk(j: Joints, L45: number = EFFECTIVE_L45): Pose {
  const q2 = rad(j.q2), q3 = rad(j.q3), q4 = rad(j.q4);
  const phi = q2 + q3 + q4;
  const r = LINKS.L2 * Math.cos(q2) + LINKS.L3 * Math.cos(q2 + q3) + L45 * Math.cos(phi);
  const z = LINKS.L1 + LINKS.L2 * Math.sin(q2) + LINKS.L3 * Math.sin(q2 + q3) + L45 * Math.sin(phi);
  const q1 = rad(j.q1);
  return { x: r * Math.cos(q1), y: r * Math.sin(q1), z, pitch: deg(phi) };
}

/** Intermediate joint positions in the arm's vertical plane, for drawing. */
export function chain(j: Joints, L45: number = EFFECTIVE_L45) {
  const q2 = rad(j.q2), q23 = rad(j.q2 + j.q3), phi = rad(j.q2 + j.q3 + j.q4);
  const pts = [
    { r: 0, z: 0 },
    { r: 0, z: LINKS.L1 },
  ];
  pts.push({ r: pts[1].r + LINKS.L2 * Math.cos(q2), z: pts[1].z + LINKS.L2 * Math.sin(q2) });
  pts.push({ r: pts[2].r + LINKS.L3 * Math.cos(q23), z: pts[2].z + LINKS.L3 * Math.sin(q23) });
  pts.push({ r: pts[3].r + L45 * Math.cos(phi), z: pts[3].z + L45 * Math.sin(phi) });
  return pts; // base, shoulder, elbow, wrist, tool
}

/** solve_one(): both elbow branches for a fixed tool pitch, filtered by joint limits. */
export function solveOne(x: number, y: number, z: number, pitch: number, L45: number = EFFECTIVE_L45): Solution {
  const q1 = deg(Math.atan2(y, x));
  const r = Math.hypot(x, y);
  const phi = rad(pitch);
  const wx = r - L45 * Math.cos(phi);
  const wz = z - LINKS.L1 - L45 * Math.sin(phi);
  const D = (wx * wx + wz * wz - LINKS.L2 ** 2 - LINKS.L3 ** 2) / (2 * LINKS.L2 * LINKS.L3);
  if (D < -1 || D > 1) {
    return { ok: false, pitch, candidates: [], D, msg: `Unreachable at pitch ${pitch.toFixed(0)}° (D = ${D.toFixed(3)})` };
  }
  const candidates: Candidate[] = [];
  for (const sign of [1, -1]) {
    const q3r = sign * Math.acos(clamp(D, -1, 1));
    const q2 = deg(Math.atan2(wz, wx) - Math.atan2(LINKS.L3 * Math.sin(q3r), LINKS.L2 + LINKS.L3 * Math.cos(q3r)));
    const q3 = deg(q3r);
    const q4 = pitch - q2 - q3;
    const j = { q1, q2, q3, q4 };
    // q3 > 0 turns the forearm counter-clockwise in the r–z plane, which puts the
    // elbow below the shoulder–wrist line.
    candidates.push({ ...j, branch: sign > 0 ? 'elbow-down' : 'elbow-up', inLimits: inLimits(j) });
  }
  const valid = candidates.filter((c) => c.inLimits);
  if (!valid.length) {
    return { ok: false, pitch, candidates, D, msg: 'No branch within joint limits' };
  }
  const preferred = valid.filter((c) => c.q2 >= 0 && c.q3 >= 0);
  const positiveQ3 = valid.filter((c) => c.q3 >= 0);
  const pool = preferred.length ? preferred : positiveQ3.length ? positiveQ3 : valid;
  const best = [...pool].sort((a, b) =>
    Math.abs(a.q4) - Math.abs(b.q4) || (Math.abs(a.q2) + Math.abs(a.q3)) - (Math.abs(b.q2) + Math.abs(b.q3)),
  )[0];
  return {
    ok: true,
    joints: { q1: best.q1, q2: best.q2, q3: best.q3, q4: best.q4 },
    branch: best.branch,
    pitch,
    candidates,
    D,
    msg: 'Solved',
  };
}

/** solve_hover(): requested pitch first, then the thesis fallback pitches. */
export function solveHover(x: number, y: number, z: number, requestedPitch: number, L45: number = EFFECTIVE_L45): Solution {
  let last: Solution | null = null;
  for (const p of [requestedPitch, ...HOVER_PITCH_FALLBACKS]) {
    const s = solveOne(x, y, z, p, L45);
    if (s.ok) return s;
    last = s;
  }
  return { ...(last as Solution), msg: `${(last as Solution).msg}; fallback pitches also failed` };
}

/** Waypoints of run_pick_and_place() for a pick at (x, y). */
export function pickAndPlace(x: number, y: number) {
  const S = SEQUENCE;
  return [
    { label: 'Approach', x, y, z: S.approachZ, pitch: S.pickPitch, grip: 1 },
    { label: 'Down', x, y, z: S.pickZ, pitch: S.pickPitch, grip: 1 },
    { label: 'Close', x, y, z: S.pickZ, pitch: S.pickPitch, grip: 0 },
    { label: 'Lift', x, y, z: S.liftZ, pitch: S.pickPitch, grip: 0 },
    { label: 'Place', x: S.place.x, y: S.place.y, z: S.place.z, pitch: S.place.pitch, grip: 0 },
    { label: 'Open', x: S.place.x, y: S.place.y, z: S.place.z, pitch: S.place.pitch, grip: 1 },
  ] as const;
}

/** Sample the reachable tool points in the arm plane for a fixed pitch (workspace section). */
export function workspaceSection(pitch: number, L45: number = EFFECTIVE_L45, step = 4): { r: number; z: number }[] {
  const out: { r: number; z: number }[] = [];
  for (let q2 = LIMITS.q2[0]; q2 <= LIMITS.q2[1]; q2 += step) {
    for (let q3 = LIMITS.q3[0]; q3 <= LIMITS.q3[1]; q3 += step) {
      const q4 = pitch - q2 - q3;
      if (q4 < LIMITS.q4[0] || q4 > LIMITS.q4[1]) continue;
      const p = fk({ q1: 0, q2, q3, q4 }, L45);
      if (p.z < 0) continue;
      out.push({ r: p.x, z: p.z });
    }
  }
  return out;
}
