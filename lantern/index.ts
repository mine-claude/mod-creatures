// @ts-check
// Everything of the Lure Lantern (Lampiraço), registered in two calls so the mod's entries stay one line each:
//   registerLantern(ctx)        content (src/main.ts, both sides): sounds, the Glow Gland (item, icon, recipe), the mob
//   registerLanternClient(ctx)  browser (src/client.ts): the procedural renderer
import { LureLantern } from './mob.ts';
import { registerGland } from './items.ts';
import { LanternRenderer } from './renderer.ts';
import { LANTERN_PATH, SOUND_NAMES } from './tuning.ts';
import { OVERWORLD } from './spawn.ts';

/** @param {any} ctx */
export function registerLantern(ctx) {
  for (const name of SOUND_NAMES) ctx.sounds.file(`lantern_${name}`, `sounds/lantern/${name}.wav`);
  registerGland(ctx);
  // the world, for the spawn test and the water under it: read lazily (only the server has ctx.dimensions.world)
  let world = null;
  const getBlock = (pos) => {
    try { world ??= ctx.dimensions.world(OVERWORLD); return world.getBlock(pos); } catch { return null; }
  };
  ctx.mobs.register(LANTERN_PATH, new LureLantern({ getBlock }));
}

/** @param {any} ctx */
export function registerLanternClient(ctx) {
  ctx.render.mobModel(LANTERN_PATH, new LanternRenderer(ctx.client));
}
