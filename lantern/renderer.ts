// @ts-check
// The Lure Lantern's renderer (ctx.render.mobModel): builds the body (model.ts) and poses it PROCEDURALLY every frame
// from how the drawn body moves and from the server's cues — no keyframed clip anywhere:
//   - it bobs (two slow sines) and tilts into its acceleration on springs; diving, it pitches nose-down along the dive;
//   - the lure swings like a pendulum on its stalk, driven by the body's acceleration (motion.ts stepPendulum), and its
//     light breathes with a gentle candle flicker (motion.ts flicker: <= 2.1 Hz, a quarter of the light at most);
//   - the tendrils trail behind the motion and undulate (chains of damped springs), the side fins row slowly and beat
//     harder when it speeds up, the tail fin steers into turns;
//   - the lights (all emissive, nothing lights the scene): the lure and its halo follow the flicker; the panes and the
//     body's halo glow while it pretends and dim once it is a maw, whose throat and eyes light up instead; the mint
//     spots and the tendrils' tips breathe slowly (motion.ts pulse); a wet glint flashes softly on the crown now and then;
//   - cues: 'reveal' / 'open' open the maw (a snappy, slightly under-damped spring; the eyes open, the panes dim),
//     'dive' opens it agape, 'bite' slams it shut and springs it open again, 'close' folds it back into a lantern;
//   - death (frame.dying, DEATH_MS): the maw falls slack, every light dies out, the body rolls over and sinks.
// LOD by distance to the camera: tendrils, fins and pendulum stop updating beyond LOD_FAR (the bob and glow go on).
import { buildLantern } from './model.ts';
import {
  biteSnap, BITE_TIME, bob, clamp, critSpring, dampedSpring, deathPose, flicker, glint, mawTarget, motion, motionFrom,
  pendulum, pulse, spring, stepPendulum, stepTendril, tendril, tiltFrom,
} from './motion.ts';
import { hash01 } from '../goblin/procedural.ts';

export const DEATH_MS = 1600;
export const LOD_FAR = 40; // blocks
const STALK_BEND = -1.05; // model.ts: the stalk tip's bend

function newState(id) {
  return {
    id, time: hash01(id * 3 + 1) * 20, phase: hash01(id * 3 + 2) * Math.PI * 2, side: hash01(id * 3 + 3) < 0.5 ? -1 : 1,
    mo: motion(), lure: pendulum(), tendrils: [0, 1, 2, 3, 4].map(() => tendril()),
    open: spring(0), mawState: 'closed', bite: -1, pitch: spring(0), roll: spring(0), fin: spring(0), tailYaw: spring(0), eyes: spring(0),
    finPhase: 0, frames: 0, cost: 0, lod: 'full', glow: 1,
  };
}

export class LanternRenderer {
  deathMs = DEATH_MS;
  _client: any = null;
  stats = { frames: 0, ms: 0 }; // read by the browser check
  /** @param {any} client ctx.client (the browser's view of the world) */
  constructor(client) {
    this._client = client;
  }

  build(kit) { return buildLantern(kit); }

  cue(m, name) {
    const s = (m.lantern ??= newState(m.id));
    if (name === 'reveal' || name === 'open') { if (s.mawState === 'closed') s.open.v += 6; if (s.mawState !== 'dive' || name === 'reveal') s.mawState = 'open'; }
    else if (name === 'dive') s.mawState = 'dive';
    else if (name === 'bite') { s.bite = 0; s.mawState = 'open'; }
    else if (name === 'close') s.mawState = 'closed';
  }

  camera() {
    try { return this._client?.player?.() ?? null; } catch { return null; }
  }

  animate(m, frame) {
    const t0 = performance.now();
    const J = m.model.joints;
    if (!J) return;
    const s = (m.lantern ??= newState(m.id));
    const dt = clamp(frame.dt, 1e-4, 0.1);
    s.time += dt; s.frames++;
    const g = m.model.group;
    const mo = motionFrom(s.mo, g.position.x, g.position.y, g.position.z, g.rotation.y, dt);
    if (frame.dying !== undefined) { this.die(s, J, frame.dying, dt); return; }
    const cam = this.camera();
    const dist = cam ? Math.hypot(cam.x - g.position.x, cam.y - g.position.y, cam.z - g.position.z) : 0;
    s.lod = dist > LOD_FAR ? 'far' : 'full';
    // the halos grow a little with distance, so from across the marsh it still reads as a lantern's glow, not a speck
    const grow = clamp(dist - 8, 0, 40) * 0.03;
    if (J.halo) J.halo.scale.set(1.1 + grow, 1.1 + grow, 1);
    if (J.bodyHalo) J.bodyHalo.scale.set(1.7 + grow * 1.5, 1.7 + grow * 1.5, 1);

    // ---- the float: bob, tilt into the acceleration, nose down along a dive; a flinch when hurt
    const b = bob(s.time, s.phase), tilt = tiltFrom(mo);
    const hurt = (m.flash ?? 0) > 0 ? 1 : 0;
    critSpring(s.pitch, tilt.pitch - 0.25 * hurt, 7, dt);
    critSpring(s.roll, tilt.roll + b.sway, 6, dt);
    J.float.position.y = 0.5 + b.y;
    J.float.rotation.x = -s.pitch.x; // nose down = rotate the front (-z) down
    J.float.rotation.z = s.roll.x;

    // ---- the maw
    if (s.bite >= 0) { s.bite += dt; if (s.bite >= BITE_TIME) s.bite = -1; }
    const want = mawTarget(s.mawState === 'closed' ? 'closed' : s.mawState);
    dampedSpring(s.open, want, 15, 0.55, dt);
    const open = Math.max(0, s.open.x) * (s.bite >= 0 ? biteSnap(s.bite) : 1);
    J.lid.rotation.x = 0.72 * open;
    J.jaw.rotation.x = -0.48 * open;
    critSpring(s.eyes, open > 0.25 ? 1 : 0, 16, dt);
    for (const e of J.eyes) e.scale.y = Math.max(0.05, s.eyes.x);

    // ---- the lights: the lure's flicker; the panes and the body's halo glow while it pretends and dim once it is a maw,
    // whose throat and eyes light up instead; the spots breathe; the glint flashes now and then
    const fl = flicker(s.time, s.phase);
    s.glow = fl;
    const o = clamp(open, 0, 1);
    setGlow(J, fl, { panes: 1 - 0.75 * o, maw: o, eyes: s.eyes.x, pulse: pulse(s.time, s.phase), pulse2: pulse(s.time, s.phase + 2.1), glint: glint(s.time, s.phase) });

    // ---- the lure: a pendulum hanging from the stalk's tip, kept hanging down in the world
    if (s.lod === 'full') stepPendulum(s.lure, mo.aForward, mo.aRight, dt);
    J.stalkBase.rotation.x = -0.12 * open; // the stalk leans back as the lid lifts
    J.lureHang.rotation.x = -(J.float.rotation.x + J.lid.rotation.x + J.stalkBase.rotation.x + STALK_BEND) + s.lure.px;
    J.lureHang.rotation.z = -J.float.rotation.z + s.lure.pz;

    if (s.lod === 'full') {
      // ---- fins: a slow rowing beat, harder with speed; the inside fin tucks in a turn
      const speed = Math.hypot(mo.vx, mo.vz);
      s.finPhase += dt * (1.1 + 0.5 * Math.min(speed, 6));
      critSpring(s.fin, clamp(mo.yawRate * 0.25, -0.5, 0.5), 8, dt);
      const beat = (0.22 + 0.05 * Math.min(speed, 6)) * Math.sin(s.finPhase * Math.PI * 2);
      for (const f of J.fins) f.fin.rotation.z = f.side * (beat + 0.1) + s.fin.x * (f.side > 0 ? 1 : -1) * 0.6;
      dampedSpring(s.tailYaw, clamp(-mo.yawRate * 0.35 - mo.aRight * 0.03, -0.7, 0.7) + 0.12 * Math.sin(s.time * 2.1 + s.phase), 9, 0.4, dt);
      J.tail.rotation.y = s.tailYaw.x;
      // ---- tendrils: trail behind the motion (the body's own frame), undulate
      for (let i = 0; i < J.tendrils.length; i++) {
        const segs = s.tendrils[i];
        stepTendril(segs, mo.vForward, mo.vRight, mo.aForward, s.time, i, dt);
        const chain = J.tendrils[i];
        for (let j = 0; j < chain.length; j++) { chain[j].rotation.x = segs[j].x.x; chain[j].rotation.z = segs[j].z.x; }
      }
    }
    const spent = performance.now() - t0;
    this.stats.frames++; this.stats.ms += spent; s.cost += spent;
  }

  // The death: slack maw, every light going out, rolling over and sinking; the tendrils go limp.
  die(s, J, t, dt) {
    const d = deathPose(t, s.side);
    J.rig.rotation.z = d.roll;
    J.rig.position.y = -d.sink;
    J.lid.rotation.x = 0.72 * d.open;
    J.jaw.rotation.x = -0.48 * d.open;
    for (const e of J.eyes) e.scale.y = Math.max(0.05, 1 - d.limp);
    setGlow(J, flicker(s.time, s.phase) * d.light, { panes: d.light * 0.5, maw: 0.3 * d.light, eyes: (1 - d.limp) * d.light, pulse: d.light * 0.5, pulse2: d.light * 0.5, glint: 0, dim: d.light });
    stepPendulum(s.lure, 0, 0, dt);
    J.lureHang.rotation.x = s.lure.px;
    for (let i = 0; i < J.tendrils.length; i++) {
      const segs = s.tendrils[i];
      stepTendril(segs, 0, 0, 0, s.time, i, dt, d.limp);
      J.tendrils[i].forEach((seg, j) => { seg.rotation.x = segs[j].x.x; seg.rotation.z = segs[j].z.x; });
    }
  }
}

// The brightness of the unlit parts (copies of the palette's colours scaled down, never brighter): the lure bulb and its
// halo follow the flicker `level`; `panes` is how much the panes and the body's halo show, `maw` how open the maw is (the
// throat lights up and the body's halo turns red-violet), `eyes` how lit the eyes are, `pulse` / `pulse2` the two groups
// of spots, `glint` the wet glint; `dim` scales everything (the death).
function setGlow(J, level, { panes = 1, maw = 0, eyes = 0, pulse = 0.5, pulse2 = 0.5, glint = 0, dim = 1 } = {}) {
  const C = J.colors;
  const k = clamp(level, 0, 1);
  J.lureMat.color.copy(C.lure).multiplyScalar(k);
  J.coreMat.color.copy(C.core).multiplyScalar(k);
  if (J.halo) { J.halo.material.opacity = 0.85 * k; J.halo.visible = k > 0.02; }
  const p = clamp(k * panes, 0, 1);
  J.paneMat.color.copy(C.pane).multiplyScalar(p);
  if (J.bodyHalo) {
    const mix = clamp(maw, 0, 1);
    J.bodyHalo.material.color.copy(C.bodyHalo).lerp(C.mawHalo, mix);
    J.bodyHalo.material.opacity = (0.3 * p + 0.22 * mix) * dim;
    J.bodyHalo.visible = J.bodyHalo.material.opacity > 0.02;
  }
  J.throatMat.color.copy(C.throat).multiplyScalar(clamp(0.15 + 0.85 * maw, 0, 1) * dim);
  J.eyeMat.color.copy(C.eye).multiplyScalar(clamp(0.2 + 0.8 * eyes, 0, 1) * dim);
  J.spotMats[0].color.copy(C.spot).multiplyScalar((0.45 + 0.55 * clamp(pulse, 0, 1)) * dim);
  J.spotMats[1].color.copy(C.spot).multiplyScalar((0.45 + 0.55 * clamp(pulse2, 0, 1)) * dim);
  J.beadMat.color.copy(C.spot).multiplyScalar((0.5 + 0.5 * clamp(pulse2, 0, 1)) * dim);
  J.tendrilTipMat.color.copy(C.tendrilTip).multiplyScalar((0.6 + 0.4 * clamp(pulse, 0, 1)) * dim);
  const gl = clamp(glint, 0, 1) * dim;
  J.glintMat.opacity = 0.8 * gl;
  J.glint.visible = gl > 0.03;
}
