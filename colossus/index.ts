// @ts-check
// Everything of the Ruin Colossus, registered in two calls so the mod's entries stay one line each:
//   registerColossus(ctx)        content (src/main.ts, both sides): its six sounds, the dust and ember particles, the slam's
//                                damage type, the thrown rock, the Rune Core (item, icon, recipe), the ruins-by-day
//                                condition and the mob
//   registerColossusClient(ctx)  browser (src/client.ts): the procedural renderer (reads ctx.client, spawns dust, plays the
//                                footfalls), the camera SHAKE (one ctx.client.camera.modify modifier reading a shaker the
//                                renderer feeds) and the debris clock (clientWorldTickEnd)
import { ColossusDust, ColossusEmber, ColossusRock, ColossusSlam, RuinColossus } from './mob.ts';
import { registerCore } from './items.ts';
import { ColossusRenderer } from './renderer.ts';
import { createShaker } from './shake.ts';
import { openWorld, OVERWORLD } from './spawn.ts';
import { COLOSSUS_PATH, SOUND_NAMES } from './tuning.ts';

/** @param {any} ctx */
export function registerColossus(ctx) {
  for (const name of SOUND_NAMES) ctx.sounds.file(`colossus_${name}`, `sounds/colossus/${name}.wav`);
  ctx.particles.register('colossus_dust', new ColossusDust());
  ctx.particles.register('colossus_ember', new ColossusEmber());
  ctx.damage.type('colossus_slam', new ColossusSlam());
  ctx.projectiles.register('colossus_rock', new ColossusRock());
  registerCore(ctx);
  // the world, for the spawn tests: read lazily (only the server draws spawns; ctx.dimensions.world exists only there)
  let world = null;
  const getBlock = (pos) => { try { world ??= ctx.dimensions.world(OVERWORLD); return world.getBlock(pos); } catch { return null; } };
  // by day too, but only by the ruins (the test is the ruin rule's own)
  const ruinsDay = ctx.mobs.spawnCondition('colossus_ruins_day', { situation: 'day', test: (e) => openWorld(e) });
  ctx.mobs.register(COLOSSUS_PATH, new RuinColossus({ getBlock, ruinsDay: typeof ruinsDay === 'string' ? ruinsDay : 'creatures:colossus_ruins_day' }));
}

/** The shaker the camera modifier reads (one per page; tests and the browser check read it too). */
export const colossusShaker = createShaker();
export let colossusRenderer = null;

/** @param {any} ctx */
export function registerColossusClient(ctx) {
  const renderer = new ColossusRenderer({ client: ctx.client, particles: ctx.particles, sounds: ctx.sounds, shaker: colossusShaker });
  colossusRenderer = renderer;
  ctx.render.mobModel(COLOSSUS_PATH, renderer);
  ctx.client.camera.modify((pose) => {
    const o = colossusShaker.sample(performance.now());
    renderer.lastShake = o;
    renderer.stats.shake = o.amp;
    if (!(o.amp > 0)) return;
    pose.x += o.x; pose.y += o.y; pose.z += o.z;
    pose.pitch += o.pitch; pose.roll += o.roll;
  }, { order: 50 });
  ctx.events.on('clientWorldTickEnd', (e) => { if (renderer.debris.length) renderer.tick(Math.min(0.1, Math.max(0, e?.dt ?? 0.016))); });
}
