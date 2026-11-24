// @ts-check
// Mutual exclusion of the creatures mod's own structures: a Ruined Castle, an Abandoned Village, a Watchtower, a Forgotten
// Shrine and a Goblin Camp never share a chunk. Each stage already keeps out of the base game's structures (frame.ts
// baseStructureIn, the outposts' gameStructureIn, the castle's AVOID); this is the same rule among OURS.
//
// How: a fixed PRECEDENCE, the biggest and rarest first. A structure asks only the lookups of the structures ABOVE it
// (ctx.locate, which every stage of the pipeline shares) for each chunk it would claim, and gives up the spot when one of them
// is there. The one above never asks the one below, so there is no cycle, and every lookup stays a pure function of the seed
// and the terrain columns: the answer is the same whatever order the chunks (or the stages' caches) are filled in, on the
// server, the page and the workers. A stage whose lookup is missing (an older generator era, a world without biomes,
// `outposts: false`) simply does not count.
//
// Adding a structure: put its chunk lookup in the list (where it belongs by size) and call claimedAbove from its placement.

export const PRECEDENCE = Object.freeze([
  'ruinedCastleAt', // ruined_castle/stage.ts: up to 4 x 4 chunks, one per 12 x 12 region at most
  'creaturesVillageAt', // village.ts: 3 x 3 chunks
  'watchtowerAt', // watchtower/stage.ts: 1 chunk
  'forgottenShrineAt', // watchtower/stage.ts: 1 chunk
  'creaturesGoblinCampAt', // camp.ts: 2 x 2 chunks
  // folk/village.ts: 3 x 3 chunks. LAST on purpose: it came after the others were already in worlds, so it yields to every
  // one of them and nobody asks it (no older structure moves).
  'creaturesMossfolkVillageAt',
] as const);

export type ClaimLookup = typeof PRECEDENCE[number];

/**
 * Is chunk (cx, cz) taken by one of our structures that comes BEFORE `self` in PRECEDENCE?
 * @param {Record<string, any>} locate the generation context's lookups (ctx.locate)
 */
export function claimedAbove(locate: Record<string, any>, self: ClaimLookup, cx: number, cz: number): boolean {
  const i = PRECEDENCE.indexOf(self);
  if (i < 0) throw new Error(`claims.ts: "${self}" is not in PRECEDENCE`);
  for (let k = 0; k < i; k++) {
    const at = locate[PRECEDENCE[k]];
    if (typeof at === 'function' && at(cx, cz)) return true;
  }
  return false;
}

/** The same for every chunk of a rectangle of chunks (cx0..cx1, cz0..cz1, inclusive). */
export function rectClaimedAbove(locate: Record<string, any>, self: ClaimLookup, cx0: number, cz0: number, cx1: number, cz1: number): boolean {
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) if (claimedAbove(locate, self, cx, cz)) return true;
  return false;
}
