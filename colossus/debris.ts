// @ts-check
// Falling stone plates (client-side debris): pure physics, no THREE — the renderer copies { x, y, z, rx, ry, rz, scale }
// onto the detached mesh every frame; the tests run the same steps in Node at several frame rates.
// A piece gets a push away from the body plus a hop, tumbles (angular velocity), falls under gravity, bounces on the
// ground it was given (a little, losing most of its speed), slides to rest, lies there and then sinks/shrinks away.
import { clamp } from '../goblin/procedural.ts';

export const DEBRIS = Object.freeze({
  gravity: 24, // blocks/s² (heavy stone)
  bounce: 0.28, // of the vertical speed kept on a bounce
  friction: 0.55, // of the horizontal speed (and spin) kept on a bounce
  rest: 0.9, // below this vertical speed on landing it stops bouncing
  slide: 3.2, // 1/s: how fast a resting piece's slide dies out
  life: 3.2, // s before it is gone
  fade: 0.7, // s of shrinking at the end
  maxStep: 1 / 60, // physics sub-step (s): the same path at 30 and 144 fps
});

/**
 * A new piece. `from` its world position, `center` the body's centre (the push goes away from it), `ground` the top of
 * the ground under it (null: falls `fallMax` at most), `r` a 0..1 random pair source for the spread (deterministic in tests).
 */
export function newDebris(from, center, ground, r = [0.5, 0.5, 0.5], { push = 2.2, hop = 3.5, half = 0.1 } = {}) {
  const dx = from.x - center.x, dz = from.z - center.z, h = Math.hypot(dx, dz) || 1;
  const ang = (r[0] - 0.5) * 0.9;
  const c = Math.cos(ang), s = Math.sin(ang);
  const ox = dx / h, oz = dz / h;
  return {
    x: from.x, y: from.y, z: from.z, rx: 0, ry: 0, rz: 0,
    vx: (ox * c - oz * s) * push * (0.7 + 0.6 * r[1]), vz: (ox * s + oz * c) * push * (0.7 + 0.6 * r[1]), vy: hop * (0.6 + 0.6 * r[2]),
    wx: (r[1] - 0.5) * 9, wy: (r[2] - 0.5) * 5, wz: (r[0] - 0.5) * 9,
    ground: Number.isFinite(ground) ? ground : from.y - 4, half, age: 0, resting: false, bounces: 0, scale: 1, alive: true,
  };
}

function sub(d, dt) {
  if (!d.resting) {
    d.vy -= DEBRIS.gravity * dt;
    d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
    d.rx += d.wx * dt; d.ry += d.wy * dt; d.rz += d.wz * dt;
    const floor = d.ground + d.half;
    if (d.y <= floor) {
      d.y = floor;
      if (-d.vy < DEBRIS.rest) { d.resting = true; d.vy = 0; }
      else { d.vy = -d.vy * DEBRIS.bounce; d.bounces++; }
      d.vx *= DEBRIS.friction; d.vz *= DEBRIS.friction;
      d.wx *= DEBRIS.friction; d.wy *= DEBRIS.friction; d.wz *= DEBRIS.friction;
    }
  } else {
    const k = Math.exp(-DEBRIS.slide * dt);
    d.vx *= k; d.vz *= k; d.wx *= k; d.wy *= k; d.wz *= k;
    d.x += d.vx * dt; d.z += d.vz * dt;
    d.rx += d.wx * dt; d.ry += d.wy * dt; d.rz += d.wz * dt;
  }
}

/** One frame (any dt, sub-stepped). Returns whether the piece is still there. */
export function stepDebris(d, dt) {
  if (!d.alive) return false;
  let left = clamp(dt, 0, 0.25);
  while (left > 1e-9) { const h = Math.min(DEBRIS.maxStep, left); sub(d, h); left -= h; }
  d.age += clamp(dt, 0, 0.25);
  const fadeAt = DEBRIS.life - DEBRIS.fade;
  d.scale = d.age < fadeAt ? 1 : clamp(1 - (d.age - fadeAt) / DEBRIS.fade, 0, 1);
  if (d.age >= DEBRIS.life) d.alive = false;
  return d.alive;
}
