// @ts-check
// The Canopy Sentinel's ARCHERY math, pure (no THREE, no DOM, no game code), so the whole shot is unit-tested in Node
// (tests/suites/creatures-sentinel-math.js) and the renderer (renderer.ts) only writes the results into the joints:
//   - bowShape(draw): the recurve longbow as two chains of limb segments; drawing bends every limb joint by one angle
//     solved so the STRING KEEPS ITS LENGTH (a real string does not stretch), so the tips come back and in as the nock
//     point is pulled to the cheek;
//   - solveArm(): a 2-bone IK with a pole (the elbow's side) — exact reach, used for the bow arm (onto the aim line)
//     and the draw arm (the hand ON the string's nock point);
//   - the action timeline the server cues: reload (hand to the quiver, an arrow to the string), draw (progressive),
//     the anchor tremble, release (the string snaps through and rings down on a spring, the bow kicks, the hand
//     follows through back past the ear), and the whistle (a hand to the mask);
//   - the cloak's drive (its segments hang on springs that lag behind the body's motion).
// Units: blocks and seconds. The bow's own frame: +y along the upper limb, -z toward the target (where the arrow points),
// +z toward the archer (the string side).
import { clamp, lerp, smoothstep } from '../goblin/procedural.ts';

// ---------------------------------------------------------------- the bow

export const BOW = Object.freeze({
  riser: 0.13, // half the riser (the grip section): the limbs start at y = +-riser
  segs: [0.16, 0.16, 0.16, 0.09], // each limb's segments, grip to tip (the last is the recurved tip)
  rest: [0.25, 0.15, 0.15, -0.9], // each limb joint's bend at brace (rad; + = toward the string / archer)
  give: [0.55, 0.85, 1.0, 0.75], // how much of the draw bend each joint takes (the tip's recurve opens up)
  drawLength: 0.55, // how far the nock point travels at full draw (blocks)
  arrow: 0.8, // the arrow's length, nock to point
});

/** One limb's tip and every joint's position (y, z) for a draw bend `D` (rad) on top of the rest shape. */
export function limbChain(D, bow = BOW) {
  let y = bow.riser, z = 0, a = 0;
  const joints = [{ y, z, a: 0 }];
  for (let i = 0; i < bow.segs.length; i++) {
    a += bow.rest[i] + D * bow.give[i];
    y += bow.segs[i] * Math.cos(a);
    z += bow.segs[i] * Math.sin(a);
    joints.push({ y, z, a });
  }
  return { tip: { y, z }, joints };
}

const restTip = limbChain(0).tip;
/** The string's length (tip to tip, straight at brace) and the brace height (the string's distance behind the grip). */
export const STRING = Object.freeze({ length: 2 * restTip.y, brace: restTip.z });

/**
 * The bow at `draw` (0..1): the nock point's z, the limb bend D (rad) that keeps the string's length, the tips and the
 * bend of every limb joint (rad, cumulative angle per segment). The upper limb is (y, z); the lower is its mirror (-y, z).
 */
export function bowShape(draw, bow = BOW) {
  const d = clamp(draw, 0, 1);
  const nock = STRING.brace + d * bow.drawLength;
  // half the string from the tip to the nock must stay length/2: find D by bisection (the distance shrinks as D grows)
  const half = STRING.length / 2;
  const dist = (D) => { const t = limbChain(D, bow).tip; return Math.hypot(t.y, nock - t.z); };
  let lo = 0, hi = 1.4;
  if (dist(0) <= half) hi = 0;
  for (let i = 0; i < 40 && hi > 0; i++) { const mid = (lo + hi) / 2; if (dist(mid) > half) lo = mid; else hi = mid; }
  const D = (lo + hi) / 2;
  const chain = limbChain(D, bow);
  return { draw: d, nock, D, tip: chain.tip, angles: chain.joints.slice(1).map((j) => j.a), joints: chain.joints };
}

// ---------------------------------------------------------------- 2-bone IK with a pole

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.hypot(a.x, a.y, a.z);
export const norm = (a) => { const l = len(a); return l > 1e-9 ? mul(a, 1 / l) : { x: 0, y: -1, z: 0 }; };

/**
 * Two-bone IK: shoulder S, target T, a pole point P (the elbow bends toward it), bones L1 and L2. Returns the elbow E
 * and the hand H (= T when T is in reach, else the nearest reachable point on the line S -> T) and `reach`.
 * |E - S| = L1 and |H - E| = L2 exactly, always.
 */
export function solveArm(S, T, P, L1, L2) {
  const st = sub(T, S), D0 = len(st);
  const dir = D0 > 1e-9 ? mul(st, 1 / D0) : { x: 0, y: -1, z: 0 };
  const lo = Math.abs(L1 - L2) + 1e-6, hi = L1 + L2 - 1e-6;
  const D = clamp(D0, lo, hi);
  const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  // the pole's direction, square to the line (a pole on the line: any square direction)
  let pv = sub(P, S);
  pv = sub(pv, mul(dir, dot(pv, dir)));
  if (len(pv) < 1e-6) pv = Math.abs(dir.y) < 0.9 ? sub({ x: 0, y: -1, z: 0 }, mul(dir, -dir.y)) : sub({ x: 1, y: 0, z: 0 }, mul(dir, dir.x));
  const pn = norm(pv);
  const E = add(add(S, mul(dir, a)), mul(pn, h));
  const H = add(S, mul(dir, D));
  return { elbow: E, hand: H, reach: D0 >= lo - 1e-9 && D0 <= hi + 1e-9 };
}

// ---------------------------------------------------------------- the action timeline (server cues)

export const RELOAD_TIME = 0.75, RELEASE_TIME = 0.45, WHISTLE_TIME = 0.8;

/**
 * Reload, t seconds since the 'nock' cue: the draw hand goes back over the shoulder to the quiver (0..0.35), pulls an
 * arrow out (0.35..0.5), and brings it round onto the string (0.5..0.75). `toQuiver` blends the hand's target from the
 * string (0) to the quiver (1); `inHand` the arrow is in the fingers; `nocked` it sits on the string.
 */
export function reloadPose(t) {
  const u = clamp(t / RELOAD_TIME, 0, 1);
  if (u < 0.45) return { toQuiver: smoothstep(u / 0.45), inHand: u > 0.4, nocked: false, pull: 0 };
  if (u < 0.65) return { toQuiver: 1, inHand: true, nocked: false, pull: smoothstep((u - 0.45) / 0.2) }; // drawing it out
  const k = smoothstep((u - 0.65) / 0.35);
  return { toQuiver: 1 - k, inHand: true, nocked: u >= 0.98, pull: 1 - k };
}

/** The anchor's tremble at full draw (blocks, a small aim wobble that grows the longer it holds). */
export function holdTremble(time, held) {
  const a = 0.004 + 0.004 * clamp(held / 2, 0, 1);
  return { x: a * Math.sin(time * 23.0), y: a * Math.sin(time * 17.3 + 1.1) };
}

/**
 * The release, t seconds after the 'release' cue: the draw hand flies back past the ear (follow-through: `follow`
 * 0..1 blends its target behind the anchor) and slowly drops; the bow arm kicks up and forward (`kick` rad) and
 * settles; `done` once it is over.
 */
export function releasePose(t) {
  const u = clamp(t / RELEASE_TIME, 0, 1);
  const follow = u < 0.12 ? smoothstep(u / 0.12) : 1 - 0.6 * smoothstep((u - 0.4) / 0.6);
  const kick = 0.22 * Math.exp(-t * 14) * Math.cos(t * 30);
  return { follow, kick, drop: smoothstep((u - 0.35) / 0.65), done: u >= 1 };
}

/** The whistle: a hand to the mask's mouth and back (blend 0..1 over WHISTLE_TIME). */
export function whistlePose(t) {
  const u = clamp(t / WHISTLE_TIME, 0, 1);
  return u < 0.25 ? smoothstep(u / 0.25) : u > 0.75 ? 1 - smoothstep((u - 0.75) / 0.25) : 1;
}

/** The 'draw_XX' / 'drawsmoke_XX' cue -> { dur (s), smoke } or null. */
export function parseDrawCue(name) {
  const m = /^draw(smoke)?_(\d{1,3})$/.exec(name);
  if (!m) return null;
  return { dur: clamp(Number(m[2]) / 10, 0.2, 5), smoke: !!m[1] };
}
/** The cue for a draw of `dur` seconds (tenths), smoke or not. */
export const drawCue = (dur, smoke) => `draw${smoke ? 'smoke' : ''}_${Math.round(clamp(dur, 0.2, 5) * 10)}`;

// ---------------------------------------------------------------- the cloak

/**
 * Where the cloak's segments want to hang (rad, per row, + = swung back) from the body's motion: forward speed and
 * forward acceleration fling it back, braking lets it swing forward, strafing turns it aside (`side`). Rows further
 * down take more of it. The springs (dampedSpring) supply the lag and the sway.
 */
export function cloakDrive(vForward, aForward, vRight, row) {
  const k = 1 + 0.45 * row;
  return {
    back: clamp((0.09 * Math.max(0, vForward) + 0.03 * Math.max(0, -vForward) - 0.02 * aForward) * k, -0.5, 1.1),
    side: clamp(-0.07 * vRight * k, -0.6, 0.6),
  };
}

/** The collapse when it dies (t s): onto the knees, then forward onto the ground; the bow slips from the hand. */
export function sentinelDeathPose(t) {
  const kneel = smoothstep(t / 0.45);
  const fallT = clamp((t - 0.45) / 0.55, 0, 1);
  const fall = fallT < 1 ? fallT * fallT : 1 + 0.06 * Math.exp(-(t - 1.0) * 8) * Math.sin((t - 1.0) * 20);
  return { kneel, fall: Math.min(1.06, fall), pitch: lerp(0, Math.PI / 2 * 0.88, Math.min(1, fall)), bowDrop: smoothstep((t - 0.2) / 0.5) };
}
