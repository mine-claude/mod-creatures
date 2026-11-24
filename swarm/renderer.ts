// @ts-check
// The Sting Swarm's renderer (ctx.render.mobModel): the server sends ONE mob; this draws the whole swarm and moves every
// insect PROCEDURALLY each frame — no keyframed clip anywhere:
//   - the flock (boids.ts): separation, alignment and cohesion around the mob's position plus each insect's own wander,
//     held to the SHAPE of the server's state (the mob's lasting pose): a loose drifting cloud with insects dipping to the
//     flowers (idle), a tight fast-swirling ball (alarmed), a STREAM pointed at the prey that WRAPS around its body
//     (attack), a wide broken cloud (flee); a hit (the engine's hurt flash) SCATTERS them and they re-form after a moment;
//   - the count follows the health (m.hp / m.maxHp): insects drop out, falling, tumbling and shrinking; at death the rest
//     burst outward and wink out one by one (frame.dying, DEATH_MS);
//   - each insect banks into its turns and pitches with its climb on critically damped springs (goblin/procedural.ts), its
//     wings beat (faster when alarmed or attacking; folded back while it sits on a flower), the hind pair a beat behind
//     the fore pair, and its abdomen pumps as it breathes and CURLS to sting ('sting' cue) when it wraps the prey;
//   - insects never fly into a solid block: the flock asks the client's own collision (ctx.client.groundBelow — physics
//     loaded lazily by the engine) per axis, cached per cell; flowers for the dips come from ctx.client.getBlock.
// LOD by distance to the camera: beyond LOD_MID half the insects and no hind wings; beyond LOD_FAR a handful of insects
// with still wings. Per-insect colour variation is the instance colour (warmer / cooler, lighter / darker, a touch larger /
// smaller); an insect dropping out darkens as it shrinks. In the attack stream each insect also turns its nose a little
// toward the prey (look only), so the stream reads as one directed flow.
import { buildSwarm } from './model.ts';
import { createSwarm, drawnAt, flyingCount, kill, MAX_INSECTS, scatter, setHealth, stepSwarm } from './boids.ts';
import { FLOWERS } from './spawn.ts';
import { BOX } from './tuning.ts';
import { clamp, critSpring, hash01, wrapAngle } from '../goblin/procedural.ts';

export const DEATH_MS = 2200;
export const LOD_MID = 28; // blocks
export const LOD_FAR = 56;
const STING_TIME = 0.35; // s of the abdomen's curl on a 'sting' cue
const STREAM_ALIGN = 0.55; // how much an insect in the attack stream turns its nose toward the prey (look only)
const WING_SWEEP = 0.3; // rad: the wings swept back in flight (folded flat along the body on a flower)
const SOLID_TTL = 1; // s: the cached solid cells are asked again after this

function newState(id: number, n: number) {
  return {
    id, sw: createSwarm(id, n), heading: [] as Array<{ yaw: any, pitch: any, roll: any, lastYaw: number }>,
    flash: 0, sting: -1, lod: 'full', active: n, drawn: 0, frames: 0, cost: 0,
    flowers: [] as Array<{ x: number, y: number, z: number }>, flowerAt: -1e9, fx: NaN, fz: NaN, ground: null as number | null,
    solidCache: new Map<number, boolean>(), solidAt: 0, mode: 'idle', target: null as any, dying: false,
    tmp: null as any,
  };
}

export class SwarmRenderer {
  deathMs = DEATH_MS;
  n = MAX_INSECTS;
  _client: any = null;
  stats = { frames: 0, ms: 0 }; // read by the browser check
  /** @param {any} client ctx.client (the browser's view of the world) */
  constructor(client: any, n = MAX_INSECTS) {
    this._client = client;
    this.n = n;
  }

  build(kit: any) { return buildSwarm(kit, this.n); }

  cue(m: any, name: string) {
    const s = (m.swarm ??= newState(m.id, this.n));
    if (name === 'scatter') scatter(s.sw, 1.3); // smoke / fire: it breaks up
    else if (name === 'sting') s.sting = 0;
  }

  // ---- the client's world (all guarded: a test or the title screen has none)
  camera() { try { return this._client?.player?.() ?? null; } catch { return null; } }

  players() {
    const out: any[] = [];
    try { const me = this._client?.player?.(); if (me) out.push(me); } catch { /* none */ }
    try { for (const p of this._client?.players?.() ?? []) out.push(p); } catch { /* none */ }
    return out;
  }

  solidFn(s: any) {
    const c = this._client;
    if (!c?.groundBelow) return null;
    return (x: number, y: number, z: number) => {
      const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
      const key = ((bx & 0x7ff) * 2048 + (by & 0x7ff)) * 2048 + (bz & 0x7ff);
      let v = s.solidCache.get(key);
      if (v === undefined) {
        let g = null;
        try { g = c.groundBelow(bx + 0.5, by + 0.999, bz + 0.5, 1); } catch { g = null; }
        v = g !== null && g > by + 0.02; // the cell has collision reaching into it (a full block; a slab counts whole)
        s.solidCache.set(key, v);
      }
      return v;
    };
  }

  // flowers near the cloud (where the dips go), and the ground under it — every 2 s or after a move of 2 blocks
  scanFlowers(s: any, cx: number, cy: number, cz: number, now: number) {
    if (now - s.flowerAt < 2000 && Math.hypot(cx - s.fx, cz - s.fz) < 2) return;
    s.flowerAt = now; s.fx = cx; s.fz = cz; s.flowers = [];
    const c = this._client;
    let g = null;
    try { g = c?.groundBelow?.(cx, cy, cz, 8) ?? null; } catch { g = null; }
    s.ground = g;
    if (g === null || !c?.getBlock) return;
    const gy = Math.round(g);
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      const x = Math.floor(cx) + dx, z = Math.floor(cz) + dz;
      for (const y of [gy, gy - 1, gy + 1]) {
        let b = null;
        try { b = c.getBlock({ x, y, z }); } catch { b = null; }
        if (typeof b === 'string' && FLOWERS.test(b)) { s.flowers.push({ x: x + 0.5, y: y + 0.45, z: z + 0.5 }); break; }
      }
    }
  }

  animate(m: any, frame: any, kit: any) {
    const t0 = performance.now();
    const J = m.model.joints;
    if (!J) return;
    const s = (m.swarm ??= newState(m.id, this.n));
    const THREE = kit?.THREE;
    if (!THREE) return;
    const dt = clamp(frame.dt, 0, 0.1);
    s.frames++;
    const g = m.model.group;
    // the container in world axes: cancel the group's yaw, so insect positions are world - group position
    J.swarm.rotation.y = -g.rotation.y;
    const cx = g.position.x, cy = g.position.y + BOX.centre, cz = g.position.z;
    const now = frame.now ?? performance.now();

    // ---- what the server says: the state (pose), a hit (the hurt flash), the health, death
    if (frame.dying !== undefined && !s.dying) { s.dying = true; kill(s.sw); }
    const flash = m.flash ?? 0;
    if (flash > s.flash + 0.05 && !s.dying) scatter(s.sw, 1);
    s.flash = flash;
    if (!s.dying) setHealth(s.sw, Number.isFinite(m.hp) && Number.isFinite(m.maxHp) && m.maxHp > 0 ? m.hp / m.maxHp : 1);
    s.mode = typeof m.pose === 'string' ? m.pose : 'idle';

    // ---- LOD
    const cam = this.camera();
    const dist = cam ? Math.hypot(cam.x - cx, cam.y - cy, cam.z - cz) : 0;
    s.lod = dist > LOD_FAR ? 'far' : dist > LOD_MID ? 'mid' : 'full';
    s.active = s.lod === 'far' ? Math.min(8, this.n) : s.lod === 'mid' ? Math.ceil(this.n / 2) : this.n;

    // ---- the prey (attack): the nearest player to the cloud; its chest is where the stream points
    s.target = null;
    if (s.mode === 'attack' && !s.dying) {
      let best = null, bd = 12;
      for (const p of this.players()) { const d = Math.hypot(p.x - cx, p.y + 1 - cy, p.z - cz); if (d < bd) { bd = d; best = p; } }
      if (best) s.target = { x: best.x, y: best.y + 1.0, z: best.z };
    }
    if (s.lod !== 'far' && s.mode === 'idle') this.scanFlowers(s, cx, cy, cz, now);
    if (now - s.solidAt > SOLID_TTL * 1000) { s.solidAt = now; s.solidCache.clear(); }

    stepSwarm(s.sw, dt, { cx, cy, cz, mode: s.mode, target: s.target, solid: this.solidFn(s), flowers: s.flowers, ground: s.ground, active: s.active });
    if (s.sting >= 0) { s.sting += dt; if (s.sting > STING_TIME) s.sting = -1; }
    this.draw(s, J, g, THREE, dt);

    const spent = performance.now() - t0;
    this.stats.frames++; this.stats.ms += spent; s.cost += spent;
  }

  // ---- the instances: one matrix per part per insect
  draw(s: any, J: any, g: any, THREE: any, dt: number) {
    const T = (s.tmp ??= {
      p: new THREE.Vector3(), q: new THREE.Quaternion(), e: new THREE.Euler(0, 0, 0, 'YXZ'), sc: new THREE.Vector3(),
      M: new THREE.Matrix4(), L: new THREE.Matrix4(), R: new THREE.Matrix4(), W: new THREE.Matrix4(), c: new THREE.Color(), at: { x: 0, y: 0, z: 0 },
      waist: new THREE.Matrix4(), fore: [new THREE.Vector3(0.024, 0.03, -0.012), new THREE.Vector3(-0.024, 0.03, -0.012)],
      hind: [new THREE.Vector3(0.022, 0.028, 0.008), new THREE.Vector3(-0.022, 0.028, 0.008)],
    });
    const sw = s.sw, list = sw.insects, t = sw.time;
    const beat = s.lod === 'far' ? 0 : 1, hindOn = s.lod === 'full';
    const wingAmp = s.mode === 'attack' || s.mode === 'alarmed' ? 0.95 : 0.8;
    let k = 0;
    for (let i = 0; i < s.active; i++) {
      const b = list[i];
      if (b.state === 2) continue;
      const h = (s.heading[i] ??= { yaw: { x: 0, v: 0 }, pitch: { x: 0, v: 0 }, roll: { x: 0, v: 0 }, lastYaw: 0 });
      // heading from the velocity (kept while it hovers still), pitch with the climb, bank into the turn
      const hv = Math.hypot(b.vx, b.vz);
      // in the attack stream (not the wrap) the heading leans toward the prey, so the stream reads as one directed flow
      // (purely visual: the flock itself is untouched)
      const stream = s.mode === 'attack' && s.target && b.rank < 0.6 && b.state === 0;
      if (hv > 0.25 || stream) {
        let want = hv > 0.25 ? Math.atan2(-b.vx, -b.vz) : h.yaw.x;
        if (stream) want += wrapAngle(Math.atan2(-(s.target.x - b.x), -(s.target.z - b.z)) - want) * STREAM_ALIGN;
        const target = h.yaw.x + wrapAngle(want - h.yaw.x);
        const before = h.yaw.x;
        critSpring(h.yaw, target, 14, dt);
        const rate = dt > 0 ? (h.yaw.x - before) / dt : 0;
        critSpring(h.roll, clamp(-rate * 0.09, -0.7, 0.7), 10, dt);
      } else critSpring(h.roll, 0, 6, dt);
      critSpring(h.pitch, clamp(Math.atan2(b.vy, Math.max(hv, 0.5)) * 0.6, -0.6, 0.6) + 0.12, 10, dt);
      const at = drawnAt(sw, b, T.at);
      T.p.set(at.x - g.position.x, at.y - g.position.y, at.z - g.position.z);
      if (b.state === 1) { h.roll.x += b.spin * dt; h.pitch.x += b.spin * 0.6 * dt; } // dropping: it tumbles
      T.e.set(h.pitch.x, h.yaw.x, h.roll.x, 'YXZ');
      T.q.setFromEuler(T.e);
      const sc = Math.max(1e-3, b.scale * b.size);
      T.sc.set(sc, sc, sc);
      T.M.compose(T.p, T.q, T.sc);
      J.body.setMatrixAt(k, T.M);
      // the abdomen: pumping as it breathes; curled under to sting (the wrap, on a 'sting' cue); limp when dropping
      const wrap = s.mode === 'attack' && b.rank >= 0.6;
      const curl = b.state === 1 ? 0.5 : (wrap && s.sting >= 0 ? Math.sin(Math.PI * s.sting / STING_TIME) * 0.9 : wrap ? 0.25 : 0);
      const breath = Math.sin(t * 7.5 + b.q1);
      const pump = 0.06 + 0.07 * breath + curl;
      T.waist.makeTranslation(0, -0.004, 0.052);
      T.R.makeRotationX(pump);
      T.L.multiplyMatrices(T.M, T.waist).multiply(T.R);
      // the breathing also swells the abdomen a touch (wider as it fills, longer as it empties), and the curl bunches it
      T.R.makeScale(1 + 0.05 * breath, 1 + 0.05 * breath, 1 - 0.03 * breath - 0.08 * curl);
      T.L.multiply(T.R);
      J.abdomen.setMatrixAt(k, T.L);
      // the wings: a stroke up and down about the body's long axis, folded back on a flower; the hind pair lags
      const slow = b.dip && Math.hypot(b.vx, b.vy, b.vz) < 0.6 ? 1 : 0;
      const fold = b.state === 1 ? 0.3 : slow;
      const stroke = beat * (1 - fold) * wingAmp * Math.sin(b.wing);
      for (let side = 0; side < 2; side++) {
        const sg = side === 0 ? 1 : -1;
        const sweep = -sg * (WING_SWEEP + fold * 1.0);
        const lift = sg * (0.2 + 0.25 * (1 - fold) + stroke);
        T.W.makeTranslation(T.fore[side].x, T.fore[side].y, T.fore[side].z);
        T.R.makeRotationZ(lift);
        T.W.multiply(T.R);
        T.R.makeRotationY(sweep);
        T.W.multiply(T.R);
        T.L.multiplyMatrices(T.M, T.W);
        (side === 0 ? J.wings.foreR : J.wings.foreL).setMatrixAt(k, T.L);
        if (hindOn) {
          const lift2 = sg * (0.16 + 0.22 * (1 - fold) + beat * (1 - fold) * wingAmp * 0.9 * Math.sin(b.wing - 0.35));
          T.W.makeTranslation(T.hind[side].x, T.hind[side].y, T.hind[side].z);
          T.R.makeRotationZ(lift2);
          T.W.multiply(T.R);
          T.R.makeRotationY(sweep * 1.1 - sg * 0.1);
          T.W.multiply(T.R);
          T.L.multiplyMatrices(T.M, T.W);
          (side === 0 ? J.wings.hindR : J.wings.hindL).setMatrixAt(k, T.L);
        }
      }
      // its own colour: a warmer or cooler, lighter or darker copy of the palette; one that drops out darkens as it fades
      const w = (b.tint - 0.5) * 2, l = 1 + 0.07 * Math.sin(b.q2), fade = b.state === 1 ? 0.55 + 0.45 * b.scale : 1;
      T.c.setRGB((1 + 0.1 * w) * l * fade, (1 + 0.03 * w) * l * fade, (1 - 0.12 * w) * l * fade);
      J.body.setColorAt(k, T.c);
      J.abdomen.setColorAt(k, T.c);
      k++;
    }
    s.drawn = k;
    for (const mesh of [J.body, J.abdomen, J.wings.foreR, J.wings.foreL]) { mesh.count = k; mesh.instanceMatrix.needsUpdate = true; }
    for (const mesh of [J.wings.hindR, J.wings.hindL]) { mesh.count = hindOn ? k : 0; mesh.instanceMatrix.needsUpdate = true; }
    if (J.body.instanceColor) J.body.instanceColor.needsUpdate = true;
    if (J.abdomen.instanceColor) J.abdomen.instanceColor.needsUpdate = true;
  }
}

/** For the browser check and the tests: what a swarm shows right now. */
export function describe(m: any) {
  const s = m?.swarm;
  if (!s) return null;
  return { mode: s.mode, lod: s.lod, active: s.active, drawn: s.drawn, flying: flyingCount(s.sw, s.active), health: s.sw.health, scatters: s.sw.scatters, frames: s.frames, cost: s.cost, seed: hash01(s.id) };
}
