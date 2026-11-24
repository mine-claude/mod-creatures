// @ts-check
// Castelo em Ruínas (creatures:ruined_castle): a large, rare fortress on high ground, built by the creatures mod and lived in
// by its creatures. Everything of it is registered in two calls, so the mod's entries stay one line each:
//   registerRuinedCastle(ctx)        content (src/main.ts, every side: server, page, mesher Worker, hosted Worker): the
//                                    masonry and furniture blocks (blocks.ts), the loot-only Old Tome, the loot tables (loot.ts),
//                                    the generator stage (stage.ts, the plan in plan.ts) with its structure KIND, and on the
//                                    server the castle's home spawn rules (spawn.ts), its chests and its crypt (warden.ts)
//   registerRuinedCastleClient(ctx)  browser (src/client.ts): the brazier's flickering fire (renderer.ts)
// Only in NEW worlds (a world born with biomes): see stage.ts and README.md.
import { registerCastleBlocks } from './blocks.ts';
import { registerCastleLoot } from './loot.ts';
import RuinedCastleStage, { setStateResolver } from './stage.ts';
import { castleSpawnRules } from './spawn.ts';
import { registerCastleWarden } from './warden.ts';
import { BrazierRenderer } from './renderer.ts';

export const CASTLE = 'creatures:ruined_castle';
export const CASTLE_ROLE = 'ruined_castle';

/** @param {any} ctx */
export function registerRuinedCastle(ctx: any) {
  registerCastleBlocks(ctx);
  registerCastleLoot(ctx);
  // the effective id of a block with a facing (asked when the generator builds a castle, long after the registry froze)
  setStateResolver((name, facing) => ctx.blocks.stateId(name, { facing }));
  ctx.worldgen.stage('ruined_castle', RuinedCastleStage);
  // what the castle is to the engine: a kind with its own role (the base game's chest filler only knows 'dungeon' and 'ruin',
  // one chest each, with the base game's table, so the castle fills its six chests itself: warden.ts); `protects`: the
  // declarative structures of other mods never share a chunk with it
  ctx.worldgen.structureKind('ruined_castle', { locator: 'ruinedCastleAt', near: 'ruinedCastlesNear', role: CASTLE_ROLE, protects: true });
  if (ctx.side !== 'server') return;
  const { castleAt, hasGuardian } = registerCastleWarden(ctx);
  const getBlock = (pos: any) => { try { return ctx.dimensions.world('mineclaude:overworld').getBlock(pos); } catch { return null; } };
  for (const [mob, rule] of castleSpawnRules(castleAt, getBlock, hasGuardian)) ctx.mobs.spawnRule(mob, rule);
}

/** @param {any} ctx */
export function registerRuinedCastleClient(ctx: any) {
  ctx.render.blockEntity('creatures:castle_brazier', new BrazierRenderer());
}
