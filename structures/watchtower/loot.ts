// @ts-check
// The chests of the two outposts: their loot tables (ctx.loot.register, docs/modding.md 16.12).
//
// The fill is the engine's, the base ruins' pattern: each structure kind declares `loot: { chest }` (index.ts) and its lookup's
// value carries `chest: { x, y, z }`; the first time anyone opens (or a mod reaches) the chest at that position, the server
// rolls the table into it, once per position (server/chests.ts prepareChest -> server/loot.ts structureChestTable /
// rollTableChest; world.looted keeps the mark, so breaking and placing the chest again gives nothing).
import { LOOT } from './names.ts';

export const TOWER_LOOT = {
  pools: [
    // what the archers keep up there: arrows, feathers to fletch more, food and string
    { rolls: { min: 3, max: 5 }, entries: [
      { item: 'mineclaude:arrow', weight: 40, count: { min: 4, max: 12 } },
      { item: 'creatures:feather', weight: 30, count: { min: 2, max: 6 } },
      { item: 'mineclaude:bread', weight: 18, count: { min: 1, max: 3 } },
      { item: 'mineclaude:cooked_meat', weight: 14, count: { min: 1, max: 2 } },
      { item: 'mineclaude:apple', weight: 14, count: { min: 1, max: 3 } },
      { item: 'mineclaude:string', weight: 10, count: { min: 1, max: 3 } },
    ] },
    // now and then a sentinel's own longbow
    { rolls: 1, entries: [{ item: 'creatures:sentinel_bow', weight: 1 }, { empty: true, weight: 7 }] },
    // and a torn piece of their map
    { rolls: 1, entries: [{ item: 'creatures:torn_map', weight: 1 }, { empty: true, weight: 2 }] },
  ],
};

export const SHRINE_LOOT = {
  pools: [
    // the offerings left on the altar: shards of crystal, moss hides, fruit and bread, a little gold
    { rolls: { min: 3, max: 5 }, entries: [
      { item: 'creatures:crystal_shard', weight: 26, count: { min: 1, max: 3 } },
      { item: 'creatures:moss_hide', weight: 24, count: { min: 1, max: 3 } },
      { item: 'mineclaude:apple', weight: 20, count: { min: 1, max: 3 } },
      { item: 'mineclaude:bread', weight: 14, count: { min: 1, max: 2 } },
      { item: 'mineclaude:gold_ingot', weight: 10, count: { min: 1, max: 2 } },
      { item: 'creatures:glow_gland', weight: 8 },
    ] },
    // the rare gift: a diamond
    { rolls: 1, entries: [{ item: 'mineclaude:diamond', weight: 1 }, { empty: true, weight: 6 }] },
  ],
};

/** @param {any} ctx */
export function registerOutpostLoot(ctx: any) {
  ctx.loot.register(LOOT.tower.split(':')[1], TOWER_LOOT);
  ctx.loot.register(LOOT.shrine.split(':')[1], SHRINE_LOOT);
}
