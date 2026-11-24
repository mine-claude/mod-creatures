// @ts-check
// The Ruin Colossus's procedural animation math: pure functions of state, time and dt — no THREE, no DOM, no game code —
// so all of it runs (and is unit-tested) in Node. The feet themselves come from the goblin's solver
// (goblin/locomotion.ts) on COLOSSUS_RIG's long legs and slow cadence; this file adds what makes it HEAVY:
//   - bodyMass: the pelvis carries the mass over the planted foot while the other swings, the hip drops on the swinging
//     side, and the whole body settles into each footfall (an impact spring the renderer kicks on landing);
//   - counterRotation: the pelvis turns with the stride, the shoulders against it;
//   - the arms: pendulums (under-damped springs) driven by the opposite leg and the body's acceleration, jolted by each
//     footfall — the forearms are huge, so they lag and overshoot;
//   - the actions the server's pose names (tuning.ts): the kneel (dormant), the wake-up, the slam's wind-up and the
//     impact, tearing a rock from its back and hurling it, settling back to the kneel;
//   - the rune glow (breathing pulse, flaring on the wind-up, brighter as plates are lost) and the crumble's order.
// Every smoothing is closed-form in dt (the goblin's springs), so 1/30 and 1/144 land on the same curve.
import { clamp, lerp, smoothstep, TAU, hash01 } from '../goblin/procedural.ts';
import { TUNING } from './tuning.ts';

// The legs, in blocks (model.ts builds with the same numbers). gaitScale stretches the goblin's step timing: slow,
// long strides. stepUpMax/stepDownMax as the goblin's (a 1-block step is climbed, a ledge is not searched).
export const COLOSSUS_RIG = Object.freeze({
  hipWidth: 0.34, hipHeight: 1.02, thigh: 0.56, shin: 0.54, ankle: 0.12, stepUpMax: 1.25, stepDownMax: 2.6, gaitScale: 2.3,
});
// The arms: shoulder joints at x = +-shoulderX, shoulderY above the torso joint; bone lengths.
export const ARM = Object.freeze({ shoulderX: 0.7, shoulderY: 0.86, upper: 0.6, fore: 0.7, fist: 0.42 });
export const TORSO_Y = 0.1; // the torso joint above the pelvis
export const NECK = Object.freeze({ y: 0.98, z: -0.16 });
export const HUNCH = 0.32; // the torso's forward stoop (rad)

// ---------------------------------------------------------------- weight

/**
 * Where the mass goes this frame, from the two feet of the locomotion state ({ side, planted, t }):
 *   lateral  pelvis shift (blocks, + = toward +x) — over the planted foot while the other swings;
 *   roll     pelvis roll (rad, THREE's z) — the hip drops on the swinging side;
 *   rise     the body vaults a little over the stance leg mid-swing (blocks);
 *   w        how far into its swing the moving foot is (0 at lift-off and at landing, 1 mid-swing).
 * Continuous in time: every term is scaled by w, which is 0 whenever the swinging foot changes.
 */
export function bodyMass(feet, rig = COLOSSUS_RIG) {
  const sw = feet.find((f) => !f.planted);
  if (!sw) return { lateral: 0, roll: 0, rise: 0, w: 0, side: 0 };
  const w = Math.sin(Math.PI * clamp(sw.t, 0, 1));
  return { lateral: -sw.side * rig.hipWidth * 0.62 * w, roll: -sw.side * 0.085 * w, rise: 0.035 * w, w, side: sw.side };
}

/** The pelvis turns with the stride (the leg ahead pulls its hip forward); the shoulders turn against it. */
export function counterRotation(fwdL, fwdR) {
  const pelvis = clamp((fwdR - fwdL) * 0.28, -0.3, 0.3);
  return { pelvis, torso: -1.25 * pelvis };
}

/** An arm's pendulum target (shoulder pitch, rad): swung by the OPPOSITE foot's forward offset, thrown back by acceleration. */
export function armSwingTarget(otherFootFwd, aForward) {
  return clamp(otherFootFwd * 0.75, -0.55, 0.55) - clamp(aForward * 0.05, -0.3, 0.3);
}
/** The footfall's kick to the body's impact spring (velocity, blocks/s: down) and to the arms (rad/s), by speed. */
export const footfallKick = (speed) => ({ body: -(0.55 + 0.25 * Math.min(2, speed)), arm: 0.9 + 0.3 * Math.min(2, speed) });

/** Slow, deep breathing: chest scale and a sink of the shoulders, from the clock (s) and a per-mob phase. */
export function breatheSlow(time, phase = 0) {
  const s = Math.sin(time * TAU * 0.22 + phase);
  return { chest: 1 + 0.028 * s, sink: 0.012 * s, s };
}

// ---------------------------------------------------------------- the actions

/** The kneel (the dormant statue) as targets in the model's frame: pelvis low, the left knee on the ground, the right
 * foot forward, the torso bowed over the fists on the ground. */
export const KNEEL = Object.freeze({
  hipY: 0.6,
  ankleL: { y: 0.12, z: 0.62 }, // behind: the shin lies on the ground, the knee down in front of it
  ankleR: { y: 0.12, z: -0.42 }, // ahead: the knee up
  torso: -0.62, // bowed forward
  head: 0.55, // chin down (relative)
  shoulder: 0.45, elbow: 0.25, // the fists on the ground in front
});

const seg = (u, a, b) => smoothstep((u - a) / (b - a));

/**
 * The wake-up (t seconds since the 'wake' pose; TUNING.wakeMs long): the rune eye kindles first, the head lifts, the
 * fists push on the ground, the body rises off the knee with a heave, a shudder sheds dust, it stands.
 *   kneel 1 -> 0, head (extra lift, rad), push (arms pressing down 0..1), glow (0..1), shudder (0..1, a short tremor).
 */
export function wakeCurve(t) {
  const u = clamp(t / (TUNING.wakeMs / 1000), 0, 1);
  const kneel = 1 - seg(u, 0.32, 0.92);
  return {
    kneel,
    head: -0.55 * seg(u, 0.05, 0.3) * (1 - seg(u, 0.85, 1)),
    push: seg(u, 0.2, 0.42) * (1 - seg(u, 0.62, 0.85)),
    glow: seg(u, 0, 0.35),
    shudder: u > 0.55 && u < 0.8 ? Math.sin((u - 0.55) / 0.25 * Math.PI) : 0,
    done: u >= 1,
  };
}

/** Settling back into the kneel (TUNING.settleMs): the reverse, slower, the glow dimming last. */
export function settleCurve(t) {
  const u = clamp(t / (TUNING.settleMs / 1000), 0, 1);
  return { kneel: seg(u, 0, 0.75), glow: 1 - 0.9 * seg(u, 0.5, 1), done: u >= 1 };
}

/** A pose blend for an action: per arm { sh, el, roll } (sh: shoulder pitch, + = forward/up; el: elbow bend), the torso's
 * pitch (+ = arch back) and yaw, a crouch (blocks the hips drop), the glow flare and the blend weight. */
const pose = (shL, elL, shR, elR, torso, yaw, crouch, flare, weight, roll = 0.12) => ({
  arms: [{ sh: shL, el: elL, roll }, { sh: shR, el: elR, roll }], torso, yaw, crouch, flare, weight,
});
// the wind-up's phases (s): raise, hold (trembling), the swing down that lands as the server's slam arrives
export const WINDUP = Object.freeze({ raise: 0.55, hold: 0.7, swing: 0.8 });

/** The slam's wind-up (t since the 'windup' pose): both fists raised high over the head, the back arched, a crouch of
 * anticipation, a tremble of strain, then the swing down (overhead -> the ground) over the last 0.1 s. */
export function windupPose(t) {
  const W = WINDUP;
  const raise = smoothstep(t / W.raise);
  if (t < W.hold) {
    const tremble = t > W.raise ? Math.sin(t * 61) * 0.025 : 0;
    return pose(lerp(0, 2.95, raise) + tremble, lerp(0.3, 0.75, raise), lerp(0, 2.95, raise) - tremble, lerp(0.3, 0.75, raise),
      lerp(0, 0.32, raise), 0, lerp(0, 0.12, raise), raise, Math.min(1, raise * 1.5), lerp(0.12, -0.05, raise));
  }
  const k = smoothstep((t - W.hold) / (W.swing - W.hold));
  return pose(lerp(2.95, 1.75, k), lerp(0.75, 0.05, k), lerp(2.95, 1.75, k), lerp(0.75, 0.05, k),
    lerp(0.32, -0.75, k), 0, lerp(0.12, 0.3, k), 1, 1, -0.05);
}

/** After the impact (t since the 'slam' pose; TUNING.slamRecoverMs): fists in the ground, bent over, then hauled out. */
export function slamPose(t) {
  const u = clamp(t / (TUNING.slamRecoverMs / 1000), 0, 1);
  const k = smoothstep((u - 0.35) / 0.65);
  const bounce = Math.exp(-t * 9) * Math.sin(t * 30) * 0.06; // the jolt of the blow
  return pose(lerp(1.75, 0, k), lerp(0.05, 0.3, k), lerp(1.75, 0, k), lerp(0.05, 0.3, k),
    lerp(-0.75, 0, k) + bounce, 0, lerp(0.3, 0, k), 1 - u, 1 - smoothstep((u - 0.6) / 0.4), -0.05);
}

/** Tearing a rock out of its own back and raising it (t since 'lift'; TUNING.liftMs): the right hand reaches over the
 * shoulder, wrenches (a twist), and lifts the chunk high behind the head. `rock` = the chunk is in the hand. */
export function liftPose(t) {
  const u = clamp(t / (TUNING.liftMs / 1000), 0, 1);
  const reach = smoothstep(u / 0.4), wrench = u > 0.4 && u < 0.6 ? Math.sin((u - 0.4) / 0.2 * Math.PI) : 0, up = smoothstep((u - 0.55) / 0.45);
  const p = pose(lerp(0, 0.5, reach), 0.6, lerp(0, 3.2, reach) + 0.25 * wrench, lerp(0.3, 2.0 - 0.6 * up, reach),
    lerp(0, 0.18, reach), lerp(0, 0.55, reach) + 0.12 * wrench, 0.06 * reach, 0.4 * reach, Math.min(1, reach * 1.6));
  return { ...p, rock: u > 0.45 };
}

/** The hurl (t since 'hurl'; TUNING.hurlRecoverMs + the swing): a fast whip forward along the aim, release, follow-through. */
export function hurlPose(t) {
  const u = clamp(t / (TUNING.hurlRecoverMs / 1000), 0, 1);
  if (u < 0.25) {
    const k = smoothstep(u / 0.25);
    return { ...pose(lerp(0.5, -0.2, k), 0.6, lerp(3.2, 1.1, k), lerp(1.4, 0.15, k), lerp(0.18, -0.35, k), lerp(0.55, -0.45, k), 0.06, 0.6, 1), rock: k < 0.5 };
  }
  const k = smoothstep((u - 0.25) / 0.75);
  return { ...pose(lerp(-0.2, 0, k), lerp(0.6, 0.3, k), lerp(1.1, 0, k), lerp(0.15, 0.3, k), lerp(-0.35, 0, k), lerp(-0.45, 0, k), lerp(0.06, 0, k), 0.6 * (1 - k), 1 - k), rock: false };
}

// ---------------------------------------------------------------- the glow

/**
 * The runes' brightness (0..1.6): a slow breathing pulse; nearly dark while dormant (a faint flicker so a sharp eye
 * can tell the statue is not just stone); brighter with every lost tier (the core is bare); flaring with the action.
 */
export function runeGlow(time, { phase = 0, tier = 0, dormant = 0, flare = 0, wake = 1 } = {}) {
  const pulse = 0.5 + 0.5 * Math.sin(time * TAU * 0.22 + phase); // in step with the breathing
  const awake = 0.45 + 0.25 * pulse + 0.15 * tier;
  const asleep = 0.08 + 0.05 * Math.max(0, Math.sin(time * 1.7 + phase * 3)) ** 8;
  const base = lerp(awake, asleep, clamp(dormant, 0, 1)) * lerp(0.15, 1, clamp(wake, 0, 1));
  return clamp(base + 0.6 * clamp(flare, 0, 1), 0, 1.6);
}

// ---------------------------------------------------------------- the crumble

/**
 * The order the body falls apart in (the death): pieces from the top down (head and shoulders first, the feet last),
 * with a per-piece jitter from a hash so it never looks like a wipe, spread over `span` seconds after `start`.
 * items: [{ y }] (world height of each piece). Returns the detach time (s) of each, in the input order. Deterministic.
 */
export function crumbleTimes(items, { start = 0.25, span = 1.9, seed = 1 } = {}) {
  if (!items.length) return [];
  let lo = Infinity, hi = -Infinity;
  for (const it of items) { lo = Math.min(lo, it.y); hi = Math.max(hi, it.y); }
  const range = Math.max(1e-6, hi - lo);
  return items.map((it, i) => {
    const fromTop = (hi - it.y) / range; // 0 = the highest piece
    return start + span * clamp(0.8 * fromTop + 0.2 * hash01(seed * 7919 + i * 31), 0, 1);
  });
}
