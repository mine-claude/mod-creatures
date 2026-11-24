// @ts-check
// Who lives in the structures: HOME rules appended to our mobs' spawning (ctx.mobs.spawnRule), next to their general rules,
// which stay exactly as they were.
//   - the goblin camp is the goblins' home: bands come out around it at night, and a few lounge about it by day;
//   - the abandoned village is haunted at night: goblin bands raid it;
//   - an overgrown (damp) village: a Moss Lurker may lie disguised in a yard, day or night (one at most).
// "Near" asks the world for the nearest structure of the role (world.nearestStructure, the structure kinds' `near` lookups)
// and then CHECKS the block that marks it (the village well's winch, the camp's fire): a region generated in an older era
// of the world, before the structures existed, has none, so nothing gathers around a structure that is not there.
// In a world without the structures (a world without biomes) the tests answer false: the rule is filtered out BEFORE the
// weighted draw, so the draw — its random numbers included — is the one of before (tests/suites/structures-village-camp.js).
import { STRUCTURE_BLOCKS as SB } from './blocks.ts';
import { inOpenOverworld } from '../src/spawn.ts';

export const ROLE = Object.freeze({ village: 'abandoned_village', camp: 'goblin_camp' });
export const NEAR = Object.freeze({ campNight: 32, campDay: 20, village: 36, lurker: 28 });
const SCAN = [24, 110]; // the heights the marker is looked for at

/**
 * near(getWorld, role, radius, marker, check?) -> test(e) for a spawn rule: the spot is in the open overworld and within
 * `radius` blocks of a structure of `role` whose marker block is really there (and passes `check(world, x, y, z)`).
 * Unloaded cells count as nothing (no spawn), never as an error.
 * @param {() => any} getWorld @param {string} role @param {number} radius @param {string} marker
 * @param {(world: any, x: number, y: number, z: number) => boolean} [check]
 */
export function structureNear(getWorld: () => any, role: string, radius: number, marker: string, check?: (w: any, x: number, y: number, z: number) => boolean) {
  const seen = new Map<string, number | null>(); // "x,z" -> the marker's y, or null (looked and it is not there)
  return (e: any) => {
    if (!inOpenOverworld(e)) return false;
    let w: any = null;
    try { w = getWorld(); } catch { return false; }
    if (!w || typeof w.nearestStructure !== 'function') return false;
    const s = w.nearestStructure(role, { x: e.x, y: e.y, z: e.z }, radius);
    if (!s) return false;
    const key = s.x + ',' + s.z;
    if (!seen.has(key)) {
      let y: number | null = null, loaded = false;
      for (let yy = SCAN[0]; yy <= SCAN[1]; yy++) {
        const b = w.getBlock({ x: s.x, y: yy, z: s.z });
        if (b !== null && b !== undefined) loaded = true;
        if (b === marker) { y = yy; break; }
      }
      if (!loaded) return false; // not generated here yet: ask again later
      if (seen.size > 256) seen.delete(seen.keys().next().value as string);
      seen.set(key, y);
    }
    const y = seen.get(key);
    return y !== null && y !== undefined && (!check || check(w, s.x, y, s.z));
  };
}

/** A damp (overgrown) village: mossy stones in the ring of its well (two blocks under the winch). */
export const dampWell = (w: any, x: number, y: number, z: number) => {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (w.getBlock({ x: x + dx, y: y - 2, z: z + dz }) === SB.mossyCobble) return true;
  return false;
};

/**
 * The home rules, as plain objects (ctx.mobs.spawnRule appends them to the mob's own list).
 * @param {() => any} getWorld
 */
export function structureRules(getWorld: () => any) {
  const camp = (r: number) => structureNear(getWorld, ROLE.camp, r, SB.campfire);
  const village = structureNear(getWorld, ROLE.village, NEAR.village, SB.wellWinch);
  const damp = structureNear(getWorld, ROLE.village, NEAR.lurker, SB.wellWinch, dampWell);
  return {
    goblin: [
      { when: 'night', light: { max: 0.35 }, weight: 60, group: [2, 4], spread: 'pack', cap: 8, ground: null, test: camp(NEAR.campNight) },
      { when: 'creatures:home_day', weight: 30, group: [1, 2], spread: 'pack', cap: 4, ground: null, test: camp(NEAR.campDay) },
      { when: 'night', light: { max: 0.35 }, weight: 50, group: [2, 4], spread: 'pack', cap: 6, ground: null, test: village },
    ],
    lurker: [
      { when: 'night', weight: 25, group: [1, 1], cap: 1, ground: null, test: damp },
      { when: 'creatures:home_day', weight: 10, group: [1, 1], cap: 1, ground: null, test: damp },
    ],
  };
}
