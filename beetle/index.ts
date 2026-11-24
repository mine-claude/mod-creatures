// @ts-check
// Everything of the Crystal Beetle, registered in two calls so the mod's entries stay one line each:
//   registerBeetle(ctx)        content (src/main.ts, both sides): its five sounds, the shard (item, icon, recipe), the mob
//   registerBeetleClient(ctx)  browser (src/client.ts): the procedural renderer, which reads ctx.client
import { BEETLE_SOUNDS, CrystalBeetle } from './mob.ts';
import { registerShard } from './items.ts';
import { BeetleRenderer } from './renderer.ts';
import { CrystalShardModel } from './shard-model.ts';
import { MOB_PATH } from './tuning.ts';
import { OVERWORLD } from './spawn.ts';

/** @param {any} ctx */
export function registerBeetle(ctx) {
  for (const name of BEETLE_SOUNDS) ctx.sounds.file(`${MOB_PATH}_${name}`, `sounds/beetle/${name}.wav`);
  registerShard(ctx);
  // the world, for the spawn test: read lazily (only the server draws spawns; ctx.dimensions.world exists only there)
  let world = null;
  const getBlock = (pos) => {
    try { world ??= ctx.dimensions.world(OVERWORLD); return world.getBlock(pos); } catch { return null; }
  };
  ctx.mobs.register(MOB_PATH, new CrystalBeetle({ getBlock }));
}

/** @param {any} ctx */
export function registerBeetleClient(ctx) {
  ctx.render.mobModel(MOB_PATH, new BeetleRenderer(ctx.client));
  ctx.render.itemModel('crystal_shard', new CrystalShardModel()); // the shard as a faceted crystal (not the flat icon)
}
