// @ts-check
// The Canopy Sentinel's renderer (ctx.render.mobModel): builds the body (model.ts) and poses it PROCEDURALLY every frame
// — no keyframed clip anywhere:
//   - the goblin's locomotion solver (goblin/locomotion.ts, on SENTINEL_RIG's longer legs) plants the feet on the
//     client's real block world, the legs reach them with its 2-bone IK; backpedalling and strafing while aiming step
//     the same way (the solver works from the actual velocity, whatever the body faces);
//   - THE SHOT: the server cues 'nock' (reload: the hand to the quiver, an arrow out, onto the string), 'draw_XX' (a
//     progressive draw of XX tenths of a second), 'release' and 'whistle'. While engaged the body turns side-on, the
//     head turns back to the target, the bow arm is solved (solveArm) to hold the bow on the AIM LINE (the ballistic
//     launch pitch for the draw's arrow speed), the bow's limbs bend by bowShape(draw) (the string keeps its length),
//     the two string halves follow the nock point, and the draw arm is solved so the HAND IS ON THE STRING, pulled to
//     the cheek; the release snaps the string through on a ringing spring, kicks the bow and follows through;
//   - the cloak (3 x 4 chained segments) and the feathered mantle hang on springs driven by the body's motion;
//   - the head looks at the target (clamped), breathing, a hurt flinch; the death is a kneel and a fall forward with
//     the bow slipping from the hand (frame.dying, DEATH_MS).
// LOD by distance to the camera (the goblin's): full (<= 24), simple (no ground queries, <= 64), beyond: legs only.
import { buildSentinel, SENTINEL_RIG, ARM, NECK_Y, CLOAK, LEDGE_DROP } from './model.ts';
import { createLocomotion, lodFor, solveLeg, stepLocomotion, toLocal } from '../goblin/locomotion.ts';
import { breathe, clamp, critSpring, dampedSpring, hash01, leanFrom, lerp, lookAngles, spring } from '../goblin/procedural.ts';
import {
  BOW, STRING, bowShape, cloakDrive, holdTremble, parseDrawCue, releasePose, reloadPose, RELEASE_TIME, RELOAD_TIME,
  sentinelDeathPose, solveArm, whistlePose, WHISTLE_TIME,
} from './archery.ts';
import { drawCurve, drawSpeed, launchPitch } from './tactics.ts';

export const DEATH_MS = 1700;
export const AIM_RANGE = 28; // a player this close, with a recent shot cue, holds its aim
const ENGAGED_FOR = 6; // s after the last shot cue that it stays in its archer's stance
const ARROW_G = 20; // the arrow's gravity (ARROW_GRAVITY x the sentinel arrow's 1.0)
const TWIST_PELVIS = -0.5, TWIST_TORSO = -0.62; // the side-on stance (rad, left shoulder toward the target)
const ANCHOR = { x: 0.05, y: NECK_Y + 0.13, z: -0.1 }; // the cheek anchor, in the torso's frame
const QUIVER_MOUTH = { x: 0.2, y: 0.62, z: 0.2 }; // the quiver's mouth over the right shoulder (torso frame)

function newState(id) {
  return {
    id, time: hash01(id) * 10, phase: hash01(id + 1) * Math.PI * 2, frames: 0, cost: 0,
    loco: createLocomotion(SENTINEL_RIG), lod: 'none',
    action: null, draw: 0, nocked: true, smoke: false, holdT: 0, drawDur: 1.2, engagedT: 99,
    aimW: spring(), crouch: spring(), leanP: spring(), leanR: spring(), headYaw: spring(), headPitch: spring(),
    vib: spring(), kick: spring(), whistle: 0,
    cloakBack: Array.from({ length: CLOAK.rows }, () => spring(0.06)), cloakSide: Array.from({ length: CLOAK.rows }, () => spring()),
    featherLift: spring(), tassetF: spring(), tassetB: spring(), peak: spring(), hookW: spring(),
    lastSteps: 0, shape: null,
  };
}

export class SentinelRenderer {
  deathMs = DEATH_MS;
  /** @param {any} client ctx.client */
  constructor(client) {
    this._client = client;
    this._envAt = -1;
    this._env = { cam: null, targets: [] };
    this._v = null; // scratch vectors (made with the kit's THREE on the first build)
    this.stats = { frames: 0, queries: 0, ms: 0 };
  }

  build(kit) {
    if (!this._v) {
      const T = kit.THREE, V = () => new T.Vector3();
      this._v = {
        T, a: V(), b: V(), c: V(), d: V(), e: V(), f: V(), g: V(), h: V(), rw: V(), up: new T.Vector3(0, 1, 0), down: new T.Vector3(0, -1, 0),
        q: new T.Quaternion(), q2: new T.Quaternion(), q3: new T.Quaternion(), m: new T.Matrix4(),
        // the palms' own scratch (the bow's axes, the forearm's direction), untouched by the arms' solve above them
        bx: V(), by: V(), bz: V(), p1: V(), p2: V(), p3: V(), qb: new T.Quaternion(), qp: new T.Quaternion(), qw: new T.Quaternion(),
      };
    }
    return buildSentinel(kit);
  }

  // the server's cues (e.mob.cue)
  cue(m, name) {
    const s = (m.sen ??= newState(m.id));
    if (name === 'nock') { s.action = { name: 'reload', t: 0 }; s.nocked = false; s.draw = 0; s.engagedT = 0; return; }
    const d = parseDrawCue(name);
    if (d) { s.action = { name: 'draw', t: 0, dur: d.dur }; s.drawDur = d.dur; s.smoke = d.smoke; s.nocked = true; s.holdT = 0; s.engagedT = 0; return; }
    if (name === 'release') { s.action = { name: 'release', t: 0 }; s.nocked = false; s.draw = 0; s.vib.v -= 7; s.kick.v += 6; s.engagedT = 0; return; }
    if (name === 'whistle') { s.whistleT = 0; }
  }

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
    if (!J || !this._v) return;
    const s = (m.sen ??= newState(m.id));
    const dt = clamp(frame.dt, 1e-4, 0.1);
    s.time += dt; s.frames++; s.engagedT += dt;
    if (frame.dying !== undefined) { this.die(m, s, J, frame.dying); return; }

    const g = m.model.group, pos = g.position, yaw = g.rotation.y, scale = g.scale.x || 1;
    const env = this.env(frame.now);
    const dist = env.cam ? Math.hypot(env.cam.x - pos.x, env.cam.y - pos.y, env.cam.z - pos.z) : 0;
    const lod = lodFor(dist);
    s.lod = lod;
    const st = stepLocomotion(s.loco, { x: pos.x, y: pos.y, z: pos.z, yaw, dt, lod, ground: (x, y, z) => this.ground(x, y, z) });
    this.stats.queries += st.queries;
    const R = SENTINEL_RIG;
    if (lod === 'none' && s.frames > 2) { this.legs(J, st, pos, yaw, scale, R.hipHeight); this.stats.frames++; return; }

    // ---- the action timeline
    this.advance(s, dt);
    const tremble = s.action?.name === 'hold' ? holdTremble(s.time, s.holdT) : { x: 0, y: 0 };
    dampedSpring(s.vib, 0, 70, 0.1, dt); // the string rings down after the release
    dampedSpring(s.kick, 0, 18, 0.35, dt);

    // ---- the target: the nearest player in range
    let target = null, best = AIM_RANGE;
    for (const p of env.targets) {
      const d = Math.hypot(p.x - pos.x, p.y - pos.y, p.z - pos.z);
      if (d < best && d > 0.5) { best = d; target = p; }
    }
    const engaged = !!target && (s.engagedT < ENGAGED_FOR || s.action !== null);
    critSpring(s.aimW, engaged ? 1 : 0, 6, dt);
    const aimW = s.aimW.x;

    // ---- body: hips on the feet, lean, breathing, the stance's twist, a flinch when hurt
    critSpring(s.crouch, (m.flash ?? 0) > 0 ? 1 : 0, 20, dt);
    const lean = leanFrom(st.aForward, st.aRight);
    critSpring(s.leanP, lean.pitch * 0.7, 9, dt);
    critSpring(s.leanR, lean.roll * 0.7, 9, dt);
    const br = breathe(s.time, s.phase);
    const swingLift = st.feet.reduce((a, f) => a + (f.planted ? 0 : Math.sin(Math.PI * Math.min(1, f.t))), 0);
    let hipY = R.hipHeight + st.body.x - 0.12 * s.crouch.x - 0.06 * aimW + br.bob + 0.022 * swingLift;
    // both legs must reach their feet, and neither folds up under the body (a foot a step above the other)
    const footRel = st.feet.map((f) => (this.footY(f, st, pos) - pos.y) / scale);
    hipY = Math.max(Math.min(hipY, Math.min(...footRel) + R.thigh + R.shin + R.ankle - 0.01), Math.max(...footRel) + 0.55);
    J.pelvis.position.y = hipY;
    J.pelvis.rotation.set(st.pitch.x * 0.5, TWIST_PELVIS * aimW, s.leanR.x);
    J.torso.rotation.set(-0.06 - s.leanP.x - 0.3 * s.crouch.x + 0.05 * aimW, TWIST_TORSO * aimW, 0);
    J.chest.scale.set(1 + (br.chest - 1) * 0.4, br.chest, 1 + (br.chest - 1) * 0.6);
    this.legs(J, st, pos, yaw, scale, hipY);

    // ---- head: toward the target, turned back against the stance's twist; a cant along the arrow when aiming
    const eye = { x: pos.x, y: pos.y + 1.65 * scale, z: pos.z };
    const la = target ? lookAngles(eye, { x: target.x, y: target.y + 1.5, z: target.z }, yaw, { maxYaw: 1.3, maxPitch: 0.8, giveUp: 2.4 }) : { yaw: 0, pitch: 0, looking: false };
    const twist = (TWIST_PELVIS + TWIST_TORSO) * aimW;
    critSpring(s.headYaw, clamp(la.yaw - twist, -1.7, 1.7), 10, dt);
    critSpring(s.headPitch, la.pitch * 0.8 - 0.3 * s.crouch.x, 10, dt);
    J.neck.rotation.y = s.headYaw.x * 0.4;
    J.head.rotation.set(-J.torso.rotation.x + s.headPitch.x, s.headYaw.x * 0.6, -0.14 * aimW);

    // ---- arms and bow (IK in world space, written as quaternions in the parents' frames)
    g.updateMatrixWorld(true);
    this.archery(m, s, J, target, aimW, tremble, st, dt);

    // ---- cloak, mantle, tassets, hood peak: springs behind the body's motion
    const drive0 = cloakDrive(st.vForward, st.aForward, st.vRight, 0);
    for (let r = 0; r < CLOAK.rows; r++) {
      const dr = cloakDrive(st.vForward, st.aForward, st.vRight, r);
      dampedSpring(s.cloakBack[r], 0.05 + 0.03 * r + dr.back + 0.04 * swingLift * (r + 1) / CLOAK.rows, 10 - 1.5 * r, 0.32, dt);
      dampedSpring(s.cloakSide[r], dr.side, 9 - r, 0.35, dt);
    }
    for (let c = 0; c < CLOAK.cols; c++) {
      const col = J.cloak[c];
      for (let r = 0; r < CLOAK.rows; r++) {
        const prev = r ? s.cloakBack[r - 1].x : 0;
        const ripple = 0.03 * Math.sin(s.time * 3.1 + c * 1.3 + r * 0.9) * (0.3 + Math.min(1, st.speed / 3));
        col[r].rotation.x = s.cloakBack[r].x - prev + ripple;
        col[r].rotation.z = (s.cloakSide[r].x - (r ? s.cloakSide[r - 1].x : 0)) + (c - 1) * 0.02 * r;
      }
    }
    dampedSpring(s.featherLift, clamp(0.06 * st.vForward - 0.03 * st.aForward, -0.3, 0.5), 14, 0.3, dt);
    const flutter = Math.min(1, st.speed / 3);
    for (const f of J.feathers) { // the lift splays them away from the body (negative = outward, see model.ts)
      f.flap.rotation.x = f.rest - s.featherLift.x * (0.6 + 0.3 * f.row) + 0.05 * flutter * Math.sin(s.time * 15 + f.phase) + 0.015 * Math.sin(s.time * 1.7 + f.phase);
    }
    dampedSpring(s.tassetF, clamp(-0.1 * st.vForward, -0.6, 0.4) + 0.25 * Math.max(0, ...this._fwd), 14, 0.35, dt);
    dampedSpring(s.tassetB, clamp(0.1 * st.vForward, -0.3, 0.7), 12, 0.35, dt);
    J.tassetF.rotation.x = s.tassetF.x;
    J.tassetB.rotation.x = s.tassetB.x;
    dampedSpring(s.peak, clamp(0.12 * st.vForward + 0.4 * s.headPitch.x, -0.4, 0.7), 11, 0.3, dt);
    J.peakTip.rotation.x = s.peak.x;
    for (const gl of J.glow) gl.scale.y = s.action?.name === 'hold' || s.action?.name === 'draw' ? 0.5 : 1; // it narrows its eyes on the anchor

    const spent = performance.now() - t0;
    this.stats.frames++; this.stats.ms += spent; s.cost += spent;
  }

  // The action's clock: reload -> (draw -> hold) -> release -> idle; the whistle on top.
  advance(s, dt) {
    const a = s.action;
    if (s.whistleT !== undefined) { s.whistleT += dt; s.whistle = whistlePose(s.whistleT); if (s.whistleT >= WHISTLE_TIME) { s.whistleT = undefined; s.whistle = 0; } }
    if (!a) return;
    a.t += dt;
    if (a.name === 'reload') { if (a.t >= RELOAD_TIME) { s.action = null; s.nocked = true; } return; }
    if (a.name === 'draw') { s.draw = drawCurve(a.t, a.dur); if (a.t >= a.dur) { s.action = { name: 'hold', t: 0 }; s.draw = 1; } return; }
    if (a.name === 'hold') { s.draw = 1; s.holdT += dt; if (a.t > 6) s.action = null; return; }
    if (a.name === 'release') { s.draw = 0; if (a.t >= RELEASE_TIME) s.action = null; }
  }

  archery(m, s, J, target, aimW, tremble, st, dt) {
    const V = this._v, T = V.T;
    const torso = J.torso, [armL, armR] = J.arms;
    const g = m.model.group;
    // the aim: from the cheek anchor toward the target's chest, raised to the arrow's launch pitch
    const anchor = torso.localToWorld(V.a.set(ANCHOR.x, ANCHOR.y, ANCHOR.z));
    const aim = V.b;
    const fwdW = V.h.set(-Math.sin(g.rotation.y), 0, -Math.cos(g.rotation.y));
    if (target) {
      const dx = target.x - anchor.x, dy = target.y + 1.2 - anchor.y, dz = target.z - anchor.z, h = Math.hypot(dx, dz);
      const pitch = launchPitch(h, dy, drawSpeed(s.drawDur), ARROW_G) ?? Math.atan2(dy, h);
      const cp = Math.cos(pitch);
      if (h > 1e-3) aim.set((dx / h) * cp, Math.sin(pitch), (dz / h) * cp); else aim.copy(fwdW);
    } else aim.copy(fwdW);
    // the grip: the bow at arm's length on the aim line, string at the anchor at full draw (+ the hold's tremble, the release's kick)
    const reach = STRING.brace + BOW.drawLength + 0.03;
    const gripAim = V.c.copy(anchor).addScaledVector(aim, reach);
    gripAim.y += tremble.y + 0.12 * s.kick.x; gripAim.x += tremble.x;
    const gripRel = torso.localToWorld(V.d.set(-0.33, 0.08, -0.14));
    const grip = gripRel.lerp(gripAim, aimW);
    // bow arm (left): elbow down and a little out
    const SL = armL.shoulder.getWorldPosition(V.e);
    const poleL = V.f.copy(SL).addScaledVector(V.down, 1).addScaledVector(fwdW, -0.2 * (1 - aimW));
    const left = this.ik(armL, SL, grip, poleL, torso);

    // the bow: grip in the fist (a little down the hand from the wrist), aimed (or carried low when relaxed)
    const wristL = armL.wrist.getWorldPosition(V.g);
    const handDir = V.e.copy(left.hand).sub(left.elbow).normalize();
    const gripPoint = wristL.addScaledVector(handDir, 0.045);
    const qAim = this.basis(aim, V.up, 0.12, V.q);
    const rightW = V.rw.set(Math.cos(g.rotation.y), 0, -Math.sin(g.rotation.y));
    const carryUp = V.d.copy(fwdW).multiplyScalar(0.75).addScaledVector(V.up, 0.65).normalize();
    const qRel = this.basisZ(rightW, carryUp, V.q2);
    qRel.slerp(qAim, aimW);
    g.getWorldQuaternion(V.q3).invert();
    J.bow.quaternion.copy(V.q3).multiply(qRel);
    J.bow.position.copy(g.worldToLocal(gripPoint.clone()));
    // the limbs bend with the draw; the string halves meet at the nock point (which rings after the release)
    const shape = bowShape(s.draw);
    s.shape = shape;
    for (const limb of J.limbs) limb.segs.forEach((seg, i) => { seg.rotation.x = BOW.rest[i] + shape.D * BOW.give[i]; });
    const nockZ = shape.nock + s.vib.x * 0.06;
    this.string(J.stringTop, shape.tip.y, shape.tip.z, nockZ);
    this.string(J.stringBot, -shape.tip.y, shape.tip.z, nockZ);
    J.nocked.position.set(-0.012, 0, nockZ);
    J.nockServing.position.set(0, 0, nockZ);
    J.nocked.visible = s.nocked;
    J.nockedBody.setSmoke(s.smoke);
    J.bow.updateMatrixWorld(true);
    const nockW = J.bow.localToWorld(V.c.set(0, -0.025, nockZ));

    // the draw arm (right): on the string while nocked; to the quiver and back while reloading; follow-through after
    let hand = V.d.copy(nockW);
    const a = s.action;
    if (a?.name === 'reload') {
      const rp = reloadPose(a.t);
      const mouth = torso.localToWorld(V.g.set(QUIVER_MOUTH.x, QUIVER_MOUTH.y + 0.18 * rp.pull, QUIVER_MOUTH.z));
      hand.lerp(mouth, rp.toQuiver);
      J.handArrow.visible = rp.inHand && !rp.nocked;
    } else J.handArrow.visible = false;
    if (a?.name === 'release') {
      const rp = releasePose(a.t);
      const back = V.g.copy(anchor).addScaledVector(aim, -0.22).addScaledVector(V.up, -0.25 * rp.drop);
      hand = V.d.copy(anchor).lerp(back, rp.follow);
    } else if (!s.nocked && a?.name !== 'reload') hand.copy(anchor).addScaledVector(aim, -0.15);
    // relaxed: the right hand hangs by the side, swinging with the gait
    const swing = clamp(-(this._fwd?.[0] ?? 0) * 1.6, -0.5, 0.5);
    const relaxed = torso.localToWorld(V.g.set(0.31, 0.02, -0.05 + swing * 0.3));
    hand.lerp(relaxed, 1 - aimW);
    if (s.whistle > 0) hand.lerp(J.mask.localToWorld(V.g.set(0.0, -0.09, -0.06)), s.whistle);
    const SR = armR.shoulder.getWorldPosition(V.e);
    const poleR = V.f.copy(SR).addScaledVector(aim, -1).addScaledVector(V.up, 0.35 * aimW - 0.6 * (1 - aimW)).addScaledVector(rightW, 0.3);
    this.ik(armR, SR, hand, poleR, torso);

    // the palms, from the bow's frame (visual only: the wrists, the IK's targets, do not move):
    //   - the bow hand's fist is built around the riser: its x along the riser (the bow's y), its -y down the forearm,
    //     so the fingers (which curl toward -z) wrap the grip and the thumb runs up the riser's face;
    //   - the draw hand stays in line with the forearm (its -y along the aim), the fingers hooking toward the face (the
    //     bow's +x) around the string at the wrist; relaxed, reloading or whistling it follows the forearm instead.
    const bowQ = J.bow.getWorldQuaternion(V.qb);
    const bowX = V.bx.set(1, 0, 0).applyQuaternion(bowQ), bowY = V.by.set(0, 1, 0).applyQuaternion(bowQ), bowZ = V.bz.set(0, 0, 1).applyQuaternion(bowQ);
    const foreL = V.p1.copy(armL.wrist.getWorldPosition(V.p2)).sub(armL.elbow.getWorldPosition(V.p3)).normalize();
    const downL = V.p2.copy(foreL).negate();
    downL.addScaledVector(bowY, -bowY.dot(downL)).normalize(); // up the forearm, made square to the riser
    this.palm(armL, bowY, downL, V.p3.crossVectors(bowY, downL).normalize(), 1);
    const hooking = s.nocked && a?.name !== 'reload' && s.whistle <= 0 ? aimW : 0;
    critSpring(s.hookW, hooking, 10, dt);
    this.palm(armR, V.p1.copy(bowY).negate(), bowZ, V.p2.copy(bowX).negate(), s.hookW.x);

    // the fingers: the bow hand grips; the draw hand hooks the string (three fingers) or holds the arrow
    for (const f of armL.fingers) { f.f1.rotation.x = 1.5; f.f2.rotation.x = 1.45; }
    armL.thumb[0].rotation.set(0.3, 0, 1.25); armL.thumb[1].rotation.x = 0.5; // up the riser, curled over its face
    const hook = s.nocked ? 1 : a?.name === 'reload' ? 0.8 : 0.35;
    armR.fingers.forEach((f, i) => { const k = i === 3 ? 0.6 : 1; f.f1.rotation.x = 1.5 * hook * k; f.f2.rotation.x = 1.4 * hook * k; });
    armR.thumb[0].rotation.set(1.0 * hook, 0, -0.3); armR.thumb[1].rotation.x = 0.4 * hook; // tucked along the top of the hand
  }

  // Turns a palm so its world axes are (x, y, z) (orthonormal, right-handed), blended by `w` toward the forearm's frame.
  palm(arm, x, y, z, w) {
    const V = this._v;
    V.m.makeBasis(x, y, z);
    const qW = V.qp.setFromRotationMatrix(V.m);
    const qLocal = arm.wrist.getWorldQuaternion(V.qw).invert().multiply(qW);
    arm.palm.quaternion.set(0, 0, 0, 1).slerp(qLocal, clamp(w, 0, 1));
  }

  // Solves an arm (world points) and writes the shoulder and elbow quaternions in their parents' frames.
  ik(arm, S, target, pole, torso) {
    const V = this._v;
    const r = solveArm({ x: S.x, y: S.y, z: S.z }, { x: target.x, y: target.y, z: target.z }, { x: pole.x, y: pole.y, z: pole.z }, ARM.upper, ARM.fore);
    // shoulder: its bone (-y) toward the elbow, in the torso's frame
    const e = torso.worldToLocal(new V.T.Vector3(r.elbow.x, r.elbow.y, r.elbow.z)).sub(arm.shoulder.position).normalize();
    arm.shoulder.quaternion.setFromUnitVectors(V.down, e);
    arm.shoulder.updateMatrixWorld(true);
    const h = arm.shoulder.worldToLocal(new V.T.Vector3(r.hand.x, r.hand.y, r.hand.z)).sub(arm.elbow.position).normalize();
    arm.elbow.quaternion.setFromUnitVectors(V.down, h);
    arm.elbow.updateMatrixWorld(true);
    return r;
  }

  // A world rotation whose -z is `fwd` and whose +y is `up` made square to it, then turned `cant` about -z.
  basis(fwd, up, cant, out) {
    const V = this._v, T = V.T;
    const z = new T.Vector3().copy(fwd).negate().normalize();
    const y = new T.Vector3().copy(up).addScaledVector(z, -up.dot(z)).normalize();
    const x = new T.Vector3().crossVectors(y, z).normalize();
    y.crossVectors(z, x);
    V.m.makeBasis(x, y, z);
    out.setFromRotationMatrix(V.m);
    if (cant) out.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), cant));
    return out;
  }

  // A world rotation whose +z is `zDir` (the string side) and whose +y is `up` made square to it.
  basisZ(zDir, up, out) {
    const V = this._v, T = V.T;
    const z = new T.Vector3().copy(zDir).normalize();
    const y = new T.Vector3().copy(up).addScaledVector(z, -up.dot(z)).normalize();
    const x = new T.Vector3().crossVectors(y, z).normalize();
    V.m.makeBasis(x, y, z);
    return out.setFromRotationMatrix(V.m);
  }

  // One string half from the nock point (0, 0, nockZ) to a tip (0, ty, tz): a unit box along +y, turned and stretched.
  string(obj, ty, tz, nockZ) {
    const V = this._v;
    const dy = ty, dz = tz - nockZ, L = Math.hypot(dy, dz) || 1e-3;
    obj.position.set(0, 0, nockZ);
    obj.quaternion.setFromUnitVectors(V.up, V.a.set(0, dy / L, dz / L));
    obj.scale.set(1, L, 1);
  }

  // Where a foot is DRAWN: the solver's, except a planted foot of a body standing still at a ledge (LEDGE_DROP).
  footY(f, st, pos) {
    return f.planted && st.speed < 0.3 ? Math.max(f.y, pos.y - LEDGE_DROP) : f.y;
  }

  // The legs' IK to the solver's feet (the goblin's way). Keeps each foot's forward offset (for the arm swing).
  legs(J, st, pos, yaw, scale, hipY) {
    const R = SENTINEL_RIG;
    const fwd = (this._fwd ??= [0, 0]);
    for (let i = 0; i < 2; i++) {
      const leg = J.legs[i], foot = st.feet[i];
      const ankle = toLocal({ x: foot.x, y: this.footY(foot, st, pos) + R.ankle * scale, z: foot.z }, pos, yaw, scale);
      const hip = { x: leg.side * R.hipWidth, y: hipY, z: 0 };
      leg.hip.position.y = hipY;
      const sol = solveLeg(hip, ankle, R.thigh, R.shin);
      leg.hip.rotation.set(sol.thighX, 0, sol.thighZ);
      leg.knee.rotation.x = -sol.knee;
      const toe = foot.planted ? 0 : 0.3 * Math.sin(Math.PI * Math.min(1, foot.t));
      leg.ankle.rotation.set(-(sol.thighX - sol.knee) + toe, 0, -sol.thighZ);
      fwd[i] = -ankle.z;
    }
    return fwd;
  }

  // The fall: onto the knees, then forward; the bow slips down to the ground.
  die(m, s, J, t) {
    const d = sentinelDeathPose(t);
    const R = SENTINEL_RIG;
    J.rig.rotation.x = -d.pitch;
    J.rig.position.y = 0.1 * d.kneel;
    J.rig.position.z = -0.25 * d.kneel;
    const drop = 0.45 * d.kneel;
    J.pelvis.position.y = R.hipHeight - drop;
    for (const leg of J.legs) {
      leg.hip.position.y = R.hipHeight - drop;
      leg.hip.rotation.set(0.25 * d.kneel, 0, 0);
      leg.knee.rotation.x = -1.7 * d.kneel;
      leg.ankle.rotation.set(1.2 * d.kneel, 0, 0);
    }
    J.torso.rotation.set(-0.3 * d.kneel, 0, 0);
    J.head.rotation.set(0.4 * d.kneel, 0, 0.2 * d.kneel);
    for (const a of J.arms) { a.shoulder.quaternion.setFromAxisAngle(this._v.up.clone().set(1, 0, 0), -0.4 - 0.9 * d.fall); a.elbow.quaternion.setFromAxisAngle(this._v.up.clone().set(1, 0, 0), -0.3); }
    J.bow.position.y = lerp(J.bow.position.y, 0.05, d.bowDrop);
    J.bow.rotation.set(0, 0, Math.PI / 2 * d.bowDrop);
    J.nocked.visible = false; J.handArrow.visible = false;
    for (const gl of J.glow) gl.visible = t < 0.6;
  }
}
