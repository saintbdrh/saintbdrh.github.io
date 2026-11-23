/**
 * Camera and joint choreography for the scroll film.
 *
 * Each beat in the DOM carries data-shot="<name>". The stage measures where each
 * beat's centre crosses the viewport centre and interpolates between consecutive
 * shots, so the camera path follows the real layout at every breakpoint.
 *
 * Coordinates are glTF (Y up, metres). The robot base sits at the origin and the
 * arm reaches along +X. Joint angles are degrees about each joint's own axis.
 */

export type Vec3 = [number, number, number];
export type JointVec = [number, number, number, number, number, number];

export interface Shot {
  cam: Vec3;          // camera position
  target: Vec3;       // look-at point
  fov: number;        // vertical field of view, degrees
  shiftX: number;     // view-offset as a fraction of width (+ moves the subject right)
  shiftY: number;     // view-offset as a fraction of height (+ moves the subject up)
  joints: JointVec;   // J1..J6
  clip: number;       // 1 = baked "Survey" clip drives the joints, 0 = `joints`
  grip: number;       // 0 open .. 1 closed (only when clip < 1)
  explode: number;    // 0 assembled .. 1 exploded
  axes: number;       // joint-axis overlay opacity
}

const base: Shot = {
  cam: [2.7, 1.3, -2.5], target: [0.32, 0.82, 0], fov: 28,
  shiftX: 0.2, shiftY: 0.02,
  joints: [-18, 14, 22, 0, 38, 0], clip: 1, grip: 0, explode: 0, axes: 0,
};

const s = (o: Partial<Shot>): Shot => ({ ...base, ...o });

export const SHOTS: Record<string, Shot> = {
  hero: s({}),

  // Scene 02: engineering. The camera approaches the mechanism that each capability lives in.
  'cap-electronics': s({
    cam: [-1.55, 1.05, -1.65], target: [-0.08, 0.5, 0], fov: 30, shiftX: 0.2, shiftY: 0,
    joints: [24, 10, 28, 0, 40, 0], clip: 0,
  }),
  'cap-embedded': s({
    cam: [0.95, 1.15, -1.75], target: [0.12, 0.72, -0.1], fov: 30, shiftX: 0.22, shiftY: 0,
    joints: [-10, 16, 30, 0, 36, 0], clip: 0,
  }),
  'cap-robotics': s({
    cam: [2.2, 1.7, -1.9], target: [0.4, 1.0, 0], fov: 30, shiftX: 0.22, shiftY: 0,
    joints: [-28, 30, 18, 20, 30, 40], clip: 0,
  }),
  'cap-vision': s({
    cam: [1.75, 1.42, -0.55], target: [0.92, 1.06, 0], fov: 26, shiftX: 0.22, shiftY: 0,
    joints: [-4, 24, 36, 0, 32, 0], clip: 0,
  }),
  'cap-control': s({
    cam: [1.6, 1.0, -1.0], target: [0.95, 0.92, 0], fov: 26, shiftX: 0.22, shiftY: 0,
    joints: [-12, 26, 44, -10, 36, 70], clip: 0, grip: 1,
  }),

  // Scene 03: thesis. The arm rises into a neutral pose and separates along its chain.
  'thesis-intro': s({
    cam: [2.4, 1.5, 2.6], target: [0.42, 0.85, 0], fov: 30, shiftX: -0.2, shiftY: 0,
    joints: [0, 0, 0, 0, 0, 0], clip: 0, explode: 0.15, axes: 0.4,
  }),
  'thesis-a': s({
    cam: [2.1, 1.9, 2.8], target: [0.45, 0.85, 0], fov: 30, shiftX: -0.22, shiftY: 0,
    joints: [0, 0, 0, 0, 0, 0], clip: 0, explode: 0.8, axes: 1,
  }),
  'thesis-b': s({
    cam: [1.2, 2.1, 3.1], target: [0.45, 0.9, 0], fov: 30, shiftX: -0.22, shiftY: 0,
    joints: [0, 0, 0, 0, 0, 0], clip: 0, explode: 1, axes: 1,
  }),
  'thesis-c': s({
    cam: [3.0, 1.2, 1.6], target: [0.5, 0.9, 0], fov: 30, shiftX: -0.22, shiftY: 0,
    joints: [0, 10, 20, 0, 30, 0], clip: 0, explode: 0.4, axes: 0.6,
  }),

  // Scene 06: contact. The arm settles, tool lowered, seen low and close.
  contact: s({
    cam: [2.3, 0.9, -2.2], target: [0.3, 0.78, 0], fov: 28, shiftX: 0.22, shiftY: -0.04,
    joints: [-30, 34, 52, 0, 26, 0], clip: 0,
  }),
};

/** Portrait screens: pull back, centre the subject, lift it above the text. */
export function adapt(shot: Shot, aspect: number): Shot {
  if (aspect >= 1.05) return shot;
  const k = aspect < 0.8 ? 1.55 : 1.25;
  const t = shot.target;
  const cam: Vec3 = [
    t[0] + (shot.cam[0] - t[0]) * k,
    t[1] + (shot.cam[1] - t[1]) * k + 0.1,
    t[2] + (shot.cam[2] - t[2]) * k,
  ];
  return { ...shot, cam, shiftX: 0, shiftY: aspect < 0.8 ? 0.2 : 0.08 };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function mix(a: Shot, b: Shot, t: number): Shot {
  const v = (x: Vec3, y: Vec3): Vec3 => [lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)];
  return {
    cam: v(a.cam, b.cam),
    target: v(a.target, b.target),
    fov: lerp(a.fov, b.fov, t),
    shiftX: lerp(a.shiftX, b.shiftX, t),
    shiftY: lerp(a.shiftY, b.shiftY, t),
    joints: a.joints.map((j, i) => lerp(j, b.joints[i], t)) as JointVec,
    clip: lerp(a.clip, b.clip, t),
    grip: lerp(a.grip, b.grip, t),
    explode: lerp(a.explode, b.explode, t),
    axes: lerp(a.axes, b.axes, t),
  };
}

/** Quintic smootherstep: zero velocity and acceleration at both ends. */
export const smoother = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
};
