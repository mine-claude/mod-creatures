// @ts-check
// The Musgarrete's WORK MOTIONS, as pure math (no THREE): the renderer poses the arms with these, the tests check them
// (tests/suites/folk-musgarrete-motion.js). Every curve is a function of the time since its cue and of WHERE the work is —
// the cell being dug or built, in the body's local frame — so a pick that swings really comes down ON the block.
import { clamp, lerp, smoothstep } from '../goblin/procedural.ts';

// The rig, in blocks (model.ts builds with the same numbers). Short root legs, long root arms, a boulder of a body.
export const MUSG_RIG = Object.freeze({
  hipWidth: 0.15, hipHeight: 0.38, thigh: 0.2, shin: 0.19, ankle: 0.04, stepUpMax: 1.25, stepDownMax: 2.6, gaitScale: 1.35,
});
export const ARM = Object.freeze({ upper: 0.27, fore: 0.27, shoulderX: 0.36, shoulderY: 0.62 }); // shoulders above the hips
export const TORSO_Y = 0.04; // the torso's pivot above the pelvis
export const TOOL_LEN = 0.55; // the pick's handle: its head is this far past the fist

export const DIG_TIME = 0.55, PLACE_TIME = 0.45, RING_TIME = 0.7, WAVE_TIME = 1.6, HARVEST_TIME = 0.8;

/**
 * The aim of an arm hanging from a shoulder at (local) `shoulder` toward `target` (local, blocks): the arm's pitch from
 * hanging (0 = straight down, PI/2 = forward, PI = straight up) and its yaw (+ = toward the body's left), and the distance.
 * Forward is -z (the game's convention).
 */
export function aimAt(shoulder: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }) {
  const dx = target.x - shoulder.x, dy = target.y - shoulder.y, dz = target.z - shoulder.z;
  const h = Math.hypot(dx, dz);
  const pitch = Math.atan2(h, -dy); // 0 when the target is straight below
  const yaw = h > 1e-6 ? Math.atan2(-dx, -dz) : 0;
  return { pitch, yaw, dist: Math.hypot(dx, dy, dz) };
}

/**
 * The dig swing (t s since the 'dig' cue): the arm rises behind the head, then comes down ALONG the aim to the block (the
 * strike lands at u = 0.55, exactly at `aimPitch`), a small rebound, and the arm rests toward the block until the next cue.
 * Returns the shoulder pitch, the elbow bend and `hit` (true in the strike's frame window).
 */
export function digSwing(t: number, aimPitch: number) {
  const u = clamp(t / DIG_TIME, 0, 1);
  const up = Math.min(Math.PI * 0.95, aimPitch + 1.7);
  if (u < 0.35) { const k = smoothstep(u / 0.35); return { shoulder: lerp(aimPitch, up, k), elbow: lerp(0.25, 1.2, k), hit: false, lean: lerp(0, -0.08, k) }; }
  if (u < 0.55) { const k = smoothstep((u - 0.35) / 0.2); return { shoulder: lerp(up, aimPitch, k), elbow: lerp(1.2, 0.05, k), hit: u >= 0.53, lean: lerp(-0.08, 0.16, k) }; }
  const k = smoothstep((u - 0.55) / 0.45);
  return { shoulder: aimPitch + 0.12 * Math.sin(k * Math.PI), elbow: lerp(0.05, 0.25, k), hit: false, lean: lerp(0.16, 0.04, k) };
}

/** The place reach (t s since 'place'): both arms out along the aim to set the block in the cell, then back. */
export function placeReach(t: number) {
  const u = clamp(t / PLACE_TIME, 0, 1);
  return { weight: Math.sin(Math.PI * smoothstep(u)), lean: 0.18 * Math.sin(Math.PI * u) };
}

/** The bell: both arms raised and brought down together onto the hollow stone. */
export function ringSwing(t: number) {
  const u = clamp(t / RING_TIME, 0, 1);
  if (u < 0.45) { const k = smoothstep(u / 0.45); return { shoulder: lerp(0.9, 2.6, k), elbow: lerp(0.3, 0.9, k) }; }
  const k = smoothstep((u - 0.45) / 0.55);
  return { shoulder: lerp(2.6, 1.0, Math.min(1, k * 1.6)), elbow: lerp(0.9, 0.2, k) };
}

/** A wave: the arm up and the forearm rocking side to side. */
export function waveArm(t: number) {
  const u = clamp(t / WAVE_TIME, 0, 1), w = Math.sin(Math.PI * smoothstep(Math.min(1, u * 1.3)));
  return { shoulder: 2.6 * w, roll: 0.5 * w, elbow: (0.5 + 0.45 * Math.sin(t * 13)) * w, weight: w };
}

/** The curl of a sleeping Musgarrete (0 standing .. 1 a mossy boulder): how far each joint folds. */
export function curlPose(k: number) {
  const c = smoothstep(k);
  return { kneel: c, drop: 0.24 * c, hunch: 1.0 * c, arms: c, head: 0.6 * c };
}
