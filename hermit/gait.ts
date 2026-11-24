// @ts-check
// The Tide Hermit's PROCEDURAL LOCOMOTION: eight walking legs whose feet find the real ground, plant, stay planted and
// step — an ALTERNATING TETRAPOD: the legs are two sets of four (on each side every other leg, and the opposite pattern
// across), and only one set is ever in the air while the other four hold the body. It is the goblin's two-foot solver
// (goblin/locomotion.ts) generalised to N feet: the same gait numbers (gaitScaled), the same swing arc (swingHeight),
// the same critically damped springs, the same column scan for the ground. Pure: no THREE, no DOM, no game code — the
// ground comes in as a function (ctx.client.groundBelow in the browser, a fake block world in the tests).
//
// A hermit crab walks SIDEWAYS: the server turns its body across the direction it moves (mob.ts), so the feet lead
// along the body's x axis. Nothing here assumes a direction: each foot's landing spot is its rest spot plus a lead along
// the measured velocity, wherever that points.
//
// Per frame, for the root (the mob's feet point, as the engine interpolates it) and yaw:
//   1. velocity and acceleration from the root's motion (exp smoothing, frame-rate independent);
//   2. each foot's error: how far its planted spot is from its rest spot + lead;
//   3. with no foot in the air, the set with the biggest error past the threshold lifts (the feet of that set that need
//      it), but only once the other set has been down MIN_STANCE — so at most four feet are ever in the air and two
//      neighbours on one side never are at the same time;
//   4. a swinging foot follows an arc to its (re-aimed) landing spot on the real ground, never below the ground of the
//      column it is over; a planted foot NEVER moves (it is only re-seated upwards if a block appears under it);
//   5. the body's height follows the average height of the feet, its roll the difference between the right and the left
//      feet, its pitch the difference between the front and the back pairs — each through a critically damped spring.
// LOD: 'full' (all of the above), 'simple' (a phase gait from speed, no ground queries), 'none' (feet at rest).
import { clamp, critSpring, expAlpha, gaitScaled, lerp, smoothstep, spring, swingHeight, wrapAngle, hash01 } from '../goblin/procedural.ts';
import { lodFor } from '../goblin/locomotion.ts';

export { lodFor };

/**
 * The rig, in blocks (model.ts builds the legs with the same numbers). Each leg: side (+1 right, -1 left), its hip in
 * the body's frame (x out, z along: - = front, y above the feet when standing) and its foot's rest spot (x out, z), and
 * its set (0 / 1) of the tetrapod. Legs 0..3 are the right side front to back, 4..7 the left side.
 */
const LEG_Z = [-0.27, -0.15, -0.03, 0.09];
const FOOT_Z = [-0.52, -0.22, 0.08, 0.36];
const FOOT_OUT = [0.66, 0.71, 0.71, 0.66];
export const HERMIT_RIG = Object.freeze({
  hipX: 0.17,
  hipHeight: 0.27, // the hips above the ground when standing
  femur: 0.34,
  tibia: 0.49,
  stepUpMax: 1.15, // the highest ground a foot reaches for (a block and a bit)
  stepDownMax: 2.2, // below this the foot does not search (a ledge): it stays at the body's height
  gaitScale: 0.5, // quick, short crab steps (a high cadence keeps every foot within the leg's reach)
  // how far ahead (in seconds of velocity, times the step's duration) a foot lands: a set stays planted about a step and a
  // half, so the landing leads by about half of that and the foot sweeps symmetrically past its rest spot
  leadScale: 0.95,
  legs: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const side = i < 4 ? 1 : -1, k = i % 4;
    return Object.freeze({ i, side, k, hipZ: LEG_Z[k], footOut: FOOT_OUT[k], footZ: FOOT_Z[k], set: (k + (side > 0 ? 0 : 1)) % 2 });
  })),
});

export const LEG_COUNT = 8;
const MIN_STANCE = 0.03; // s a set stays down after landing before the other may lift
const SETTLE_AFTER = 0.25; // s stopped before the feet tidy up to their rest spots
const SETTLE_ERROR = 0.06;
const TURN_REPLANT = 0.5; // rad of yaw since a foot landed that makes it re-plant (turning in place)
const PARTNER_LIFT = 0.4; // a foot of the lifting set comes along if its error is this fraction of the threshold
const REACH_SLACK = 0.86; // a planted foot farther (horizontally) than this share of the leg's flat reach lifts

const newFoot = (leg) => ({ i: leg.i, side: leg.side, set: leg.set, x: 0, y: 0, z: 0, planted: true, t: 0, dur: 0.25, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, arc: 0.08, landYaw: 0, downFor: 1, jitter: 0.92 + 0.16 * hash01(leg.i * 31 + 7) });

/** A locomotion state (one per mob). */
export function createGait(rig = HERMIT_RIG) {
  return {
    init: false, lod: 'none', rig,
    px: 0, py: 0, pz: 0, yaw: 0,
    vx: 0, vz: 0, ax: 0, az: 0, yawRate: 0,
    speed: 0, vForward: 0, vRight: 0, aForward: 0, aRight: 0,
    still: 0, phase: 0,
    feet: rig.legs.map(newFoot),
    body: spring(0), // the body's height offset from the root (the feet's average)
    pitch: spring(0), // nose up = positive
    roll: spring(0), // right side up = positive
    steps: 0, // landed steps (tests, debug)
    lifts: 0, // set lifts (tests)
    lastSet: -1, // the set that stepped last (the other one goes next)
    maxAir: 0, // the most feet ever in the air at once (tests)
    queries: 0, // ground queries this frame (budget)
  };
}

const fwd = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
const right = (yaw) => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });

/** A body-frame point (x right, z back) to world (x, z) for a root and yaw. */
export function bodyToWorld(root, yaw, x, z) {
  const r = right(yaw), f = fwd(yaw);
  return { x: root.x + r.x * x - f.x * z, z: root.z + r.z * x - f.z * z };
}

/** The foot's rest spot in the world (no lead). */
export function restSpot(root, yaw, leg) {
  return bodyToWorld(root, yaw, leg.side * leg.footOut, leg.footZ);
}

// The ground for a foot at (x, z): scanned from above the hip so a step up is found; too high (a wall) or nothing
// within reach (a ledge) gives null.
function groundFor(st, ground, x, rootY, z) {
  st.queries++;
  const g = ground(x, rootY + st.rig.stepUpMax + 0.2, z);
  if (g === null || g === undefined || !Number.isFinite(g)) return null;
  if (g > rootY + st.rig.stepUpMax || g < rootY - st.rig.stepDownMax) return null;
  return g;
}

function landingSpot(st, ground, root, leg, g) {
  const rest = restSpot(root, st.yaw, leg);
  const lead = g.stepDur * (st.rig.leadScale ?? 0.5);
  const lx = rest.x + st.vx * lead, lz = rest.z + st.vz * lead;
  let y = groundFor(st, ground, lx, root.y, lz);
  if (y !== null) return { x: lx, y, z: lz };
  y = groundFor(st, ground, rest.x, root.y, rest.z);
  return { x: rest.x, y: y ?? root.y, z: rest.z };
}

function plantAll(st, ground, root) {
  for (const f of st.feet) {
    const r = restSpot(root, st.yaw, st.rig.legs[f.i]);
    const y = ground ? groundFor(st, ground, r.x, root.y, r.z) : null;
    Object.assign(f, { x: r.x, y: y ?? root.y, z: r.z, planted: true, t: 0, landYaw: st.yaw, downFor: 1 });
  }
}

/** How many feet are in the air. */
export const airborne = (st) => { let n = 0; for (const f of st.feet) if (!f.planted) n++; return n; };
/** A foot's height as the body sees it: planted = where it is; swinging = on the line from lift-off to landing. */
const footY = (ft) => (ft.planted ? ft.y : lerp(ft.fy, ft.ty, smoothstep(ft.t)));

/**
 * One frame. input: { x, y, z, yaw, dt, ground(x, y, z) -> top | null, lod?: 'full' | 'simple' | 'none' }.
 * Returns the state (feet in WORLD coordinates, the body's height offset, pitch and roll, the gait numbers).
 */
export function stepGait(st, input) {
  const dt = clamp(input.dt, 1e-4, 0.1);
  const root = { x: input.x, y: input.y, z: input.z };
  const lod = input.lod ?? 'full';
  st.queries = 0;
  if (!st.init) {
    st.init = true; st.px = root.x; st.py = root.y; st.pz = root.z; st.yaw = input.yaw;
    plantAll(st, lod === 'full' ? input.ground : null, root);
  }
  // 1. the root's motion
  const rvx = (root.x - st.px) / dt, rvz = (root.z - st.pz) / dt;
  const teleport = Math.hypot(root.x - st.px, root.z - st.pz) > 2.5;
  const a = expAlpha(14, dt);
  const nvx = teleport ? 0 : lerp(st.vx, rvx, a), nvz = teleport ? 0 : lerp(st.vz, rvz, a);
  const ab = expAlpha(8, dt);
  st.ax = lerp(st.ax, (nvx - st.vx) / dt, ab); st.az = lerp(st.az, (nvz - st.vz) / dt, ab);
  st.vx = nvx; st.vz = nvz;
  st.yawRate = lerp(st.yawRate, wrapAngle(input.yaw - st.yaw) / dt, expAlpha(10, dt));
  st.yaw = input.yaw;
  st.px = root.x; st.py = root.y; st.pz = root.z;
  const f = fwd(st.yaw), r = right(st.yaw);
  st.speed = Math.hypot(st.vx, st.vz);
  st.vForward = st.vx * f.x + st.vz * f.z; st.vRight = st.vx * r.x + st.vz * r.z;
  st.aForward = st.ax * f.x + st.az * f.z; st.aRight = st.ax * r.x + st.az * r.z;
  st.still = st.speed < 0.08 && Math.abs(st.yawRate) < 0.3 ? st.still + dt : 0;
  const g = gaitScaled(st.speed, st.rig.gaitScale ?? 1);
  if (teleport) plantAll(st, lod === 'full' ? input.ground : null, root);

  if (lod !== 'full') {
    st.lod = lod;
    if (lod === 'none') { plantAll(st, null, root); critSpring(st.body, 0, 12, dt); critSpring(st.pitch, 0, 12, dt); critSpring(st.roll, 0, 12, dt); return st; }
    // 'simple': the two sets alternate on a phase from the speed; feet at the root's height
    const moving = st.speed > 0.08;
    if (moving) st.phase += dt * g.cadence * Math.PI * 2;
    const dir = moving ? { x: st.vx / st.speed, z: st.vz / st.speed } : r;
    for (const ft of st.feet) {
      const leg = st.rig.legs[ft.i], ph = st.phase + (ft.set ? Math.PI : 0);
      const rest = restSpot(root, st.yaw, leg), reach = moving ? g.stride * 0.5 : 0;
      ft.x = rest.x + dir.x * Math.sin(ph) * reach; ft.z = rest.z + dir.z * Math.sin(ph) * reach;
      ft.y = root.y + (moving ? Math.max(0, Math.cos(ph)) * 0.1 : 0);
      ft.planted = !moving || ft.y - root.y < 0.01;
    }
    critSpring(st.body, 0, 12, dt); critSpring(st.pitch, 0, 12, dt); critSpring(st.roll, 0, 12, dt);
    return st;
  }
  if (st.lod !== 'full') plantAll(st, input.ground, root); // coming closer: plant on the real ground first
  st.lod = 'full';
  const ground = input.ground;

  // 2. planted feet: re-seated upwards only (a block placed under one); they never slide
  let swingSet = -1;
  for (const ft of st.feet) {
    if (ft.planted) {
      ft.downFor += dt;
      const here = groundFor(st, ground, ft.x, root.y, ft.z);
      if (here !== null && here > ft.y + 1e-6) ft.y = here;
    } else swingSet = ft.set;
  }
  // 3. lifting: one set at a time
  if (swingSet < 0) {
    const thr = st.still > SETTLE_AFTER ? SETTLE_ERROR : g.threshold;
    const reachH = REACH_SLACK * Math.sqrt(Math.max(0, (st.rig.femur + st.rig.tibia) ** 2 - st.rig.hipHeight ** 2));
    const err = new Array(st.feet.length).fill(0), setErr = [0, 0], setDown = [Infinity, Infinity];
    for (const ft of st.feet) {
      const leg = st.rig.legs[ft.i], rest = restSpot(root, st.yaw, leg);
      const lead = g.stepDur * (st.rig.leadScale ?? 0.5);
      const e = Math.hypot(rest.x + st.vx * lead - ft.x, rest.z + st.vz * lead - ft.z);
      const turned = Math.abs(wrapAngle(st.yaw - ft.landYaw)) > TURN_REPLANT;
      const sunk = Math.abs(ft.y - root.y) > st.rig.stepUpMax + 0.1;
      // a foot near the end of its leg's reach has to go, whatever its error says
      const hip = bodyToWorld(root, st.yaw, leg.side * st.rig.hipX, leg.hipZ);
      const stretched = Math.hypot(ft.x - hip.x, ft.z - hip.z) > reachH;
      err[ft.i] = turned || sunk || stretched ? Math.max(e, thr + 1e-3) : e;
      setErr[ft.set] = Math.max(setErr[ft.set], err[ft.i]);
      setDown[ft.set] = Math.min(setDown[ft.set], ft.downFor);
    }
    let lift = -1;
    for (const s of [0, 1]) {
      if (setErr[s] > thr && setDown[1 - s] >= MIN_STANCE && (lift < 0 || setErr[s] > setErr[lift])) lift = s;
    }
    // strict alternation while walking: the set that stepped last waits for the other one, if that one has anything to do
    // (without this, at a run the set that just landed — always the most behind its moving target — would step again and
    // again while the other set's feet trailed off)
    if (lift >= 0 && lift === st.lastSet && setErr[1 - lift] > thr * PARTNER_LIFT) lift = setDown[lift] >= MIN_STANCE ? 1 - lift : -1;
    if (lift >= 0) {
      st.lifts++;
      st.lastSet = lift;
      for (const ft of st.feet) {
        if (ft.set !== lift || err[ft.i] < thr * PARTNER_LIFT) continue;
        const to = landingSpot(st, ground, root, st.rig.legs[ft.i], g);
        const rise = Math.abs(to.y - ft.y);
        Object.assign(ft, { planted: false, t: 0, dur: g.stepDur * ft.jitter * (1 + 0.35 * Math.min(1, rise)), fx: ft.x, fy: ft.y, fz: ft.z, tx: to.x, ty: to.y, tz: to.z, arc: 0.06 + 0.02 * Math.min(st.speed, 4) + 0.35 * Math.min(rise, 1.2) });
      }
    }
  }
  // 4. swinging feet
  for (const ft of st.feet) {
    if (ft.planted) continue;
    ft.t += dt / ft.dur;
    if (ft.t < 0.75) { // re-aim while early in the swing (the body keeps moving)
      const to = landingSpot(st, ground, root, st.rig.legs[ft.i], g);
      ft.tx = to.x; ft.tz = to.z;
      if (Math.abs(to.y - ft.ty) > 1e-6) { ft.arc = Math.max(ft.arc, 0.06 + 0.35 * Math.min(Math.abs(to.y - ft.fy), 1.2)); ft.ty = to.y; }
    }
    const t = Math.min(1, ft.t), s = smoothstep(t);
    ft.x = lerp(ft.fx, ft.tx, s); ft.z = lerp(ft.fz, ft.tz, s);
    let y = swingHeight(ft.fy, ft.ty, t, ft.arc);
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
  st.maxAir = Math.max(st.maxAir, airborne(st));

  // 5. the body from the feet: height, roll (right vs left), pitch (front pair vs back pair)
  let sum = 0, rightY = 0, leftY = 0;
  for (const ft of st.feet) { const y = footY(ft); sum += y; if (ft.side > 0) rightY += y; else leftY += y; }
  const avg = sum / st.feet.length;
  critSpring(st.body, clamp(avg - root.y, -0.6, 0.6), 14, dt);
  const span = 2 * (FOOT_OUT[1] + FOOT_OUT[2]) / 2;
  critSpring(st.roll, clamp(Math.atan2((rightY - leftY) / 4, span) * 0.8, -0.45, 0.45), 10, dt);
  const front = (footY(st.feet[0]) + footY(st.feet[4])) / 2, back = (footY(st.feet[3]) + footY(st.feet[7])) / 2;
  critSpring(st.pitch, clamp(Math.atan2(front - back, FOOT_Z[3] - FOOT_Z[0]) * 0.8, -0.45, 0.45), 10, dt);
  return st;
}
