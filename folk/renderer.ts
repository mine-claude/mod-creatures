// @ts-check
// The Musgarrete's renderer (ctx.render.mobModel): the body (model.ts) posed PROCEDURALLY every frame — no keyframed clip:
//   - the feet: the goblin's solver (goblin/locomotion.ts) with the Musgarrete's own short, heavy rig: feet that find the
//     real ground (ctx.client.groundBelow), plant, never slide, step one at a time; 2-bone IK legs; hips on the feet;
//   - the body: a slow sway, lean into the acceleration, breathing of the boulder; the moss mantle, the beard and the crown's
//     plant ride damped springs driven by the motion (secondary motion);
//   - the head looks at the nearest player, else at the work it is doing (the target cell in its NPC view), else around;
//   - the arms swing heavily with the gait, or WORK: the brain's cues ('dig', 'place', 'ring', 'harvest', 'work_*', 'talk',
//     'gesture', 'wave', 'eat', 'stretch', 'scratch', 'look_around', 'shiver') and poses ('dig', 'sleep', 'cower') become
//     motions aimed at the actual target cell (the pick comes down ON the block being dug), carrying a block holds it in
//     both arms in front of the body and slows the arm swing;
//   - sleeping, it curls into a mossy boulder in its nest, breathing slowly, eyes dark; dying, it tips over.
// LOD by distance to the camera (the goblin's): full (<= 24 blocks), a simple gait (<= 64), feet at rest beyond.
import { buildMusgarrete, lookOf, applyLook } from './model.ts';
import { MUSG_RIG as R, ARM, TORSO_Y, aimAt, digSwing, placeReach, ringSwing, waveArm, curlPose, DIG_TIME, PLACE_TIME, RING_TIME, WAVE_TIME, HARVEST_TIME } from './motion.ts';
import { createLocomotion, lodFor, solveLeg, stepLocomotion, toLocal } from '../goblin/locomotion.ts';
import { breathe, clamp, critSpring, dampedSpring, deathPose, hash01, leanFrom, lookAngles, spring, lerp } from '../goblin/procedural.ts';

export const DEATH_MS = 1500;
const LOOK_RANGE = 8;
const CUE_TIME: Record<string, number> = { dig: DIG_TIME, place: PLACE_TIME, ring: RING_TIME, wave: WAVE_TIME, harvest: HARVEST_TIME, talk: 1.1, gesture: 1.3, eat: 1.4, stretch: 2.2, scratch: 1.4, look_around: 2.6, shiver: 1.2, work_chisel: 0.5, work_sort: 1.2, work_sharpen: 0.9, open_door: 0.5 };

function newState(id: number) {
  return {
    id, time: hash01(id) * 10, phase: hash01(id + 3) * 6.28, fallSide: hash01(id + 5) < 0.5 ? -1 : 1,
    loco: createLocomotion(R), lod: 'none', look: null as any, lookSeed: -1,
    leanP: spring(), leanR: spring(), headYaw: spring(), headPitch: spring(), curl: spring(), cower: spring(), carry: spring(), dig: spring(), shift: spring(),
    mantle: [0, 1, 2, 3, 4].map(() => spring()), beard: spring(), crown: spring(), crownZ: spring(), aimYaw: spring(), aimPitch: spring(),
    cues: [] as { name: string; t: number }[], frames: 0, cost: 0, carryBlock: null as string | null,
  };
}

export class MusgarreteRenderer {
  deathMs = DEATH_MS;
  stats = { frames: 0, queries: 0, ms: 0 };
  _ctx: any; _envAt = -1; _env: any = { cam: null, targets: [] };
  constructor(ctx: any) { this._ctx = ctx; }

  build(kit: any) { const m = buildMusgarrete(kit); (m as any).kit = kit; return m; }

  cue(m: any, name: string) {
    const s = (m.musg ??= newState(m.id));
    s.cues = s.cues.filter((c) => c.name !== name);
    s.cues.push({ name, t: 0 });
    if (s.cues.length > 4) s.cues.shift();
  }

  env(now: number) {
    if (this._envAt === now) return this._env;
    this._envAt = now;
    const c = this._ctx.client;
    let me = null, others: any[] = [];
    try { me = c?.player?.() ?? null; others = c?.players?.() ?? []; } catch { /* */ }
    this._env = { cam: me, targets: me ? [me, ...others] : others };
    return this._env;
  }

  ground(x: number, y: number, z: number) { try { return this._ctx.client.groundBelow(x, y, z, 4); } catch { return null; } }

  view(m: any) { try { return this._ctx.npcs.view(m.id); } catch { return null; } }

  animate(m: any, frame: any) {
    const t0 = performance.now();
    const J = m.model.joints;
    if (!J) return;
    const s = (m.musg ??= newState(m.id));
    const dt = clamp(frame.dt, 1e-4, 0.1);
    s.time += dt; s.frames++;
    const v = this.view(m);
    // the individual's look, once its seed is known
    const seed = v?.seed ?? m.id;
    if (s.lookSeed !== seed) { s.lookSeed = seed; s.look = lookOf(seed); applyLook(m.model, s.look); }
    if (frame.dying !== undefined) { this.die(s, J, frame.dying); return; }
    for (const c of s.cues) c.t += dt;
    s.cues = s.cues.filter((c) => c.t < (CUE_TIME[c.name] ?? 1));
    const cue = (name: string) => s.cues.find((c) => c.name === name) ?? null;

    const g = m.model.group, pos = g.position, yaw = g.rotation.y;
    const scale = (g.scale.x || 1) * (s.look?.scale ?? 1);
    const env = this.env(frame.now);
    const dist = env.cam ? Math.hypot(env.cam.x - pos.x, env.cam.y - pos.y, env.cam.z - pos.z) : 0;
    const lod = lodFor(dist);
    s.lod = lod;
    const pose = m.pose ?? null;
    const sleeping = pose === 'sleep';
    const st = stepLocomotion(s.loco, { x: pos.x, y: pos.y, z: pos.z, yaw, dt, lod: sleeping ? 'none' : lod, ground: (x: number, y: number, z: number) => this.ground(x, y, z) });
    this.stats.queries += st.queries;

    // ---- the held tool and the carried block
    const held = v?.held ?? null;
    J.pick.visible = !!held && /pickaxe/.test(held) && !sleeping;
    J.hoe.visible = !!held && /hoe/.test(held) && !sleeping;
    const carrying = !!v?.carry && !sleeping;
    critSpring(s.carry, carrying ? 1 : 0, 9, dt);
    if (carrying && s.carryBlock !== v.carry) this.setCarry(m, J, v.carry, s);
    J.carry.visible = s.carry.x > 0.5;

    // ---- the curl (sleep) and the crouch (fear)
    critSpring(s.curl, sleeping ? 1 : 0, sleeping ? 2.2 : 4, dt);
    critSpring(s.cower, pose === 'cower' || cue('shiver') ? 1 : 0, 8, dt);
    const curl = curlPose(s.curl.x);
    if (lod === 'none' && s.frames > 2 && curl.kneel < 0.01) { this.legs(J, st, pos, yaw, scale, R.hipHeight); this.stats.frames++; return; }

    // ---- body
    const lean = leanFrom(st.aForward, st.aRight);
    critSpring(s.leanP, lean.pitch * 0.7, 7, dt);
    critSpring(s.leanR, lean.roll * 0.7 + Math.sin(s.time * 1.1 + s.phase) * 0.025 * (1 - curl.kneel), 7, dt);
    const br = breathe(s.time * (sleeping ? 0.45 : 1), s.phase);
    // weight shift: the boulder leans over the planted foot while the other swings (a heavy side-to-side)
    const [fl, fr] = st.feet;
    critSpring(s.shift, fl.planted && !fr.planted ? -1 : fr.planted && !fl.planted ? 1 : 0, 9, dt);
    const sway = 0.07 * s.shift.x;
    const hipY = R.hipHeight + st.body.x - curl.drop - 0.06 * s.cower.x + br.bob - 0.03 * s.carry.x;
    J.pelvis.position.y = hipY;
    J.pelvis.rotation.x = st.pitch.x * 0.5;
    J.pelvis.rotation.z = s.leanR.x + sway * 0.4;
    J.body.scale.set(1 + (br.chest - 1) * 0.6, br.chest, 1 + (br.chest - 1) * 0.6);

    // the work target in the local frame (from the NPC view): the cell's centre
    const tgt = v?.t ? toLocal({ x: v.t.x + 0.5, y: v.t.y + 0.5, z: v.t.z + 0.5 }, pos, yaw, scale) : null;
    const dig = cue('dig'), place = cue('place'), ring = cue('ring'), harvest = cue('harvest'), wave = cue('wave');
    critSpring(s.dig, pose === 'dig' || dig ? 1 : 0, 10, dt);
    let leanWork = 0;
    if (dig) leanWork = digSwing(dig.t, 1.2).lean;
    if (place) leanWork = placeReach(place.t).lean;
    if (harvest) leanWork = 0.35 * Math.sin(Math.PI * clamp(harvest.t / HARVEST_TIME, 0, 1));
    J.torso.rotation.x = -(s.leanP.x + 0.08 + curl.hunch + 0.3 * s.cower.x + leanWork - 0.06 * s.carry.x + (s.look?.lean ?? 0));
    J.torso.position.y = TORSO_Y;

    // ---- legs (IK to the planted feet), folded when it curls up
    const fwd = this.legs(J, st, pos, yaw, scale, hipY, curl.kneel);

    // ---- head: a player near, else the work, else a glance around
    let target: any = null, best = LOOK_RANGE;
    for (const p of env.targets) { const d = Math.hypot(p.x - pos.x, p.y - pos.y, p.z - pos.z); if (d < best && d > 0.3) { best = d; target = { x: p.x, y: p.y + 1.5, z: p.z }; } }
    if (!target && v?.t) target = { x: v.t.x + 0.5, y: v.t.y + 0.5, z: v.t.z + 0.5 };
    const eye = { x: pos.x, y: pos.y + 0.9 * scale, z: pos.z };
    const la = target && !sleeping ? lookAngles(eye, target, yaw, { maxYaw: 0.9, maxPitch: 0.6 }) : { yaw: 0, pitch: 0, looking: false };
    const around = cue('look_around');
    const glance = around ? Math.sin((around.t / 2.6) * Math.PI * 2) * 0.8 : 0;
    critSpring(s.headYaw, la.yaw + glance, 6, dt);
    critSpring(s.headPitch, la.pitch - curl.head, 6, dt);
    J.head.rotation.y = s.headYaw.x;
    J.head.rotation.x = -J.torso.rotation.x * 0.6 + s.headPitch.x * 0.8;
    const scratch = cue('scratch');
    J.head.rotation.z = scratch ? Math.sin(scratch.t * 9) * 0.06 : 0;
    // the eyes: dark asleep, a slow blink awake
    const blink = ((s.time + s.phase) % 5.3) < 0.14;
    for (const e of J.eyes) e.glow.scale.y = sleeping ? 0.08 : blink ? 0.2 : 1;
    // the mouth: talking opens and closes the stone lip
    const talk = cue('talk') ?? cue('gesture');
    const eat = cue('eat');
    J.jaw.rotation.x = -(talk ? Math.max(0, Math.sin(talk.t * 14)) * 0.22 : eat ? Math.max(0, Math.sin(eat.t * 10)) * 0.18 : 0) - (ring || dig?.t ? 0.05 : 0);

    // ---- arms
    const swingAmp = (0.35 - 0.25 * s.carry.x) * clamp(st.speed / 2, 0, 1);
    const arm = [0, 1].map((i) => ({ sh: 0.12 + clamp(fwd[1 - i] * 2.2, -0.7, 0.7) * swingAmp / 0.35, yaw: 0, roll: (i ? 1 : -1) * 0.12, el: 0.25 }));
    // carrying: both forearms up under the block
    if (s.carry.x > 0.01) for (const a of arm) { a.sh = lerp(a.sh, 1.05, s.carry.x); a.el = lerp(a.el, 0.9, s.carry.x); a.roll = lerp(a.roll, a.roll * 0.3, s.carry.x); }
    // aims at the work cell from each shoulder
    const aimOf = (i: number) => {
      if (!tgt) return { pitch: 1.2, yaw: 0, dist: 1 };
      const sh = { x: (i ? 1 : -1) * ARM.shoulderX, y: hipY + ARM.shoulderY, z: 0 };
      return aimAt(sh, tgt);
    };
    const rAim = aimOf(1), lAim = aimOf(0);
    critSpring(s.aimPitch, rAim.pitch, 12, dt);
    critSpring(s.aimYaw, clamp(rAim.yaw, -1.2, 1.2), 12, dt);
    const torsoPitch = -J.torso.rotation.x;
    if (dig || pose === 'dig') {
      const sw = dig ? digSwing(dig.t, s.aimPitch.x - torsoPitch) : { shoulder: s.aimPitch.x - torsoPitch, elbow: 0.25 };
      arm[1] = { sh: sw.shoulder, yaw: s.aimYaw.x, roll: 0, el: sw.elbow };
      arm[0] = { sh: 0.5, yaw: 0, roll: -0.2, el: 0.9 }; // the off hand braces
    }
    if (ring) { const r = ringSwing(ring.t); arm[0] = { sh: r.shoulder - torsoPitch, yaw: clamp(lAim.yaw, -0.6, 0.6), roll: 0, el: r.elbow }; arm[1] = { sh: r.shoulder - torsoPitch, yaw: clamp(rAim.yaw, -0.6, 0.6), roll: 0, el: r.elbow }; }
    if (place) {
      const p = placeReach(place.t);
      for (const i of [0, 1]) { const a = i ? rAim : lAim; arm[i] = { sh: lerp(arm[i].sh, a.pitch - torsoPitch, p.weight), yaw: lerp(arm[i].yaw, clamp(a.yaw, -1, 1), p.weight), roll: arm[i].roll * (1 - p.weight), el: lerp(arm[i].el, 0.1, p.weight) }; }
    }
    if (harvest) { const k = Math.sin(Math.PI * clamp(harvest.t / HARVEST_TIME, 0, 1)); arm[1] = { sh: lerp(arm[1].sh, rAim.pitch - torsoPitch, k), yaw: lerp(0, rAim.yaw, k) + 0.5 * Math.sin(harvest.t * 9) * k, roll: 0, el: 0.3 }; }
    const chisel = cue('work_chisel'), sort = cue('work_sort'), sharpen = cue('work_sharpen');
    if (chisel) { const k = Math.sin(Math.PI * chisel.t / 0.5); arm[1] = { sh: 1.1 + 0.35 * k, yaw: 0.2, roll: 0, el: 1.0 - 0.5 * k }; arm[0] = { sh: 1.0, yaw: -0.25, roll: 0, el: 1.1 }; }
    if (sort) { arm[0] = { sh: 0.9 + 0.3 * Math.sin(sort.t * 7), yaw: -0.2, roll: 0, el: 0.8 }; arm[1] = { sh: 0.9 + 0.3 * Math.sin(sort.t * 7 + Math.PI), yaw: 0.2, roll: 0, el: 0.8 }; }
    if (sharpen) { arm[1] = { sh: 1.0, yaw: 0.3 + 0.25 * Math.sin(sharpen.t * 12), roll: 0, el: 1.2 }; arm[0] = { sh: 1.0, yaw: -0.3, roll: 0, el: 1.2 }; }
    if (wave) { const w = waveArm(wave.t); arm[1] = { sh: lerp(arm[1].sh, w.shoulder, w.weight), yaw: 0, roll: w.roll * w.weight, el: w.elbow }; }
    const gesture = cue('gesture');
    if (gesture) { const k = Math.sin(Math.PI * clamp(gesture.t / 1.3, 0, 1)); arm[0] = { sh: lerp(arm[0].sh, 1.3, k), yaw: -0.5 * k, roll: -0.3 * k, el: lerp(arm[0].el, 0.6, k) }; }
    if (talk && !gesture) { arm[0].sh += 0.25 * Math.sin(talk.t * 5); }
    if (eat) { const k = Math.sin(Math.PI * clamp(eat.t / 1.4, 0, 1)); arm[1] = { sh: lerp(arm[1].sh, 2.2, k), yaw: 0.4 * k, roll: 0, el: lerp(arm[1].el, 2.2, k) }; }
    const stretch = cue('stretch');
    if (stretch) { const k = Math.sin(Math.PI * clamp(stretch.t / 2.2, 0, 1)); for (const a of arm) { a.sh = lerp(a.sh, 2.9, k); a.el = lerp(a.el, 0.1, k); } }
    if (scratch) { const k = Math.sin(Math.PI * clamp(scratch.t / 1.4, 0, 1)); arm[0] = { sh: lerp(arm[0].sh, 2.5, k), yaw: -0.3, roll: -0.4 * k, el: lerp(arm[0].el, 2.0, k) + 0.15 * Math.sin(scratch.t * 20) * k }; }
    if (s.cower.x > 0.01) for (const a of arm) { a.sh = lerp(a.sh, 2.6, s.cower.x); a.el = lerp(a.el, 2.2, s.cower.x); a.yaw = lerp(a.yaw, 0, s.cower.x); }
    if (curl.arms > 0.01) for (const a of arm) { a.sh = lerp(a.sh, 0.4, curl.arms); a.el = lerp(a.el, 2.3, curl.arms); a.roll = lerp(a.roll, 0, curl.arms); }
    for (const [i, A] of J.arms.entries()) { const a = arm[i]; A.shoulder.rotation.set(a.sh, a.yaw, a.roll); A.elbow.rotation.x = a.el; }

    // ---- secondary motion: the mantle, the beard, the crown ride springs driven by the body's motion
    const accF = clamp(-st.aForward * 0.06, -0.5, 0.5), vel = clamp(st.vForward * 0.12, -0.4, 0.5);
    s.mantle.forEach((sp: any, i: number) => {
      dampedSpring(sp, vel * (i < 3 ? 1 : 0.6) + accF + (st.steps % 2 ? 0.02 : -0.02) * (i + 1) * 0.3, 11 + i, 0.35, dt);
      J.mantle[i].rotation.x = sp.x;
    });
    dampedSpring(s.beard, vel * 0.8 + accF + (talk ? Math.sin(talk.t * 14) * 0.08 : 0), 9, 0.3, dt);
    for (const [i, b] of J.beard.entries()) { b.rotation.x = s.beard.x * (0.8 + 0.1 * i); b.rotation.z = Math.sin(s.time * 1.7 + i) * 0.04; }
    dampedSpring(s.crown, -st.aForward * 0.08 + Math.sin(s.time * 2 + s.phase) * 0.03, 8, 0.25, dt);
    dampedSpring(s.crownZ, st.aRight * 0.06 - st.yawRate * 0.05, 8, 0.25, dt);
    J.crown.rotation.set(s.crown.x, 0, s.crownZ.x);

    const spent = performance.now() - t0;
    this.stats.frames++; this.stats.ms += spent; s.cost += spent;
  }

  // the carried block: a cube with the block's own faces (kit.blockTexture), else a stone-coloured cube
  setCarry(m: any, J: any, name: string, s: any) {
    s.carryBlock = name;
    const kit = m.model.kit, THREE = kit?.THREE;
    if (!THREE) return;
    for (const c of [...J.carry.children]) { J.carry.remove(c); c.geometry?.dispose?.(); }
    const bt = kit.blockTexture?.(name);
    const geo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
    let mat;
    if (bt) {
      const uv = geo.attributes.uv, [u0, v0, u1, v1] = bt.side;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
      mat = new THREE.MeshLambertMaterial({ map: bt.texture });
    } else mat = new THREE.MeshLambertMaterial({ color: 0x7d7d76 });
    J.carry.add(new THREE.Mesh(geo, mat));
  }

  legs(J: any, st: any, pos: any, yaw: number, scale: number, hipY: number, kneel = 0) {
    const fwd = [0, 0];
    for (let i = 0; i < 2; i++) {
      const leg = J.legs[i], foot = st.feet[i];
      leg.hip.position.y = hipY;
      if (kneel > 0.01) {
        // curled: the knees fold under the boulder
        leg.hip.rotation.set(1.4 * kneel, 0, leg.side * 0.25 * kneel);
        leg.knee.rotation.x = -2.2 * kneel;
        leg.ankle.rotation.set(0.8 * kneel, 0, 0);
        continue;
      }
      const ankle = toLocal({ x: foot.x, y: foot.y + R.ankle * scale, z: foot.z }, pos, yaw, scale);
      const hip = { x: leg.side * R.hipWidth, y: hipY, z: 0 };
      const sol = solveLeg(hip, ankle, R.thigh, R.shin);
      leg.hip.rotation.set(sol.thighX, 0, sol.thighZ);
      leg.knee.rotation.x = -sol.knee;
      const toe = foot.planted ? 0 : 0.3 * Math.sin(Math.PI * Math.min(1, foot.t));
      leg.ankle.rotation.set(-(sol.thighX - sol.knee) + toe, 0, -sol.thighZ);
      fwd[i] = -ankle.z;
    }
    return fwd;
  }

  die(s: any, J: any, t: number) {
    const d = deathPose(t, s.fallSide);
    J.rig.rotation.z = d.roll;
    J.rig.position.y = 0.2 * Math.abs(Math.sin(d.roll));
    J.pelvis.position.y = R.hipHeight - d.drop * 0.6;
    for (const leg of J.legs) { leg.hip.rotation.set(1.0 * d.kneel, 0, 0); leg.knee.rotation.x = -1.6 * d.kneel; }
    for (const a of J.arms) { a.shoulder.rotation.set(0.3, 0, a.side * (0.2 + 0.8 * d.kneel)); a.elbow.rotation.x = 0.5; }
    for (const e of J.eyes) e.glow.scale.y = Math.max(0.05, 1 - d.kneel);
  }
}
