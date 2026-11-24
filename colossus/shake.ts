// @ts-check
// The camera shake of the Colossus's footfalls and slams: pure (no THREE, no DOM), driven by an explicit clock, so the
// same math runs in the browser (a ctx.client.camera.modify modifier, the engine's stacked camera modifiers) and in Node
// (tests/suites/creatures-colossus-math.js).
//   - shakeFalloff: how hard a shake of `intensity` reaches a viewer `dist` blocks away (quadratic, zero at `radius`);
//   - createShaker(): a few concurrent shakes; add(amp, ms, now) and sample(now) -> the pose offset { x, y, z, pitch,
//     roll } — smooth deterministic noise (a sum of incommensurate sines) under an envelope with a quick attack and a
//     quadratic decay, EXACTLY zero once every shake has run out (the camera returns to where it was).

/** Shake amplitude (0..intensity) for a viewer `dist` blocks from the source; 0 at and beyond `radius`. */
export function shakeFalloff(intensity, dist, radius) {
  if (!(radius > 0) || !(dist >= 0) || dist >= radius || !(intensity > 0)) return 0;
  const k = 1 - dist / radius;
  return intensity * k * k;
}

// the feel: the most a full-strength (amp 1) shake moves the camera
export const SHAKE_MAX = Object.freeze({ pos: 0.11, pitch: 0.022, roll: 0.018 });
export const SHAKE_CAP = 1.5; // shakes add up, to this much
export const SHAKES = Object.freeze({
  step: { intensity: 0.22, ms: 280, radius: 13 },
  slam: { intensity: 1.0, ms: 650, radius: 18 },
  wake: { intensity: 0.4, ms: 900, radius: 14 },
  crumble: { intensity: 0.45, ms: 700, radius: 14 },
});

/** The envelope of one shake at u = elapsed / duration: a 40 ms-ish attack, then (1 - u)^2. */
export function envelope(u, attack = 0.06) {
  if (!(u >= 0) || u >= 1) return 0;
  return Math.min(1, u / attack) * (1 - u) * (1 - u);
}

const wave = (t, a, b, c) => (Math.sin(t * a) * 0.55 + Math.sin(t * b + 1.3) * 0.3 + Math.sin(t * c + 2.1) * 0.15);

export function createShaker() {
  const list = []; // { amp, start, dur } (ms)
  const zero = () => ({ x: 0, y: 0, z: 0, pitch: 0, roll: 0, amp: 0 });
  return {
    /** A new shake of amplitude `amp` (0..1, already fallen off by distance) for `ms`, starting at `now` (ms). */
    add(amp, ms, now) {
      if (!(amp > 0.002) || !(ms > 0) || !Number.isFinite(now)) return false;
      if (list.length >= 8) list.shift();
      list.push({ amp: Math.min(1, amp), start: now, dur: ms });
      return true;
    },
    /** The camera offset at `now` (ms): position in blocks, pitch and roll in radians. */
    sample(now) {
      let a = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        const s = list[i], u = (now - s.start) / s.dur;
        if (u >= 1) { list.splice(i, 1); continue; }
        a += s.amp * envelope(u);
      }
      if (!(a > 0)) return zero();
      a = Math.min(SHAKE_CAP, a);
      const t = now / 1000;
      return {
        x: SHAKE_MAX.pos * a * wave(t, 71, 113, 157),
        y: SHAKE_MAX.pos * a * wave(t, 83, 131, 173),
        z: SHAKE_MAX.pos * a * 0.5 * wave(t, 67, 109, 151),
        pitch: SHAKE_MAX.pitch * a * wave(t, 59, 97, 139),
        roll: SHAKE_MAX.roll * a * wave(t, 53, 89, 127),
        amp: a,
      };
    },
    active: () => list.length,
    clear() { list.length = 0; },
  };
}
