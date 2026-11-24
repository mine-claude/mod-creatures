// @ts-check
// The goblin's renderer (ctx.render.mobModel): builds the body (model.ts) and, every frame, poses it PROCEDURALLY from
// the mob's state — no keyframed clip anywhere:
//   - locomotion.ts walks the feet over the client's real block world (ctx.client.groundBelow), the legs reach them with
//     2-bone IK, the hips ride the average of the feet and the body pitches on steps;
//   - the arms counter-swing with the gait and open out for balance on slopes; a server cue (e.mob.cue) plays the throw
//     (aimed at the target, pebble in hand until release) or the stab (with a lunge);
//   - the head and eyes look at the nearest player in range (clamped), the ears ring on springs when it turns, brakes or
//     lands a step, the body leans into its acceleration, crouches when hurt, breathes and fidgets when idle;
//   - when it dies the body stays DEATH_MS and collapses (frame.dying).
// LOD by distance to the camera: full (<= 24 blocks), simple gait without ground queries (<= 64), plain slide beyond.
import { buildGoblin } from './model.ts';
import { RIG, createLocomotion, lodFor, solveLeg, stepLocomotion, toLocal } from './locomotion.ts';
import {
  breathe, clamp, critSpring, dampedSpring, deathPose, earDrive, fidgetAt, hash01, leanFrom, lookAngles, spring,
  stabPose, STAB_TIME, throwPose, THROW_TIME,
} from './procedural.ts';

export const DEATH_MS = 1400;
export const LOOK_RANGE = 12;
const HUNCH = 0.4; // the torso's forward stoop (rad)

function newState(id) {
  return {
    id, time: hash01(id) * 10, phase: hash01(id + 1) * Math.PI * 2, fallSide: hash01(id + 2) < 0.5 ? -1 : 1,
    loco: createLocomotion(), lod: 'none',
    crouch: spring(), leanP: spring(), leanR: spring(), headYaw: spring(), headPitch: spring(), pupilX: spring(), pupilY: spring(),
    earSwing: spring(), earFlap: spring(), earTip: spring(), earBounce: spring(), flapF: spring(), flapB: spring(), pouch: spring(),
    lastSteps: 0, action: null, target: null, frames: 0, cost: 0,
  };
}

export class GoblinRenderer {
  deathMs = DEATH_MS;
  /** @param {any} client ctx.client (the browser's view of the world) */
  constructor(client) {
    this._client = client;
    this._envAt = -1;
    this._env = { cam: null, targets: [] };
    this.stats = { frames: 0, queries: 0, ms: 0 }; // read by the browser check (budget)
  }

  build(kit) { return buildGoblin(kit); }

  // the server's cues (e.mob.cue): 'throw', 'stab'
  cue(m, name) {
    const s = (m.gob ??= newState(m.id));
    if (name === 'throw' || name === 'stab') s.action = { name, t: 0 };
  }

  // the camera and the look targets, once per frame for every goblin
  env(now) {
    if (this._envAt === now) return this._env;
    this._envAt = now;
    const c = this._client;
    let me = null, others = [];
    try { me = c?.player?.() ?? null; others = c?.players?.() ?? []; } catch { /* outside a session */ }
    this._env = { cam: me, targets: me ? [me, ...others] : others };
    return this._env;
  }

  ground(x, y, z) {
    try { return this._client.groundBelow(x, y, z, 4); } catch { return null; }
  }

  animate(m, frame) {
    const t0 = performance.now();
    const J = m.model.joints;
    if (!J) return;
    const s = (m.gob ??= newState(m.id));
    const dt = clamp(frame.dt, 1e-4, 0.1);
    s.time += dt; s.frames++;
    if (frame.dying !== undefined) { this.die(m, s, J, frame.dying, dt); return; }

    const g = m.model.group, pos = g.position, yaw = g.rotation.y, scale = g.scale.x || 1;
    const env = this.env(frame.now);
    const dist = env.cam ? Math.hypot(env.cam.x - pos.x, env.cam.y - pos.y, env.cam.z - pos.z) : 0;
    const lod = lodFor(dist);
    s.lod = lod;
    const st = stepLocomotion(s.loco, { x: pos.x, y: pos.y, z: pos.z, yaw, dt, lod, ground: (x, y, z) => this.ground(x, y, z) });
    this.stats.queries += st.queries;
    if (lod === 'none' && s.frames > 2) { this.legs(J, st, pos, yaw, scale, RIG.hipHeight); this.stats.frames++; return; } // a far slide: feet at rest, nothing else

    // ---- body: crouch on hurt, lean into the acceleration, hips on the feet, breathing
    critSpring(s.crouch, (m.flash ?? 0) > 0 ? 1 : 0, 20, dt);
    const lean = leanFrom(st.aForward, st.aRight);
    critSpring(s.leanP, lean.pitch, 9, dt);
    critSpring(s.leanR, lean.roll, 9, dt);
    const br = breathe(s.time, s.phase);
    const swingLift = st.feet.reduce((a, f) => a + (f.planted ? 0 : Math.sin(Math.PI * Math.min(1, f.t))), 0);
    const hipY = RIG.hipHeight + st.body.x - 0.1 * s.crouch.x + br.bob + 0.018 * swingLift;
    J.pelvis.position.y = hipY;
    J.pelvis.rotation.x = st.pitch.x * 0.6;
    J.pelvis.rotation.z = s.leanR.x;
    J.chest.scale.set(1 + (br.chest - 1) * 0.5, br.chest, 1 + (br.chest - 1) * 0.7);

    // ---- action (server cue)
    let act = null;
    if (s.action) {
      s.action.t += dt;
      const dur = s.action.name === 'throw' ? THROW_TIME : STAB_TIME;
      if (s.action.t >= dur) s.action = null;
      else act = s.action.name === 'throw' ? { name: 'throw', ...throwPose(s.action.t) } : { name: 'stab', ...stabPose(s.action.t) };
    }
    const lunge = act?.name === 'stab' ? act.lunge : 0;
    J.torso.rotation.x = -HUNCH - s.leanP.x - 0.25 * s.crouch.x - 0.25 * Math.max(0, st.pitch.x) - lunge;
    J.torso.rotation.y = act?.name === 'throw' ? act.twist * act.weight : 0;

    // ---- legs (IK to the planted / swinging feet)
    const fwd = this.legs(J, st, pos, yaw, scale, hipY);

    // ---- head and eyes: the nearest player in range
    let target = null, best = LOOK_RANGE;
    for (const p of env.targets) {
      const d = Math.hypot(p.x - pos.x, p.y - pos.y, p.z - pos.z);
      if (d < best && d > 0.3) { best = d; target = p; }
    }
    const eye = { x: pos.x, y: pos.y + 0.95 * scale, z: pos.z };
    const la = target ? lookAngles(eye, { x: target.x, y: target.y + 1.5, z: target.z }, yaw) : { yaw: 0, pitch: 0, looking: false };
    const fid = fidgetAt(s.id, s.time);
    const glance = fid.kind === 'glance' && !la.looking ? Math.sin(fid.t * Math.PI) * 0.8 * (hash01(s.id + 9) < 0.5 ? -1 : 1) : 0;
    critSpring(s.headYaw, la.yaw * 0.8 + glance, 11, dt);
    critSpring(s.headPitch, la.pitch * 0.7 - 0.25 * s.crouch.x, 11, dt);
    J.neck.rotation.y = s.headYaw.x * 0.35;
    J.head.rotation.y = s.headYaw.x * 0.65;
    J.head.rotation.x = -J.torso.rotation.x - J.pelvis.rotation.x + s.headPitch.x;
    J.head.rotation.z = fid.kind === 'scratch' ? Math.sin(fid.t * Math.PI) * 0.18 : 0;
    // the pupils take what the neck could not (and dart with the glance)
    critSpring(s.pupilX, clamp(-(la.yaw - s.headYaw.x) * 0.06 - glance * 0.02, -0.022, 0.022), 30, dt);
    critSpring(s.pupilY, clamp((la.pitch - s.headPitch.x) * 0.05, -0.014, 0.014), 30, dt);
    const blink = ((s.time + s.phase) % 3.9) < 0.11;
    for (const e of J.eyes) {
      e.pupil.position.x = s.pupilX.x; e.pupil.position.y = s.pupilY.x;
      e.eye.scale.y = blink || s.crouch.x > 0.6 ? 0.2 : 1;
    }
    // jaw: a mutter, a snarl when it throws or stabs, a gasp when hurt
    const mutter = Math.max(0, Math.sin(s.time * 11)) * (Math.sin(s.time * 0.9 + s.phase) > 0.6 ? 0.08 : 0);
    J.jaw.rotation.x = -(0.04 + mutter + (act ? 0.35 * act.weight : 0) + 0.3 * s.crouch.x);

    // ---- ears: springs driven by turning, braking/accelerating, the landing of each step
    const drive = earDrive(st.yawRate, st.aForward);
    dampedSpring(s.earSwing, drive.swing, 15, 0.3, dt);
    dampedSpring(s.earFlap, drive.flap, 13, 0.28, dt);
    if (st.steps !== s.lastSteps) { s.earBounce.v -= 1.6 + 0.4 * Math.min(st.speed, 3); s.lastSteps = st.steps; }
    dampedSpring(s.earBounce, 0, 18, 0.25, dt);
    dampedSpring(s.earTip, s.earSwing.x * 1.3 + s.earFlap.x, 10, 0.22, dt);
    const twitch = fid.kind === 'ear' ? Math.sin(fid.t * Math.PI * 4) * 0.35 * (1 - fid.t) : 0;
    for (const e of J.ears) {
      const sd = e.side;
      e.base.rotation.y = -sd * 0.42 + s.earSwing.x + sd * s.earFlap.x;
      e.base.rotation.z = sd * (0.32 - 0.75 * s.crouch.x + s.earBounce.x * 0.5 + (sd > 0 ? twitch : 0));
      e.tip.rotation.y = 0.7 * (s.earTip.x - s.earSwing.x);
      e.tip.rotation.z = sd * (-0.3 + s.earBounce.x * 0.8 - 0.3 * s.crouch.x);
    }

    // ---- arms: counter-swing with the opposite leg, out for balance; the action takes the right arm
    const balance = 0.1 + 0.6 * Math.abs(st.pitch.x) + 0.02 * Math.min(6, Math.abs(st.aRight)) + 0.15 * s.crouch.x;
    for (const a of J.arms) {
      const i = a.side < 0 ? 0 : 1, other = 1 - i;
      let sh = HUNCH + clamp(fwd[other] * 2.6, -0.9, 0.9) + 0.1 * Math.sin(s.time * 1.3 + s.phase + i);
      let el = 0.3 + 0.12 * Math.min(st.speed, 4);
      let roll = a.side * balance;
      if (i === 1 && act) {
        const aim = -J.torso.rotation.x + s.headPitch.x * 0.8;
        sh = sh * (1 - act.weight) + (act.shoulder + aim * (act.name === 'throw' ? 0.5 : 1) - HUNCH * 0.3) * act.weight;
        el = el * (1 - act.weight) + act.elbow * act.weight;
        roll = roll * (1 - act.weight) + 0.15 * act.weight;
      }
      if (i === 0 && fid.kind === 'scratch' && !act) { sh = HUNCH + 2.4 * Math.sin(fid.t * Math.PI); el = 1.9 * Math.sin(fid.t * Math.PI); }
      a.shoulder.rotation.set(sh, 0, roll);
      a.elbow.rotation.x = el;
    }
    J.pebble.visible = act?.name === 'throw' && !act.release;

    // ---- cloth and pouch: lag behind the motion
    dampedSpring(s.flapF, clamp(-0.12 * st.vForward - 0.05 * st.aForward, -0.9, 0.5) + 0.3 * Math.max(0, fwd[0], fwd[1]), 14, 0.35, dt);
    dampedSpring(s.flapB, clamp(0.1 * st.vForward + 0.04 * st.aForward, -0.4, 0.9), 12, 0.35, dt);
    dampedSpring(s.pouch, clamp(-0.05 * st.aRight, -0.5, 0.5) + 0.06 * swingLift, 11, 0.3, dt);
    J.flapFront.rotation.x = s.flapF.x;
    J.flapBack.rotation.x = s.flapB.x;
    J.pouch.rotation.z = s.pouch.x;
    const spent = performance.now() - t0;
    this.stats.frames++;
    this.stats.ms += spent;
    s.cost += spent; // this goblin's own share (the browser check sums it for the budget)
  }

  // The legs' IK to the solver's feet. Returns each foot's forward offset from its hip (blocks; + = ahead).
  legs(J, st, pos, yaw, scale, hipY) {
    const fwd = [0, 0];
    for (let i = 0; i < 2; i++) {
      const leg = J.legs[i], foot = st.feet[i];
      const ankle = toLocal({ x: foot.x, y: foot.y + RIG.ankle * scale, z: foot.z }, pos, yaw, scale);
      const hip = { x: leg.side * RIG.hipWidth, y: hipY, z: 0 };
      leg.hip.position.y = hipY;
      const sol = solveLeg(hip, ankle);
      leg.hip.rotation.set(sol.thighX, 0, sol.thighZ);
      leg.knee.rotation.x = -sol.knee;
      // the foot stays flat on the ground; mid-swing the toes lift a little
      const toe = foot.planted ? 0 : 0.35 * Math.sin(Math.PI * Math.min(1, foot.t));
      leg.ankle.rotation.set(-(sol.thighX - sol.knee) + toe, 0, -sol.thighZ);
      fwd[i] = -ankle.z;
    }
    return fwd;
  }

  // The collapse: the knees give, the body drops and tips over to one side.
  die(m, s, J, t, dt) {
    const d = deathPose(t, s.fallSide);
    J.rig.rotation.z = d.roll;
    J.rig.position.y = 0.14 * Math.abs(Math.sin(d.roll));
    J.pelvis.position.y = RIG.hipHeight - d.drop;
    J.torso.rotation.x = -HUNCH - 0.5 * d.kneel;
    for (const leg of J.legs) {
      leg.hip.position.y = RIG.hipHeight - d.drop;
      leg.hip.rotation.set(1.1 * d.kneel, 0, 0);
      leg.knee.rotation.x = -1.9 * d.kneel;
      leg.ankle.rotation.set(0.8 * d.kneel, 0, 0);
    }
    for (const a of J.arms) { a.shoulder.rotation.set(HUNCH + 0.6 * d.kneel, 0, a.side * (0.2 + 0.9 * d.kneel)); a.elbow.rotation.x = 0.4; }
    J.head.rotation.x = HUNCH + d.head;
    J.jaw.rotation.x = -0.45 * d.kneel;
    for (const e of J.ears) { e.base.rotation.z = e.side * (0.32 - 1.0 * d.kneel); e.tip.rotation.z = -e.side * 0.6 * d.kneel; }
    for (const e of J.eyes) e.eye.scale.y = Math.max(0.15, 1 - d.kneel);
    J.pebble.visible = false;
  }
}
