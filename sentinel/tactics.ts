// @ts-check
// The Canopy Sentinel's numbers and its PURE tactics (no SDK, no game code, no THREE): the draw -> arrow speed curve,
// a voxel line of sight over any solid(x, y, z), the search for HIGH GROUND (a standable spot 2+ blocks up with a clear
// line to the target) and for COVER (a standable spot whose line to the threat is blocked), and the group's shot
// staggering. The server goals (goals.ts) call these with e.solidAt; tests/suites/creatures-sentinel-math.js calls them
// over fake block worlds.

export const SENTINEL = 'creatures:canopy_sentinel';
export const ARROW_PROJECTILE = 'creatures:sentinel_arrow';
export const SMOKE_PROJECTILE = 'creatures:smoke_arrow';
export const SMOKE_EFFECT = 'creatures:smoke_blind';
export const SOUNDS = Object.freeze({
  draw: 'creatures:sentinel_draw', release: 'creatures:sentinel_release', rustle: 'creatures:sentinel_rustle',
  hurt: 'creatures:sentinel_hurt', death: 'creatures:sentinel_death', whistle: 'creatures:sentinel_whistle',
});
export const SOUND_FILES = ['draw', 'release', 'rustle', 'hurt', 'death', 'whistle'];

export const NOTICE = 24; // blocks: it notices a player this far (with a clear line beyond NOTICE_NEAR)
export const NOTICE_NEAR = 8;
export const KEEP_MIN = 10, KEEP_MAX = 18; // the band it shoots from
export const TOO_CLOSE = 6; // closer: it hops back
export const GROUP_RADIUS = 20; // its band: other sentinels within this
export const STAGGER = 0.9; // s: no two of a band release closer than this
export const RELOAD_TIME = 0.75; // s: hand to the quiver, an arrow to the string
export const SMOKE_EVERY = 4; // every 4th arrow is a smoke arrow (when the target is 8+ blocks away)
export const COVER_TIME = [1.6, 2.6]; // s hidden behind a block (drawn)
export const COVER_COOLDOWN = 4; // s before it hides again from a drawn bow
export const AIMED_AT = 0.14; // rad: a bow pointed within this of its body counts as aimed at it
export const HIGH_EVERY = 3; // s between high-ground searches
export const HIGH_GAIN = 2; // blocks up that count as high ground
export const HIGH_RADIUS = 7, COVER_RADIUS = 5;
export const ARROW = { damage: 4, error: 0.035 };
export const SMOKE = { damage: 1, seconds: 3 };

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** How long it draws for a target `d` blocks away (s): farther = a longer, fuller draw. */
export function drawTimeFor(d) { return clamp(0.45 + 0.06 * d, 0.7, 1.8); }

/**
 * The arrow's launch speed (blocks/s) after drawing `t` seconds: a bow stores more energy the further it is drawn,
 * with diminishing returns (the limbs stiffen). Monotonic, 10 at t = 0, about 25 at 0.7 s and 33 at 1.8 s.
 */
export function drawSpeed(t) { return 10 + 26 * (1 - Math.exp(-1.2 * Math.max(0, t))); }

/** The draw (0..1) of the string t seconds into a draw lasting `dur`: fast at first, slowing into the anchor. */
export function drawCurve(t, dur) {
  const u = clamp(t / Math.max(1e-3, dur), 0, 1);
  return 1 - (1 - u) * (1 - u) * (1 - u) * 0.85 - 0.15 * (1 - u);
}

// ---------------------------------------------------------------- line of sight (voxel DDA)

/**
 * Whether the segment a -> b crosses no solid cell (Amanatides-Woo traversal; the cells holding a and b count).
 * solid(x, y, z) on integer cells.
 */
export function lineClear(solid, a, b) {
  let x = Math.floor(a.x), y = Math.floor(a.y), z = Math.floor(a.z);
  const ex = Math.floor(b.x), ey = Math.floor(b.y), ez = Math.floor(b.z);
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
  const tdx = sx ? Math.abs(1 / dx) : Infinity, tdy = sy ? Math.abs(1 / dy) : Infinity, tdz = sz ? Math.abs(1 / dz) : Infinity;
  let tx = sx > 0 ? (x + 1 - a.x) * tdx : sx < 0 ? (a.x - x) * tdx : Infinity;
  let ty = sy > 0 ? (y + 1 - a.y) * tdy : sy < 0 ? (a.y - y) * tdy : Infinity;
  let tz = sz > 0 ? (z + 1 - a.z) * tdz : sz < 0 ? (a.z - z) * tdz : Infinity;
  for (let n = 0; n < 256; n++) {
    if (solid(x, y, z)) return false;
    if (x === ex && y === ey && z === ez) return true;
    if (tx <= ty && tx <= tz) { if (tx > 1) return true; x += sx; tx += tdx; }
    else if (ty <= tz) { if (ty > 1) return true; y += sy; ty += tdy; }
    else { if (tz > 1) return true; z += sz; tz += tdz; }
  }
  return true;
}

/** A body of two blocks fits standing at cell (x, y, z): ground under it, air for the legs and the head. */
export const standable = (solid, x, y, z) => solid(x, y - 1, z) && !solid(x, y, z) && !solid(x, y + 1, z);

const EYE = 1.6, CHEST = 1.2;

/**
 * High ground near `me` (feet, blocks) to shoot `target` (feet) from: a standable cell within HIGH_RADIUS whose feet
 * are at least HIGH_GAIN above its own, from which the target's chest is in a clear line, and whose distance to the
 * target is in the shooting band (with 2 blocks of slack). The best by height first, then the least walking.
 * Returns { x, y, z } (the cell's centre at its floor) or null. `avoid` (a list of cells) skips spots that failed.
 */
export function findHighGround(solid, me, target, { radius = HIGH_RADIUS, gain = HIGH_GAIN, maxUp = 5, avoid = [] } = {}) {
  const bx = Math.floor(me.x), by = Math.floor(me.y), bz = Math.floor(me.z);
  const cands = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      if (dx * dx + dz * dz > radius * radius) continue;
      const x = bx + dx, z = bz + dz;
      const c = { x: x + 0.5, z: z + 0.5 };
      const dT = Math.hypot(c.x - target.x, c.z - target.z);
      if (dT < KEEP_MIN - 2 || dT > KEEP_MAX + 2) continue; // out of the band: no block read at all
      // one read per cell, top down: the highest cell with ground under it and two of air over it
      let above1 = solid(x, by + maxUp + 2, z), above0 = solid(x, by + maxUp + 1, z);
      for (let y = by + maxUp; y >= by + gain - 1; y--) {
        const here = solid(x, y, z);
        if (here && !above0 && !above1) { // feet at y + 1
          const fy = y + 1;
          if (fy >= by + gain && !avoid.some((q) => q.x === x && q.y === fy && q.z === z)) cands.push({ c: { x: c.x, y: fy, z: c.z }, score: (fy - by) * 2 - 0.35 * Math.hypot(dx, dz) - 0.2 * Math.abs(dT - 14) });
          break;
        }
        above1 = above0; above0 = here;
      }
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const chest = { x: target.x, y: target.y + CHEST, z: target.z };
  for (const k of cands.slice(0, 12)) {
    if (lineClear(solid, { x: k.c.x, y: k.c.y + EYE, z: k.c.z }, chest)) return k.c;
  }
  return null;
}

// the cells of a disc of radius r, nearest first (the cover search stops at the first that works)
const discs = new Map();
function disc(r) {
  let d = discs.get(r);
  if (!d) {
    d = [];
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (dx * dx + dz * dz <= r * r) d.push([dx, dz, Math.hypot(dx, dz)]);
    d.sort((a, b) => a[2] - b[2]);
    discs.set(r, d);
  }
  return d;
}

/**
 * Cover from `threat` (feet) near `me` (feet): a standable cell within COVER_RADIUS, at about its own height, whose
 * eye-to-eye line to the threat is blocked, and not closer to the threat than `minFromThreat`. The nearest wins.
 * Returns { x, y, z } or null.
 */
export function findCover(solid, me, threat, { radius = COVER_RADIUS, minFromThreat = 4 } = {}) {
  const bx = Math.floor(me.x), by = Math.floor(me.y), bz = Math.floor(me.z);
  const eye = { x: threat.x, y: threat.y + EYE, z: threat.z };
  for (const [dx, dz] of disc(radius)) {
    const x = bx + dx, z = bz + dz;
    if (Math.hypot(x + 0.5 - threat.x, z + 0.5 - threat.z) < minFromThreat) continue;
    for (const y of [by, by + 1, by - 1]) {
      if (!standable(solid, x, y, z)) continue;
      const c = { x: x + 0.5, y, z: z + 0.5 };
      // hidden: neither its eyes nor its chest can be seen from the threat's eyes
      if (!lineClear(solid, eye, { x: c.x, y: y + EYE, z: c.z }) && !lineClear(solid, eye, { x: c.x, y: y + 1.0, z: c.z })) return c;
      break;
    }
  }
  return null;
}

/**
 * Group staggering: may this sentinel release now? `mates` are the last release times (s, the same clock as `now`) of
 * the other sentinels of its band. No mate released within STAGGER seconds.
 */
export function staggerOk(now, mates, gap = STAGGER) {
  for (const t of mates) if (typeof t === 'number' && now - t < gap) return false;
  return true;
}

/** Is a player's bow pointed at the mob? eye/look of the player, the mob's middle; within AIMED_AT radians and 40 blocks. */
export function aimedAt(eye, look, mid, cone = AIMED_AT) {
  const dx = mid.x - eye.x, dy = mid.y - eye.y, dz = mid.z - eye.z, d = Math.hypot(dx, dy, dz);
  if (d < 1e-6 || d > 40) return false;
  const dot = (dx * look.x + dy * look.y + dz * look.z) / (d * (Math.hypot(look.x, look.y, look.z) || 1));
  return Math.acos(clamp(dot, -1, 1)) < cone;
}

/** The ballistic launch pitch (rad) for a horizontal distance x, a rise dy, a speed v and gravity g (the lower arc), or null. */
export function launchPitch(x, dy, v, g) {
  if (x < 1e-6) return dy >= 0 ? Math.PI / 2 : -Math.PI / 2;
  const v2 = v * v, disc = v2 * v2 - g * (g * x * x + 2 * dy * v2);
  if (disc < 0) return null;
  return Math.atan((v2 - Math.sqrt(disc)) / (g * x));
}
