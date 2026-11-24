// @ts-check
// Everything of the Goblin, registered in two calls so the mod's entries stay one line each:
//   registerGoblin(ctx)        content (src/main.ts, both sides): sounds, the pebble projectile, the two items and their
//                              icons, the mob
//   registerGoblinClient(ctx)  browser (src/client.ts): the procedural renderer, which reads ctx.client
import { Goblin, GoblinPebble, goblinHomeRules } from './mob.ts';
import { OVERWORLD, canopyEdge, nearTermiteMound } from '../src/spawn.ts';
import { GoblinPebbleItem, GoblinPouchItem, paintGoblinIcons } from './items.ts';
import { GoblinRenderer } from './renderer.ts';

/** @param {any} ctx */
export function registerGoblin(ctx) {
  for (const name of ['chatter', 'throw', 'hurt', 'death']) ctx.sounds.file(`goblin_${name}`, `sounds/goblin/${name}.wav`);
  ctx.projectiles.register('goblin_pebble', new GoblinPebble());
  paintGoblinIcons(ctx);
  ctx.items.register('goblin_pebble', new GoblinPebbleItem());
  ctx.items.register('goblin_pouch', new GoblinPouchItem());
  // its homes (the canopy's edge, the savanna's termite mounds) look at the world lazily (only the server draws spawns; ctx.dimensions.world exists only there)
  let world = null;
  const getBlock = (pos) => { try { world ??= ctx.dimensions.world(OVERWORLD); return world.getBlock(pos); } catch { return null; } };
  const goblin = new Goblin();
  goblin.spawn = [...goblin.spawn, ...goblinHomeRules(canopyEdge(getBlock), nearTermiteMound(getBlock))];
  ctx.mobs.register('goblin', goblin);
}

/** @param {any} ctx */
export function registerGoblinClient(ctx) {
  ctx.render.mobModel('goblin', new GoblinRenderer(ctx.client));
}
