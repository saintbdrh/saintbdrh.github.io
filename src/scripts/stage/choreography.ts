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
  /** Optional: aim at a named node of the model and orbit it at [azimuth°, elevation°, distance m]. */
  focus?: string;
  focusOffset?: Vec3;
  orbit?: Vec3;
}

const base: Shot = {
  cam: [3.0, 1.35, -2.8], target: [0.32, 0.8, 0], fov: 28,
  shiftX: 0.2, shiftY: 0.04,
  joints: [-18, 14, 22, 0, 38, 0], clip: 1, grip: 0, explode: 0, axes: 0,
};

const s = (o: Partial<Shot>): Shot => ({ ...base, ...o });

export const SHOTS: Record<string, Shot> = {
  hero: s({}),

  // Scene 02: engineering. The camera approaches the mechanism that each capability lives in.
  // Azimuth is measured from +Z toward +X; 180 looks from the cable side.
  'cap-electronics': s({
    focus: 'A_base', focusOffset: [0, -0.05, 0], orbit: [-18, 16, 2.7], fov: 30, shiftX: 0.2, shiftY: 0,
    joints: [-20, 10, 28, 0, 40, 0], clip: 0,
  }),
  'cap-embedded': s({
    focus: 'A_shoulder', focusOffset: [0, 0, 0.38], orbit: [12, 8, 2.0], fov: 30, shiftX: 0.2, shiftY: 0,
    joints: [-15, 16, 30, 0, 36, 0], clip: 0,
  }),
  'cap-robotics': s({
    focus: 'A_elbow', focusOffset: [0.15, -0.3, 0.16], orbit: [38, 14, 3.1], fov: 30, shiftX: 0.18, shiftY: 0,
    joints: [-30, 30, 18, 20, 30, 40], clip: 0,
  }),
  'cap-vision': s({
    focus: 'A_camera', orbit: [28, 14, 1.55], fov: 28, shiftX: 0.14, shiftY: 0,
    joints: [-4, 24, 36, 0, 32, 0], clip: 0,
  }),
  'cap-control': s({
    focus: 'A_tool', orbit: [8, 6, 1.7], fov: 28, shiftX: 0.14, shiftY: 0,
    joints: [-12, 26, 44, -10, 36, 70], clip: 0, grip: 1,
  }),

  // Scene 03: thesis. The arm rises into a neutral pose and separates along its chain.
  'thesis-intro': s({
    focus: 'J2', focusOffset: [0.3, 0.3, 0], orbit: [205, 10, 5.4], fov: 32, shiftX: -0.1, shiftY: 0,
    joints: [0, 0, 0, 0, 0, 0], clip: 0, explode: 0.15, axes: 0.4,
  }),
  'thesis-a': s({
    focus: 'J2', focusOffset: [0.35, 0.35, 0], orbit: [195, 14, 5.6], fov: 32, shiftX: -0.1, shiftY: 0,
    joints: [0, 0, 0, 0, 0, 0], clip: 0, explode: 0.8, axes: 1,
  }),
  'thesis-b': s({
    focus: 'J2', focusOffset: [0.35, 0.35, 0], orbit: [180, 22, 5.6], fov: 32, shiftX: -0.1, shiftY: 0,
    joints: [0, 0, 0, 0, 0, 0], clip: 0, explode: 1, axes: 1,
  }),
  'thesis-c': s({
    focus: 'J2', focusOffset: [0.3, 0.3, 0], orbit: [215, 8, 5.4], fov: 32, shiftX: -0.1, shiftY: 0,
    joints: [0, 10, 20, 0, 30, 0], clip: 0, explode: 0.4, axes: 0.6,
  }),

  // Scene 06: contact. The arm settles, tool lowered, seen low.
  contact: s({
    cam: [2.9, 0.95, -2.7], target: [0.3, 0.78, 0], fov: 30, shiftX: 0.24, shiftY: 0.02,
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
  // camera offset interpolated in spherical coordinates (shortest azimuth), so
  // transitions orbit the subject rather than passing through it
  const sp = (c: Vec3, g: Vec3) => {
    const x = c[0] - g[0], y = c[1] - g[1], z = c[2] - g[2];
    const r = Math.hypot(x, y, z);
    return { r, az: Math.atan2(x, z), el: Math.asin(y / (r || 1)) };
  };
  const A = sp(a.cam, a.target), B = sp(b.cam, b.target);
  let dAz = B.az - A.az;
  dAz = Math.atan2(Math.sin(dAz), Math.cos(dAz));
  const r = lerp(A.r, B.r, t), az = A.az + dAz * t, el = lerp(A.el, B.el, t);
  const target = v(a.target, b.target);
  const cam: Vec3 = [target[0] + Math.sin(az) * Math.cos(el) * r, target[1] + Math.sin(el) * r, target[2] + Math.cos(az) * Math.cos(el) * r];
  return {
    cam,
    target,
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
