// @ts-check
// Everything of the Canopy Sentinel, registered in two calls so the mod's entries stay one line each:
//   registerSentinel(ctx)        content (src/main.ts, both sides): sounds, the smoke particle and effect, the two arrows,
//                                the feather and the longbow (icons, the fletching recipe), the dusk condition, the mob
//   registerSentinelClient(ctx)  browser (src/client.ts): the procedural renderer, which reads ctx.client
import { CanopySentinel, SentinelArrow, SentinelSmoke, SmokeArrow, SmokeBlind, duskTest, OVERWORLD } from './mob.ts';
import { FEATHER_RECIPE, FeatherItem, SentinelBowItem, paintSentinelIcons } from './items.ts';
import { SentinelRenderer } from './renderer.ts';
import { SentinelBowModel } from './bow-model.ts';
import { SOUND_FILES } from './tactics.ts';
import { canopyEdge, forestFloor } from '../src/spawn.ts';

/** @param {any} ctx */
export function registerSentinel(ctx) {
  for (const name of SOUND_FILES) ctx.sounds.file(`sentinel_${name}`, `sounds/sentinel/${name}.wav`);
  ctx.particles.register('sentinel_smoke', new SentinelSmoke());
  ctx.effects.register('smoke_blind', new SmokeBlind());
  ctx.projectiles.register('sentinel_arrow', new SentinelArrow());
  ctx.projectiles.register('smoke_arrow', new SmokeArrow());
  paintSentinelIcons(ctx);
  ctx.items.register('feather', new FeatherItem());
  ctx.items.register('sentinel_bow', new SentinelBowItem());
  ctx.recipes.add(FEATHER_RECIPE);
  // the forest test reads the world lazily (only the server draws spawns; ctx.dimensions.world exists only there)
  let world = null;
  const getBlock = (pos) => { try { world ??= ctx.dimensions.world(OVERWORLD); return world.getBlock(pos); } catch { return null; } };
  const forest = forestFloor(getBlock);
  ctx.mobs.spawnCondition('sentinel_dusk', { situation: 'day', test: duskTest });
  ctx.mobs.register('canopy_sentinel', new CanopySentinel({ forest, edge: canopyEdge(getBlock) }));
}

/** @param {any} ctx */
export function registerSentinelClient(ctx) {
  ctx.render.mobModel('canopy_sentinel', new SentinelRenderer(ctx.client));
  ctx.render.itemModel('sentinel_bow', new SentinelBowModel()); // the longbow as a real recurve bow with its string
}
