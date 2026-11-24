// @ts-check
// TERRAIN 2: the earth banks ("skirts") around the structures that stand on a raised floor — the Watchtower, the Forgotten
// Shrine, the Ruined Castle. Each declares a SITE (the engine's terrain adaptation, docs/modding.md 22.8): its footprint,
// its floor and mode `beard` (fill only: soil under the footprint up to the floor and a ramp of soil around it; nothing is
// ever cut outside the footprint). The ramp may reach a few blocks into a neighbouring chunk, so every chunk asks the
// structures of the chunks around it; a chunk that belongs to ANOTHER structure (the game's or one of this mod's) keeps its
// ground untouched (the ramp just stops at its border). Pure: the sites come from the plans, the heights from the columns.
import { CS, baseStructureIn } from './frame.ts';

/** The lookups of this mod's structures that own whole chunks (claims.ts). */
const OWNERS = ['ruinedCastleAt', 'creaturesVillageAt', 'watchtowerAt', 'forgottenShrineAt', 'creaturesGoblinCampAt', 'creaturesMossfolkVillageAt'];

/** Is chunk (cx, cz) another structure's (the game's, or one of this mod's other than `self`)? */
export function otherStructureIn(locate: Record<string, any>, self: string[], cx: number, cz: number): boolean {
  if (baseStructureIn(locate, cx, cz)) return true;
  for (const k of OWNERS) {
    if (self.includes(k)) continue;
    const at = locate[k];
    if (typeof at === 'function' && at(cx, cz)) return true;
  }
  return false;
}

/**
 * Applies the sites that reach chunk (cx, cz): `sitesAround(cx, cz)` lists the sites of the structures whose chunks lie
 * within `reach` chunks. A chunk of another structure is left as it is (unless it holds one of the sites' own footprints).
 */
export function applySkirts(ctx: any, chunk: any, self: string[], sites: any[]): void {
  if (!sites.length) return;
  const own = sites.some((s) => s.x0 < chunk.x0 + CS && s.x1 >= chunk.x0 && s.z0 < chunk.z0 + CS && s.z1 >= chunk.z0);
  if (!own && otherStructureIn(ctx.locate, self, chunk.cx, chunk.cz)) return;
  ctx.structures.adapt.chunk(chunk, CS, ctx.height, sites, (x: number, z: number) => ctx.columnInfo(x, z).h);
}

/** The sites whose skirt reaches the box of blocks x0..x1, z0..z1, from a per-chunk lookup of sites (the chunks around). */
export function sitesReaching(x0: number, z0: number, x1: number, z1: number, reachChunks: number, sitesOfChunk: (cx: number, cz: number) => any[]): any[] {
  const out: any[] = [];
  const c0x = Math.floor(x0 / CS) - reachChunks, c1x = Math.floor(x1 / CS) + reachChunks, c0z = Math.floor(z0 / CS) - reachChunks, c1z = Math.floor(z1 / CS) + reachChunks;
  for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
    for (const s of sitesOfChunk(cx, cz)) {
      const r = (s.skirt ?? 3) + 1;
      if (s.x0 - r <= x1 && s.x1 + r >= x0 && s.z0 - r <= z1 && s.z1 + r >= z0 && !out.includes(s)) out.push(s);
    }
  }
  return out;
}
