// @ts-check
// The goblin's procedural animation math: pure functions of state and dt, no THREE, no DOM, no game code — so the
// whole thing runs (and is unit-tested) in Node. Everything here is frame-rate independent: springs are solved in
// closed form for the step dt (exact for any dt, so 1/30 and 1/144 land on the same curve), and every smoothing uses
// exp(-k * dt), never a per-frame factor.
//
// The renderer (renderer.ts) calls these every frame with what it reads from the mob (position, yaw, hurt flash, the
// server's cues) and writes the results into the model's joints.

export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** The shortest signed angle from a to b, in (-PI, PI]. */
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const smoothstep = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
/** Exponential smoothing factor for a rate `k` (1/s) over dt: the same curve at any frame rate. */
export const expAlpha = (k, dt) => 1 - Math.exp(-k * dt);

// ---------------------------------------------------------------- springs

/** A 1D spring's state. */
export const spring = (x = 0) => ({ x, v: 0 });

/**
 * Critically damped spring toward `target` with natural frequency `omega` (1/s), solved exactly for dt.
 * Never overshoots, never explodes, whatever dt is.
 */
export function critSpring(s, target, omega, dt) {
  const x0 = s.x - target, e = Math.exp(-omega * dt), b = s.v + omega * x0;
  s.x = target + (x0 + b * dt) * e;
  s.v = (s.v - omega * b * dt) * e;
  return s.x;
}

/**
 * Damped spring (any damping ratio zeta > 0) toward `target`, solved exactly for dt: the ears' wobble (zeta < 1)
 * overshoots and rings down, at the same rate at 30 or 144 frames per second.
 */
export function dampedSpring(s, target, omega, zeta, dt) {
  if (zeta >= 1) return critSpring(s, target, omega, dt);
  const x0 = s.x - target, wd = omega * Math.sqrt(1 - zeta * zeta);
  const e = Math.exp(-zeta * omega * dt), c = Math.cos(wd * dt), sn = Math.sin(wd * dt);
  const B = (s.v + zeta * omega * x0) / wd;
  s.x = target + e * (x0 * c + B * sn);
  s.v = e * (s.v * c - (zeta * omega * B + wd * x0) * sn);
  return s.x;
}

// ---------------------------------------------------------------- gait

/**
 * The gait for a horizontal speed (blocks/s): how long one foot's swing lasts, how far ahead of its rest spot it lands
 * and the error that makes it lift. Faster = shorter swings (higher cadence) AND longer strides; stopped = no step at
 * all beyond a small settle threshold. A foot's stride is speed * 2 * stepDur (one swing + one stance).
 */
export function gaitParams(speed) {
  return gaitScaled(speed, 1);
}

/** gaitParams with the step's time stretched by `scale` (a bigger body takes longer, slower strides: the sentinel's rig). */
export function gaitScaled(speed, scale) {
  const v = Math.max(0, speed);
  const stepDur = clamp(0.34 - 0.045 * v, 0.16, 0.34) * (scale > 0 ? scale : 1);
  return {
    stepDur,
    lead: 0.5 * stepDur, // seconds of velocity the landing spot leads the hip by
    threshold: Math.max(0.09, 0.85 * v * stepDur), // the error (blocks) that lifts the foot
    stride: v * 2 * stepDur,
    cadence: v > 0.05 ? 1 / (2 * stepDur) : 0, // full cycles (two steps) per second
  };
}

/** The swing foot's height over its arc (t 0..1): the lift peaks mid-swing; stepping up rises early, down drops late. */
export function swingHeight(fromY, toY, t, arc) {
  const up = toY > fromY;
  const base = up ? lerp(fromY, toY, smoothstep(t * 1.6)) : lerp(fromY, toY, smoothstep((t - 0.35) / 0.65));
  return base + arc * 4 * t * (1 - t);
}

// ---------------------------------------------------------------- look-at

/**
 * Head yaw and pitch (radians, relative to the body) to look from `eye` at `target`, for a body facing `bodyYaw`
 * (forward = (-sin yaw, -cos yaw), the game's convention). Clamped to what a neck can do; a target behind the
 * shoulder (beyond `giveUp`) is not looked at: { yaw: 0, pitch: 0, looking: false }.
 */
export function lookAngles(eye, target, bodyYaw, { maxYaw = 1.2, maxPitch = 0.7, giveUp = 2.1 } = {}) {
  const dx = target.x - eye.x, dy = target.y - eye.y, dz = target.z - eye.z;
  const h = Math.hypot(dx, dz);
  if (!(h + Math.abs(dy) > 1e-6)) return { yaw: 0, pitch: 0, looking: false };
  const rel = wrapAngle(Math.atan2(-dx, -dz) - bodyYaw);
  if (Math.abs(rel) > giveUp) return { yaw: 0, pitch: 0, looking: false };
  return { yaw: clamp(rel, -maxYaw, maxYaw), pitch: clamp(Math.atan2(dy, h), -maxPitch, maxPitch), looking: true };
}

// ---------------------------------------------------------------- secondary motion

/**
 * Where the ears want to be pushed by the body's motion: turning swings them out (yaw rate, rad/s), braking flings
 * them forward and accelerating sweeps them back (forward acceleration, blocks/s²). The springs do the rest.
 */
export function earDrive(yawRate, accelForward) {
  return { swing: clamp(-yawRate * 0.22, -0.9, 0.9), flap: clamp(-accelForward * 0.09, -0.7, 0.7) };
}

/** Body lean (radians) into the acceleration in the body's frame: pitch forward when speeding up, roll into turns. */
export function leanFrom(accelForward, accelRight) {
  return { pitch: clamp(accelForward * 0.045, -0.35, 0.35), roll: clamp(-accelRight * 0.045, -0.3, 0.3) };
}

/** Idle breathing: chest scale and a small head bob, from the clock (s) and a per-mob phase. */
export function breathe(time, phase = 0) {
  const s = Math.sin(time * TAU * 0.42 + phase);
  return { chest: 1 + 0.035 * s, bob: 0.008 * s };
}

/** A small fast integer hash -> [0, 1): the per-mob fidget schedule, the same in every browser. */
export function hash01(n) {
  let h = (n | 0) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = (h >>> 16) ^ h;
  return (h >>> 0) / 4294967296;
}

/**
 * The fidget at `time` for mob `id`: every few seconds one of 'ear' (a twitch), 'scratch' (a hand to the head),
 * 'glance' (a quick look aside) or null, with its progress 0..1. Deterministic: no Math.random.
 */
export function fidgetAt(id, time) {
  const slot = Math.floor(time / 3.5), local = time - slot * 3.5;
  const r = hash01(id * 7919 + slot);
  if (r < 0.35) return { kind: null, t: 0 };
  const dur = 0.9, start = hash01(id * 104729 + slot) * (3.5 - dur);
  if (local < start || local > start + dur) return { kind: null, t: 0 };
  return { kind: r < 0.6 ? 'ear' : r < 0.82 ? 'glance' : 'scratch', t: (local - start) / dur };
}

// ---------------------------------------------------------------- actions (server cues) and death

export const THROW_TIME = 0.55, STAB_TIME = 0.42;

/**
 * The throwing arm over the throw (t seconds since the cue): wind-up behind the head, a fast whip forward along the
 * aim and a follow-through. `shoulder` is the arm's pitch (0 = hanging, PI = straight up/back), `elbow` its bend,
 * `twist` the torso's yaw; `release` turns true once the pebble has left the hand.
 */
export function throwPose(t) {
  const u = clamp(t / THROW_TIME, 0, 1);
  if (u < 0.45) { const k = smoothstep(u / 0.45); return { shoulder: lerp(0, 3.4, k), elbow: lerp(0.2, 1.7, k), twist: lerp(0, 0.45, k), release: false, weight: k }; }
  if (u < 0.65) { const k = smoothstep((u - 0.45) / 0.2); return { shoulder: lerp(3.4, 1.3, k), elbow: lerp(1.7, 0.1, k), twist: lerp(0.45, -0.35, k), release: k > 0.4, weight: 1 }; }
  const k = smoothstep((u - 0.65) / 0.35);
  return { shoulder: lerp(1.3, 0, k), elbow: lerp(0.1, 0.2, k), twist: lerp(-0.35, 0, k), release: true, weight: 1 - k };
}

/** The stab: draw back, thrust the arm straight forward with a lunge of the torso, recover. */
export function stabPose(t) {
  const u = clamp(t / STAB_TIME, 0, 1);
  if (u < 0.35) { const k = smoothstep(u / 0.35); return { shoulder: lerp(0, 0.6, k), elbow: lerp(0.2, 1.7, k), lunge: lerp(0, -0.12, k), weight: k }; }
  if (u < 0.55) { const k = smoothstep((u - 0.35) / 0.2); return { shoulder: lerp(0.6, 1.55, k), elbow: lerp(1.7, 0, k), lunge: lerp(-0.12, 0.35, k), weight: 1 }; }
  const k = smoothstep((u - 0.55) / 0.45);
  return { shoulder: lerp(1.55, 0, k), elbow: lerp(0, 0.2, k), lunge: lerp(0.35, 0, k), weight: 1 - k };
}

/**
 * The collapse (t seconds since death): the knees buckle, the body drops and tips over to one side with a small
 * bounce, the head lolls. `side` is +1 or -1 (which way it falls, per mob).
 */
export function deathPose(t, side = 1) {
  const buckle = smoothstep(t / 0.35);
  const fallT = clamp((t - 0.2) / 0.5, 0, 1);
  // ease-in fall (gravity) then a damped bounce on the ground
  const fall = fallT < 1 ? fallT * fallT : 1 + 0.08 * Math.exp(-(t - 0.7) * 7) * Math.sin((t - 0.7) * 22);
  return { kneel: buckle, drop: 0.32 * buckle, roll: side * (Math.PI / 2) * 0.92 * fall, head: 0.5 * smoothstep((t - 0.4) / 0.4), fade: clamp((t - 1.0) / 0.4, 0, 1) };
}
