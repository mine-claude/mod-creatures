// @ts-check
// The Crystal Beetle's renderer (ctx.render.mobModel): builds the body (model.ts) and poses it every frame,
// PROCEDURALLY, from what the server says (its pose: 'curl' | 'roll' | 'flipped' | 'uncurl' | none) and how it actually
// moves — no keyframed clip:
//   - walking: a six-legged tripod gait whose cadence and stride come from the measured speed, the antennae swaying;
//   - curl: the legs fold in, the head and the abdomen tuck under, the wing cases wrap down and a faceted crystal hull
//     closes around it (springs, so a curl interrupted halfway is still smooth);
//   - roll: the ball turns by the distance it really travelled along its facing (angle += distance / radius), so it never
//     slides over the ground; when the roll ends the shell eases back to upright;
//   - flipped: it turns over onto its back with a hop and rocks on its dome while the six legs paddle the air, each on
//     its own rhythm, tiring towards the end of the stun; the mandibles snap;
//   - uncurl: it rolls back onto its legs;
//   - the crystals glow (unlit materials): a slow pulse, charging while curled, a stutter while stunned, dark in death;
//   - death (deathMs): it keels over onto its back, curls its legs and goes dark.
// LOD: beyond 48 blocks from the camera the legs stop animating (the body, the roll and the glow keep going).
import { buildBeetle } from './model.ts';
import { DEATH_MS, BODY } from './tuning.ts';
import { LEG, beetleDeath, bodyFrame, clamp, critSpring, flail, forwardOf, glowLevel, poseTargets, rollBy, settleRoll, tripod } from './procedural.ts';
import { hash01, spring } from '../goblin/procedural.ts';

export const LOD_FAR = 48;

function newState(m) {
  return {
    time: hash01(m.id) * 10, phase: hash01(m.id + 3) * Math.PI * 2, gait: 0,
    curl: spring(), flip: spring(), roll: spring(), walk: spring(), lastX: null, lastZ: null,
    pose: null, poseAt: 0, frames: 0,
  };
}

export class BeetleRenderer {
  deathMs = DEATH_MS;
  _client: any = null;
  stats = { frames: 0, ms: 0, maxRoll: 0 }; // read by the browser check
  /** @param {any} client ctx.client (the browser's view of the world) */
  constructor(client) {
    this._client = client;
  }

  build(kit) { return buildBeetle(kit); }

  #camDist(pos) {
    try { const me = this._client?.player?.(); return me ? Math.hypot(me.x - pos.x, me.y - pos.y, me.z - pos.z) : 0; } catch { return 0; }
  }

  animate(m, frame) {
    const t0 = performance.now();
    const model = m.model, J = model.joints;
    if (!J) return;
    const s = (m.beetle ??= newState(m));
    const dt = clamp(frame.dt, 1e-4, 0.1);
    s.time += dt; s.frames++;
    if (frame.dying !== undefined) { this.die(model, s, J, frame.dying, dt); return; }

    const g = model.group, pos = g.position, yaw = g.rotation.y;
    // the distance it really moved since the last frame, along its facing (the roll) and in all (the gait)
    const dx = s.lastX === null ? 0 : pos.x - s.lastX, dz = s.lastZ === null ? 0 : pos.z - s.lastZ;
    s.lastX = pos.x; s.lastZ = pos.z;
    const moved = Math.hypot(dx, dz) < 2 ? 1 : 0; // a teleport is not a roll
    const speed = moved * Math.hypot(dx, dz) / dt;
    if (m.pose !== s.pose) { s.pose = m.pose ?? null; s.poseAt = s.time; }
    const want = poseTargets(s.pose);
    const stunT = s.time - s.poseAt;

    critSpring(s.curl, want.curl, want.curl > s.curl.x ? 11 : 7, dt);
    critSpring(s.flip, want.flip, want.flip > s.flip.x ? 9 : 6, dt);
    const c = clamp(s.curl.x, 0, 1), f = clamp(s.flip.x, 0, 1);
    if (want.rolling || c > 0.6) {
      s.roll.x = rollBy(s.roll.x, moved * forwardOf(dx, dz, yaw), BODY.ballR * Math.max(0.6, c)); // a half-open ball rolls tighter
      s.roll.v = 0;
    } else settleRoll(s.roll, 9, dt);
    this.stats.maxRoll = Math.max(this.stats.maxRoll, Math.abs(s.roll.x));

    // ---- the body: height and roll about its length (flip), the ball's roll about x
    const bf = bodyFrame(c, f, s.time, want.flip ? stunT : 0);
    J.rig.position.y = bf.y;
    J.rig.rotation.z = bf.roll;
    J.roller.rotation.x = -s.roll.x;
    const breathe = Math.sin(s.time * 2.1 + s.phase) * 0.012;
    J.body.position.y = breathe * (1 - c);

    // ---- curl: tuck the head and the abdomen, wrap the wing cases, close the hull
    J.head.rotation.x = -1.05 * c + (1 - c) * Math.sin(s.time * 0.9 + s.phase) * 0.05;
    J.pronotum.rotation.x = -0.35 * c;
    J.abdomen.rotation.x = 1.1 * c;
    for (const e of J.elytra) e.j.rotation.z = -e.side * (0.95 * c - 0.12 * f * Math.max(0, Math.sin(s.time * 9))); // stunned: they rattle open
    const hs = c < 0.02 ? 1e-3 : 0.35 + 0.65 * c;
    J.hull.scale.setScalar(hs);
    J.hull.visible = c >= 0.02;
    this.tuck(J, c);

    // ---- head bits: mandibles and antennae
    const snap = f > 0.5 ? Math.max(0, Math.sin(s.time * 14)) * 0.5 : 0.08 + 0.06 * Math.sin(s.time * 3 + s.phase);
    for (const md of J.mandibles) md.j.rotation.y = md.side * (snap * (1 - c) - 0.25 * c);
    critSpring(s.walk, Math.min(1, speed / 1.5), 8, dt);
    for (const a of J.antennae) {
      const sway = Math.sin(s.time * 2.6 + s.phase + a.side) * 0.18 + s.walk.x * 0.25 + (f > 0.5 ? Math.sin(s.time * 19 + a.side) * 0.35 : 0);
      a.base.rotation.set(0.55 * (1 - c) - 0.9 * c + 0.12 * s.walk.x, a.side * (0.35 + sway * 0.4), 0);
      a.tip.rotation.set(-0.35 + sway * 0.5 - 0.6 * c, 0, 0);
      a.base.scale.setScalar(1 - 0.75 * c);
    }

    // ---- legs: gait standing up, folded in when curled, paddling the air on its back
    const near = this.#camDist(pos) <= LOD_FAR;
    const k = near ? clamp(speed / 1.2, 0, 1) * (1 - c) * (1 - f) : 0;
    s.gait += dt * (7 + 6 * k) * (k > 0.04 ? 1 : 0);
    J.legs.forEach((leg, i) => {
      const sd = leg.side;
      let swing = 0, lift = 0, kneeBend = 0;
      if (near) {
        const w = tripod(s.gait, i, k);
        const fl = f > 0.3 ? flail(s.time, i, stunT) : null;
        swing = w.swing * (1 - f) + (fl ? fl.swing * f : 0);
        lift = w.lift * (1 - f) + (fl ? fl.lift * f : 0);
        kneeBend = w.knee * (1 - f) + (fl ? fl.knee * f : 0);
      }
      // folded: the femur down along the side, the tibia doubled under it
      leg.hip.rotation.y = sd * (leg.splay * (1 - 0.7 * c) + swing);
      leg.hip.rotation.z = sd * (LEG.up * (1 - c) - 0.35 * c + lift);
      leg.knee.rotation.z = -sd * ((LEG.up + LEG.down) * (1 - c) + 2.5 * c + kneeBend);
      leg.hip.scale.setScalar(1 - 0.8 * c); // drawn in under the hull
    });

    // ---- the glow
    this.glow(model, glowLevel(s.time, { curl: c, flip: f, phase: s.phase }));
    const spent = performance.now() - t0;
    this.stats.frames++;
    this.stats.ms += spent;
  }

  // Curled (c 0..1): the crystals of the open body sink into the shell (the hull's own spikes take over) and the head and
  // the abdomen draw in, so the ball reads as one closed armoured sphere.
  tuck(J, c) {
    const k = Math.max(1e-3, 1 - 0.9 * c);
    for (const st of J.studs ?? []) st.scale.setScalar(k);
    J.head.userData.z ??= J.head.position.z;
    J.head.position.z = J.head.userData.z + 0.2 * c;
    J.head.scale.setScalar(1 - 0.35 * c);
    J.abdomen.userData.z ??= J.abdomen.position.z;
    J.abdomen.position.z = J.abdomen.userData.z - 0.12 * c;
    J.abdomen.scale.setScalar(1 - 0.3 * c);
    J.torso.scale.setScalar(1 - 0.3 * c);
    J.pronotum.scale.setScalar(1 - 0.35 * c);
    for (const e of J.elytra) e.j.scale.setScalar(1 - 0.35 * c);
  }

  glow(model, level) {
    for (const list of [model.glows, model.trims]) {
      for (const { mat, base } of list ?? []) {
        mat.color.setHex(base);
        mat.color.multiplyScalar(0.25 + 0.75 * level);
      }
    }
  }

  // The death: over onto its back, legs curled in, the light going out.
  die(model, s, J, t, dt) {
    const d = beetleDeath(t);
    const c = clamp(s.curl.x, 0, 1) * (1 - d.flip);
    s.curl.x = c;
    const bf = bodyFrame(c, Math.max(d.flip, clamp(s.flip.x, 0, 1)), 0, 0);
    J.rig.position.y = bf.y + d.settle;
    J.rig.rotation.z = Math.PI * Math.max(d.flip, clamp(s.flip.x, 0, 1));
    settleRoll(s.roll, 9, dt);
    J.roller.rotation.x = -s.roll.x;
    J.hull.scale.setScalar(Math.max(1e-3, c));
    J.hull.visible = c > 0.02;
    this.tuck(J, c);
    for (const leg of J.legs) {
      leg.hip.rotation.y = leg.side * leg.splay * (1 - 0.6 * d.legCurl);
      leg.hip.rotation.z = leg.side * (LEG.up + 0.5 * d.legCurl);
      leg.knee.rotation.z = -leg.side * (LEG.up + LEG.down + 1.2 * d.legCurl);
      leg.hip.scale.setScalar(1 - 0.8 * c);
    }
    for (const md of J.mandibles) md.j.rotation.y = md.side * 0.3 * d.legCurl;
    for (const a of J.antennae) { a.base.rotation.set(-0.3 * d.legCurl, a.side * 0.5, 0); a.tip.rotation.set(-0.8 * d.legCurl, 0, 0); }
    this.glow(model, glowLevel(s.time, { dying: t, phase: s.phase }));
  }
}

