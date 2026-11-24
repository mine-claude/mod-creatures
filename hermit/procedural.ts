// @ts-check
// The Tide Hermit's procedural animation math (everything but the feet, which are gait.ts): pure functions of state and
// dt — no THREE, no DOM, no game code — so it runs and is unit-tested in Node. Frame-rate independent: the springs are
// the goblin's closed-form ones (exact for any dt), timelines are functions of elapsed time, smoothing is exp(-k dt).
//
//   eyes      each stalk aims at the player on its own (its own position, its own spring, its own idle glances), within
//             what a stalk can swivel; a startled hermit's stalks fold down flat
//   claws     the big claw's SNAP (wind-up open, a hard close with a springy overshoot of the arm) and the small claw's
//             quick PINCH, both underdamped springs; idle, the fingers work at the sand (the forage 'pick')
//   antennae  sway with the clock and swing with the body's acceleration (springs)
//   retreat   the soft body pulls back into the shell, the legs tuck in one after another (back to front), the claws
//             fold over the opening, the eyes go last; the shell rocks when it lands and when a blow knocks on it
//   peek      the way out again: ONE eye stalk pops out first, a beat later the other, then the antennae, the claws and
//             the legs in sequence
//   death     the legs curl under, the body sinks into the shell and the shell tips over onto its side
import { clamp, critSpring, dampedSpring, hash01, lerp, lookAngles, smoothstep, spring, TAU, wrapAngle } from '../goblin/procedural.ts';

export { clamp, critSpring, dampedSpring, hash01, lerp, smoothstep, spring, TAU, wrapAngle };

// ---------------------------------------------------------------- eyes

/** How far an eye stalk swivels (rad, relative to the body). */
export const EYE_LIMITS = Object.freeze({ maxYaw: 1.35, maxPitch: 0.8, giveUp: 2.6 });

/**
 * Where one eye stalk wants to point: at the target (each from its own base, so the two converge on a near player) when
 * it is in view, else an idle glance of its own (a hash schedule per eye, never the same as the other eye's).
 * Returns { yaw, pitch, looking } within EYE_LIMITS.
 */
export function eyeAim(eye, target, bodyYaw, id, side, time) {
  if (target) {
    const la = lookAngles(eye, target, bodyYaw, EYE_LIMITS);
    if (la.looking) return la;
  }
  const slot = Math.floor(time / 1.7 + hash01(id * 13 + side * 5) * 3);
  const r1 = hash01(id * 977 + slot * 31 + (side > 0 ? 1 : 2)), r2 = hash01(id * 613 + slot * 17 + (side > 0 ? 3 : 4));
  return { yaw: clamp((r1 - 0.5) * 1.6 + side * 0.25, -EYE_LIMITS.maxYaw, EYE_LIMITS.maxYaw), pitch: clamp((r2 - 0.6) * 0.7, -EYE_LIMITS.maxPitch, EYE_LIMITS.maxPitch), looking: false };
}

/** One eye's spring state: yaw and pitch, underdamped (a stalk overshoots a little and settles). */
export const eyeState = () => ({ yaw: spring(0), pitch: spring(0) });
export function stepEye(s, aim, dt, omega = 16) {
  dampedSpring(s.yaw, aim.yaw, omega, 0.55, dt);
  dampedSpring(s.pitch, aim.pitch, omega, 0.55, dt);
  // never past what the stalk can do, even mid-overshoot
  s.yaw.x = clamp(s.yaw.x, -EYE_LIMITS.maxYaw - 0.15, EYE_LIMITS.maxYaw + 0.15);
  s.pitch.x = clamp(s.pitch.x, -EYE_LIMITS.maxPitch - 0.15, EYE_LIMITS.maxPitch + 0.15);
  return s;
}

// ---------------------------------------------------------------- claws

export const SNAP_TIME = 0.62, PINCH_TIME = 0.3, PICK_TIME = 0.9;

/**
 * The big claw over a snap (t s since the cue): it winds up (the arm draws back and the finger opens wide), then
 * strikes (the arm shoots forward and the finger slams shut) and recovers. Returns targets for the springs:
 * open 0..1 (the finger), reach (the arm, -1 drawn back .. 1 thrust out) and lift (the arm raised).
 */
export function snapTargets(t) {
  if (t < 0) return { open: 0.15, reach: 0, lift: 0 };
  if (t < 0.24) { const k = smoothstep(t / 0.24); return { open: lerp(0.15, 1, k), reach: lerp(0, -0.7, k), lift: lerp(0, 0.6, k) }; }
  if (t < 0.36) return { open: 0, reach: 1, lift: 0.15 }; // the strike: the springs carry the overshoot
  const k = smoothstep((t - 0.36) / (SNAP_TIME - 0.36));
  return { open: lerp(0, 0.15, k), reach: lerp(1, 0, k), lift: lerp(0.15, 0, k) };
}

/** The small claw over a pinch: a quick open and close with a little jab. */
export function pinchTargets(t) {
  if (t < 0 || t >= PINCH_TIME) return { open: 0.2, reach: 0, lift: 0 };
  const u = t / PINCH_TIME;
  return u < 0.4 ? { open: lerp(0.2, 1, smoothstep(u / 0.4)), reach: 0.3, lift: 0.2 } : { open: 0, reach: 0.9, lift: 0 };
}

/** Picking at the sand: the small claw dips to the ground and back, twice, the fingers nibbling. */
export function pickTargets(t) {
  if (t < 0 || t >= PICK_TIME) return null;
  const u = t / PICK_TIME, dips = Math.sin(u * Math.PI * 2) ** 2;
  return { dip: dips, open: 0.2 + 0.6 * Math.max(0, Math.sin(u * Math.PI * 8)) };
}

/** A claw's springs: the finger (fast, a lot of overshoot) and the arm (slower, some). */
export const clawState = () => ({ open: spring(0.15), reach: spring(0), lift: spring(0) });
export function stepClaw(s, want, dt, big = true) {
  dampedSpring(s.open, want.open, big ? 34 : 40, 0.32, dt);
  dampedSpring(s.reach, want.reach, big ? 22 : 30, 0.42, dt);
  dampedSpring(s.lift, want.lift, 16, 0.6, dt);
  return s;
}

// ---------------------------------------------------------------- antennae

/** The antennae's drive: a lazy sway from the clock plus a swing against the body's acceleration (body frame). */
export function antennaDrive(time, phase, side, aForward, aRight) {
  return {
    yaw: Math.sin(time * 1.7 + phase + side) * 0.22 + clamp(-aRight * 0.05, -0.5, 0.5),
    pitch: Math.sin(time * 2.3 + phase * 1.3 + side * 0.7) * 0.12 + clamp(aForward * 0.05, -0.4, 0.4),
  };
}

// ---------------------------------------------------------------- retreat and peek

/**
 * How far out each part is (1 = out, 0 = tucked in the shell) for the state `state` at `t` s since it began:
 *   retreat: the legs tuck back to front (0.06 s apart), the claws fold, the body pulls in, the eyes go last;
 *   peek: the LEFT eye stalk pops out first, the right one a beat later, then the antennae, the claws, the body, the legs;
 *   anything else: all out.
 * Feed these into springs (the renderer does): an interrupted retreat comes back out smoothly.
 */
export function shellTargets(state, t) {
  const legs = new Array(8);
  if (state === 'retreat') {
    for (let i = 0; i < 8; i++) {
      const k = 3 - (i % 4); // back legs first
      legs[i] = 1 - smoothstep((t - 0.03 * (i >= 4 ? 1 : 0) - 0.07 * k) / 0.22);
    }
    const claws = 1 - smoothstep((t - 0.18) / 0.25);
    const body = 1 - smoothstep((t - 0.12) / 0.4);
    const antennae = 1 - smoothstep((t - 0.2) / 0.3);
    const eyeL = 1 - smoothstep((t - 0.42) / 0.16), eyeR = 1 - smoothstep((t - 0.36) / 0.16);
    return { legs, claws, body, antennae, eyeL, eyeR };
  }
  if (state === 'peek') {
    const eyeL = smoothstep(t / 0.22);
    const eyeR = smoothstep((t - 0.48) / 0.2);
    const antennae = smoothstep((t - 0.62) / 0.25);
    const body = smoothstep((t - 0.7) / 0.45);
    const claws = smoothstep((t - 0.8) / 0.3);
    for (let i = 0; i < 8; i++) legs[i] = smoothstep((t - 0.9 - 0.04 * (i % 4) - 0.02 * (i >= 4 ? 1 : 0)) / 0.2);
    return { legs, claws, body, antennae, eyeL, eyeR };
  }
  legs.fill(1);
  return { legs, claws: 1, body: 1, antennae: 1, eyeL: 1, eyeR: 1 };
}

/**
 * The shell's rock: a spring (angle about the body's length) kicked when the body slams in and when a blow knocks on
 * the shell, ringing down on its own. `kick` adds angular velocity (rad/s).
 */
export const rockState = () => ({ roll: spring(0), pitch: spring(0) });
export function stepRock(s, dt) {
  dampedSpring(s.roll, 0, 11, 0.18, dt);
  dampedSpring(s.pitch, 0, 9, 0.22, dt);
  return s;
}
export function kickRock(s, roll, pitch = 0) { s.roll.v += roll; s.pitch.v += pitch; }

// ---------------------------------------------------------------- death

/** The death (t s): the legs curl under, the body sinks into the shell, the shell tips over onto its side with a bounce. */
export function hermitDeath(t, side = 1) {
  const curl = smoothstep(t / 0.5);
  const sink = smoothstep((t - 0.2) / 0.5);
  const tipT = clamp((t - 0.45) / 0.45, 0, 1);
  const tip = tipT < 1 ? tipT * tipT : 1 + 0.12 * Math.exp(-(t - 0.9) * 7) * Math.sin((t - 0.9) * 20);
  return { curl, sink, tip: side * 1.25 * tip, eyes: 1 - smoothstep((t - 0.1) / 0.35) };
}
