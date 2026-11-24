// @ts-check
// The castle's loot tables (ctx.loot.register), by increasing value: what the soldiers left (gatehouse, barracks), what the
// great hall kept, what the library and the throne room hid, and the treasury. The danger of the zone (`bonus`) adds rolls
// and quantities, like the base game's chests.

import { ITEM } from '../watchtower/names.ts';

const M = (n: string) => `mineclaude:${n}`;
// ONE Torn Map in the whole mod: the watchtower's item (its id lives in watchtower/names.ts)
const TORN_MAP = ITEM.tornMap;
const C = (n: string) => `creatures:${n}`;
const e = (item: string, weight: number, min = 1, max = min) => ({ item, weight, count: min === max ? min : { min, max } });

export const CASTLE_LOOT = Object.freeze({
  castle_barracks: { pools: [
    { rolls: { min: 4, max: 6 }, bonus: { scale: 0.5, rolls: 1 }, entries: [
      e(M('bread'), 10, 1, 4), e(M('cooked_meat'), 8, 1, 3), e(M('apple'), 6, 1, 3), e(M('arrow'), 10, 4, 16),
      e(M('iron_ingot'), 8, 1, 4), e(M('coal'), 6, 2, 8), e(M('torch'), 5, 2, 8), e(M('leather'), 4, 1, 3),
      e(M('iron_sword'), 2), e(M('bow'), 2), e(M('iron_helmet'), 1), e(M('shield'), 1),
    ] },
  ] },
  castle_hall: { pools: [
    { rolls: { min: 4, max: 6 }, bonus: { scale: 0.5, rolls: 1 }, entries: [
      e(M('bread'), 10, 2, 5), e(M('cooked_meat'), 10, 2, 5), e(M('apple'), 8, 2, 4), e(M('iron_ingot'), 6, 2, 5),
      e(M('gold_ingot'), 5, 1, 3), e(TORN_MAP, 3), e(M('iron_chestplate'), 1), e(M('crossbow'), 1),
    ] },
  ] },
  castle_library: { pools: [
    { rolls: { min: 3, max: 5 }, bonus: { scale: 0.5, rolls: 1 }, entries: [
      e(C('old_tome'), 10, 1, 3), e(TORN_MAP, 6), e(C('crystal_shard'), 8, 1, 4), e(M('gold_ingot'), 6, 1, 4),
      e(M('diamond'), 2, 1, 2), e(C('glow_gland'), 3, 1, 2), e(M('iron_pickaxe'), 2),
    ] },
    { rolls: 1, entries: [e(C('old_tome'), 1)] }, // a library always keeps one book
  ] },
  castle_treasury: { pools: [
    { rolls: { min: 5, max: 7 }, bonus: { scale: 0.5, rolls: 1 }, entries: [
      e(M('gold_ingot'), 12, 3, 9), e(M('diamond'), 6, 1, 4), e(C('crystal_shard'), 6, 2, 6), e(M('iron_ingot'), 6, 3, 8),
      e(M('diamond_sword'), 2), e(M('diamond_pickaxe'), 2), e(M('diamond_war_axe'), 1), e(M('diamond_chestplate'), 1),
      e(M('gold_helmet'), 2), e(M('gold_chestplate'), 1),
    ] },
    { rolls: 1, entries: [e(C('rune_core'), 3), e(M('diamond'), 2, 2, 3)] }, // the prize: a Rune Core, or a fistful of diamonds
  ] },
});

export const LOOT_NAMES = Object.freeze(Object.keys(CASTLE_LOOT).map((k) => `creatures:${k}`));

/** @param {any} ctx */
export function registerCastleLoot(ctx: any) {
  for (const [name, table] of Object.entries(CASTLE_LOOT)) ctx.loot.register(name, table);
}
