// @ts-check
// The creatures' places: the Abandoned Village (village.ts) and the Goblin Camp (camp.ts), the homes of our mobs. Everything
// is registered by ONE call from src/main.ts (the content entry: the server, the page, the mesher Worker and the hosted
// Worker all run it, so they all generate the same chunks):
//   - the textures (textures/structures/*.png, painted by art.ts through tools/gen-structure-textures.ts) and the blocks
//     (blocks.ts: thatch, old planks, mossy cobblestone, vines, the furniture and the camp's props, the two loot chests);
//   - the loot tables of the chests (loot.ts);
//   - two stages of the generator and their structure kinds (role, `protects`: the mods' declarative structures keep out);
//   - the home rules of the goblins and the Moss Lurker around them (spawns.ts).
// The browser half (the campfire's flames and smoke) is registerStructuresClient, from src/client.ts.
// New worlds only: README.md ("Só em mundo novo").
import { registerStructureBlocks, STRUCTURE_TEXTURES } from './blocks.ts';
import { registerStructureLoot } from './loot.ts';
import { structureRules, ROLE } from './spawns.ts';
import { OVERWORLD } from '../src/spawn.ts';
import VillageStage, { VILLAGE_CHANCE } from './village.ts';
import GoblinCampStage from './camp.ts';
import { registerStructureSets } from './sets.ts';
import { VILLAGE_PIECES } from './village-pieces.ts';
import { FOLK_CHANCE } from '../folk/village.ts';
import { FOLK_PIECES } from '../folk/pieces.ts';

export { registerStructuresClient } from './client.ts';

/** @param {any} ctx */
export function registerStructures(ctx: any) {
  for (const t of STRUCTURE_TEXTURES) ctx.textures.png(t, `textures/structures/${t}.png`, { size: 16 });
  registerStructureBlocks(ctx);
  registerStructureLoot(ctx);
  // the engine's structure sets of the two villages and their pieces (terrain 2: sets.ts, village-pieces.ts, folk/pieces.ts)
  registerStructureSets(ctx, { village: VILLAGE_CHANCE, folk: FOLK_CHANCE });
  ctx.worldgen.structurePieces('abandoned_village', VILLAGE_PIECES);
  ctx.worldgen.structurePieces('mossfolk_village', FOLK_PIECES);
  // the stages run after the base game's (the last one is its wells), so they see its finished terrain and structures
  ctx.worldgen.stage('abandoned_village', VillageStage);
  ctx.worldgen.stage('goblin_camp', GoblinCampStage);
  ctx.worldgen.structureKind('abandoned_village', { locator: 'creaturesVillageAt', near: 'creaturesVillagesNear', role: ROLE.village });
  ctx.worldgen.structureKind('goblin_camp', { locator: 'creaturesGoblinCampAt', near: 'creaturesGoblinCampsNear', role: ROLE.camp });
  // who lives there (the world is looked at lazily: only the server draws spawns, and ctx.dimensions.world exists only there)
  let world: any = null;
  const getWorld = () => (world ??= ctx.dimensions.world(OVERWORLD));
  const rules = structureRules(getWorld);
  for (const r of rules.goblin) ctx.mobs.spawnRule('creatures:goblin', r);
  for (const r of rules.lurker) ctx.mobs.spawnRule('creatures:moss_lurker', r);
}
