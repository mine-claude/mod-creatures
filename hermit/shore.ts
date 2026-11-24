// @ts-check
// The Tide Hermit's world queries, pure functions over a getBlock({ x, y, z }) -> full block name | null (the WorldApi's
// on the server, a fake world in the tests):
//   - beachSpot: the spawn test — sand at the sea's edge, water next to it, the open overworld only;
//   - chooseShell: the block its shell is made of, drawn from the SHELLS list among what lies around it;
//   - waterlineSpot / nearestWater: where it forages (sand next to water) and where it runs to.
import { SHELLS, SHELL_FALLBACK, SHELL_SCAN, SHELL_WEIGHT } from './tuning.ts';

export const OVERWORLD = 'mineclaude:overworld';
// The base game's sea level is 30 (packages/shared/src/constants.ts SEA_LEVEL; written here, not imported: a content
// file reachable from the modloader must not pull engine tables in at load time). Its beaches are sand up to sea + 1,
// so a beach spot has its feet (the top of the sand) between these heights.
export const BEACH_MIN_Y = 28, BEACH_MAX_Y = 33;
export const WATER_RING = 5; // blocks around the spot searched for water

type GetBlock = (pos: { x: number, y: number, z: number }) => string | null;
export const isSand = (name) => typeof name === 'string' && /(^|[:_])sand$/.test(name);
export const isWater = (name) => typeof name === 'string' && /(^|:)water(_\d+)?$/.test(name);
const isOpen = (name) => name === null || name === undefined || /(^|:)air$/.test(String(name));

/** Is there water (any level) within `r` blocks of (x, z), at the sand's height or one below? */
export function waterNear(getBlock: GetBlock, x: number, y: number, z: number, r = WATER_RING) {
  for (let d = 1; d <= r; d++) {
    for (let k = -d; k <= d; k++) {
      for (const [dx, dz] of [[k, -d], [k, d], [-d, k], [d, k]]) {
        if (isWater(getBlock({ x: x + dx, y, z: z + dz })) || isWater(getBlock({ x: x + dx, y: y - 1, z: z + dz }))) return true;
      }
    }
  }
  return false;
}

/**
 * beachSpot(getBlock) -> test(e) for a spawn rule: e is the spawn spot { x, y, z, player } (y = the feet, on top of the
 * ground). Sand under the feet at the sea's edge with water within WATER_RING blocks; never in a lobby, a minigame room
 * or another dimension. Unloaded cells count as nothing (no spawn), never as an error.
 */
export function beachSpot(getBlock: GetBlock) {
  return (e) => {
    const p = e?.player;
    if (p && p.room && p.room !== 'mundo') return false;
    if (p && (p.dimension ?? OVERWORLD) !== OVERWORLD) return false;
    const x = Math.floor(e.x), y = Math.floor(e.y), z = Math.floor(e.z);
    if (y < BEACH_MIN_Y || y > BEACH_MAX_Y) return false;
    if (!isSand(getBlock({ x, y: y - 1, z })) || !isOpen(getBlock({ x, y, z }))) return false;
    return waterNear(getBlock, x, y, z);
  };
}

/**
 * The shell: every cell of the SHELLS list within SHELL_SCAN of `at` adds its kind's weight (at most capPerKind cells of a
 * kind count, so a beach of sand does not drown a lone crate); one kind is drawn by those weights with rnd() in [0, 1).
 * Nothing of the list nearby: one of SHELL_FALLBACK. Returns the index into SHELLS; `info` (optional) learns where it came
 * from ('scan' | 'fallback') and how many cells of the list were seen.
 */
export function chooseShell(getBlock: GetBlock, at: { x: number, y: number, z: number }, rnd: () => number, info: any = null) {
  const count = new Map<string, number>();
  const x0 = Math.floor(at.x), y0 = Math.floor(at.y), z0 = Math.floor(at.z), R = SHELL_SCAN.radius;
  for (let dy = -SHELL_SCAN.below; dy <= SHELL_SCAN.above; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        let b = null;
        try { b = getBlock({ x: x0 + dx, y: y0 + dy, z: z0 + dz }); } catch { b = null; }
        if (typeof b === 'string' && SHELL_WEIGHT[b] !== undefined) count.set(b, (count.get(b) ?? 0) + 1);
      }
    }
  }
  let total = 0;
  const pool: Array<[string, number]> = [];
  for (const [name, n] of count) {
    const w = Math.min(n, SHELL_SCAN.capPerKind) * SHELL_WEIGHT[name];
    pool.push([name, w]); total += w;
  }
  const r = Math.min(0.999999, Math.max(0, rnd()));
  if (info) { info.from = total > 0 ? 'scan' : 'fallback'; info.seen = [...count.values()].reduce((a, b) => a + b, 0); }
  if (!(total > 0)) return SHELLS.indexOf(SHELL_FALLBACK[Math.floor(r * SHELL_FALLBACK.length)]);
  let acc = r * total;
  for (const [name, w] of pool) { acc -= w; if (acc < 0) return SHELLS.indexOf(name); }
  return SHELLS.indexOf(pool[pool.length - 1][0]);
}

/**
 * A foraging spot: a sand cell with open air over it and water beside it, within `r` blocks of `at`, chosen from a
 * few random tries (rnd in [0, 1)); null when none was found. The feet's position { x, y, z } (cell centre).
 */
export function waterlineSpot(getBlock: GetBlock, at: { x: number, y: number, z: number }, r: number, rnd: () => number) {
  const fy = Math.floor(at.y);
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(at.x + (rnd() * 2 - 1) * r), z = Math.floor(at.z + (rnd() * 2 - 1) * r);
    for (const dy of [0, -1, 1]) {
      const y = fy + dy;
      if (isSand(getBlock({ x, y: y - 1, z })) && isOpen(getBlock({ x, y, z })) && waterNear(getBlock, x, y, z, 1)) return { x: x + 0.5, y, z: z + 0.5 };
    }
  }
  return null;
}

/** The nearest water cell within `r` blocks (rings outwards, from a block above the feet to two below: a crab knocked
 * into a hop still finds the sea), or null. */
export function nearestWater(getBlock: GetBlock, at: { x: number, y: number, z: number }, r: number) {
  const x = Math.floor(at.x), y = Math.floor(at.y), z = Math.floor(at.z);
  for (let d = 1; d <= r; d++) {
    for (let k = -d; k <= d; k++) {
      for (const [dx, dz] of [[k, -d], [k, d], [-d, k], [d, k]]) {
        for (const dy of [0, -1, 1, -2]) if (isWater(getBlock({ x: x + dx, y: y + dy, z: z + dz }))) return { x: x + dx + 0.5, y: y + dy, z: z + dz + 0.5 };
      }
    }
  }
  return null;
}
