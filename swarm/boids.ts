// @ts-check
// The Sting Swarm's FLOCK, as pure math (no THREE, no game code): the server knows ONE mob (the swarm's centre); the
// browser draws 24-36 small insects around it and this file moves them. Every insect is a boid — separation, alignment
// and cohesion with its neighbours — held by a damped spring to a SLOT whose layout is the swarm's SHAPE, and the shape
// follows the server's state (the mob's pose):
//   idle     a loose, flattened cloud drifting and swirling slowly over the meadow; now and then an insect leaves it to
//            DIP to a flower (or to the grass under the cloud), hovers there a moment and comes back;
//   calm     the same cloud, looser, no dips (it is settling after a chase);
//   alarmed  a TIGHT ball that swirls fast, a little higher (the buzz rises with it);
//   attack   a STREAM: most insects strung along the line from the centre to the prey's chest (a wave running down it, so
//            it reads as an arrow), the front of it WRAPPED around the prey's body (orbiting rings, head to waist);
//   flee     a wide, fast cloud (smoke or fire: it breaks up and keeps away).
// Events: scatter() — a HIT: every insect is flung outward and the slots let go of them for SCATTER_HOLD s, then the
// spring comes back over REFORM s (the cloud re-forms); kill() — death: they all burst outward and wink out one by one.
// The COUNT follows the health: setHealth(h) drops insects (they fall, spin and fade) down to ceil(n * h).
// The step is FIXED (SIM_DT) with an accumulator and the drawn position is interpolated between the last two steps, so the
// motion is the same at 30 or 144 fps; every random draw comes from a generator seeded by the mob id (deterministic).
// Insects never end a step inside a solid block: env.solid(x, y, z) is asked per axis and a blocked axis bounces.

export const SIM_DT = 1 / 60;
export const MAX_STEPS = 8; // a long frame (a tab in the background) never runs more than this many steps
export const MAX_INSECTS = 36;
export const SCATTER_HOLD = 0.45; // s: after a hit, the slots let go this long
export const REFORM = 1.1; // s: then the spring comes back over this long
export const DROP_TIME = 1.1; // s: a dropped insect falls and fades this long
export const DEATH_TIME = 2.0; // s: the last one is gone by then
export const RADIUS = Object.freeze({ idle: 1.5, calm: 1.9, alarmed: 0.75, attack: 0.8, flee: 3.0, dead: 0 });
export const WING_HZ = Object.freeze({ idle: 15, calm: 15, alarmed: 21, attack: 24, flee: 23, dead: 9 });
export const MAX_SPEED = Object.freeze({ idle: 3, calm: 3, alarmed: 5, attack: 8.5, flee: 7, dead: 9 });
const WRAP_FRAC = 0.4; // the share of the insects that wraps the prey in an attack (the rest is the stream)
const SEP_R = 0.24, NEAR_R = 0.75;

export type Vec = { x: number, y: number, z: number };
export type Env = {
  cx: number, cy: number, cz: number, // the swarm's centre (world)
  mode?: string, // the server's pose: idle | calm | alarmed | attack | flee
  target?: Vec | null, // the prey's chest (attack)
  solid?: ((x: number, y: number, z: number) => boolean) | null,
  flowers?: Vec[] | null, // flower cells near the cloud (their centres): where the dips go
  ground?: number | null, // the ground's top under the centre: dips without flowers go there
  active?: number, // how many insects are simulated and drawn (the LOD)
};

/** A small, fast seeded generator (mulberry32): the same seed, the same sequence. */
export function rng(seed: number) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (t: number) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

function newInsect(r: () => number, i: number, rank: number) {
  // a point in the unit ball (rejection), flattened: the cloud is wider than it is tall
  let ux = 0, uy = 0, uz = 0;
  do { ux = r() * 2 - 1; uy = r() * 2 - 1; uz = r() * 2 - 1; } while (ux * ux + uy * uy + uz * uz > 1 || ux * ux + uy * uy + uz * uz < 0.05);
  return {
    i, rank, // rank: its place in the stream / the wrap (a shuffled 0..1)
    x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0,
    ux, uy: uy * 0.6, uz, // its slot in the cloud (unit)
    swirl: (r() < 0.5 ? -1 : 1) * (0.25 + r() * 0.35), // rad/s around the centre
    f1: 0.7 + r() * 1.3, f2: 0.9 + r() * 1.5, f3: 0.6 + r() * 1.2, // its own wander (Hz-ish)
    q1: r() * 6.283, q2: r() * 6.283, q3: r() * 6.283,
    wing: r() * 6.283, // the wing beat's phase
    wingK: 0.9 + r() * 0.2, // its own beat, a little faster or slower
    tint: r(), // the colour variation the renderer applies (0..1)
    size: 0.9 + r() * 0.22,
    state: 0, // 0 flying, 1 dropping (falling + fading), 2 gone
    dropT: 0, spin: 0,
    dip: null as Vec | null, dipT: 0, nextDip: 2 + r() * 10,
    dieAt: 0, // death: when it winks out (s after kill)
    scale: 1,
  };
}
export type Insect = ReturnType<typeof newInsect>;

/** A new swarm of `n` insects (MAX_INSECTS by default) around (cx, cy, cz), seeded by `seed` (the mob id). */
export function createSwarm(seed: number, n = MAX_INSECTS, cx = 0, cy = 0, cz = 0) {
  const r = rng(seed * 2654435761);
  n = clamp(Math.floor(n), 1, 64);
  // a shuffled rank, so the insects dropped first (the highest index) are spread over the whole shape
  const ranks = Array.from({ length: n }, (_, i) => (i + 0.5) / n);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ranks[i], ranks[j]] = [ranks[j], ranks[i]]; }
  const insects = ranks.map((rank, i) => newInsect(r, i, rank));
  for (const b of insects) {
    b.x = b.px = cx + b.ux * 0.6; b.y = b.py = cy + b.uy * 0.6; b.z = b.pz = cz + b.uz * 0.6;
  }
  return {
    seed, n, r, insects, time: 0, acc: 0, alpha: 0, steps: 0,
    mode: 'idle', modeT: 0, scatterT: -1, scatters: 0, health: 1, dead: -1,
    cx, cy, cz, vcx: 0, vcy: 0, vcz: 0, init: false,
  };
}
export type Swarm = ReturnType<typeof createSwarm>;

/** A HIT: every flying insect is flung outward; the shape lets go for SCATTER_HOLD and re-forms over REFORM. */
export function scatter(sw: Swarm, strength = 1) {
  if (sw.dead >= 0) return;
  sw.scatterT = 0; sw.scatters++;
  for (const b of sw.insects) {
    if (b.state !== 0) continue;
    let dx = b.x - sw.cx + (sw.r() - 0.5) * 0.6, dy = b.y - sw.cy + (sw.r() - 0.3) * 0.6, dz = b.z - sw.cz + (sw.r() - 0.5) * 0.6;
    const d = Math.hypot(dx, dy, dz) || 1;
    dx /= d; dy /= d; dz /= d;
    const s = (4.2 + sw.r() * 3.2) * strength;
    b.vx += dx * s; b.vy += dy * s * 0.7 + 0.8; b.vz += dz * s;
    b.dip = null; b.dipT = 0;
  }
}

/** Death: they all burst outward and wink out one by one within DEATH_TIME. */
export function kill(sw: Swarm) {
  if (sw.dead >= 0) return;
  scatter(sw, 0.8);
  sw.dead = 0;
  sw.mode = 'dead';
  for (const b of sw.insects) b.dieAt = 0.35 + sw.r() * (DEATH_TIME - 0.75);
}

/** How many insects fly at health h (0..1): ceil(n * h), at least one while it lives. */
export const countFor = (n: number, h: number) => (h <= 0 ? 0 : clamp(Math.ceil(n * clamp(h, 0, 1) - 1e-9), 1, n));

/** The health (0..1) changed: insects drop out (fall and fade) down to countFor(n, h); healed, the gone ones come back. */
export function setHealth(sw: Swarm, h: number) {
  if (!Number.isFinite(h)) return;
  sw.health = clamp(h, 0, 1);
}

function syncCount(sw: Swarm) {
  if (sw.dead >= 0) return;
  const want = countFor(sw.n, sw.health);
  let flying = 0;
  for (const b of sw.insects) if (b.state === 0) flying++;
  // drop the highest indices first; bring back the lowest gone ones first
  for (let i = sw.n - 1; i >= 0 && flying > want; i--) {
    const b = sw.insects[i];
    if (b.state === 0) { b.state = 1; b.dropT = 0; b.spin = (sw.r() - 0.5) * 30; flying--; }
  }
  for (let i = 0; i < sw.n && flying < want; i++) {
    const b = sw.insects[i];
    if (b.state === 2) {
      b.state = 0; b.scale = 0.05; flying++;
      b.x = b.px = sw.cx + b.ux * 0.3; b.y = b.py = sw.cy + b.uy * 0.3; b.z = b.pz = sw.cz + b.uz * 0.3;
      b.vx = b.vy = b.vz = 0;
    }
  }
}

/** The slot of insect b in the current shape (world). */
export function slotOf(sw: Swarm, b: Insect, env: Env, out: Vec) {
  const t = sw.time, mode = sw.mode;
  const cx = sw.cx, cy = sw.cy, cz = sw.cz;
  if (mode === 'attack' && env.target) {
    const T = env.target;
    if (b.rank >= 1 - WRAP_FRAC) {
      // the wrap: rings around the prey's body, from the head down to the waist, orbiting
      const k = (b.rank - (1 - WRAP_FRAC)) / WRAP_FRAC; // 0..1
      const a = k * 6.283 * 3.7 + t * (2.6 + k) * (b.swirl > 0 ? 1 : -1);
      const rad = 0.5 + 0.12 * Math.sin(t * 3 + b.q1);
      out.x = T.x + Math.cos(a) * rad;
      out.y = T.y - 0.75 + 1.35 * ((k * 5.3) % 1) + 0.1 * Math.sin(t * 4 + b.q2);
      out.z = T.z + Math.sin(a) * rad;
      return out;
    }
    // the stream: strung along centre -> prey, a wave running down it toward the prey
    const s = b.rank / (1 - WRAP_FRAC); // 0..1 along the line
    const dx = T.x - cx, dy = T.y - cy, dz = T.z - cz;
    const L = Math.hypot(dx, dz) || 1;
    const px = -dz / L, pz = dx / L; // horizontal perpendicular
    const w = 0.28 * (1 - 0.6 * s) * Math.sin(t * 7 - s * 9 + b.q1);
    const w2 = 0.18 * (1 - 0.6 * s) * Math.sin(t * 5.3 - s * 7 + b.q2);
    out.x = cx + dx * s + px * w;
    out.y = cy + dy * s + w2;
    out.z = cz + dz * s + pz * w;
    return out;
  }
  const R = mode === 'attack' ? RADIUS.attack : (RADIUS as any)[mode] ?? RADIUS.idle;
  const lift = mode === 'alarmed' || mode === 'attack' ? 0.25 : 0;
  const spin = (mode === 'alarmed' || mode === 'attack' ? 4.2 : mode === 'flee' ? 1.5 : 1) * b.swirl;
  const a = t * spin;
  const c = Math.cos(a), s = Math.sin(a);
  const breathe = 1 + 0.12 * Math.sin(t * 0.8 + b.q3);
  out.x = cx + (b.ux * c - b.uz * s) * R * breathe;
  out.y = cy + lift + b.uy * R * breathe;
  out.z = cz + (b.ux * s + b.uz * c) * R * breathe;
  return out;
}

const _slot: Vec = { x: 0, y: 0, z: 0 };

function chooseDip(sw: Swarm, b: Insect, env: Env) {
  const fl = env.flowers;
  if (fl && fl.length) {
    const f = fl[Math.floor(sw.r() * fl.length) % fl.length];
    b.dip = { x: f.x + (sw.r() - 0.5) * 0.25, y: f.y + 0.05 + sw.r() * 0.2, z: f.z + (sw.r() - 0.5) * 0.25 };
  } else if (Number.isFinite(env.ground as number)) {
    b.dip = { x: sw.cx + (sw.r() - 0.5) * 2.4, y: (env.ground as number) + 0.3 + sw.r() * 0.2, z: sw.cz + (sw.r() - 0.5) * 2.4 };
  } else return;
  b.dipT = 1.2 + sw.r() * 1.4;
}

/** Can it stand at (x, y, z)? (no solid test given: anywhere) */
const free = (env: Env, x: number, y: number, z: number) => { try { return !env.solid || !env.solid(x, y, z); } catch { return true; } };

function stepOnce(sw: Swarm, h: number, env: Env) {
  const list = sw.insects, mode = sw.mode, active = clamp(env.active ?? sw.n, 1, sw.n);
  sw.time += h; sw.modeT += h; sw.steps++;
  if (sw.scatterT >= 0) { sw.scatterT += h; if (sw.scatterT > SCATTER_HOLD + REFORM) sw.scatterT = -1; }
  if (sw.dead >= 0) sw.dead += h;
  // how much the shape pulls: none while scattered, coming back smoothly
  const hold = sw.dead >= 0 ? 0 : sw.scatterT < 0 ? 1 : sw.scatterT < SCATTER_HOLD ? 0 : smooth((sw.scatterT - SCATTER_HOLD) / REFORM);
  const ks = (mode === 'attack' ? 14 : mode === 'alarmed' ? 11 : 6) * hold;
  const kd = 2 * Math.sqrt(Math.max(ks, 1)) * 0.75 + (hold < 1 ? 1.6 : 0); // a little extra drag while scattered
  const kSep = 26, kAl = mode === 'attack' ? 2.2 : 1.2, kCo = mode === 'alarmed' ? 1.6 : 0.7;
  const kN = mode === 'idle' || mode === 'calm' ? 3.2 : mode === 'flee' ? 6 : 4.5;
  const vmax = (MAX_SPEED as any)[mode] ?? 4;
  const t = sw.time;
  for (let i = 0; i < active; i++) {
    const b = list[i];
    b.px = b.x; b.py = b.y; b.pz = b.z;
    b.wing += h * 6.283 * ((WING_HZ as any)[mode] ?? 15) * b.wingK;
    if (b.state === 2) continue;
    if (b.state === 1 || (sw.dead >= 0 && sw.dead >= b.dieAt)) {
      // dropping out (or winking out at death): falls, tumbles, shrinks
      if (b.state !== 1) { b.state = 1; b.dropT = 0; b.spin = (sw.r() - 0.5) * 30; }
      b.dropT += h;
      b.vy -= (sw.dead >= 0 ? 4 : 9) * h;
      b.vx *= Math.exp(-1.5 * h); b.vz *= Math.exp(-1.5 * h);
      const limit = sw.dead >= 0 ? 0.45 : DROP_TIME;
      b.scale = clamp(1 - b.dropT / limit, 0, 1);
      move(b, h, env);
      if (b.dropT >= limit) b.state = 2;
      continue;
    }
    if (b.scale < 1) b.scale = Math.min(1, b.scale + h * 2);
    let ax = 0, ay = 0, az = 0;
    // ---- the shape's slot (or a flower to dip to)
    if (mode === 'idle' && hold === 1 && sw.dead < 0) {
      if (b.dip) { b.dipT -= h; if (b.dipT <= 0) { b.dip = null; b.nextDip = 3 + sw.r() * 9; } }
      else { b.nextDip -= h; if (b.nextDip <= 0) { chooseDip(sw, b, env); if (!b.dip) b.nextDip = 4; } }
    } else if (b.dip) { b.dip = null; b.nextDip = 3 + sw.r() * 6; }
    const slot = b.dip ?? slotOf(sw, b, env, _slot);
    const kk = b.dip ? 9 * hold : ks;
    ax += kk * (slot.x - b.x); ay += kk * (slot.y - b.y); az += kk * (slot.z - b.z);
    // damping relative to the centre's own motion: the cloud keeps up with the mob instead of trailing behind it
    ax -= kd * (b.vx - sw.vcx); ay -= kd * (b.vy - sw.vcy); az -= kd * (b.vz - sw.vcz);
    // ---- the boids: separation, alignment, cohesion
    let sx = 0, sy = 0, sz = 0, avx = 0, avy = 0, avz = 0, acx = 0, acy = 0, acz = 0, nn = 0;
    for (let j = 0; j < active; j++) {
      if (j === i) continue;
      const o = list[j];
      if (o.state !== 0) continue;
      const dx = b.x - o.x, dy = b.y - o.y, dz = b.z - o.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > NEAR_R * NEAR_R) continue;
      const d = Math.sqrt(d2) || 1e-4;
      if (d < SEP_R) { const k = (1 - d / SEP_R) / d; sx += dx * k; sy += dy * k; sz += dz * k; }
      avx += o.vx; avy += o.vy; avz += o.vz; acx += o.x; acy += o.y; acz += o.z; nn++;
    }
    ax += kSep * sx; ay += kSep * sy; az += kSep * sz;
    if (nn) {
      ax += kAl * (avx / nn - b.vx) * hold + kCo * (acx / nn - b.x) * hold;
      ay += kAl * (avy / nn - b.vy) * hold + kCo * (acy / nn - b.y) * hold;
      az += kAl * (avz / nn - b.vz) * hold + kCo * (acz / nn - b.z) * hold;
    }
    // ---- its own wander (smooth, deterministic)
    const dipCalm = b.dip ? 0.35 : 1;
    ax += kN * dipCalm * Math.sin(t * b.f1 + b.q1);
    ay += kN * dipCalm * 0.6 * Math.sin(t * b.f2 + b.q2);
    az += kN * dipCalm * Math.sin(t * b.f3 + b.q3);
    b.vx += ax * h; b.vy += ay * h; b.vz += az * h;
    const sp = Math.hypot(b.vx, b.vy, b.vz), cap = hold < 1 ? Math.max(vmax, 9) : vmax;
    if (sp > cap) { const k = cap / sp; b.vx *= k; b.vy *= k; b.vz *= k; }
    move(b, h, env);
  }
}

// Integrate one step and never END inside a solid block: each axis is tried alone; a blocked axis bounces back softly.
function move(b: Insect, h: number, env: Env) {
  if (!env.solid) { b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h; return; }
  if (!free(env, b.x, b.y, b.z)) {
    // it started inside (a block was placed on it, or the mob came through a wall): out upward, a cell at a time; buried
    // deeper than that, it goes back to the swarm's centre
    let out = false;
    for (let k = 1; k <= 3 && !out; k++) if (free(env, b.x, Math.floor(b.y) + k + 0.05, b.z)) { b.y = Math.floor(b.y) + k + 0.05; out = true; }
    if (!out && free(env, env.cx, env.cy, env.cz)) { b.x = env.cx; b.y = env.cy; b.z = env.cz; b.vx = b.vz = 0; }
    b.vy = Math.max(b.vy, 0);
    return;
  }
  const nx = b.x + b.vx * h;
  if (free(env, nx, b.y, b.z)) b.x = nx; else b.vx *= -0.3;
  const ny = b.y + b.vy * h;
  if (free(env, b.x, ny, b.z)) b.y = ny; else b.vy *= -0.3;
  const nz = b.z + b.vz * h;
  if (free(env, b.x, b.y, nz)) b.z = nz; else b.vz *= -0.3;
}

/**
 * Advance the swarm by a frame of `dt` seconds (any length; fixed SIM_DT steps inside) toward `env`. Returns the
 * interpolation factor the renderer draws with (alpha: 0..1 between each insect's previous and current step).
 */
export function stepSwarm(sw: Swarm, dt: number, env: Env) {
  if (!(dt > 0) || !Number.isFinite(dt)) dt = 0;
  // the centre: followed every frame; a long jump (a teleport) carries the whole cloud along
  if (!sw.init) { // the first frame: the cloud is born where the mob is (it was laid out around the creation point)
    sw.init = true;
    const ix = env.cx - sw.cx, iy = env.cy - sw.cy, iz = env.cz - sw.cz;
    for (const b of sw.insects) { b.x += ix; b.y += iy; b.z += iz; b.px = b.x; b.py = b.y; b.pz = b.z; }
    sw.cx = env.cx; sw.cy = env.cy; sw.cz = env.cz;
  }
  const jx = env.cx - sw.cx, jy = env.cy - sw.cy, jz = env.cz - sw.cz;
  if (Math.hypot(jx, jy, jz) > 6) for (const b of sw.insects) { b.x += jx; b.y += jy; b.z += jz; b.px += jx; b.py += jy; b.pz += jz; }
  else if (dt > 0) {
    const k = 1 - Math.exp(-8 * dt);
    sw.vcx += (jx / dt - sw.vcx) * k; sw.vcy += (jy / dt - sw.vcy) * k; sw.vcz += (jz / dt - sw.vcz) * k;
  }
  sw.cx = env.cx; sw.cy = env.cy; sw.cz = env.cz;
  const mode = sw.dead >= 0 ? 'dead' : env.mode && env.mode in RADIUS ? env.mode : 'idle';
  if (mode !== sw.mode) { sw.mode = mode; sw.modeT = 0; }
  syncCount(sw);
  sw.acc = Math.min(sw.acc + dt, SIM_DT * MAX_STEPS);
  while (sw.acc >= SIM_DT) { stepOnce(sw, SIM_DT, env); sw.acc -= SIM_DT; }
  sw.alpha = sw.acc / SIM_DT;
  return sw.alpha;
}

/** Where insect b is drawn this frame (interpolated). */
export function drawnAt(sw: Swarm, b: Insect, out: Vec) {
  const a = sw.alpha;
  out.x = b.px + (b.x - b.px) * a; out.y = b.py + (b.y - b.py) * a; out.z = b.pz + (b.z - b.pz) * a;
  return out;
}

// ------------------------------------------------------------------------------------------- measures (tests, browser check)
/** Flying insects (state 0) among the first `active`. */
export function flyingCount(sw: Swarm, active = sw.n) {
  let n = 0;
  for (let i = 0; i < Math.min(active, sw.n); i++) if (sw.insects[i].state === 0) n++;
  return n;
}

/** Mean distance of the flying insects from a point (the centre by default). */
export function meanRadius(sw: Swarm, c: Vec = { x: sw.cx, y: sw.cy, z: sw.cz }) {
  let s = 0, n = 0;
  for (const b of sw.insects) if (b.state === 0) { s += Math.hypot(b.x - c.x, b.y - c.y, b.z - c.z); n++; }
  return n ? s / n : 0;
}

/** The farthest flying insect from the centre. */
export function maxRadius(sw: Swarm) {
  let m = 0;
  for (const b of sw.insects) if (b.state === 0) m = Math.max(m, Math.hypot(b.x - sw.cx, b.y - sw.cy, b.z - sw.cz));
  return m;
}

/** The shape's spread along the axis centre -> target and across it (standard deviations), and the share near the target. */
export function streamShape(sw: Swarm, target: Vec, wrapR = 1.1) {
  const dx = target.x - sw.cx, dy = target.y - sw.cy, dz = target.z - sw.cz, L = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / L, uy = dy / L, uz = dz / L;
  const along: number[] = [], across: number[] = [];
  let near = 0, n = 0;
  for (const b of sw.insects) {
    if (b.state !== 0) continue;
    const rx = b.x - sw.cx, ry = b.y - sw.cy, rz = b.z - sw.cz;
    const a = rx * ux + ry * uy + rz * uz;
    along.push(a);
    across.push(Math.hypot(rx - a * ux, ry - a * uy, rz - a * uz));
    if (Math.hypot(b.x - target.x, (b.y - target.y) * 0.6, b.z - target.z) < wrapR) near++;
    n++;
  }
  const sd = (v: number[]) => { const m = v.reduce((s, x) => s + x, 0) / (v.length || 1); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length || 1)); };
  return { along: sd(along), across: across.reduce((s, x) => s + x, 0) / (across.length || 1), nearTarget: n ? near / n : 0 };
}

/** Every number of every insect is finite. */
export function finite(sw: Swarm) {
  for (const b of sw.insects) for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'wing', 'scale'] as const) if (!Number.isFinite(b[k])) return false;
  return true;
}
