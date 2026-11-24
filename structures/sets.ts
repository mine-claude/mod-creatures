// @ts-check
// The STRUCTURE SETS of the creatures mod (the engine's sets: packages/shared/src/worldgen/structures/, docs/modding.md 22.8).
// They replace the Phase-2 helper `spacing.ts`: the same numbers, now the engine's primitive.
//
//   creatures:villages           the Abandoned Village: one per region; terrain 2: 24 x 24 chunks, a 4 x 4 chunk claim (room
//                                for lanes of houses) kept 4 chunks off the border (two villages at least 8 chunks apart,
//                                edge to edge), 24 places tried; terrain 1: the original 12-chunk regions, a 3 x 3 claim, 10
//                                places, no inset (its old worlds keep every village where it was: the set is given the
//                                stage's own rolls)
//   creatures:mossfolk_villages  the Musgarrete village: the same regions, and in terrain 2 it keeps 17 chunks (claim to claim)
//                                from an Abandoned Village (EXCLUSION: the abandoned village is older in the precedence of
//                                claims.ts and never asks back)
//
// Which set a world uses is decided by its terrain version (ctx.opts.terrainVersion): terrain 2 worlds use the registered
// sets, terrain 1 worlds the frozen numbers below (spec passed to ctx.structures.starts).
export const VILLAGE_SET = 'creatures:villages';
export const FOLK_SET = 'creatures:mossfolk_villages';

/** Terrain version of the world being generated (the base game's option; absent = 1). */
export const isTerrain2 = (ctx: any) => ctx?.opts?.terrainVersion === 2;

/** Terrain 2: one village per 24 x 24 chunks, 8 chunks between claims, a 4 x 4 claim, 24 places tried. */
export const VILLAGES_T2 = Object.freeze({ spacing: 24, separation: 8, footprint: 4, attempts: 24, salt: 0x51a7e5 });
/** Terrain 2: the Musgarrete villages, kept 17 chunks from an Abandoned Village. */
export const FOLK_VILLAGES_T2 = Object.freeze({ spacing: 24, separation: 8, footprint: 4, attempts: 24, salt: 0x6d055a, exclusion: [{ set: VILLAGE_SET, chunks: 17 }] });

/** The set spec of a world: terrain 2's registered set (undefined: use the registry), or the structure's terrain-1 numbers. */
export function villageSetSpec(ctx: any, terrain1: { region: number; tries: number; chance: number; salt: number }) {
  return isTerrain2(ctx) ? undefined : Object.freeze({ spacing: terrain1.region, separation: 0, footprint: 3, attempts: terrain1.tries, frequency: terrain1.chance, salt: terrain1.salt });
}

/** Registers the sets (src/main.ts, through registerStructures). The frequency is the stage's own roll (see the stages). */
export function registerStructureSets(ctx: any, chances: { village: number; folk: number }) {
  ctx.worldgen.structureSet('villages', { ...VILLAGES_T2, frequency: chances.village });
  ctx.worldgen.structureSet('mossfolk_villages', { ...FOLK_VILLAGES_T2, frequency: chances.folk });
}
