// @ts-check
// The Root Serpent's renderer (ctx.render.mobModel): builds the body (model.ts) and poses it PROCEDURALLY every frame —
// no keyframed clip anywhere:
//   - FOLLOW-THE-LEADER (spine.ts): the head is the mob; every segment sits on the path the head took, at a fixed arc
//     length behind it, on the real ground (ctx.client.groundBelow per segment), bending over steps and draping over
//     ledges; the serpentine wave is laid into the track (amplitude and frequency grow with speed);
//   - BURROWED (pose 'burrowed'): the head sinks as it moves on, so the body follows it down into the soil one segment at
//     a time; under the surface only a mound of earth and roots travels over the ground (and the server's spray of soil);
//     'surface' bursts the head out with an overshoot, and the body pulls itself out of the hole after it;
//   - 'rear': the head rises and draws back over an S-coil of the neck (an under-damped spring: it overshoots and
//     settles), the jaw gapes; 'strike': the head and neck are thrown forward along the heading (a fast spring that
//     overshoots) with the jaw wide, then snap back;
//   - 'rattle': the tail lifts and buzzes; pose 'coil': the body wraps around the player in a helix, head first (each
//     segment blends from its track onto the helix with a delay), turning slowly; 'squeeze' tightens it with a pulse;
//   - the jaw, a flicking forked tongue, the sap in the cracks glowing softly (a slow pulse, brighter when it strikes or
//     squeezes, dim under the ground); the RED EYES follow the DAYLIGHT (ctx.client.daylight()): a deep, quiet red by day,
//     at full ember with an additive halo behind each as the light goes (nightEyes), a very slow pulse, never a flicker;
//   - death (frame.dying, DEATH_MS): the body goes limp and settles to the ground segment by segment, head first,
//     rolling onto its side; the glow goes out.
// LOD by distance to the camera: 'full' (<= 24 blocks: ground per segment), 'simple' (<= 64: the recorded heights, no
// ground queries), 'none' (no springs, no tongue/rattle detail).
import { buildSerpent } from './model.ts';
import { BODY } from './tuning.ts';
import {
  coilPoint, coilWeight, createSpine, deathSettle, jawOpen, rattleLayer, rearLayer, rearPitch, segmentRadius, stepSpine,
} from './spine.ts';
import { clamp, critSpring, dampedSpring, hash01, lerp, smoothstep, spring, wrapAngle } from '../goblin/procedural.ts';

export const DEATH_MS = 2400;
export const LOD_FULL = 24, LOD_SIMPLE = 64;
export const lodFor = (dist: number) => (dist <= LOD_FULL ? 'full' : dist <= LOD_SIMPLE ? 'simple' : 'none');

function newState(id: number) {
  return {
    id, time: hash01(id * 5 + 1) * 20, phase: hash01(id * 5 + 2) * Math.PI * 2,
    spine: createSpine(), lod: 'full',
    sink: spring(0), rear: spring(0), ext: spring(0), coil: spring(0), squeeze: spring(0), flinch: spring(0), headYaw: spring(0),
    rearUntil: -1, strikeT: -1, rattleT: 0, hiss: 0, turn: hash01(id * 5 + 3) * Math.PI * 2,
    frames: 0, cost: 0, dead: null as any,
    pts: [] as Array<{ x: number, y: number, z: number }>, // the drawn parts this frame (head first), world space
  };
}

export class SerpentRenderer {
  deathMs = DEATH_MS;
  _client: any = null;
  stats = { frames: 0, ms: 0, queries: 0 }; // read by the browser check
  /** @param {any} client ctx.client (the browser's view of the world) */
  constructor(client: any) {
    this._client = client;
  }

  build(kit: any) { return buildSerpent(kit); }

  // the server's cues (e.mob.cue)
  cue(m: any, name: string) {
    const s = (m.serpent ??= newState(m.id));
    if (name === 'rattle') s.rattleT = 1.5;
    else if (name === 'rear') { s.rearUntil = s.time + 1.3; s.hiss = 1; }
    else if (name === 'strike') { s.strikeT = 0; s.rearUntil = s.time + 0.32; }
    else if (name === 'surface') { s.sink.v -= 2.5; s.hiss = 0.6; }
    else if (name === 'squeeze') s.squeeze.v += 7;
    else if (name === 'release') { s.squeeze.v -= 2; }
  }

  #cam() {
    try { return this._client?.player?.() ?? null; } catch { return null; }
  }

  #ground(x: number, y: number, z: number) {
    try { return this._client.groundBelow(x, y, z, 6); } catch { return null; }
  }

  /** The world's daylight (0 night .. 1 noon), as the sky reports it; 1 when the client does not say. */
  #daylight() {
    try { const d = this._client?.daylight?.(); return typeof d === 'number' && Number.isFinite(d) ? clamp(d, 0, 1) : 1; } catch { return 1; }
  }

  animate(m: any, frame: any) {
    const t0 = performance.now();
    const J = m.model.joints;
    if (!J) return;
    const s = (m.serpent ??= newState(m.id));
    const dt = clamp(frame.dt, 1e-4, 0.1);
    s.time += dt; s.frames++;
    const g = m.model.group, pos = g.position, yaw = g.rotation.y, scale = g.scale.x || 1;
    // the world container: the group's yaw cancelled, so everything below is placed in world offsets from the mob
    J.world.rotation.y = -yaw;
    J.world.scale.setScalar(1 / scale);
    if (frame.dying !== undefined) { this.#die(m, s, J, frame.dying, dt); return; }

    const cam = this.#cam();
    const dist = cam ? Math.hypot(cam.x - pos.x, cam.y - pos.y, cam.z - pos.z) : 0;
    const lod = lodFor(dist);
    s.lod = lod;
    const pose = m.pose ?? null;

    // ---- under the soil: the head sinks (softly) as it moves on; coming up it bursts out and overshoots
    const down = pose === 'burrowed';
    dampedSpring(s.sink, down ? BODY.sink : 0, down ? 4.2 : 7, down ? 1 : 0.42, dt);
    s.sink.x = clamp(s.sink.x, -0.35, BODY.sink + 0.1);
    const sp = stepSpine(s.spine, { x: pos.x, y: pos.y, z: pos.z, yaw, dt, lod, sink: Math.max(0, s.sink.x), ground: (x: number, y: number, z: number) => this.#ground(x, y, z) });
    this.stats.queries += sp.queries;

    // ---- the layers' springs
    dampedSpring(s.rear, s.time < s.rearUntil ? 1 : 0, 11, 0.42, dt);
    if (s.strikeT >= 0) { s.strikeT += dt; if (s.strikeT > 0.9) s.strikeT = -1; }
    dampedSpring(s.ext, s.strikeT >= 0 && s.strikeT < 0.16 ? 1 : 0, 24, 0.36, dt);
    s.rattleT = Math.max(0, s.rattleT - dt);
    const rattle = smoothstep(s.rattleT / 0.3);
    critSpring(s.coil, pose === 'coil' ? 1 : 0, pose === 'coil' ? 6 : 4, dt);
    dampedSpring(s.squeeze, 0, 13, 0.3, dt);
    critSpring(s.flinch, (m.flash ?? 0) > 0 ? 1 : 0, 25, dt);
    s.hiss = Math.max(0, s.hiss - dt * 0.9);
    s.turn += dt * 0.35 * s.coil.x;
    const coil = s.coil.x, squeeze = clamp(s.squeeze.x, 0, 1.4);

    // ---- every part's world position: the track + the layers
    const n = sp.n, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const centre = { x: pos.x, y: pos.y, z: pos.z };
    const pts = s.pts;
    pts.length = n + 1;
    const place = (k: number, base: { x: number, y: number, z: number }, i: number) => {
      const L = rearLayer(i, s.rear.x, s.ext.x);
      let x = base.x + fx * L.fwd + rx * L.side, y = base.y + L.up, z = base.z + fz * L.fwd + rz * L.side;
      if (i >= 0 && lod !== 'none') {
        const R = rattleLayer(i, n, rattle, s.time);
        const sg = sp.segs[i];
        x += -sg.fz * R.side; z += sg.fx * R.side; y += R.up;
      }
      // the flinch: a sideways jerk of the front half when it is hit
      const fl = s.flinch.x * 0.08 * (i < 0 ? 1 : Math.max(0, 1 - i / 8));
      x += rx * fl; z += rz * fl;
      const cw = coilWeight(i < 0 ? -1 : i, n, coil);
      if (cw > 0) {
        const cp = coilPoint(i < 0 ? -1.3 : i, n, centre, squeeze, s.turn);
        x = lerp(x, cp.x, cw); y = lerp(y, cp.y, cw); z = lerp(z, cp.z, cw);
      }
      const p = (pts[k] ??= { x: 0, y: 0, z: 0 });
      p.x = x; p.y = y; p.z = z;
    };
    place(0, sp.head, -1);
    for (let i = 0; i < n; i++) place(i + 1, sp.segs[i], i);

    // ---- the segments: placed, aimed from the one behind to the one ahead, hidden when wholly under the soil
    const breath = lod === 'none' ? 0 : 0.02;
    for (let i = 0; i < n; i++) {
      const jt = J.segs[i], p = pts[i + 1], ahead = pts[i], behind = pts[Math.min(n, i + 2)];
      jt.seg.position.set(p.x - pos.x, p.y - pos.y, p.z - pos.z);
      const dx = ahead.x - behind.x, dy = ahead.y - behind.y, dz = ahead.z - behind.z, h = Math.hypot(dx, dz);
      jt.seg.rotation.set(Math.atan2(dy, Math.max(h, 1e-4)), h > 1e-5 ? Math.atan2(-dx, -dz) : jt.seg.rotation.y, 0);
      // the roots BANK into a bend (a slight roll towards the inside of the turn, read from the headings on each side of
      // the segment), so the spiral of strands twists with the body; and the body breathes, a slow 2% swell down the chain
      const ya = Math.atan2(-(ahead.x - p.x), -(ahead.z - p.z)), yb = Math.atan2(-(p.x - behind.x), -(p.z - behind.z));
      jt.body.rotation.z = h > 1e-3 ? clamp(wrapAngle(ya - yb) * 0.45, -0.3, 0.3) * (1 - coil) : 0;
      const swell = 1 + breath * Math.sin(s.time * 1.7 + s.phase - i * 0.45);
      jt.body.scale.x = swell; jt.body.scale.y = swell;
      // stretched along its length when its neighbours are farther apart than the spacing (down a steep drape, around the
      // coil), so the body never shows gaps
      jt.body.scale.z = clamp(Math.hypot(dx, dy, dz) / (2 * BODY.spacing), 1, 2.4);
      const sunk = sp.segs[i].sink * (1 - coil);
      jt.seg.visible = sunk < 2 * jt.r + 0.08;
    }

    // ---- the head: aimed along the neck (or at the player it coils around), pitched by the rear and the strike
    const hp = pts[0], s0 = pts[1];
    J.head.position.set(hp.x - pos.x, hp.y - pos.y, hp.z - pos.z);
    let hy = Math.atan2(-(hp.x - s0.x), -(hp.z - s0.z));
    let hpch = Math.atan2(hp.y - s0.y, Math.max(1e-4, Math.hypot(hp.x - s0.x, hp.z - s0.z)));
    if (s.rear.x > 0.02 || s.ext.x > 0.02) { hy = yaw + wrapAngle(hy - yaw) * 0.3; hpch = rearPitch(s.rear.x, s.ext.x); }
    if (coil > 0.02) { // coiled: it faces the player's head, from beside it
      const face = Math.atan2(-(centre.x - hp.x), -(centre.z - hp.z));
      hy = hy + wrapAngle(face - hy) * coil;
      hpch = lerp(hpch, -0.15, coil);
    }
    critSpring(s.headYaw, wrapAngle(hy - s.headYaw.x) + s.headYaw.x, 18, dt);
    J.head.rotation.set(hpch, s.headYaw.x, 0);
    J.head.visible = s.sink.x < 0.42 || coil > 0.5;

    // ---- the jaw and the tongue
    const open = jawOpen(s.rear.x, s.ext.x, coil, s.hiss, s.time + s.phase);
    J.jaw.rotation.x = -1.05 * open; // wide: ~60 degrees at a full gape
    const flick = lod === 'none' ? 0 : tongueFlick(s.id, s.time, open);
    J.tongue.scale.z = Math.max(0.01, flick);
    J.tongue.rotation.y = 0.25 * Math.sin(s.time * 31) * flick;
    J.tongue.visible = flick > 0.02;

    // ---- the glow: a slow pulse of the sap; brighter when it strikes or squeezes, dim under the soil. The eyes follow
    // the daylight: quiet by day, at full ember with their halos at night (a very slow pulse, never a flicker)
    const pulse = 0.5 + 0.14 * Math.sin(s.time * 1.25 + s.phase);
    const rage = clamp(s.rear.x + s.ext.x + coil * 0.8 + squeeze * 0.5, 0, 1);
    const buried = clamp(s.sink.x / BODY.sink, 0, 1);
    const E = nightEyes(this.#daylight(), s.time + s.phase, rage, buried);
    setGlow(J, (pulse + 0.25 * rage) * (1 - 0.6 * buried), E.eye, E.halo);

    // ---- the mound: churned soil heaving over the ground where the buried head travels; it rocks and pitches forward as
    // the soil is pushed up ahead of the head
    const mv = down && s.sink.x > 0.55;
    J.mound.visible = mv;
    if (mv) {
      const sg = sp.head, v = clamp(sp.speed, 0, 3), wob = Math.sin(s.time * 9 + s.phase) * 0.03 * v;
      J.mound.position.set(sg.x - pos.x, -0.04 + wob, sg.z - pos.z); // on the surface it travels under (the mob's feet)
      J.mound.rotation.order = 'YXZ';
      J.mound.rotation.set(-0.12 * (v / 3) + 0.06 * Math.sin(s.time * 11), sg.yaw + Math.sin(s.time * 3) * 0.2, 0.08 * Math.sin(s.time * 5.5 + s.phase) * (v / 3));
      const k = 0.75 + 0.25 * clamp(sp.speed / 3, 0, 1);
      J.mound.scale.set(k, k * (0.8 + 0.25 * Math.abs(Math.sin(s.time * 7))), k * 1.2);
    }
    const spent = performance.now() - t0;
    this.stats.frames++; this.stats.ms += spent; s.cost += spent;
  }

  // The death: limp, settling to the ground segment by segment (head first), rolling onto its side; the glow goes out.
  #die(m: any, s: any, J: any, t: number, dt: number) {
    const g = m.model.group, pos = g.position, n = J.segs.length;
    if (!s.dead) {
      // where every part was when it died, and the ground under it
      const sp = s.spine;
      s.dead = { from: s.pts.map((p: any) => ({ ...p })), ground: [sp.head.g, ...sp.segs.map((q: any) => q.g)], yaw: J.head.rotation.y, pitch: J.head.rotation.x };
      if (s.dead.from.length !== n + 1) s.dead.from = [sp.head, ...sp.segs].map((p: any) => ({ x: p.x, y: p.y, z: p.z }));
    }
    const D = s.dead;
    const parts = [];
    for (let k = 0; k <= n; k++) {
      const i = k - 1, f = D.from[k], gy = (D.ground[k] ?? f.y) + (i < 0 ? 0.1 : segmentRadius(i, n) * 0.75);
      const d = deathSettle(i, n, t);
      parts.push({ x: f.x, y: lerp(f.y, gy, d.fall), z: f.z, roll: d.roll, slack: d.slack }); // fall > 1 is the small bounce
    }
    for (let i = 0; i < n; i++) {
      const jt = J.segs[i], p = parts[i + 1], a = parts[i], b = parts[Math.min(n, i + 2)];
      jt.seg.visible = true;
      jt.seg.position.set(p.x - pos.x, p.y - pos.y, p.z - pos.z);
      const dx = a.x - b.x, dz = a.z - b.z, h = Math.hypot(dx, dz);
      jt.seg.rotation.set(Math.atan2(a.y - b.y, Math.max(h, 1e-4)) * (1 - p.slack), h > 1e-5 ? Math.atan2(-dx, -dz) : jt.seg.rotation.y, 0);
      jt.body.rotation.z = p.roll;
      jt.body.scale.x = 1; jt.body.scale.y = 1; // the breathing stops
      jt.body.scale.z = clamp(Math.hypot(dx, a.y - b.y, dz) / (2 * BODY.spacing), 1, 2.4);
    }
    const hp = parts[0];
    J.head.visible = true;
    J.head.position.set(hp.x - pos.x, hp.y - pos.y, hp.z - pos.z);
    J.head.rotation.set(D.pitch * (1 - hp.slack) - 0.1 * hp.slack, D.yaw, hp.roll * 0.9);
    J.jaw.rotation.x = -0.55 * smoothstep(t / 0.5);
    J.tongue.visible = false;
    J.mound.visible = false;
    // a last weak buzz of the rattle, then still
    J.rattle.rotation.y = 0.3 * Math.sin(t * 90) * Math.max(0, 1 - t / 0.6);
    const E = nightEyes(this.#daylight(), 0, 0, 0);
    setGlow(J, 0.8 * (1 - smoothstep(t / 1.6)), E.eye * (1 - smoothstep(t / 1.2)), E.halo * (1 - smoothstep(t / 1.0)));
    void dt;
  }
}

/** The tongue's reach (0..1): a quick double flick every few seconds on a per-serpent schedule; never while the jaw gapes. */
export function tongueFlick(id: number, time: number, open: number) {
  if (open > 0.35) return 0;
  const slot = Math.floor(time / 2.7), local = time - slot * 2.7;
  if (hash01(id * 13 + slot) < 0.3) return 0;
  const start = hash01(id * 17 + slot) * 1.9;
  const u = (local - start) / 0.5;
  if (u < 0 || u > 1) return 0;
  return Math.max(0, Math.sin(u * Math.PI * 2)) ** 0.6; // out, in, out, in
}

/** How much of the night the eyes feel (0 by day .. 1 in the dark) for a daylight of `d`. The overworld sky never reports
 * less than 0.4 (its night floor; a storm takes it a little lower) and 1 at noon: nothing above ~0.85, everything at or
 * below 0.45, smooth between (dusk brings them up gently). */
export const nightLevel = (d: number) => 1 - smoothstep((d - 0.45) / 0.4);

/** The eyes' levels for a daylight `d`: `eye` the brightness of the red core and its slit (0..1 of the palette: a quiet
 * ~0.55 by day, ~1 at night, a little more when it rages), `halo` the opacity of the additive halo behind each (0 by day,
 * ~0.5..0.7 at night, up to 0.8 raging, less while buried). `t` is the serpent's own time: a very slow pulse (one wave
 * every ~6 s), so it breathes but never flickers. */
export function nightEyes(d: number, t: number, rage: number, buried: number) {
  const night = nightLevel(d);
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.05); // 0..1, ~0.17 Hz
  const eye = clamp(0.55 + 0.45 * night * (0.88 + 0.12 * pulse) + 0.2 * rage, 0, 1);
  const halo = clamp(night * (0.6 + 0.1 * pulse) * (0.8 + 0.2 * rage) * (1 - 0.7 * clamp(buried, 0, 1)), 0, 0.8);
  return { night, eye, halo };
}

// the unlit parts' brightness: `sap` scales the cracks and the throat, `eye` the eyes' core and slit (copies of the
// palette, never brighter), `halo` the opacity of the additive halo sprite behind each eye (hidden when nothing shows)
function setGlow(J: any, sap: number, eye: number, halo: number) {
  const G = J.glow;
  G.sap.color.copy(G.base.sap).multiplyScalar(clamp(sap, 0, 1));
  G.throat.color.copy(G.base.throat).multiplyScalar(clamp(sap * 0.8, 0, 1));
  G.eye.color.copy(G.base.eye).multiplyScalar(clamp(eye, 0, 1));
  G.eyeSlit.color.copy(G.base.eyeSlit).multiplyScalar(clamp(0.6 + 0.4 * eye, 0, 1));
  const op = clamp(halo, 0, 1);
  for (const h of J.halos ?? []) { h.material.opacity = op; h.visible = op > 0.02; }
}
