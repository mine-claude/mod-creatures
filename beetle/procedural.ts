// @ts-check
// The Crystal Beetle's procedural animation math: pure functions of state and dt (no THREE, no DOM, no game code), so it
// runs — and is unit-tested — in Node. Frame-rate independent: the springs are the goblin's closed-form ones (exact for
// any dt) and the roll is integrated from the distance actually travelled, never from a per-frame constant.
import { clamp, critSpring, lerp, smoothstep, TAU, wrapAngle } from '../goblin/procedural.ts';
import { BODY, POSES } from './tuning.ts';

export { clamp, critSpring, lerp, smoothstep, TAU, wrapAngle };

/** What each server pose asks of the body: curled into a ball (0..1), on its back (0..1), rolling (the ball turns with its speed). */
export function poseTargets(pose) {
  switch (pose) {
    case POSES.curl: return { curl: 1, flip: 0, rolling: false };
    case POSES.roll: return { curl: 1, flip: 0, rolling: true };
    case POSES.flipped: return { curl: 0, flip: 1, rolling: false };
    case POSES.uncurl: return { curl: 0, flip: 0, rolling: false };
    default: return { curl: 0, flip: 0, rolling: false };
  }
}

/**
 * The ball's roll angle after moving `forward` blocks along its facing (negative = backwards): a ball of radius r turns
 * by distance / r, so the shell never slides over the ground, at any speed and any frame rate.
 */
export const rollBy = (angle: number, forward: number, r: number = BODY.ballR) => angle + forward / r;

/**
 * Not rolling any more: the angle eases to the nearest whole turn (the shell upright again), critically damped so it
 * never spins back past it. `s` is a spring { x, v } holding the angle.
 */
export function settleRoll(s, omega, dt) {
  const target = s.x + wrapAngle(-s.x); // the nearest multiple of 2π
  return critSpring(s, target, omega, dt);
}

/** The forward component (blocks) of a displacement (dx, dz) for a body facing `yaw` (forward = (-sin yaw, -cos yaw)). */
export const forwardOf = (dx, dz, yaw) => -dx * Math.sin(yaw) - dz * Math.cos(yaw);

// ---------------------------------------------------------------- legs

/** The six legs: [side (+1 / -1), hip z (blocks, - = front), resting splay (rad, + = forward), tripod 0/1]. */
export const LEGS = Object.freeze([
  [1, -0.24, 0.55, 0], [-1, -0.24, 0.55, 1],
  [1, 0.02, 0, 1], [-1, 0.02, 0, 0],
  [1, 0.28, -0.5, 0], [-1, 0.28, -0.5, 1],
]);
export const LEG = Object.freeze({ hipX: 0.27, hipY: -0.12, femur: 0.3, tibia: 0.5, up: 0.5, down: 1.15 });

/**
 * The tripod gait at `phase` (rad) for leg i and gait amount k (0 = standing, 1 = full stride): forward swing of the
 * hip (rad), the lift while the leg swings forward (rad) and the knee's extra bend on the lift.
 */
export function tripod(phase, i, k) {
  const p = phase + (LEGS[i][3] ? Math.PI : 0);
  const lift = Math.max(0, Math.cos(p));
  return { swing: Math.sin(p) * 0.38 * k, lift: lift * 0.4 * k, knee: lift * 0.25 * k };
}

/**
 * On its back, the legs paddle at the air: each leg on its own fast rhythm (a hash of its index, never in step with the
 * others), stronger right after it lands on its back and tiring towards the end of the stun (`t` s since flipped).
 */
export function flail(time, i, t = 0) {
  const vigour = clamp(1.2 - 0.12 * t, 0.55, 1.2);
  const f = 11 + (i * 2.3) % 5, ph = i * 1.9;
  return {
    swing: Math.sin(time * f + ph) * 0.55 * vigour,
    lift: (0.35 + 0.3 * Math.sin(time * (f * 0.7) + ph * 1.3)) * vigour,
    knee: (0.4 + 0.45 * Math.sin(time * (f * 1.3) + ph)) * vigour,
  };
}

/** How high the body's centre rides: standing on its legs, curled as a ball on the ground, upside down on its shell. */
export const CENTER = Object.freeze({ stand: 0.42, ball: BODY.ballR, back: 0.44 }); // on its back it rests on the tips of its crystals

/** The body's centre height and roll (rad about its length) for curl c and flip f (0..1), with a hop mid-turn. */
export function bodyFrame(c, f, time = 0, stunT = 0) {
  const base = lerp(lerp(CENTER.stand, CENTER.ball, c), CENTER.back, f);
  const hop = 0.22 * Math.sin(Math.PI * clamp(f, 0, 1)); // it has to clear its own shell to turn over
  const rock = f > 0.95 ? Math.sin(time * 7.5) * 0.12 * clamp(1 - 0.2 * stunT, 0.3, 1) : 0; // rocking on the dome
  return { y: base + hop, roll: Math.PI * f + rock };
}

// ---------------------------------------------------------------- glow

/**
 * The shell's glow (0..1): a slow breathing pulse; brighter and faster while curled or rolling (the crystals charge),
 * a stuttering flicker while stunned, fading out over the death.
 */
export function glowLevel(time, { curl = 0, flip = 0, dying = -1, phase = 0 } = {}) {
  let g = 0.62 + 0.18 * Math.sin(time * TAU * 0.35 + phase);
  g += curl * (0.18 + 0.1 * Math.sin(time * TAU * 1.6 + phase));
  if (flip > 0.5) g = lerp(g, 0.35 + 0.45 * Math.abs(Math.sin(time * 17 + phase)) * (Math.sin(time * 3.1) > -0.3 ? 1 : 0.3), flip);
  if (dying >= 0) g *= 1 - smoothstep(dying / 1.3);
  return clamp(g, 0, 1);
}

// ---------------------------------------------------------------- death

/** The death (t s): it keels over onto its back, the legs curl in, the crystals go dark (glowLevel with `dying`). */
export function beetleDeath(t) {
  const turn = smoothstep(t / 0.55);
  const curl = smoothstep((t - 0.35) / 0.7);
  const settle = t > 0.55 ? 0.06 * Math.exp(-(t - 0.55) * 8) * Math.sin((t - 0.55) * 26) : 0;
  return { flip: turn, legCurl: curl, settle };
}
