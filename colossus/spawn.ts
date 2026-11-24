// @ts-check
// Where a Ruin Colossus may wake up in the world: by the old stone of the RUINS (and anything else built of the game's
// ancient stone: the dungeons' walls that break the surface) — any spot whose surroundings hold enough `ancient_stone`
// / `ancient_glyph` — and, more rarely, alone on the bare rock of the highlands at night. Never in the lobby, a minigame
// room or another dimension, and only where its 3-block body fits.
// Pure: the world comes in as getBlock({ x, y, z }) -> full block name | null (unloaded = nothing, no spawn).

import { HOME, HOME_GROUND, homeRules } from '../src/biome-homes.ts';

export const OVERWORLD = 'mineclaude:overworld';
// (the ruin pieces of the biomes mod's Planalto das Ruínas count too: names only, no dependency on that mod)
export const ANCIENT = Object.freeze(['mineclaude:ancient_stone', 'mineclaude:ancient_glyph', 'biomes:rune_stone', 'biomes:column_drum', 'biomes:fallen_drum_x', 'biomes:fallen_drum_z', 'biomes:column_capital', 'biomes:ancient_statue']);
/** The floors of the ruin rules (the engine's `ground` filter): the ruin's own floor and what grows over and around it. */
export const RUIN_FLOOR = Object.freeze(['mineclaude:ancient_stone', 'mineclaude:ancient_glyph', 'mineclaude:cobblestone', 'mineclaude:grass', 'mineclaude:dirt', 'mineclaude:stone', 'mineclaude:gravel', 'mineclaude:sand']);
export const HIGHLAND_FLOOR = Object.freeze(['mineclaude:stone', 'mineclaude:gravel', 'mineclaude:cobblestone']);
export const HIGHLAND_Y = 62; // the bare rock up on the mountains (the sea is at 30, the sky at 96)
export const RUIN_RADIUS = 7; // blocks around the spot searched for ancient stone
export const MIN_ANCIENT = 3; // ancient blocks seen around: the spot is by a ruin
const AIR = new Set([null, undefined, 'mineclaude:air']);

/** Out in the open world (the spawn spot's player): not the lobby, a minigame room or another dimension. */
export function openWorld(e) {
  const p = e?.player;
  if (p && p.room && p.room !== 'mundo') return false;
  if (p && (p.dimension ?? OVERWORLD) !== OVERWORLD) return false;
  return true;
}

/** Three cells of room for its body over the spot (the engine already asks for two). */
export function fitsBody(getBlock, x, y, z) {
  for (let dy = 0; dy < 3; dy++) {
    const b = getBlock({ x, y: y + dy, z });
    if (b === null || b === undefined) return false; // unloaded
    if (!AIR.has(b) && !/(^|:)(tall_grass|short_grass|fern|flower|.*_flower)$/.test(b)) return false;
  }
  return true;
}

/** How many ancient blocks lie within `radius` of the spot (sampled on a 2-block grid, from 2 below to 3 above). */
export function ancientAround(getBlock, x, y, z, radius = RUIN_RADIUS) {
  let n = 0;
  for (let dx = -radius; dx <= radius; dx += 2) {
    for (let dz = -radius; dz <= radius; dz += 2) {
      if (dx * dx + dz * dz > radius * radius) continue;
      for (let dy = -2; dy <= 3; dy++) if (ANCIENT.includes(getBlock({ x: x + dx, y: y + dy, z: z + dz }))) n++;
    }
  }
  return n;
}

/** test(e) for the ruin rules: the open world, room for the body, enough ancient stone around. */
export function nearRuins(getBlock) {
  return (e) => {
    if (!openWorld(e)) return false;
    const x = Math.floor(e.x), y = Math.floor(e.y), z = Math.floor(e.z);
    return fitsBody(getBlock, x, y, z) && ancientAround(getBlock, x, y, z) >= MIN_ANCIENT;
  };
}

/** test(e) for the highland rule: the open world, high up, under the open sky, room for the body. */
export function highland(getBlock) {
  return (e) => {
    if (!openWorld(e) || e?.underground) return false;
    if (!(e.y >= HIGHLAND_Y)) return false;
    return fitsBody(getBlock, Math.floor(e.x), Math.floor(e.y), Math.floor(e.z));
  };
}

/** test(e) for the home rules (the Planalto das Ruínas): the open world, under the open sky, room for the body. */
export function plateauHome(getBlock) {
  return (e) => openWorld(e) && !e?.underground && fitsBody(getBlock, Math.floor(e.x), Math.floor(e.y), Math.floor(e.z));
}

/** The colossus's spawn rules. Rare: one at a time, at most one near a player. `ruinsDay` is the day condition's full name. */
export function colossusSpawnRules(getBlock, ruinsDay) {
  const ruins = nearRuins(getBlock);
  return [
    { when: 'night', ground: RUIN_FLOOR.slice(), weight: 6, group: [1, 1], cap: 1, test: ruins },
    { when: ruinsDay, ground: RUIN_FLOOR.slice(), weight: 3, group: [1, 1], cap: 1, test: ruins },
    { when: 'night', ground: HIGHLAND_FLOOR.slice(), weight: 2, group: [1, 1], cap: 1, test: highland(getBlock) },
    // home: the Planalto das Ruínas, by night and by day (biome worlds only; elsewhere these never match and the draw is the old one)
    ...homeRules(HOME.ruin_plateau, HOME_GROUND.ruin_plateau, [
      { when: 'night', weight: 14, group: [1, 1], cap: 1, test: plateauHome(getBlock) },
      { when: 'creatures:home_day', weight: 8, group: [1, 1], cap: 1, test: plateauHome(getBlock) },
    ]),
  ];
}
