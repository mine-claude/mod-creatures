// @ts-check
// "Biome + general" spawning (owner's decision, 2026-11-21): in a world WITH biomes each creature is much more common in
// its home biome (from the `biomes` mod) and stays rare elsewhere; in a world WITHOUT biomes nothing changes.
//
// The pattern: the mob KEEPS its general rules exactly as they were and APPENDS home rules built by homeRules() — the same
// shape with `biomes: [home]`, a higher weight and the home's own floor. No hard dependency on the `biomes` mod:
//   - a spawn rule's `biomes` filter is checked for SHAPE only (shared/modloader/spawn-rules.ts), never for existence, so
//     'biomes:mossy_forest' is accepted even when the biome mod is not installed;
//   - in a world without biomes (or without that mod) the column's biome is null, the filter never matches, the rule is
//     filtered out BEFORE the weighted draw — so the draw, its random numbers included, is exactly the old one.
// To give another creature a home: add its biome here, and one `...homeRules(...)` line next to its general rules.

/** The home biomes, by the names the `biomes` mod registers (mods/biomes/<biome>/index.ts). */
export const HOME = Object.freeze({
  mossy_forest: 'biomes:mossy_forest',
  glow_marsh: 'biomes:glow_marsh',
  red_dunes: 'biomes:red_dunes',
  flower_meadow: 'biomes:flower_meadow',
  tall_canopy: 'biomes:tall_canopy',
  coral_coast: 'biomes:coral_coast',
  ruin_plateau: 'biomes:ruin_plateau',
  golden_savanna: 'biomes:golden_savanna',
  mushroom_grove: 'biomes:mushroom_grove',
  ipe_forest: 'biomes:ipe_forest',
  snowy_taiga: 'biomes:snowy_taiga',
});

/** The floor of each home: the ground blocks a creature born there stands on (the biome's surface first). */
export const HOME_GROUND = Object.freeze({
  mossy_forest: ['biomes:moss_carpet', 'mineclaude:grass', 'mineclaude:dirt'],
  glow_marsh: ['biomes:mud', 'biomes:peat', 'mineclaude:grass', 'mineclaude:dirt', 'mineclaude:sand', 'biomes:dead_log', 'biomes:dead_tree_log'],
  red_dunes: ['biomes:red_sand', 'mineclaude:sand'],
  flower_meadow: ['mineclaude:grass'],
  tall_canopy: ['mineclaude:grass', 'mineclaude:dirt'],
  coral_coast: ['biomes:shell_sand', 'mineclaude:sand'],
  ruin_plateau: ['biomes:stone_moss', 'biomes:weathered_stone', 'mineclaude:grass', 'mineclaude:stone', 'mineclaude:gravel'],
  golden_savanna: ['mineclaude:grass', 'biomes:termite_earth', 'mineclaude:dirt'],
  mushroom_grove: ['biomes:mycelium_soil', 'mineclaude:grass', 'mineclaude:dirt'],
  ipe_forest: ['mineclaude:grass', 'mineclaude:dirt'],
  snowy_taiga: ['mineclaude:snow', 'mineclaude:grass', 'mineclaude:dirt', 'mineclaude:gravel'],
});

/**
 * Home rules: each given rule restricted to the home biome, standing on the home floor. `test` replaces the general
 * rule's test (inside its home a creature does not need the "looks like a forest" heuristics, only the room/dimension
 * guards); weights and caps are the caller's.
 * @param {string} biome a HOME value
 * @param {string[]} ground a HOME_GROUND value
 * @param {Array<Record<string, any>>} rules
 */
export function homeRules(biome: string, ground: string[], rules: Array<Record<string, any>>) {
  return rules.map((r) => ({ ...r, biomes: [biome], ground }));
}

// ---- Homes that are NOT biomes: underground features of the `biomes` mod, found by their FLOOR ----
// A geode (biomes:crystal_geodes, mods/biomes/crystal_geodes/) is a chamber under any biome, so its rules cannot use the
// `biomes` filter (the column's biome is the surface's). They use the `ground` filter instead: the floor blocks only that
// feature generates. Still no hard dependency: without the mod (or in a world without biomes, where no geode is ever
// generated) no spot stands on those blocks, the rule is filtered out BEFORE the weighted draw and the draw is the old one.

/** The floor of each underground home (the blocks only that feature generates). */
export const FEATURE_GROUND = Object.freeze({
  crystal_geodes: ['biomes:amethyst_block', 'biomes:lit_amethyst', 'biomes:calcite'],
});

/**
 * Home rules of an underground feature: each given rule restricted to the feature's own floor (no `biomes` filter).
 * @param {string[]} ground a FEATURE_GROUND value
 * @param {Array<Record<string, any>>} rules
 */
export function featureHomeRules(ground: string[], rules: Array<Record<string, any>>) {
  return rules.map((r) => ({ ...r, ground }));
}
