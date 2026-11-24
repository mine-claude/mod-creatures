// @ts-check
// The Lure Lantern's FLIGHT, as pure math (no game code): the server brain (mob.ts) decides a wanted velocity every tick
// and the mob's travel(e) eases the real velocity toward it. The engine already lets a mod mob fly — `gravity: 0` takes
// the engine's fall away and `travel(e)` sets the velocity (blocks/s) after the engine's own steering — so the lantern
// needs no new seam: these functions are all of its "locomotion", and tests/suites/creatures-lantern-motion.js runs them.

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Exponential approach of `v` toward `want` at `rate` (1/s) over dt: the same curve at any tick length. */
export const approach = (v: number, want: number, rate: number, dt: number) => v + (want - v) * (1 - Math.exp(-rate * dt));

/**
 * The top of what it floats over, scanning down from y: the first cell that is solid or water. `isSurface(x, y, z)`
 * answers for one cell. Returns the top (cell y + 1) or null when nothing is found within `depth` cells.
 */
export function surfaceBelow(isSurface: (x: number, y: number, z: number) => boolean, x: number, y: number, z: number, depth: number) {
  const bx = Math.floor(x), bz = Math.floor(z), top = Math.floor(y);
  for (let by = top; by >= top - depth; by--) if (isSurface(bx, by, bz)) return by + 1;
  return null;
}

/** The vertical speed that brings it to `targetY`: proportional, capped at `max` (it never drops like a stone). */
export const climbToward = (y: number, targetY: number, max: number, gain = 2.2) => clamp((targetY - y) * gain, -max, max);

/**
 * The drifting height: `hover` blocks above the surface, swaying slowly (`sway` blocks, ~one cycle in 12 s) with a
 * per-mob phase, so a few of them over the same pond do not rise and fall together.
 */
export const driftHeight = (surface: number, hover: number, sway: number, timeS: number, phase: number) =>
  surface + hover + sway * Math.sin(timeS * 0.52 + phase);

/** A velocity of `speed` from `from` toward `to` (3D); zero when they coincide. */
export function toward(from: { x: number, y: number, z: number }, to: { x: number, y: number, z: number }, speed: number) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, d = Math.hypot(dx, dy, dz);
  if (!(d > 1e-6)) return [0, 0, 0];
  return [dx / d * speed, dy / d * speed, dz / d * speed];
}

/**
 * One step of the wanted velocity toward the real one, per axis, and the result clamped to `cap` (blocks/s). The
 * travel hook runs this: it is the lantern's inertia.
 */
export function easeVelocity(v: { x: number, y: number, z: number }, want: readonly number[], rate: number, dt: number, cap = 12) {
  v.x = clamp(approach(v.x, want[0], rate, dt), -cap, cap);
  v.y = clamp(approach(v.y, want[1], rate, dt), -cap, cap);
  v.z = clamp(approach(v.z, want[2], rate, dt), -cap, cap);
  return v;
}

/** Where it circles while it waits for the next dive: `radius` around the prey, `above` over its feet, at angle `a`. */
export const orbitPoint = (prey: { x: number, y: number, z: number }, radius: number, above: number, a: number) =>
  ({ x: prey.x + Math.cos(a) * radius, y: prey.y + above, z: prey.z + Math.sin(a) * radius });
