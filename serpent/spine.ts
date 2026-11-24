// @ts-check
// The Root Serpent's PROCEDURAL SPINE: pure math (no THREE, no DOM, no game code), so the same code runs in the browser
// over the client's real block world (ctx.client.groundBelow) and in Node over a fake one (tests/suites/
// creatures-serpent-math.js).
//
// FOLLOW-THE-LEADER. The head is the mob's position. Every time it moves, its path is RECORDED as points spaced
// RECORD_STEP apart along the 3D arc, each with the arc length `s` it was laid at, the lateral offset of the serpentine
// track at that spot (`off`) and how deep the head was travelling (`sink`). Segment i sits on that recorded path at a
// fixed arc length behind the head (BODY.neck + i * BODY.spacing): it is exactly where the head was when it had travelled
// that much less — so the body follows the head's track through every turn, up every step and down into the soil, and
// the spacing along the path never changes (the chord between neighbours is the spacing, or a little less on a bend).
//
// SERPENTINE. The lateral offset is laid into the TRACK when the head passes (amplitude from the speed at that moment,
// phase from the arc length): the wave stands still on the ground and the body slides through it, like a real snake. Its
// amplitude grows with speed and, with a fixed wavelength, its frequency in time is speed / wavelength — both scale with
// speed. Stopped, a small idle sway (from the clock) keeps it alive.
//
// GROUND. With LOD 'full' each segment asks the ground under it (one column scan); the heights are then passed through a
// max-slope envelope (neighbours never differ by more than SLOPE_DROP), so on a 1-block step the body BENDS up and over
// the edge instead of popping, and drapes down a ledge. A critically damped spring per segment smooths changes; a segment
// is never left inside the block under it. 'simple' uses the recorded height of the path (no queries); 'none' skips the
// springs too. Everything is frame-rate independent: recording is by distance, springs are solved in closed form for dt,
// smoothing is exp(-k dt).
//
// The pose LAYERS (rear / strike / rattle / coil / death) are separate pure functions the renderer adds on top.
import { clamp, critSpring, expAlpha, lerp, smoothstep, spring, TAU } from '../goblin/procedural.ts';
import { BODY } from './tuning.ts';

export const RECORD_STEP = 0.04; // blocks between recorded path points
export const TELEPORT = 3; // a jump of the head farther than this in one frame resets the path (a teleport)
export const VERTICAL_ARC = 0.3; // how much of a vertical move counts as arc length along the path
export const MAX_SLOPE = 1.8; // the steepest the body's ground line may rise (blocks up per block across): it bends over edges
export const SLOPE_DROP = MAX_SLOPE * BODY.spacing; // ...which is this much between two neighbours a spacing apart
export const Y_OMEGA = 16; // the segments' height spring (1/s)
export const SCAN_UP = 2.2; // a segment looks for ground from this far above its path height (finds a 2-block rise)
export const SCAN_DOWN = 3; // ...and accepts ground at most this far below it

/** The arc length (blocks, along the path) from the head to segment i's centre. */
export const arcOf = (i: number) => BODY.neck + i * BODY.spacing;
/** The body's whole length along its path (head to the tail's last segment). */
export const bodyLength = (n = BODY.segments) => arcOf(n - 1);

/** Segment i's radius: thickest just behind the head, tapering to the tail's tip. */
export function segmentRadius(i: number, n = BODY.segments) {
  const u = clamp(i / Math.max(1, n - 1), 0, 1);
  return BODY.rTip + (BODY.rMax - BODY.rTip) * Math.pow(1 - u, 0.85) * (0.9 + 0.1 * smoothstep(u / 0.15));
}

/** The serpentine track's amplitude (blocks) for a speed (blocks/s): 0 when still, growing and saturating with speed. */
export const undulationAmp = (v: number) => 0.3 * (1 - Math.exp(-Math.max(0, v) / 2.4));
/** Its frequency in time (Hz) for a speed: the wave is fixed on the ground, so it is speed / wavelength. */
export const undulationFreq = (v: number) => Math.max(0, v) / BODY.wavelength;
/** The idle sway (blocks) when it is (nearly) stopped. */
export const idleAmp = (v: number) => 0.045 * (1 - smoothstep(v / 0.4));

type PathPoint = { x: number, y: number, z: number, s: number, off: number, sink: number };
type Seg = { x: number, y: number, z: number, ys: { x: number, v: number }, g: number, r: number, sink: number, fx: number, fz: number };

/** A spine state (one per serpent). */
export function createSpine(n = BODY.segments) {
  const segs: Seg[] = [];
  for (let i = 0; i < n; i++) segs.push({ x: 0, y: 0, z: 0, ys: spring(0), g: 0, r: segmentRadius(i, n), sink: 0, fx: 0, fz: -1 });
  return {
    init: false, n, lod: 'full',
    total: 0, // arc length the head has travelled
    path: [] as PathPoint[], // oldest first; the head itself is a "live" point after the last one
    x: 0, y: 0, z: 0, yaw: 0, sink: 0, off: 0,
    speed: 0, time: 0, queries: 0, resets: 0,
    head: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, g: 0 },
    segs,
  };
}
export type Spine = ReturnType<typeof createSpine>;

// the track's lateral offset where the head is now (arc length s, speed v)
const trackOff = (s: number, v: number) => undulationAmp(v) * Math.sin(TAU * s / BODY.wavelength);

function resetPath(st: Spine, x: number, y: number, z: number, yaw: number, sink: number) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), L = bodyLength(st.n) + 0.6;
  st.path = [];
  const steps = Math.ceil(L / RECORD_STEP);
  for (let k = steps; k >= 1; k--) {
    const a = k * RECORD_STEP;
    st.path.push({ x: x - fx * a, y, z: z - fz * a, s: st.total - a, off: 0, sink });
  }
  st.x = x; st.y = y; st.z = z; st.sink = sink; st.off = 0;
  st.resets++;
}

/**
 * The recorded path at arc length s (interpolated; beyond the newest point, toward the live head). Points older than the
 * path's start clamp to it. Returns the CENTRE line point plus its offset and sink.
 */
export function samplePath(st: Spine, s: number) {
  const P = st.path, last = P[P.length - 1];
  if (!last || s >= last.s) {
    if (!last) return { x: st.x, y: st.y, z: st.z, off: st.off, sink: st.sink };
    const span = st.total - last.s;
    const t = span > 1e-9 ? clamp((s - last.s) / span, 0, 1) : 1;
    return { x: lerp(last.x, st.x, t), y: lerp(last.y, st.y, t), z: lerp(last.z, st.z, t), off: lerp(last.off, st.off, t), sink: lerp(last.sink, st.sink, t) };
  }
  if (s <= P[0].s) return { x: P[0].x, y: P[0].y, z: P[0].z, off: P[0].off, sink: P[0].sink };
  // binary search: the last point with p.s <= s
  let lo = 0, hi = P.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (P[mid].s <= s) lo = mid; else hi = mid; }
  const a = P[lo], b = P[hi], t = (s - a.s) / Math.max(1e-9, b.s - a.s);
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), off: lerp(a.off, b.off, t), sink: lerp(a.sink, b.sink, t) };
}

/** The drawn track point at arc s: the centre line pushed sideways by its recorded offset (right of the local tangent). */
export function trackPoint(st: Spine, s: number) {
  const c = samplePath(st, s);
  const a = samplePath(st, s + 0.08), b = samplePath(st, s - 0.08);
  let fx = a.x - b.x, fz = a.z - b.z;
  const h = Math.hypot(fx, fz);
  if (h > 1e-6) { fx /= h; fz /= h; } else { fx = -Math.sin(st.yaw); fz = -Math.cos(st.yaw); }
  // right of forward (fx, fz) is (-fz, fx) in the game's frame (forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw))
  return { x: c.x - fz * c.off, y: c.y, z: c.z + fx * c.off, off: c.off, sink: c.sink, fx, fz };
}

/**
 * One frame. input: { x, y, z (the mob's feet = the head's point), yaw, dt, ground?(x, y, z) -> top | null,
 * lod?: 'full' | 'simple' | 'none', sink?: 0..BODY.sink (how deep the head travels now) }.
 * Fills st.segs (world positions, ground, sink) and st.head. Returns st.
 */
export function stepSpine(st: Spine, input: any) {
  const dt = clamp(input.dt, 1e-4, 0.1);
  const lod = input.lod ?? 'full', sink = clamp(input.sink ?? 0, 0, 3);
  const { x, y, z } = input;
  st.queries = 0; st.lod = lod; st.time += dt;
  // the arc the head travelled: horizontal distance, plus only a part of the vertical (a step up the engine makes in a frame
  // or two is not a metre of body standing on the riser: the segments spread over the edge and the ground envelope bends them)
  const jump = Math.hypot(x - st.x, VERTICAL_ARC * (y - st.y), z - st.z);
  // a teleport: far sideways, or a vertical jump no fall or climb makes in one frame (a ledge drop of a few blocks is not one)
  if (!st.init || !(Math.hypot(x - st.x, z - st.z) <= TELEPORT && Math.abs(y - st.y) <= 2 * TELEPORT)) {
    const first = !st.init;
    st.init = true; st.yaw = input.yaw;
    resetPath(st, x, y, z, input.yaw, sink);
    for (const sg of st.segs) sg.ys.v = 0;
    if (!first) st.speed = 0;
    layOut(st, input.ground, lod, dt, true);
    return st;
  }
  // ---- record the head's motion (by distance, so the track is the same at any frame rate)
  const v = Math.hypot(x - st.x, z - st.z) / dt;
  st.speed = lerp(st.speed, v, expAlpha(5, dt));
  st.yaw = input.yaw;
  if (jump > 0) {
    const last = st.path[st.path.length - 1];
    const fromX = st.x, fromY = st.y, fromZ = st.z, fromSink = st.sink, s0 = st.total;
    st.total += jump;
    // fixed points every RECORD_STEP of arc since the last fixed one
    let next = (last ? last.s : s0) + RECORD_STEP;
    while (next <= st.total) {
      const t = (next - s0) / jump;
      st.path.push({ x: lerp(fromX, x, t), y: lerp(fromY, y, t), z: lerp(fromZ, z, t), s: next, off: trackOff(next, st.speed), sink: lerp(fromSink, sink, t) });
      next += RECORD_STEP;
    }
  }
  st.x = x; st.y = y; st.z = z; st.sink = sink; st.off = trackOff(st.total, st.speed);
  // out of the soil again: the sunk part of the track rises out slowly (it pulls itself out of the hole)
  if (sink < 0.05) {
    const k = expAlpha(1.4, dt);
    for (const p of st.path) if (p.sink > 0) p.sink = p.sink < 0.01 ? 0 : p.sink * (1 - k);
  }
  // forget the track behind the tail
  const cut = st.total - bodyLength(st.n) - 1;
  let drop = 0;
  while (drop < st.path.length - 2 && st.path[drop].s < cut) drop++;
  if (drop > 32 || (drop > 0 && st.path.length > 400)) st.path.splice(0, drop);
  layOut(st, input.ground, lod, dt, false);
  return st;
}

// the ground top under (x, z) scanned from above a reference height; null when none within reach
function groundAt(st: Spine, ground: any, px: number, refY: number, pz: number) {
  st.queries++;
  let g = null;
  try { g = ground(px, refY + SCAN_UP, pz); } catch { g = null; }
  if (g === null || g === undefined || !Number.isFinite(g)) return null;
  // (a scan that starts inside a wall taller than SCAN_UP answers that cell's top: the body is pressed up against it)
  if (g < refY - SCAN_DOWN) return null;
  return g;
}

// The ground a segment RESTS on, continuous as it moves: its own column, and the columns just across the next block edge
// ahead of it and behind it along the track, each lowered by MAX_SLOPE times the distance to that edge. Without this a
// segment crossing the edge of a step would see its ground jump a whole block in one frame; with it the height ramps up
// as the edge comes near (the body bends over the step before it gets there) and drapes as it leaves a ledge.
export const EDGE_LOOK = 0.45; // blocks: an edge nearer than this is looked across
function restGround(st: Spine, ground: any, x: number, refY: number, z: number, fx: number, fz: number) {
  let g = groundAt(st, ground, x, refY, z);
  if (g === null) return null;
  for (const dir of [1, -1]) {
    const dx = fx * dir, dz = fz * dir;
    const ax = dx > 1e-6 ? (Math.floor(x) + 1 - x) / dx : dx < -1e-6 ? (x - Math.floor(x)) / -dx : Infinity;
    const az = dz > 1e-6 ? (Math.floor(z) + 1 - z) / dz : dz < -1e-6 ? (z - Math.floor(z)) / -dz : Infinity;
    const a = Math.min(ax, az);
    if (!(a < EDGE_LOOK)) continue;
    const o = groundAt(st, ground, x + dx * (a + 0.02), refY, z + dz * (a + 0.02));
    if (o !== null) g = Math.max(g, o - MAX_SLOPE * a);
  }
  return g;
}

// place the head and the segments on the track, the ground and the springs
function layOut(st: Spine, ground: any, lod: string, dt: number, snap: boolean) {
  const n = st.n, useGround = lod === 'full' && typeof ground === 'function';
  const idle = idleAmp(st.speed);
  // the head
  const hp = trackPoint(st, st.total);
  let hg = useGround ? groundAt(st, ground, hp.x, hp.y, hp.z) : null;
  if (hg === null) hg = hp.y;
  st.head.g = hg;
  // the segments' track points and ground
  const tgt = new Array(n);
  for (let i = 0; i < n; i++) {
    const sg = st.segs[i];
    const tp = trackPoint(st, st.total - arcOf(i));
    // the idle sway: a slow wave from the clock, strongest at the neck (stopped, it is never quite still)
    const sway = idle * Math.sin(st.time * 1.7 - i * 0.55) * (0.4 + 0.6 * (1 - i / n));
    sg.x = tp.x - tp.fz * sway; sg.z = tp.z + tp.fx * sway;
    sg.fx = tp.fx; sg.fz = tp.fz; sg.sink = tp.sink;
    let g = useGround ? restGround(st, ground, sg.x, tp.y, sg.z, tp.fx, tp.fz) : null;
    if (g === null) g = tp.y;
    sg.g = g;
    tgt[i] = g + sg.r;
  }
  // the max-slope envelope: from the head back, then from the tail forward
  // (by HORIZONTAL distance: where the path climbed a riser, neighbours stand close together and must stay close in height)
  const hd = (a: { x: number, z: number }, b: { x: number, z: number }) => Math.max(0.02, Math.hypot(a.x - b.x, a.z - b.z));
  let prev = hg + BODY.headLift, px = hp.x, pz = hp.z;
  for (let i = 0; i < n; i++) {
    const sg = st.segs[i];
    tgt[i] = Math.max(tgt[i], prev - MAX_SLOPE * hd(sg, { x: px, z: pz }));
    prev = tgt[i]; px = sg.x; pz = sg.z;
  }
  for (let i = n - 2; i >= 0; i--) tgt[i] = Math.max(tgt[i], tgt[i + 1] - MAX_SLOPE * hd(st.segs[i], st.segs[i + 1]));
  for (let i = 0; i < n; i++) {
    const sg = st.segs[i], want = tgt[i] - sg.sink;
    if (snap || lod === 'none') { sg.ys.x = want; sg.ys.v = 0; }
    else critSpring(sg.ys, want, Y_OMEGA, dt);
    let yy = sg.ys.x;
    if (sg.sink < 0.05 && yy < sg.g + sg.r * 0.5) { yy = sg.g + sg.r * 0.5; sg.ys.x = yy; if (sg.ys.v < 0) sg.ys.v = 0; }
    sg.y = yy;
  }
  // the head: on the track, its height on the ground it is over (minus how deep it travels), facing along the body
  const h = st.head;
  h.x = hp.x; h.z = hp.z;
  h.y = hg + BODY.headLift - st.sink;
  const s0 = st.segs[0];
  const dx = h.x - s0.x, dz = h.z - s0.z, dh = Math.hypot(dx, dz);
  h.yaw = dh > 1e-4 ? Math.atan2(-dx, -dz) : st.yaw;
  h.pitch = Math.atan2(h.y - s0.y, Math.max(dh, 1e-4));
}

// ---------------------------------------------------------------- pose layers (offsets in the head's heading frame)

const FRONT = 7; // the segments the rear / strike moves

/**
 * The rear and the strike for part `i` (-1 = the head, 0.. = segments): offsets { up, fwd, side } in blocks, along the
 * body's heading. `rear` 0..1(+ overshoot): the head raised high and pulled back over an S-coil of the neck, ready;
 * `ext` the lunge (0 = coiled back, 1 = fully out, beyond = overshoot): the head and neck thrown forward and down.
 */
export function rearLayer(i: number, rear: number, ext: number) {
  const k = i < 0 ? 1.15 : i < FRONT ? Math.pow(1 - i / FRONT, 1.5) : 0;
  if (k === 0) return { up: 0, fwd: 0, side: 0 };
  // (the rear's spring overshoots ABOVE 1; below 0 it would push the neck into the ground: clamped)
  const r = Math.max(0, rear), e = ext;
  const up = r * 0.95 * k * (1 - 0.55 * clamp(e, 0, 1.3));
  const back = r * 0.42 * k * (1 - clamp(e, 0, 1.3));
  // the S: the neck swings out to one side then the other between the head and the 7th segment
  const side = i < 0 ? 0 : r * 0.24 * Math.sin(Math.PI * 2 * (i + 1) / (FRONT + 1)) * (1 - clamp(e, 0, 1));
  const fwd = -back + e * 1.05 * k;
  return { up, fwd, side };
}

/** The head's pitch (rad, + = nose up) for the rear / strike: up while rearing, down along the lunge. */
export const rearPitch = (rear: number, ext: number) => 0.55 * Math.max(0, rear) * (1 - clamp(ext, 0, 1)) - 0.35 * clamp(ext, 0, 1.3);

/**
 * The tail rattle at clock `time` (s) with strength `w` 0..1: the last segments lift and buzz side to side, more toward
 * the tip. Offsets { up, side } for segment i.
 */
export function rattleLayer(i: number, n: number, w: number, time: number) {
  const k = smoothstep((i - (n - 7)) / 6);
  if (k <= 0 || w <= 0) return { up: 0, side: 0 };
  return { up: w * 0.34 * k * k, side: w * 0.085 * k * Math.sin(time * TAU * 16 + i * 0.9) };
}

/**
 * The coil: where segment i sits when wrapped around a player standing at `c` (the feet). A helix from the head (at the
 * top, near the face) down to the tail, which trails on the ground. `squeeze` 0..1 tightens it; `turn` spins it slowly.
 */
export function coilPoint(i: number, n: number, c: { x: number, y: number, z: number }, squeeze: number, turn: number) {
  const r = segmentRadius(i, n);
  const wraps = n - 4; // the last four trail out on the ground
  const j = Math.min(i, wraps);
  const ang = turn - j * (TAU / 14); // ~14 segments a turn: neighbours stay close along the wrap (a turn and a bit)
  const R = (0.36 + r) * (1 - 0.13 * clamp(squeeze, 0, 1));
  const top = 1.38;
  let y = c.y + top - j * (top - 0.12) / wraps;
  let x = c.x + Math.cos(ang) * R, z = c.z + Math.sin(ang) * R;
  if (i > wraps) { // the trailing tail: out along the last wrap's tangent, on the ground
    const t = (i - wraps) * 0.2, ta = ang - Math.PI / 2;
    x += Math.cos(ta) * t; z += Math.sin(ta) * t; y = c.y + r;
  }
  return { x, y: Math.max(y, c.y + r), z };
}

/** How far segment i is into its wrap (0 = on its track, 1 = on the helix) at coil strength c 0..1: the head wraps first. */
export const coilWeight = (i: number, n: number, c: number) => smoothstep(c * 1.6 - 0.6 * (i / Math.max(1, n - 1)));

export const DEATH_TIME = 2.2; // s: the whole settle (the engine keeps the body DEATH_MS)

/**
 * The death, segment by segment: part i (from the head, -1, back to the tail) lets go after a delay, falls limp to the
 * ground with a small bounce and rolls onto its side. Returns { fall 0..1+, roll (rad), slack 0..1 }.
 */
export function deathSettle(i: number, n: number, t: number) {
  const delay = 0.12 + (i + 1) * 0.055;
  const u = clamp((t - delay) / 0.34, 0, 1);
  const fall = u < 1 ? u * u : 1 + 0.06 * Math.exp(-(t - delay - 0.34) * 9) * Math.sin((t - delay - 0.34) * 24);
  return { fall, roll: (i % 2 ? 1 : -1) * 0.25 * smoothstep(u) + 1.1 * smoothstep((t - 0.6 - i * 0.02) / 0.8), slack: smoothstep(u) };
}

/** The jaw's opening (rad) for what it is doing; `hiss` 0..1 adds a gape, `ext` the strike's bite. */
export function jawOpen(rear: number, ext: number, coil: number, hiss: number, time: number) {
  const strike = ext > 0.05 ? 0.95 * clamp(1 - Math.abs(ext - 0.6) / 0.6, 0, 1) : 0;
  const tongue = 0.04 * Math.max(0, Math.sin(time * 1.9)) ** 8;
  return clamp(0.05 + tongue + 0.45 * clamp(rear, 0, 1.2) * (1 - clamp(ext, 0, 1)) + strike + 0.35 * coil + 0.3 * hiss, 0, 1.05);
}
