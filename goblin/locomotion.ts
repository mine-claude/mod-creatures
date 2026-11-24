// @ts-check
// The goblin's PROCEDURAL LOCOMOTION: two feet that find the real ground, plant, stay planted and step — computed every
// frame from where the body is, never from a keyframed clip. Pure (no THREE, no DOM, no game code): the ground comes
// in as a function, so the same solver runs in the browser over the client's block world (ctx.client.groundBelow) and
// in Node over a fake block world (tests/suites/creatures-goblin-locomotion.js).
//
// Per frame, for the root (the mob's feet point, as the engine interpolates it) and yaw:
//   1. velocity and acceleration from the root's motion (smoothed with exp(-k dt));
//   2. each foot's REST spot (under its hip) plus a LEAD along the velocity, and the real ground there: a column scan
//      down from above the hip (a 1-block step up is found, a wall is not stepped into);
//   3. a planted foot stays exactly where it is until its error from that spot passes the gait threshold (or the body
//      turned, or the ground under it changed); then it swings — only one foot at a time, and only after the other has
//      been down a moment, so on the ground gait both feet are never in the air;
//   4. a swinging foot follows an arc to the (re-aimed) landing spot whose height grows with the height difference;
//      it is never below the ground of the column it is over (it never enters a solid block);
//   5. the hips follow the average height of the feet with a critically damped spring, and the body pitches with the
//      height difference between the front and back foot (stairs, slopes of steps).
// LOD: 'full' (all of the above), 'simple' (a gait from phase and speed, no ground queries), 'none' (feet at rest).
import { clamp, critSpring, expAlpha, gaitScaled, lerp, smoothstep, spring, swingHeight, wrapAngle } from './procedural.ts';

// The rig, in blocks (the model in model.ts is built with the same numbers).
export const RIG = Object.freeze({
  hipWidth: 0.11, // hip joints at x = +-hipWidth
  hipHeight: 0.46, // hip joints above the feet when standing (legs slightly bent)
  thigh: 0.26,
  shin: 0.26,
  ankle: 0.05, // the ankle above the sole
  stepUpMax: 1.25, // the highest ground a foot reaches for (a 1-block step plus a slab)
  stepDownMax: 2.6, // below this the foot does not search (a ledge): it stays at the body's height
});
export const LOD_FULL = 24, LOD_SIMPLE = 64; // blocks from the camera
export const lodFor = (dist) => (dist <= LOD_FULL ? 'full' : dist <= LOD_SIMPLE ? 'simple' : 'none');

const MIN_STANCE = 0.06; // s a foot stays down after landing before the other may lift
const SETTLE_AFTER = 0.2; // s stopped before the feet tidy up to their rest spots
const SETTLE_ERROR = 0.05;
const TURN_REPLANT = 0.55; // rad of yaw since the foot landed that makes it re-plant (turn in place)

const newFoot = (side) => ({ side, x: 0, y: 0, z: 0, planted: true, t: 0, dur: 0.3, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, arc: 0.1, landYaw: 0, downFor: 1 });

/** A locomotion state (one per mob). `rig`: the legs' numbers (RIG's fields; the goblin's by default — the Canopy
 * Sentinel, mods/creatures/sentinel, walks on longer legs with the same solver). */
export function createLocomotion(rig = RIG) {
  return {
    init: false, lod: 'none', rig,
    px: 0, py: 0, pz: 0, yaw: 0,
    vx: 0, vz: 0, ax: 0, az: 0, yawRate: 0,
    speed: 0, vForward: 0, vRight: 0, aForward: 0, aRight: 0,
    still: 0, phase: 0,
    feet: [newFoot(-1), newFoot(1)],
    body: spring(0), // hip offset from the root's height
    pitch: spring(0), // body pitch from the feet (nose up = positive)
    steps: 0, // landed steps (tests, debug)
    queries: 0, // ground queries this frame (budget)
  };
}

const fwd = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
const right = (yaw) => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });

/** The foot's rest spot (no lead) for a root and yaw. */
export function restSpot(root, yaw, side, rig = RIG) {
  const r = right(yaw);
  return { x: root.x + r.x * side * rig.hipWidth, z: root.z + r.z * side * rig.hipWidth };
}

// The ground for a foot at (x, z): scanned from above the hip so a step up is found; too high (a wall) or nothing
// within reach (a ledge) gives null.
function groundFor(st, ground, x, rootY, z) {
  st.queries++;
  const rig = st.rig ?? RIG;
  const g = ground(x, rootY + rig.stepUpMax + 0.2, z);
  if (g === null || g === undefined || !Number.isFinite(g)) return null;
  if (g > rootY + rig.stepUpMax || g < rootY - rig.stepDownMax) return null;
  return g;
}

// Where a foot should land now: rest + lead along the velocity, on the real ground. If the led spot is a wall, the
// plain rest spot; if that is too, the body's own height.
function landingSpot(st, ground, root, side, g) {
  const rest = restSpot(root, st.yaw, side, st.rig);
  const lx = rest.x + st.vx * g.lead, lz = rest.z + st.vz * g.lead;
  let y = groundFor(st, ground, lx, root.y, lz);
  if (y !== null) return { x: lx, y, z: lz };
  y = groundFor(st, ground, rest.x, root.y, rest.z);
  return { x: rest.x, y: y ?? root.y, z: rest.z };
}

function plantAll(st, ground, root) {
  for (const f of st.feet) {
    const r = restSpot(root, st.yaw, f.side, st.rig);
    const y = ground ? groundFor(st, ground, r.x, root.y, r.z) : null;
    Object.assign(f, { x: r.x, y: y ?? root.y, z: r.z, planted: true, t: 0, landYaw: st.yaw, downFor: 1 });
  }
}

/**
 * One frame. input: { x, y, z, yaw, dt, ground(x, y, z) -> top | null, lod?: 'full' | 'simple' | 'none' }.
 * Returns the state (feet in WORLD coordinates, body offset and pitch, the gait numbers).
 */
export function stepLocomotion(st, input) {
  const dt = clamp(input.dt, 1e-4, 0.1);
  const root = { x: input.x, y: input.y, z: input.z };
  const lod = input.lod ?? 'full';
  st.queries = 0;
  if (!st.init) {
    st.init = true; st.px = root.x; st.py = root.y; st.pz = root.z; st.yaw = input.yaw;
    plantAll(st, lod === 'full' ? input.ground : null, root);
    st.body.x = 0; st.body.v = 0;
  }
  // 1. motion of the root
  const rvx = (root.x - st.px) / dt, rvz = (root.z - st.pz) / dt;
  const a = expAlpha(14, dt);
  const nvx = lerp(st.vx, rvx, a), nvz = lerp(st.vz, rvz, a);
  const ab = expAlpha(8, dt);
  st.ax = lerp(st.ax, (nvx - st.vx) / dt, ab); st.az = lerp(st.az, (nvz - st.vz) / dt, ab);
  st.vx = nvx; st.vz = nvz;
  const dyaw = wrapAngle(input.yaw - st.yaw);
  st.yawRate = lerp(st.yawRate, dyaw / dt, expAlpha(10, dt));
  st.yaw = input.yaw;
  st.px = root.x; st.py = root.y; st.pz = root.z;
  const f = fwd(st.yaw), r = right(st.yaw);
  st.speed = Math.hypot(st.vx, st.vz);
  st.vForward = st.vx * f.x + st.vz * f.z; st.vRight = st.vx * r.x + st.vz * r.z;
  st.aForward = st.ax * f.x + st.az * f.z; st.aRight = st.ax * r.x + st.az * r.z;
  st.still = st.speed < 0.08 && Math.abs(st.yawRate) < 0.3 ? st.still + dt : 0;
  const g = gaitScaled(st.speed, (st.rig ?? RIG).gaitScale ?? 1);

  // LOD: far away the feet are not worth a ground query
  if (lod !== 'full') {
    const wasFull = st.lod === 'full';
    st.lod = lod;
    if (lod === 'none') { plantAll(st, null, root); critSpring(st.body, 0, 12, dt); critSpring(st.pitch, 0, 12, dt); return st; }
    // 'simple': a phase gait from speed, feet at the root's height
    if (st.speed > 0.08) st.phase += dt * g.cadence * Math.PI * 2;
    for (const ft of st.feet) {
      const s = Math.sin(st.phase + (ft.side > 0 ? 0 : Math.PI));
      const rest = restSpot(root, st.yaw, ft.side, st.rig), reach = st.speed > 0.08 ? g.stride * 0.5 : 0;
      const dir = st.speed > 0.08 ? { x: st.vx / st.speed, z: st.vz / st.speed } : f;
      ft.x = rest.x + dir.x * s * reach; ft.z = rest.z + dir.z * s * reach;
      ft.y = root.y + (st.speed > 0.08 ? Math.max(0, Math.cos(st.phase + (ft.side > 0 ? 0 : Math.PI))) * 0.12 : 0);
      ft.planted = !(st.speed > 0.08) || ft.y - root.y < 0.01;
      if (wasFull) ft.t = 0;
    }
    critSpring(st.body, 0, 12, dt); critSpring(st.pitch, 0, 12, dt);
    return st;
  }
  if (st.lod !== 'full') plantAll(st, input.ground, root); // coming closer: plant on the real ground first
  st.lod = 'full';
  const ground = input.ground;

  // 2-4. the feet
  const swinging = st.feet.find((ft) => !ft.planted);
  for (const ft of st.feet) {
    if (ft.planted) {
      ft.downFor += dt;
      // the ground under a planted foot vanished or rose (a block broken or placed): re-seat it
      const here = groundFor(st, ground, ft.x, root.y, ft.z);
      if (here !== null && here > ft.y + 1e-6) ft.y = here;
    }
  }
  if (!swinging) {
    // pick the foot that most needs to move; lift it if it passed the threshold and the other has been down a moment
    let best = null, bestErr = 0;
    for (const ft of st.feet) {
      const other = st.feet[ft.side < 0 ? 1 : 0];
      if (other.downFor < MIN_STANCE) continue;
      const rest = restSpot(root, st.yaw, ft.side, st.rig);
      const ex = rest.x + st.vx * g.lead - ft.x, ez = rest.z + st.vz * g.lead - ft.z;
      const err = Math.hypot(ex, ez);
      const turned = Math.abs(wrapAngle(st.yaw - ft.landYaw)) > TURN_REPLANT;
      const sunk = Math.abs(ft.y - root.y) > st.rig.stepUpMax + 0.1;
      const thr = st.still > SETTLE_AFTER ? SETTLE_ERROR : g.threshold;
      const need = turned || sunk ? Math.max(err, thr + 1e-3) : err;
      if (need > thr && need > bestErr) { best = ft; bestErr = need; }
    }
    if (best) {
      const to = landingSpot(st, ground, root, best.side, g);
      const rise = Math.abs(to.y - best.y);
      Object.assign(best, { planted: false, t: 0, dur: g.stepDur * (1 + 0.35 * Math.min(1, rise)), fx: best.x, fy: best.y, fz: best.z, tx: to.x, ty: to.y, tz: to.z, arc: 0.07 + 0.025 * Math.min(st.speed, 4) + 0.35 * Math.min(rise, 1.2) });
    }
  }
  for (const ft of st.feet) {
    if (ft.planted) continue;
    ft.t += dt / ft.dur;
    // re-aim the landing while the foot is still early in its swing (the body keeps moving)
    if (ft.t < 0.75) {
      const to = landingSpot(st, ground, root, ft.side, g);
      ft.tx = to.x; ft.tz = to.z;
      if (Math.abs(to.y - ft.ty) > 1e-6) { ft.arc = Math.max(ft.arc, 0.07 + 0.35 * Math.min(Math.abs(to.y - ft.fy), 1.2)); ft.ty = to.y; }
    }
    const t = Math.min(1, ft.t), s = smoothstep(t);
    ft.x = lerp(ft.fx, ft.tx, s); ft.z = lerp(ft.fz, ft.tz, s);
    let y = swingHeight(ft.fy, ft.ty, t, ft.arc);
    // never inside the ground of the column it is over (the edge of a step)
    const under = groundFor(st, ground, ft.x, Math.max(root.y, ft.fy, ft.ty), ft.z);
    if (under !== null && y < under) y = under;
    ft.y = y;
    if (ft.t >= 1) {
      ft.x = ft.tx; ft.z = ft.tz;
      const land = groundFor(st, ground, ft.x, Math.max(root.y, ft.ty), ft.z);
      ft.y = land ?? ft.ty;
      ft.planted = true; ft.t = 0; ft.landYaw = st.yaw; ft.downFor = 0;
      st.steps++;
    }
  }

  // 5. hips and pitch from the feet
  const [L, R] = st.feet;
  const footY = (ft) => (ft.planted ? ft.y : lerp(ft.fy, ft.ty, smoothstep(ft.t)));
  const avg = (footY(L) + footY(R)) / 2;
  critSpring(st.body, clamp(avg - root.y, -0.7, 0.7), 14, dt);
  const df = (L.x - R.x) * f.x + (L.z - R.z) * f.z, dy = footY(L) - footY(R);
  const slope = Math.abs(df) > 0.08 ? Math.atan2(dy, Math.abs(df)) * Math.sign(df) : 0;
  critSpring(st.pitch, clamp(slope * 0.55, -0.4, 0.4), 9, dt);
  return st;
}

/** How many feet are in the air (tests: never 2 on the ground gait). */
export const airborne = (st) => st.feet.filter((ft) => !ft.planted).length;

// ---------------------------------------------------------------- 2-bone leg IK (the model's local frame)

/**
 * Two-bone IK for a leg hanging from `hip` (local coordinates: x right, y up, forward = -z) to `ankle`, thigh `L1`,
 * shin `L2`. The thigh pitches by `thighX` (about x — positive swings the foot forward, to -z) and then rolls by
 * `thighZ` (about z, sideways): THREE's 'ZXY' Euler order on the hip joint (matrix Rz * Rx), whose bone hangs along -y.
 * The shin bends `-knee` about x from the thigh (the knee points forward). Any ankle within reach is reached exactly;
 * `reach` is false when it was out of reach (the leg then points at it, straight or fully folded).
 */
export function solveLeg(hip, ankle, L1 = RIG.thigh, L2 = RIG.shin) {
  const dx = ankle.x - hip.x, dy = ankle.y - hip.y, dz = ankle.z - hip.z;
  const D0 = Math.hypot(dx, dy, dz);
  const lo = Math.abs(L1 - L2) + 1e-4, hi = L1 + L2 - 1e-4;
  const D = clamp(D0, lo, hi);
  const cosK = clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1);
  const knee = Math.PI - Math.acos(cosK);
  // the ankle in the thigh's own frame before the thigh turns: (0, a, b)
  const a = -(L1 + L2 * Math.cos(knee)), b = L2 * Math.sin(knee);
  const k = D0 > 1e-9 ? D / D0 : 0;
  const tx = dx * k, ty = D0 > 1e-9 ? dy * k : -D, tz = dz * k;
  // the roll comes last: the sideways part is the (y, z)-plane chain turned about z
  const side = Math.hypot(tx, ty);
  const thighZ = side > 1e-9 ? Math.atan2(tx, -ty) : 0;
  const thighX = Math.atan2(tz, -side) - Math.atan2(b, a);
  return { thighX, thighZ, knee, reach: D0 <= hi + 1e-6 && D0 >= lo - 1e-6 };
}

/** Forward kinematics of solveLeg's angles (Rz(thighZ) * Rx(thighX) * the bent chain): the ankle position (tests). */
export function legFK(hip, { thighX, thighZ, knee }, L1 = RIG.thigh, L2 = RIG.shin) {
  const a = -(L1 + L2 * Math.cos(knee)), b = L2 * Math.sin(knee);
  const y1 = a * Math.cos(thighX) - b * Math.sin(thighX), z1 = a * Math.sin(thighX) + b * Math.cos(thighX);
  return { x: hip.x - y1 * Math.sin(thighZ), y: hip.y + y1 * Math.cos(thighZ), z: hip.z + z1 };
}

/** World point -> the model's local frame (root at the feet, rotated by yaw, uniform scale). */
export function toLocal(p, root, yaw, scale = 1) {
  const dx = (p.x - root.x) / scale, dy = (p.y - root.y) / scale, dz = (p.z - root.z) / scale;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: c * dx - s * dz, y: dy, z: s * dx + c * dz };
}
