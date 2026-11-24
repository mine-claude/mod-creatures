// @ts-check
// The Lure Lantern's PROCEDURAL ANIMATION math: pure functions of state and dt (no THREE, no DOM, no game code), so it
// runs and is unit-tested in Node (tests/suites/creatures-lantern-motion.js). Frame-rate independent: the springs are the
// goblin's closed-form ones (exact for any dt), the pendulum integrates in fixed sub-steps, every smoothing is exp(-k dt).
//
//   bob(t, phase)            the body's gentle float (two slow sines: never a strobe of motion)
//   flicker(t, phase)        the lure's warm flicker: brightness in [FLICKER_MIN, 1], slowest components only (<= 2.1 Hz),
//                            a soft swell — photosensitivity-safe (no fast flashes, small luminance swing)
//   pendulum                 the lure hanging from its stalk: a damped 2-axis pendulum driven by the body's acceleration
//   tendrils                 chains of springs that trail behind the motion, with a slow travelling wave
//   maw                      the split-open body: a slightly under-damped spring (it snaps open, settles) + the bite snap
//   motionFrom(...)          the body's velocity / acceleration / yaw rate from where the renderer draws it
import { clamp, critSpring, dampedSpring, expAlpha, lerp, smoothstep, spring, wrapAngle } from '../goblin/procedural.ts';

export { clamp, critSpring, dampedSpring, expAlpha, lerp, smoothstep, spring, wrapAngle };
export const TAU = Math.PI * 2;

// ---------------------------------------------------------------- bob and flicker

/** The float: a vertical offset (blocks) and a little sway (rad), from the clock (s) and a per-mob phase. */
export function bob(t: number, phase = 0) {
  return {
    y: 0.07 * Math.sin(t * TAU * 0.34 + phase) + 0.025 * Math.sin(t * TAU * 0.81 + phase * 1.7),
    sway: 0.05 * Math.sin(t * TAU * 0.27 + phase * 0.6),
  };
}

export const FLICKER_MIN = 0.74;
export const FLICKER_MAX_HZ = 2.1;
/**
 * The lure's brightness, a multiplier in [FLICKER_MIN, 1]: a candle-like swell made of three slow sines (0.53, 1.27 and
 * 2.1 Hz) — never a hard on/off, never faster than ~2 Hz, and the whole swing is at most a quarter of the light.
 */
export function flicker(t: number, phase = 0) {
  const s = 0.5 * Math.sin(t * TAU * 0.53 + phase) + 0.3 * Math.sin(t * TAU * 1.27 + phase * 2.3) + 0.2 * Math.sin(t * TAU * FLICKER_MAX_HZ + phase * 3.1);
  return 1 - (1 - FLICKER_MIN) * (0.5 - 0.5 * s); // s in [-1, 1] -> [FLICKER_MIN, 1]
}

/**
 * The bioluminescent spots' slow breathing, in [0, 1]: two slow sines (0.22 and 0.09 Hz) — a tide, not a blink.
 * `phase` sets the spots of one mob (and the two groups of spots) out of step.
 */
export function pulse(t: number, phase = 0) {
  return 0.5 + 0.5 * (0.7 * Math.sin(t * TAU * 0.22 + phase) + 0.3 * Math.sin(t * TAU * 0.09 + phase * 1.9));
}

export const GLINT_EVERY = 5.5; // s between wet glints
export const GLINT_WIDTH = 0.35; // s: half-width of one glint
/** The wet glint on the crown, in [0, 1]: a soft bump of ~0.7 s once every GLINT_EVERY s (offset by `phase`), 0 between. */
export function glint(t: number, phase = 0) {
  const u = (((t / GLINT_EVERY + phase / TAU) % 1) + 1) % 1;
  const x = (u - 0.5) / (GLINT_WIDTH / GLINT_EVERY);
  return Math.exp(-4 * x * x);
}

// ---------------------------------------------------------------- the lure's pendulum

export const LURE = Object.freeze({ length: 0.26, gravity: 11, damping: 1.7, maxAngle: 1.25, substep: 1 / 240, drive: 0.4 });

/** A two-axis pendulum (pitch about x, roll about z), angles in rad, relative to hanging straight down. */
export const pendulum = () => ({ px: 0, vx: 0, pz: 0, vz: 0 });

/**
 * One frame of the lure's swing. `aForward`, `aRight` (blocks/s²) are the body's acceleration in its own frame: the
 * pendulum feels the opposite (speeding up swings it back, braking flings it forward, a turn throws it outward).
 * Integrated in fixed sub-steps (semi-implicit Euler at 240 Hz), so 30 fps and 144 fps swing the same.
 */
export function stepPendulum(st: { px: number, vx: number, pz: number, vz: number }, aForward: number, aRight: number, dt: number) {
  const L = LURE.length, g = LURE.gravity, c = LURE.damping;
  // the drive is softened (LURE.drive): the soft body and the thread drag through the air, it is not a rigid frame
  const af = clamp(Number.isFinite(aForward) ? aForward : 0, -40, 40) * LURE.drive, ar = clamp(Number.isFinite(aRight) ? aRight : 0, -40, 40) * LURE.drive;
  let left = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.25);
  while (left > 1e-9) {
    const h = Math.min(LURE.substep, left);
    left -= h;
    // pitch: positive swings the bulb forward (-z); a forward acceleration pushes it back
    st.vx += (-(g / L) * Math.sin(st.px) - c * st.vx - (af / L) * Math.cos(st.px)) * h;
    st.vz += (-(g / L) * Math.sin(st.pz) - c * st.vz - (ar / L) * Math.cos(st.pz)) * h;
    st.px = clamp(st.px + st.vx * h, -LURE.maxAngle, LURE.maxAngle);
    st.pz = clamp(st.pz + st.vz * h, -LURE.maxAngle, LURE.maxAngle);
    if (Math.abs(st.px) >= LURE.maxAngle) st.vx *= -0.3; // the stalk stops it: a soft bounce, not a spin
    if (Math.abs(st.pz) >= LURE.maxAngle) st.vz *= -0.3;
  }
  return st;
}

/** The energy-like size of the swing (tests: it rings down when the body is still). */
export const swingOf = (st: { px: number, vx: number, pz: number, vz: number }) => Math.hypot(st.px, st.pz, st.vx * 0.16, st.vz * 0.16);

// ---------------------------------------------------------------- tendrils

export const TENDRIL_SEGMENTS = 4;
/** One tendril: a chain of segments, each with a pitch and a roll spring (relative to the one above). */
export const tendril = (n = TENDRIL_SEGMENTS) => Array.from({ length: n }, () => ({ x: spring(), z: spring() }));

/**
 * One frame of a tendril. The chain trails behind the velocity (vForward, vRight in blocks/s, the body's frame) and lags
 * its acceleration; each lower segment adds a little more bend and is softer (lower frequency), and a slow wave runs
 * down it (`t` s, `i` its index), so the tendrils undulate even when the body hangs still.
 */
export function stepTendril(segs: Array<{ x: { x: number, v: number }, z: { x: number, v: number } }>, vForward: number, vRight: number, aForward: number, t: number, i: number, dt: number, limp = 0) {
  const n = segs.length;
  const trailX = clamp(0.16 * vForward + 0.025 * aForward, -1.1, 1.1); // forward motion: the tips stream back (+x pitch = back)
  const trailZ = clamp(-0.16 * vRight, -1.1, 1.1);
  for (let j = 0; j < n; j++) {
    const k = (1 - limp);
    const wave = k * 0.16 * Math.sin(t * TAU * 0.45 - j * 0.9 + i * 1.3);
    const waveZ = k * 0.09 * Math.sin(t * TAU * 0.31 - j * 0.8 + i * 2.1);
    const omega = 13 - j * 2.2, zeta = 0.38 + 0.1 * limp;
    dampedSpring(segs[j].x, (trailX / n) * (1 + j * 0.35) * k + wave, omega, zeta, dt);
    dampedSpring(segs[j].z, (trailZ / n) * (1 + j * 0.35) * k + waveZ, omega, zeta, dt);
  }
  return segs;
}

// ---------------------------------------------------------------- the maw

export const BITE_TIME = 0.32;
/**
 * The bite snap (t s since the 'bite' cue): the open maw slams shut (fast), holds a beat and springs open again.
 * Returns a multiplier on how open the maw is (1 = as the spring says, 0 = shut).
 */
export function biteSnap(t: number) {
  if (!(t >= 0) || t >= BITE_TIME) return 1;
  if (t < 0.06) return 1 - smoothstep(t / 0.06);
  if (t < 0.13) return 0;
  return smoothstep((t - 0.13) / (BITE_TIME - 0.13));
}

/** How wide the maw wants to be for a server state (cues): closed 0, open 1, diving 1.15 (agape). */
export const mawTarget = (state: string) => (state === 'dive' ? 1.15 : state === 'open' ? 1 : 0);

// ---------------------------------------------------------------- motion of the drawn body

export const motion = () => ({ init: false, px: 0, py: 0, pz: 0, yaw: 0, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, az: 0, yawRate: 0, vForward: 0, vRight: 0, aForward: 0, aRight: 0, speed: 0 });

/** The body's velocity, acceleration and yaw rate from its drawn position and yaw (smoothed with exp(-k dt)). */
export function motionFrom(st: ReturnType<typeof motion>, x: number, y: number, z: number, yaw: number, dt0: number) {
  const dt = clamp(Number.isFinite(dt0) ? dt0 : 1 / 60, 1e-4, 0.1);
  if (!st.init) { Object.assign(st, { init: true, px: x, py: y, pz: z, yaw }); return st; }
  const a = expAlpha(12, dt), ab = expAlpha(7, dt);
  const nvx = lerp(st.vx, (x - st.px) / dt, a), nvy = lerp(st.vy, (y - st.py) / dt, a), nvz = lerp(st.vz, (z - st.pz) / dt, a);
  st.ax = clamp(lerp(st.ax, (nvx - st.vx) / dt, ab), -60, 60);
  st.ay = clamp(lerp(st.ay, (nvy - st.vy) / dt, ab), -60, 60);
  st.az = clamp(lerp(st.az, (nvz - st.vz) / dt, ab), -60, 60);
  st.vx = nvx; st.vy = nvy; st.vz = nvz;
  st.yawRate = lerp(st.yawRate, wrapAngle(yaw - st.yaw) / dt, expAlpha(10, dt));
  st.px = x; st.py = y; st.pz = z; st.yaw = yaw;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  st.vForward = st.vx * fx + st.vz * fz; st.vRight = st.vx * rx + st.vz * rz;
  st.aForward = st.ax * fx + st.az * fz; st.aRight = st.ax * rx + st.az * rz;
  st.speed = Math.hypot(st.vx, st.vy, st.vz);
  return st;
}

/** The body's tilt into its motion: nose down when it dives or speeds up, a roll into turns (rad, clamped). */
export function tiltFrom(m: ReturnType<typeof motion>) {
  const h = Math.hypot(m.vx, m.vz);
  const dive = m.vy < -1 ? clamp(Math.atan2(-m.vy, Math.max(h, 0.5)) * 0.8, 0, 1.0) : 0;
  return { pitch: clamp(0.04 * m.aForward, -0.3, 0.3) + dive, roll: clamp(-0.05 * m.aRight - 0.12 * m.yawRate, -0.45, 0.45) };
}

/** The death (t s since): the maw falls slack, the light dies out, the body rolls over and sinks. */
export function deathPose(t: number, side = 1) {
  const k = smoothstep(t / 0.9);
  return { open: 1.25 * smoothstep(t / 0.3), light: 1 - smoothstep(t / 1.2), roll: side * 2.4 * k, sink: 0.9 * k * k, limp: smoothstep(t / 0.5) };
}
