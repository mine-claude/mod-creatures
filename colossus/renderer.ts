// @ts-check
// The Ruin Colossus's renderer (ctx.render.mobModel): builds the body (model.ts) and poses it PROCEDURALLY every frame
// from what the server says (its pose `<state>_<tier>`, tuning.ts) and how it actually moves — no keyframed clip:
//   - WEIGHT: the goblin's locomotion solver (goblin/locomotion.ts) on COLOSSUS_RIG's long legs and slow cadence plants
//     the feet on the client's real block world (ctx.client.groundBelow) and the legs reach them with its 2-bone IK; the
//     pelvis carries the mass over the planted foot, the hip drops on the swinging side, the torso counter-rotates, and
//     every footfall is an IMPACT: the body sinks into it on a spring, the arms (heavy pendulums) jolt, dust bursts from
//     under the foot, a grinding step sounds and nearby cameras SHAKE (shake.ts, by distance);
//   - idle: slow breathing, the runes pulsing with it; the vines and ferns sway on springs;
//   - dormant: a kneeling statue, the runes nearly dark; the WAKE rises from the kneel (eye first, the fists push, a
//     heave, a shudder that sheds dust, standing); after a long quiet it SETTLES back down;
//   - the SLAM: fists raised over the head (the telegraph, the runes flaring), the swing down, the impact (a dust ring,
//     a big shake), the fists hauled out of the ground; the THROW: a rock torn from its back, raised, hurled;
//   - DEBRIS: as the health tier rises, the plates of that tier come off as tumbling stone (debris.ts) and the glowing
//     core shows under them; a colossus first seen already damaged simply has those plates missing;
//   - death (deathMs): it drops to its knees and CRUMBLES piece by piece from the top down, the runes going out.
// LOD by distance to the camera (the goblin's): full (<= 24 blocks), simple gait without ground queries (<= 64), beyond:
// the legs only. The debris and the shake run on their own clock (tick(), from the client's world tick).
import { buildColossus, crumblePieces } from './model.ts';
import {
  ARM, COLOSSUS_RIG, HUNCH, KNEEL, armSwingTarget, bodyMass, breatheSlow, counterRotation, crumbleTimes, footfallKick,
  hurlPose, liftPose, runeGlow, settleCurve, slamPose, wakeCurve, windupPose,
} from './procedural.ts';
import { DEATH_MS, parsePose } from './tuning.ts';
import { SHAKES, shakeFalloff } from './shake.ts';
import { newDebris, stepDebris } from './debris.ts';
import { createLocomotion, lodFor, solveLeg, stepLocomotion, toLocal } from '../goblin/locomotion.ts';
import { clamp, critSpring, dampedSpring, hash01, leanFrom, lerp, lookAngles, spring } from '../goblin/procedural.ts';

export const LOOK_RANGE = 16;
export const MAX_DEBRIS = 240;
const R: any = COLOSSUS_RIG;
const STEP_SOUND_RADIUS = 18;

function newState(id) {
  return {
    id, time: hash01(id) * 10, phase: hash01(id + 1) * Math.PI * 2, frames: 0, cost: 0,
    loco: createLocomotion(COLOSSUS_RIG as any), lod: 'none',
    state: null, stateT: 0, prev: null, tier: null,
    kneel: spring(1), lat: spring(), roll: spring(), impact: spring(), leanP: spring(), headYaw: spring(), headPitch: spring(),
    armSh: [spring(), spring()], armEl: [spring(0.3), spring(0.3)], actW: spring(),
    vineA: [], vineB: [], fern: spring(), planted: [true, true], steps: 0, slams: 0, lastAct: null, crumble: null, impacts: 0,
  };
}

export class ColossusRenderer {
  deathMs = DEATH_MS;
  _client: any = null; _particles: any = null; _sounds: any = null; _shaker: any = null;
  _envAt = -1; _env: any = { cam: null, targets: [] }; _scene: any = null; _v: any = null;
  debris: any[] = []; lastShake: any = null;
  stats: any = null;
  /**
   * @param {{ client: any, particles?: any, sounds?: any, shaker?: any }} env ctx.client (the browser's view of the world),
   * ctx.particles and ctx.sounds (browser), and the camera shaker the mod's camera modifier reads.
   */
  constructor(env) {
    this._client = env?.client ?? null;
    this._particles = env?.particles ?? null;
    this._sounds = env?.sounds ?? null;
    this._shaker = env?.shaker ?? null;
    this._envAt = -1;
    this._env = { cam: null, targets: [] };
    this._scene = null;
    this._v = null;
    this.debris = []; // { obj, d, r0: {x,y,z}, s0, bundle }
    this.lastShake = null; // the camera offset of the last frame (the modifier writes it; the browser check reads it)
    // read by the browser check: frames, ground queries, ms, footfalls, slams, plates detached, crumble pieces
    this.stats = { frames: 0, queries: 0, ms: 0, footfalls: 0, slams: 0, detached: 0, crumbled: 0, shakes: 0 };
  }

  build(kit) {
    if (!this._v) { const T = kit.THREE; this._v = { T, a: new T.Vector3(), b: new T.Vector3() }; }
    return buildColossus(kit);
  }

  cue() { /* everything rides the pose (late arrivals see it too) */ }

  env(now) {
    if (this._envAt === now) return this._env;
    this._envAt = now;
    const c = this._client;
    let me = null, others = [];
    try { me = c?.player?.() ?? null; others = c?.players?.() ?? []; } catch { /* outside a session */ }
    this._env = { cam: me, targets: me ? [me, ...others] : others };
    return this._env;
  }

  ground(x, y, z, depth = 4) {
    try { return this._client.groundBelow(x, y, z, depth); } catch { return null; }
  }

  // ---------------------------------------------------------------- effects (dust, sound, shake)
  dust(name, p, count) {
    try { this._particles?.spawn(name, p, count); } catch { /* over the budget, or no page */ }
  }

  /** A shake for the local camera from a source at p (its falloff by distance), and a sound at a volume by distance. */
  feel(kind, p, soundName = null) {
    const me = this._env.cam;
    if (!me) return 0;
    const d = Math.hypot(me.x - p.x, (me.y + 1.6) - p.y, me.z - p.z);
    const sh = SHAKES[kind];
    const amp = sh ? shakeFalloff(sh.intensity, d, sh.radius) : 0;
    if (amp > 0 && this._shaker?.add(amp, sh.ms, performance.now())) this.stats.shakes++;
    if (soundName && d < STEP_SOUND_RADIUS) {
      try { this._sounds?.play(soundName, { volume: clamp(1 - d / STEP_SOUND_RADIUS, 0, 1) * 0.9 }); } catch { /* sound budget */ }
    }
    return amp;
  }

  // ---------------------------------------------------------------- debris
  /** Takes `obj` off the body into the world as a tumbling piece. */
  detach(obj, center, seed, bundle = null) {
    const scene = this._scene;
    if (!scene || !obj.parent) { if (obj) obj.visible = false; return false; }
    obj.updateWorldMatrix(true, true);
    scene.attach(obj); // keeps where it is in the world
    if (this.debris.length >= MAX_DEBRIS) this.drop(this.debris.shift());
    const p = obj.position;
    const g = this.ground(p.x, p.y, p.z, 8);
    const d = newDebris({ x: p.x, y: p.y, z: p.z }, center, g ?? p.y - 3, [hash01(seed), hash01(seed + 1), hash01(seed + 2)], { half: 0.1 });
    this.debris.push({ obj, d, r0: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z }, s0: obj.scale.x, bundle });
    if (bundle) bundle.live++;
    return true;
  }

  drop(rec) {
    if (!rec) return;
    rec.obj.parent?.remove(rec.obj);
    rec.obj.traverse((o) => o.geometry?.dispose?.());
    if (rec.bundle && --rec.bundle.live <= 0 && rec.bundle.done) for (const m of rec.bundle.materials) m.dispose?.();
  }

  /** Every frame (the client's world tick): the debris fall and tumble. */
  tick(dt) {
    const t0 = performance.now();
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const rec = this.debris[i], d = rec.d;
      if (!stepDebris(d, dt)) { this.debris.splice(i, 1); this.drop(rec); continue; }
      rec.obj.position.set(d.x, d.y, d.z);
      rec.obj.rotation.set(rec.r0.x + d.rx, rec.r0.y + d.ry, rec.r0.z + d.rz);
      rec.obj.scale.setScalar(Math.max(1e-3, rec.s0 * d.scale));
    }
    this.stats.ms += performance.now() - t0;
  }

  /** The plates of the tiers (from, to] come off (with embers from the core under them); at the first sight just hidden. */
  breakPlates(m, s, to, live) {
    const plates = m.model.plates ?? [];
    const g = m.model.group, center = { x: g.position.x, y: g.position.y + 1.6, z: g.position.z };
    let n = 0;
    for (const pl of plates) {
      if (pl.gone || pl.tier === 0 || pl.tier > to) continue;
      pl.gone = true;
      if (live && this.detach(pl.obj, center, s.id * 97 + n * 7)) {
        n++; this.stats.detached++;
        const p = pl.obj.position;
        this.dust('colossus_ember', { x: p.x, y: p.y, z: p.z }, 10);
        this.dust('colossus_dust', { x: p.x, y: p.y, z: p.z }, 8);
      } else pl.obj.visible = false;
    }
    if (n) this.feel('crumble', center);
    return n;
  }

  // ---------------------------------------------------------------- the frame
  animate(m, frame) {
    const t0 = performance.now();
    const J = m.model.joints;
    if (!J || !this._v) return;
    this._scene = m.model.group.parent ?? this._scene;
    const s = (m.col ??= newState(m.id));
    s.stats = this.stats; // the browser check reads the renderer's counters through the mob
    const dt = clamp(frame.dt, 1e-4, 0.1);
    s.time += dt; s.frames++;
    if (frame.dying !== undefined) { this.die(m, s, J, frame.dying, dt); return; }

    // ---- the server's word: state and tier
    const ps = parsePose(m.pose ?? null);
    const state = ps.state ?? 'walk';
    if (s.tier === null) { s.tier = ps.tier; this.breakPlates(m, s, ps.tier, false); }
    else if (ps.tier > s.tier) { this.breakPlates(m, s, ps.tier, true); s.tier = ps.tier; }
    if (state !== s.state) {
      s.prev = s.state; s.state = state; s.stateT = 0;
      if (s.frames <= 1) s.prev = null; // a first sight is not a transition
      if (state === 'slam' && s.prev === 'windup') this.impact(m, s, J);
      if (state === 'wake' && s.prev) { const p = m.model.group.position; this.feel('wake', { x: p.x, y: p.y + 1, z: p.z }); this.dust('colossus_dust', { x: p.x, y: p.y + 0.3, z: p.z }, 30); }
    } else s.stateT += dt;
    if (s.frames === 1 && (state === 'dormant' || state === 'settle')) s.kneel.x = 1;
    if (s.frames === 1 && state !== 'dormant' && state !== 'settle' && state !== 'wake') s.kneel.x = 0;

    const g = m.model.group, pos = g.position, yaw = g.rotation.y, scale = g.scale.x || 1;
    const env = this.env(frame.now);
    const dist = env.cam ? Math.hypot(env.cam.x - pos.x, env.cam.y - pos.y, env.cam.z - pos.z) : 0;
    const lod = lodFor(dist);
    s.lod = lod;
    const st: any = stepLocomotion(s.loco, { x: pos.x, y: pos.y, z: pos.z, yaw, dt, lod, ground: (x, y, z) => this.ground(x, y, z) });
    this.stats.queries += st.queries;
    if (lod === 'none' && s.frames > 2) { this.legs(J, st, pos, yaw, scale, R.hipHeight, 0, 0); this.stats.frames++; return; }

    // ---- kneel weight (dormant 1, standing 0) and the action's pose
    let kneelT = 0, wake = null, settle = null;
    if (state === 'dormant') kneelT = 1;
    else if (state === 'wake') { wake = wakeCurve(s.stateT); kneelT = wake.kneel; }
    else if (state === 'settle') { settle = settleCurve(s.stateT); kneelT = settle.kneel; }
    critSpring(s.kneel, kneelT, wake || settle ? 30 : 6, dt);
    const k = clamp(s.kneel.x, 0, 1);
    let act = null;
    if (state === 'windup') act = windupPose(s.stateT);
    else if (state === 'slam') act = slamPose(s.stateT);
    else if (state === 'lift') act = liftPose(s.stateT);
    else if (state === 'hurl') act = hurlPose(s.stateT);
    critSpring(s.actW, act ? act.weight : 0, act ? 18 : 6, dt);
    const aw = act ? Math.max(s.actW.x, act.weight) : s.actW.x;
    if (act) s.lastAct = act;
    const A = act ?? s.lastAct;

    // ---- weight over the planted foot; the footfalls
    const bm = bodyMass(st.feet, R);
    const walking = 1 - k;
    for (let i = 0; i < 2; i++) {
      const f = st.feet[i];
      if (f.planted && !s.planted[i] && lod === 'full' && walking > 0.6 && st.speed > 0.15) this.footfall(s, f, st.speed);
      s.planted[i] = f.planted;
    }
    critSpring(s.lat, bm.lateral * walking, 10, dt);
    critSpring(s.roll, bm.roll * walking, 10, dt);
    dampedSpring(s.impact, 0, 13, 0.45, dt);
    const lean = leanFrom(st.aForward, st.aRight);
    critSpring(s.leanP, lean.pitch * 0.6, 5, dt);
    const br = breatheSlow(s.time, s.phase);
    const crouch = A ? A.crouch * aw : 0;
    const standY = R.hipHeight + st.body.x + bm.rise * walking + s.impact.x - crouch - br.sink;
    const hipY = lerp(standY, KNEEL.hipY, k) + (wake ? 0.06 * wake.shudder * Math.sin(s.time * 40) : 0);
    J.pelvis.position.set(s.lat.x, hipY, 0);
    J.pelvis.rotation.set(st.pitch.x * 0.5, 0, s.roll.x);

    // ---- the legs: IK to the feet (blended to the kneel)
    const fwd = this.legs(J, st, pos, yaw, scale, hipY, k, s.lat.x);
    const cr = counterRotation(fwd[0], fwd[1]);
    J.pelvis.rotation.y = cr.pelvis * walking;

    // ---- the torso: hunch, the counter-turn, kneel bow, the action
    const torsoAct = A ? A.torso * aw : 0;
    J.torso.rotation.x = lerp(-HUNCH - s.leanP.x, KNEEL.torso, k) + torsoAct + (wake ? 0.25 * wake.push : 0);
    J.torso.rotation.y = cr.torso * walking + (A ? A.yaw * aw : 0);
    J.torso.rotation.z = -s.roll.x * 0.7;
    J.chest.scale.set(1 + (br.chest - 1) * 0.6, br.chest, 1 + (br.chest - 1) * 0.8);

    // ---- the head: the nearest player in range (not while asleep)
    let target = null, best = LOOK_RANGE;
    for (const p of env.targets) {
      const d = Math.hypot(p.x - pos.x, p.y - pos.y, p.z - pos.z);
      if (d < best && d > 0.5) { best = d; target = p; }
    }
    const eye = { x: pos.x, y: pos.y + 2.5 * scale, z: pos.z };
    const la = target && k < 0.5 ? lookAngles(eye, { x: target.x, y: target.y + 1.5, z: target.z }, yaw, { maxYaw: 0.9, maxPitch: 0.5, giveUp: 1.9 }) : { yaw: 0, pitch: 0, looking: false };
    critSpring(s.headYaw, la.yaw * 0.85, 4.5, dt); // a slow, heavy turn of the head
    critSpring(s.headPitch, la.pitch * 0.7, 4.5, dt);
    J.neck.rotation.y = s.headYaw.x * 0.4;
    J.head.rotation.y = s.headYaw.x * 0.6;
    J.head.rotation.x = -J.torso.rotation.x * (1 - k) - st.pitch.x * 0.5 + s.headPitch.x + KNEEL.head * k + (wake ? wake.head : 0);
    J.jaw.rotation.x = -((state === 'windup' ? 0.18 * aw : 0) + (state === 'slam' ? 0.22 * (1 - s.stateT) : 0) + (wake ? 0.15 * wake.push : 0));

    // ---- the arms: heavy pendulums driven by the opposite leg; the action and the kneel take them over
    for (const a of J.arms) {
      const i = a.side < 0 ? 0 : 1, other = 1 - i;
      const swing = (HUNCH + armSwingTarget(fwd[other], st.aForward)) * walking;
      const kneelSh = KNEEL.shoulder - KNEEL.torso + (wake ? 0.35 * wake.push : 0);
      let sh = lerp(swing, kneelSh, k), el = lerp(0.28 + 0.05 * Math.min(st.speed, 2), KNEEL.elbow, k);
      let roll = 0.14 + 0.04 * Math.abs(s.roll.x) * 10;
      if (A && aw > 1e-3) {
        const ar = A.arms[i];
        sh = lerp(sh, ar.sh - torsoAct * 0.5, aw); el = lerp(el, ar.el, aw); roll = lerp(roll, ar.roll + 0.12, aw);
      }
      const omega = lerp(3.6, 16, Math.max(aw, k * 0.6)); // free: a slow heavy pendulum; posed: crisp
      dampedSpring(s.armSh[i], sh, omega, lerp(0.28, 0.9, aw), dt);
      critSpring(s.armEl[i], el, lerp(6, 18, aw), dt);
      a.shoulder.rotation.set(s.armSh[i].x, 0, a.side * roll);
      a.elbow.rotation.x = s.armEl[i].x;
      a.fist.rotation.x = -0.1 * walking;
    }
    J.rock.visible = !!(act && act.rock);

    // ---- moss: vines and ferns sway with the motion and the footfalls
    const vineDrive = clamp(-0.12 * st.aForward, -0.6, 0.6) + 0.5 * s.impact.v;
    J.vines.forEach((vn, i) => {
      const sa = (s.vineA[i] ??= spring()), sb = (s.vineB[i] ??= spring());
      dampedSpring(sa, vineDrive + 0.06 * Math.sin(s.time * 1.3 + vn.phase), 6, 0.25, dt);
      dampedSpring(sb, sa.x * 1.4, 8, 0.2, dt);
      vn.a.rotation.x = sa.x; vn.b.rotation.x = sb.x - sa.x * 0.5;
      vn.a.rotation.z = 0.08 * Math.sin(s.time * 0.9 + vn.phase);
    });
    dampedSpring(s.fern, 0.4 * s.impact.v + 0.05 * Math.sin(s.time * 1.7), 9, 0.25, dt);
    for (const f of J.ferns) f.rotation.x = s.fern.x;

    // ---- the runes
    const flare = A ? A.flare * aw : 0;
    const level = runeGlow(s.time, { phase: s.phase, tier: s.tier ?? 0, dormant: k * (state === 'wake' ? 1 - (wake?.glow ?? 0) : 1), flare, wake: wake ? Math.max(0.15, wake.glow) : 1 });
    this.glow(m.model, level);
    s.glow = level;

    const spent = performance.now() - t0;
    this.stats.frames++;
    this.stats.ms += spent;
    s.cost += spent;
  }

  footfall(s, f, speed) {
    const kick = footfallKick(speed);
    s.impact.v += kick.body;
    for (const a of s.armSh) a.v += (s.steps % 2 ? 1 : -1) * kick.arm * 0.2;
    s.steps++;
    this.stats.footfalls++;
    const p = { x: f.x, y: f.y + 0.06, z: f.z };
    this.dust('colossus_dust', p, 7);
    this.feel('step', p, 'colossus_step');
  }

  impact(m, s, J) {
    s.slams++;
    this.stats.slams++;
    s.impact.v -= 2.4;
    const g = m.model.group;
    g.updateMatrixWorld(true);
    const v = this._v.a;
    const pts = [];
    for (const a of J.arms) { a.fist.getWorldPosition(v); pts.push({ x: v.x, y: g.position.y + 0.1, z: v.z }); }
    const c = { x: (pts[0].x + pts[1].x) / 2, y: g.position.y + 0.1, z: (pts[0].z + pts[1].z) / 2 };
    for (const p of pts) this.dust('colossus_dust', p, 24);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; this.dust('colossus_dust', { x: c.x + Math.cos(a) * 1.6, y: c.y, z: c.z + Math.sin(a) * 1.6 }, 6); }
    this.dust('colossus_ember', c, 12);
    this.feel('slam', c);
  }

  // The runes' look: the amber channels follow the level but never blow out to white (capped), the teal sigils ride a
  // touch brighter, the eye is the focal point (a floor so it never goes fully dark, a higher cap).
  glow(model, level) {
    for (const { mat, base, kind } of model.glows ?? []) {
      mat.color.setHex(base);
      mat.color.multiplyScalar(kind === 'eye' ? Math.min(1.45, level * 1.15 + 0.08) : kind === 'sigil' ? Math.min(1.25, level * 1.05) : Math.min(1.15, level));
    }
  }

  // The legs' IK. k blends the feet from the solver's (walking) to the kneel. Returns each foot's forward offset (+ = ahead).
  legs(J, st, pos, yaw, scale, hipY, k, lat) {
    const fwd = [0, 0];
    for (let i = 0; i < 2; i++) {
      const leg = J.legs[i], foot = st.feet[i];
      const walk = toLocal({ x: foot.x, y: foot.y + R.ankle * scale, z: foot.z }, pos, yaw, scale);
      const kn = i === 0 ? KNEEL.ankleL : KNEEL.ankleR;
      const ankle = k > 0 ? { x: lerp(walk.x, leg.side * R.hipWidth * 1.1, k), y: lerp(walk.y, kn.y, k), z: lerp(walk.z, kn.z, k) } : walk;
      const hip = { x: leg.side * R.hipWidth + lat, y: hipY, z: 0 };
      leg.hip.position.set(hip.x, hipY, 0);
      const sol = solveLeg(hip, ankle, R.thigh, R.shin);
      leg.hip.rotation.set(sol.thighX, 0, sol.thighZ);
      leg.knee.rotation.x = -sol.knee;
      const toe = foot.planted ? 0 : 0.3 * Math.sin(Math.PI * Math.min(1, foot.t));
      const flat = -(sol.thighX - sol.knee);
      leg.ankle.rotation.set(lerp(flat + toe, i === 0 ? flat - 1.2 : flat, k), 0, -sol.thighZ); // kneeling: the back foot's toes tuck under
      fwd[i] = -ankle.z;
    }
    return fwd;
  }

  // ---------------------------------------------------------------- death: to its knees, then the crumble
  die(m, s, J, t, dt) {
    const g = m.model.group;
    if (!s.crumble) {
      g.updateMatrixWorld(true);
      const pieces = crumblePieces(g);
      const v = this._v.a;
      const items = pieces.map((o) => ({ y: o.getWorldPosition(v).y }));
      const times = crumbleTimes(items, { start: 0.35, span: 1.9, seed: s.id });
      const order = pieces.map((o, i) => ({ o, t: times[i], i })).sort((a, b) => a.t - b.t);
      const mats = new Set();
      g.traverse((o) => { if (o.material) { mats.add(o.material); o.material.emissive?.setRGB(0, 0, 0); } }); // the hurt flash of the killing blow must not tint the rubble red
      s.crumble = { order, next: 0, bundle: { live: 0, done: false, materials: [...mats] } };
      this.feel('crumble', { x: g.position.x, y: g.position.y + 1, z: g.position.z });
    }
    // it sinks to its knees, bowed, the arms hanging
    const kd = clamp(t / 0.45, 0, 1);
    critSpring(s.kneel, 1, 12, dt);
    J.pelvis.position.y = lerp(J.pelvis.position.y, KNEEL.hipY - 0.06 * kd, kd);
    J.torso.rotation.x = lerp(J.torso.rotation.x, KNEEL.torso - 0.2, kd);
    J.head.rotation.x = lerp(J.head.rotation.x, 0.7, kd);
    for (const a of J.arms) { a.shoulder.rotation.x = lerp(a.shoulder.rotation.x, 0.4, kd); a.elbow.rotation.x = lerp(a.elbow.rotation.x, 0.2, kd); }
    for (const leg of J.legs) {
      const sol = solveLeg({ x: leg.side * R.hipWidth, y: J.pelvis.position.y, z: 0 }, { x: leg.side * R.hipWidth, y: 0.12, z: leg.side < 0 ? 0.62 : -0.4 }, R.thigh, R.shin);
      leg.hip.position.y = J.pelvis.position.y;
      leg.hip.rotation.set(sol.thighX, 0, sol.thighZ);
      leg.knee.rotation.x = -sol.knee;
    }
    // the pieces fall away from the top down
    const c = s.crumble, center = { x: g.position.x, y: g.position.y + 1.3, z: g.position.z };
    while (c.next < c.order.length && c.order[c.next].t <= t) {
      const { o, i } = c.order[c.next++];
      if (o.parent && this.detach(o, center, s.id * 131 + i, c.bundle)) {
        this.stats.crumbled++;
        if (i % 9 === 0) { const p = o.position; this.dust('colossus_dust', { x: p.x, y: p.y, z: p.z }, 6); }
      }
    }
    if (c.next >= c.order.length) c.bundle.done = true;
    // the runes still on the body go out, flickering
    const fade = clamp(1 - t / 1.6, 0, 1);
    this.glow(m.model, 0.9 * fade * (0.7 + 0.3 * Math.abs(Math.sin(t * 23))));
  }
}
