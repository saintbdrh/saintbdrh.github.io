/**
 * Drives the DOFBOT model from the thesis IK (lab/ik.ts).
 *
 * Frames: thesis x forward, y left, z up, millimetres. three.js (glTF) is Y-up,
 * metres, with thesis y = -Z. The model's rest pose has every link vertical, so:
 *   J1 about +Y by q1;  J2, J3, J4 about -Z by (90 - q2), -q3, -q4;  J5 about +Y (roll).
 * Motion is interpolated in joint space, the way the real servos move.
 */
import * as THREE from 'three';
import { solveHover, NOMINAL_L45, type Joints } from '../lab/ik';

const D = THREE.MathUtils.degToRad;
const AX_YAW = new THREE.Vector3(0, 1, 0);
const AX_PITCH = new THREE.Vector3(0, 0, -1);
const AX_FWD = new THREE.Vector3(1, 0, 0);

export const toWorld = (x: number, y: number, z: number) => new THREE.Vector3(x / 1000, z / 1000, -y / 1000);
export const toThesis = (v: THREE.Vector3) => ({ x: v.x * 1000, y: -v.z * 1000, z: v.y * 1000 });

export interface ArmPose extends Joints { roll: number; grip: number } // grip 0 open .. 1 closed

export const HOME: ArmPose = { q1: 0, q2: 80, q3: -50, q4: -70, roll: 0, grip: 0 };

export class Arm {
  j: THREE.Object3D[];
  fingers: THREE.Object3D[];
  tcp: THREE.Object3D;
  pose: ArmPose = { ...HOME };

  constructor(root: THREE.Object3D) {
    const get = (n: string) => {
      const o = root.getObjectByName(n);
      if (!o) throw new Error(`DOFBOT node ${n} missing`);
      return o;
    };
    this.j = ['J1', 'J2', 'J3', 'J4', 'J5'].map(get);
    this.fingers = [get('FingerL'), get('FingerR')];
    this.tcp = get('TCP');
    this.apply();
  }

  apply(p: ArmPose = this.pose) {
    this.pose = p;
    this.j[0].quaternion.setFromAxisAngle(AX_YAW, D(p.q1));
    this.j[1].quaternion.setFromAxisAngle(AX_PITCH, D(90 - p.q2));
    this.j[2].quaternion.setFromAxisAngle(AX_PITCH, D(-p.q3));
    this.j[3].quaternion.setFromAxisAngle(AX_PITCH, D(-p.q4));
    this.j[4].quaternion.setFromAxisAngle(AX_YAW, D(p.roll));
    // jaws hinge about the forward axis; closing swings them inward
    const a = D(4 - 13 * p.grip);
    this.fingers[0].quaternion.setFromAxisAngle(AX_FWD, a);
    this.fingers[1].quaternion.setFromAxisAngle(AX_FWD, -a);
  }

  /** IK for a tool point in thesis coordinates (mm); the hover solver picks a feasible pitch. */
  solve(x: number, y: number, z: number, pitch = -60) {
    return solveHover(x, y, z, pitch, NOMINAL_L45);
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

export function blend(a: ArmPose, b: ArmPose, t: number): ArmPose {
  const s = smooth(t);
  return {
    q1: lerp(a.q1, b.q1, s), q2: lerp(a.q2, b.q2, s), q3: lerp(a.q3, b.q3, s), q4: lerp(a.q4, b.q4, s),
    roll: lerp(a.roll, b.roll, s), grip: lerp(a.grip, b.grip, s),
  };
}

/** Duration for a joint-space move, limited to ~70 deg/s on the largest joint, like a bus servo. */
export function moveTime(a: ArmPose, b: ArmPose) {
  const d = Math.max(Math.abs(a.q1 - b.q1), Math.abs(a.q2 - b.q2), Math.abs(a.q3 - b.q3), Math.abs(a.q4 - b.q4), Math.abs(a.roll - b.roll));
  const g = Math.abs(a.grip - b.grip) * 420;
  return Math.max(380, (d / 70) * 1000, g);
}
