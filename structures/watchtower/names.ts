// @ts-check
// The names of the two small outposts of this folder (structures/watchtower/): the Watchtower of the Canopy Sentinels and
// the Forgotten Shrine of the Moss Lurkers. Everything else of the folder reads its ids from here.

export const MOD = 'creatures';
export const ns = (path: string) => `${MOD}:${path}`;

/** The structure kinds (ctx.worldgen.structureKind), their roles and lookups. */
export const KIND = Object.freeze({
  tower: 'watchtower',
  shrine: 'forgotten_shrine',
});
export const ROLE = Object.freeze({ tower: 'watchtower', shrine: 'forgotten_shrine' });
export const LOCATOR = Object.freeze({
  towerAt: 'watchtowerAt', towersNear: 'watchtowersNear',
  shrineAt: 'forgottenShrineAt', shrinesNear: 'forgottenShrinesNear',
});
/** The generator stage that places both (one stage: the shrine keeps out of a tower's chunk). */
export const STAGE = 'outposts';

/** Their chests' loot tables (ctx.loot.register). */
export const LOOT = Object.freeze({ tower: ns('watchtower_chest'), shrine: ns('forgotten_shrine_chest') });

/** The blocks they are built of (registered by blocks.ts, in THIS order: never reorder, new ones at the end). */
export const BLOCK = Object.freeze({
  post: ns('tower_post'),
  railing: ns('tower_railing'),
  railingZ: ns('tower_railing_z'),
  target: ns('archery_target'),
  rack: ns('weapon_rack'),
  lantern: ns('hanging_lantern'),
  pillar: ns('mossy_pillar'),
  altar: ns('offering_altar'),
  candle: ns('shrine_candle'),
  vine: ns('shrine_vine'),
});

/** The game's blocks they also use. */
export const BASE = Object.freeze({
  air: 'mineclaude:air', planks: 'mineclaude:planks', slab: 'mineclaude:planks_slab', cobble: 'mineclaude:cobblestone',
  ancient: 'mineclaude:ancient_stone', glyph: 'mineclaude:ancient_glyph', chest: 'mineclaude:chest', torch: 'mineclaude:torch',
  dirt: 'mineclaude:dirt', gravel: 'mineclaude:gravel', grass: 'mineclaude:grass',
  stairsN: 'mineclaude:planks_stairs', stairsS: 'mineclaude:planks_stairs_s',
});

/** The flavour item of the tower's chest. */
export const ITEM = Object.freeze({ tornMap: ns('torn_map') });

/** The biomes (mod `biomes`) each one stands in. No dependency: the names are only compared with api/ctx.biomeAt. */
export const BIOME = Object.freeze({
  mossy: 'biomes:mossy_forest', canopy: 'biomes:tall_canopy', meadow: 'biomes:flower_meadow',
});
export const TOWER_BIOMES = Object.freeze([BIOME.canopy, BIOME.mossy, BIOME.meadow]);
export const SHRINE_BIOMES = Object.freeze([BIOME.mossy, BIOME.canopy, BIOME.meadow]);
