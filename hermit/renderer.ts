// @ts-check
// The Tide Hermit's renderer (ctx.render.mobModel): builds the body (model.ts) and poses it every frame, PROCEDURALLY,
// from what the server says (the pose "h<shell>_<state>" and the cues 'snap' | 'pinch' | 'pick' | 'knock') and how it
// actually moves — no keyframed clip:
//   - the shell: the pose's shell index dresses the whorl in that block's atlas cells (kit.blockTexture);
//   - walking: eight feet on the real ground (gait.ts over ctx.client.groundBelow), an alternating tetrapod, SIDEWAYS
//     (the server turns the body across its path); each leg reaches its foot with the goblin's 2-bone IK in a frame
//     turned on its side (the knee arches up like a crab's); the body's height, pitch and roll come from the feet;
//   - eye stalks: each tracks the nearest player on its own spring (they converge on a near one), idle glances apart;
//   - claws: the big one SNAPS (wind-up, slam, springy overshoot), the small one PINCHES and picks at the sand;
//   - antennae whip with the body's acceleration (a cascade of springs down each one), the kelp on the shell swings;
//   - retreat: the legs tuck in back to front, the claws fold over the opening, the body pulls in, the eyes go last, the
//     shell lands on the sand and rocks; a blow while inside knocks it rocking again;
//   - peek: ONE eye stalk pops out first, then the other, then antennae, claws, body and legs;
//   - death (deathMs): the legs curl, the body sinks into the shell, the shell tips over onto its side.
// LOD: feet on the real ground within 24 blocks, a phase gait to 64, nothing but the body's pose beyond (gait.ts).
import { buildHermit, setShell } from './model.ts';
import { DEATH_MS, parsePose } from './tuning.ts';
import { HERMIT_RIG, createGait, lodFor, stepGait } from './gait.ts';
import { solveLeg } from '../goblin/locomotion.ts';
import {
  PICK_TIME, PINCH_TIME, SNAP_TIME, antennaDrive, clamp, clawState, critSpring, dampedSpring, eyeAim, eyeState, hash01,
  hermitDeath, kickRock, lerp, pickTargets, pinchTargets, rockState, shellTargets, smoothstep, snapTargets, spring, stepClaw,
  stepEye, stepRock,
} from './procedural.ts';

const LOOK_RANGE = 12;
// the tucked leg (in the IK's angles): thigh swung up to the body, knee folded flat
const TUCK = Object.freeze({ thighX: 2.1, thighZ: 0, knee: 2.7 });

function newState(m) {
  return {
    id: m.id, time: hash01(m.id) * 10, phase: hash01(m.id + 3) * Math.PI * 2, frames: 0,
    gait: createGait(), lod: 'full',
    state: 'forage', stateAt: 0, shell: -1,
    out: { legs: Array.from({ length: 8 }, () => spring(1)), claws: spring(1), body: spring(1), antennae: spring(1), eyeL: spring(1), eyeR: spring(1) },
    eyes: [eyeState(), eyeState()], startle: spring(0),
    big: clawState(), small: clawState(), snapT: -1, pinchT: -1, pickT: -1,
    ant: Array.from({ length: 4 }, () => [spring(0), spring(0), spring(0), spring(0)]),
    kelp: [spring(0), spring(0), spring(0)],
    rock: rockState(), settle: spring(0),
    fallSide: hash01(m.id + 11) < 0.5 ? -1 : 1,
    legAngles: Array.from({ length: 8 }, () => ({ thighX: 0, thighZ: 0, knee: 0 })),
  };
}

export class HermitRenderer {
  deathMs = DEATH_MS;
  _client: any = null;
  _env: any = null;
  _envAt = -1;
  _v: any = null;
  stats = { frames: 0, queries: 0, ms: 0 }; // read by the browser check (budget)
  /** @param {any} client ctx.client (the browser's view of the world) */
  constructor(client) { this._client = client; }

  build(kit) {
    this._v ??= new kit.THREE.Vector3();
    return buildHermit(kit);
  }

  // the server's cues (e.mob.cue)
  cue(m, name) {
    const s = (m.hermit ??= newState(m));
    if (name === 'snap') s.snapT = 0;
    else if (name === 'pinch') s.pinchT = 0;
    else if (name === 'pick') s.pickT = 0;
    else if (name === 'knock') kickRock(s.rock, (hash01(s.frames + s.id) < 0.5 ? -1 : 1) * 3.2, 1.2);
  }

  // the camera and the look targets, once per frame for every hermit
  env(now) {
    if (this._envAt === now && this._env) return this._env;
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
    const model = m.model, J = model.joints;
    if (!J) return;
    const s = (m.hermit ??= newState(m));
    const dt = clamp(frame.dt, 1e-4, 0.1);
    s.time += dt; s.frames++;

    // the pose: which shell, which state
    const pp = parsePose(m.pose);
    if (pp && pp.shell !== s.shell) { s.shell = pp.shell; setShell(model, pp.shell); }
    const state = pp?.state ?? 'forage';
    if (state !== s.state) {
      if (state === 'retreat') kickRock(s.rock, s.fallSide * 2.4, -1.6); // it slams into the shell: the shell rocks
      s.state = state; s.stateAt = s.time;
    }
    if (frame.dying !== undefined) { this.die(m, s, J, frame.dying, dt); return; }

    const g = model.group, pos = g.position, yaw = g.rotation.y, scale = g.scale.x || 1;
    const env = this.env(frame.now);
    const dist = env.cam ? Math.hypot(env.cam.x - pos.x, env.cam.y - pos.y, env.cam.z - pos.z) : 0;
    const lod = lodFor(dist);
    s.lod = lod;
    const st = stepGait(s.gait, { x: pos.x, y: pos.y, z: pos.z, yaw, dt, lod, ground: (x, y, z) => this.ground(x, y, z) });
    this.stats.queries += st.queries;

    // ---- in / out of the shell
    const tgt = shellTargets(state, s.time - s.stateAt);
    const O = s.out;
    for (let i = 0; i < 8; i++) critSpring(O.legs[i], tgt.legs[i], 22, dt);
    critSpring(O.claws, tgt.claws, 18, dt);
    critSpring(O.body, tgt.body, 14, dt);
    critSpring(O.antennae, tgt.antennae, 18, dt);
    critSpring(O.eyeL, tgt.eyeL, 26, dt);
    critSpring(O.eyeR, tgt.eyeR, 26, dt);
    const body = clamp(O.body.x, 0, 1);
    stepRock(s.rock, dt);

    // ---- body: the feet carry it; inside the shell it sits on the sand
    const breathe = Math.sin(s.time * 2.4 + s.phase) * 0.006 * body;
    const scurry = st.feet.reduce((a, f) => a + (f.planted ? 0 : Math.sin(Math.PI * Math.min(1, f.t))), 0);
    J.rig.position.y = lerp(0.1, HERMIT_RIG.hipHeight + st.body.x, body) + breathe + 0.006 * scurry;
    J.rig.rotation.x = st.pitch.x * body + s.rock.pitch.x;
    J.rig.rotation.z = st.roll.x * body + 0.03 * clamp(-st.aRight * 0.1, -1, 1) * body;
    J.shell.rotation.z = s.rock.roll.x;
    J.front.position.z = -0.14 + 0.24 * (1 - body);
    J.front.position.y = 0.02 + 0.05 * (1 - body);
    J.front.scale.setScalar(lerp(0.5, 1, body));
    J.abdomen.position.z = 0.02 + 0.12 * (1 - body);
    J.abdomen.scale.setScalar(lerp(0.6, 1, body));
    s.segWave = (s.segWave ?? 0) + dt * (2 + 4 * Math.min(1, st.speed));
    J.segs.forEach((seg, k) => { seg.rotation.y = Math.sin(s.segWave - k * 0.8) * 0.06 * body; });

    if (lod === 'none' && s.frames > 2) { this.legs(J, s, st, g, 1); this.stats.frames++; this.stats.ms += performance.now() - t0; return; }

    // ---- legs: IK to the feet, blended with the tucked pose
    this.legs(J, s, st, g, 0);

    // ---- eyes: each on its own, at the nearest player in range; startled stalks drop for a moment
    critSpring(s.startle, (m.flash ?? 0) > 0 ? 1 : 0, (m.flash ?? 0) > 0 ? 40 : 6, dt);
    let target = null, best = LOOK_RANGE;
    for (const p of env.targets) {
      const d = Math.hypot(p.x - pos.x, p.y - pos.y, p.z - pos.z);
      if (d < best && d > 0.3) { best = d; target = { x: p.x, y: p.y + 1.5, z: p.z }; }
    }
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    J.eyes.forEach((e, k) => {
      const ex = e.side * 0.055 * scale, ez = -0.43 * scale, ey = (J.rig.position.y + 0.32) * scale;
      const eye = { x: pos.x + c * ex + sn * ez, y: pos.y + ey, z: pos.z - sn * ex + c * ez };
      const aim = eyeAim(eye, target, yaw, s.id, e.side, s.time);
      const es = stepEye(s.eyes[k], aim, dt, k ? 15 : 17);
      const out = clamp((e.side < 0 ? O.eyeL : O.eyeR).x, 0, 1);
      e.yaw.rotation.y = es.yaw.x * out;
      e.pitch.rotation.x = es.pitch.x * out - 0.9 * s.startle.x;
      e.stalk.rotation.x = 1.45 * (1 - out); // folded back flat into the opening
      e.stalk.scale.setScalar(Math.max(0.05, lerp(0.35, 1, out)));
      e.yaw.visible = out > 0.03;
      e.eye.scale.y = ((s.time + s.phase * 3 + e.side) % 4.3) < 0.09 ? 0.3 : 1; // a quick wipe of the eye
    });

    // ---- claws
    const hostile = state === 'hostile' ? 1 : 0;
    s.guard = lerp(s.guard ?? 0, hostile, 1 - Math.exp(-4 * dt));
    let bigWant = { open: 0.12 + 0.05 * Math.sin(s.time * 1.3 + s.phase), reach: 0, lift: 0.25 * s.guard };
    if (s.snapT >= 0) { s.snapT += dt; if (s.snapT >= SNAP_TIME) s.snapT = -1; else bigWant = snapTargets(s.snapT); }
    let smallWant = { open: 0.2 + 0.1 * Math.sin(s.time * 2.1 + s.phase), reach: 0, lift: 0.15 * s.guard };
    let dip = 0;
    if (s.pinchT >= 0) { s.pinchT += dt; if (s.pinchT >= PINCH_TIME) s.pinchT = -1; else smallWant = pinchTargets(s.pinchT); }
    else if (s.pickT >= 0) { s.pickT += dt; const pk = pickTargets(s.pickT); if (!pk) s.pickT = -1; else { dip = pk.dip; smallWant = { open: pk.open, reach: 0.2, lift: -0.4 * pk.dip }; } }
    stepClaw(s.big, bigWant, dt, true);
    stepClaw(s.small, smallWant, dt, false);
    const clawOut = clamp(O.claws.x, 0, 1);
    for (const cl of J.claws) {
      const cs = cl.big ? s.big : s.small, sd = cl.side;
      // the rest pose: elbow folded so the palm crosses in front of the face; the big one is the door of the shell
      const fold = 1 - clawOut;
      cl.shoulder.rotation.set(-0.15 - 0.55 * cs.lift.x + 0.5 * fold + (cl.big ? 0 : 0.5 * dip), -sd * (0.35 - 0.25 * cs.reach.x) - sd * 0.5 * fold, sd * 0.1);
      cl.shoulder.position.z = -0.27 - 0.06 * cs.reach.x + 0.08 * fold;
      cl.wrist.rotation.set(0.1 * cs.lift.x, -sd * (0.75 - 0.6 * clamp(cs.reach.x, -0.5, 1.3)) - sd * 0.35 * fold, 0);
      cl.palm.rotation.set(-0.12 + 0.2 * cs.lift.x + (cl.big ? 0 : 0.6 * dip), sd * 0.2, 0);
      cl.finger.rotation.x = clamp(cs.open.x, -0.12, 1.3) * 0.85 * (0.3 + 0.7 * clawOut);
    }
    // mouthparts: a busy flutter while it forages, quieter otherwise
    for (const mp of J.mouth) mp.j.rotation.x = Math.sin(s.time * (state === 'forage' ? 17 : 8) + mp.side) * (state === 'forage' ? 0.25 : 0.1) * body;

    // ---- antennae: a cascade of springs down each whip
    const antOut = clamp(O.antennae.x, 0, 1);
    J.antennae.forEach((a, k) => {
      const drv = antennaDrive(s.time, s.phase + k * 0.9, a.side, st.aForward, st.aRight);
      const springs = s.ant[k];
      a.base.rotation.x = lerp(-0.6, a.long ? 0.5 : 0.35, antOut) + (a.long ? 0.15 * s.startle.x : 0);
      a.links.forEach((link, i) => {
        const prev = i ? springs[i - 1].x * 0.6 : 0;
        dampedSpring(springs[i], (drv.yaw * (a.long ? 1 : 0.5)) + prev, 13 - 2 * i, 0.35, dt);
        link.rotation.y = springs[i].x * antOut;
        link.rotation.x = (drv.pitch * 0.5 + (a.long ? 0.12 * i : 0)) * antOut - (1 - antOut) * 0.5;
      });
    });

    // ---- the kelp on the shell: it swings against the body's sideways acceleration and the shell's rock
    J.kelp.forEach((link, i) => {
      const prev = i ? s.kelp[i - 1].x * 0.7 : 0;
      dampedSpring(s.kelp[i], clamp(-st.aRight * 0.04, -0.8, 0.8) + s.rock.roll.x * 0.8 + prev + Math.sin(s.time * 1.1 + i) * 0.05, 7 - i, 0.25, dt);
      link.rotation.z = s.kelp[i].x;
      link.rotation.x = clamp(st.aForward * 0.02, -0.4, 0.4);
    });

    const spent = performance.now() - t0;
    this.stats.frames++;
    this.stats.ms += spent;
  }

  // The legs: each hip frame's own view of its foot (the world point taken into the frame by the engine's own matrices,
  // so the body's height, pitch, roll and the mob's scale are all accounted for) -> the goblin's 2-bone IK, blended with
  // the tucked pose by how far out the leg is. `rest`: LOD 'none' (no IK, the resting crouch).
  legs(J, s, st, group, rest) {
    group.updateMatrixWorld(true);
    const v = this._v ?? { set() { return this; } };
    for (let i = 0; i < 8; i++) {
      const L = J.legs[i], foot = st.feet[i], out = clamp(s.out.legs[i].x, 0, 1);
      let sol;
      if (!rest && v.isVector3) {
        v.set(foot.x, foot.y + 0.02, foot.z);
        L.hip.worldToLocal(v);
        sol = solveLeg({ x: 0, y: 0, z: 0 }, { x: v.x, y: v.y, z: v.z }, HERMIT_RIG.femur, HERMIT_RIG.tibia);
      } else sol = { thighX: 0.95, thighZ: 0, knee: 1.75 };
      const a = s.legAngles[i];
      a.thighX = lerp(TUCK.thighX, sol.thighX, out);
      a.thighZ = lerp(TUCK.thighZ, sol.thighZ, out);
      a.knee = lerp(TUCK.knee, sol.knee, out);
      L.thigh.rotation.set(a.thighX, 0, a.thighZ);
      L.knee.rotation.x = -a.knee;
      L.hip.scale.setScalar(lerp(0.7, 1, out));
    }
  }

  // The death: legs curl under, the body sinks into the shell, the shell tips over onto its side and settles.
  die(m, s, J, t, dt) {
    const d = hermitDeath(t, s.fallSide);
    J.rig.position.y = lerp(HERMIT_RIG.hipHeight, 0.12, d.sink) + 0.18 * Math.abs(Math.sin(d.tip)) * 0.6;
    J.rig.rotation.z = d.tip;
    J.rig.rotation.x = 0;
    J.front.position.z = -0.14 + 0.22 * d.sink;
    J.front.scale.setScalar(lerp(1, 0.55, d.sink));
    for (let i = 0; i < 8; i++) {
      const L = J.legs[i], k = smoothstep(d.curl * 1.2 - 0.03 * (i % 4));
      L.thigh.rotation.set(lerp(0.9, TUCK.thighX, k), 0, 0);
      L.knee.rotation.x = -lerp(1.7, TUCK.knee, k);
    }
    for (const e of J.eyes) { e.stalk.rotation.x = 1.45 * (1 - d.eyes); e.stalk.scale.setScalar(Math.max(0.05, lerp(0.35, 1, d.eyes))); }
    for (const cl of J.claws) { cl.finger.rotation.x = 0.6 * d.curl; cl.shoulder.rotation.x = 0.5 * d.curl; }
    stepRock(s.rock, dt);
  }
}
