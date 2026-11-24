// @ts-check
// The loot of the structures' chests (rolled once, the first time a player opens the chest: blocks.ts fillOnce).
// A village chest: what a family left behind (food, light, a few tools, a little metal) and what the woods' creatures shed
// around it; a goblin camp's chest: the band's hoard — pebbles, stolen tools, meat, and the pouches they keep their shiny
// things in. Each has a rare pool. (The game has no maps or enchanted books yet: the rare finds are a diamond, an iron
// piece of armour, the Canopy Sentinel's bow, a saddle.)
import { LOOT } from './blocks.ts';

const m = (n: string) => `mineclaude:${n}`, c = (n: string) => `creatures:${n}`;
const e = (item: string, weight: number, min = 1, max = min) => ({ item, weight, ...(max > 1 || min > 1 ? { count: min === max ? min : { min, max } } : {}) });

export const VILLAGE_LOOT = {
  pools: [
    { rolls: { min: 3, max: 5 }, entries: [
      e(m('bread'), 10, 1, 3), e(m('apple'), 10, 1, 4), e(m('cooked_meat'), 6, 1, 3), e(m('wheat'), 6, 2, 6), e(m('seeds'), 5, 2, 5),
      e(m('torch'), 8, 2, 6), e(m('string'), 5, 1, 4), e(m('leather'), 4, 1, 3), e(m('stick'), 5, 2, 6), e(m('coal'), 5, 2, 5),
    ] },
    { rolls: { min: 1, max: 2 }, entries: [
      e(m('iron_ingot'), 6, 1, 3), e(m('gold_ingot'), 3, 1, 2), e(m('stone_pickaxe'), 4), e(m('iron_axe'), 2), e(m('iron_pickaxe'), 2),
      e(m('bucket'), 2), e(m('shield'), 1), e(m('bow'), 2), e(m('arrow'), 4, 4, 10),
    ] },
    { rolls: { min: 1, max: 2 }, entries: [
      e(c('moss_hide'), 6, 1, 3), e(c('crystal_shard'), 3, 1, 2), e(c('goblin_pouch'), 4), e(c('feather'), 4, 2, 5), e(c('wild_honey'), 3, 1, 2), e(c('goblin_pebble'), 3, 2, 6),
    ] },
    { rolls: 1, conditions: [{ type: 'random_chance', chance: 0.1 }], entries: [
      e(m('diamond'), 3), e(m('iron_chestplate'), 2), e(c('sentinel_bow'), 1),
    ] },
  ],
};

export const CAMP_LOOT = {
  pools: [
    { rolls: { min: 3, max: 5 }, entries: [
      e(c('goblin_pebble'), 10, 4, 12), e(m('cooked_meat'), 8, 1, 4), e(m('raw_meat'), 6, 1, 4), e(m('apple'), 5, 1, 3), e(m('bone'), 5, 1, 4),
      e(m('leather'), 4, 1, 3), e(m('string'), 4, 1, 3),
    ] },
    { rolls: { min: 1, max: 2 }, entries: [
      e(m('stone_sword'), 5), e(m('stone_axe'), 5), e(m('wood_pickaxe'), 4), e(m('iron_shovel'), 2), e(m('iron_sword'), 2), e(m('bow'), 2),
      e(m('arrow'), 4, 3, 8), e(m('shield'), 1),
    ] },
    { rolls: { min: 1, max: 3 }, entries: [
      e(c('goblin_pouch'), 8, 1, 2), e(m('gold_ingot'), 5, 1, 3), e(m('iron_ingot'), 4, 1, 2), e(c('crystal_shard'), 2), e(c('feather'), 3, 1, 4),
    ] },
    { rolls: 1, conditions: [{ type: 'random_chance', chance: 0.1 }], entries: [
      e(m('diamond'), 2), e(m('iron_helmet'), 2), e(m('saddle'), 1),
    ] },
  ],
};

/** @param {any} ctx */
export function registerStructureLoot(ctx: any) {
  ctx.loot.register(LOOT.village.split(':')[1], VILLAGE_LOOT);
  ctx.loot.register(LOOT.camp.split(':')[1], CAMP_LOOT);
}
