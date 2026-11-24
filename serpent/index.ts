// @ts-check
// Everything of the Root Serpent (Serpente de Raízes), registered in two calls so the mod's entries stay one line each:
//   registerSerpent(ctx)        content (src/main.ts, both sides): its six sounds, the soil particle, the "Constrição"
//                               effect, the two damage types (the bite, the squeeze), the Living Bark (item, icon, recipe),
//                               the forest-by-day condition and the mob
//   registerSerpentClient(ctx)  browser (src/client.ts): the procedural renderer, which reads ctx.client
import RootSerpent, { SerpentBite, SerpentCoil, SerpentSoil, SerpentSqueeze } from './mob.ts';
import { registerBark } from './items.ts';
import { SerpentRenderer } from './renderer.ts';
import { OVERWORLD, rootFloor } from './spawn.ts';
import { SERPENT_PATH, SOUND_NAMES, isDiggable } from './tuning.ts';
import { inOpenOverworld } from '../src/spawn.ts';
import { HOME, HOME_GROUND, homeRules } from '../src/biome-homes.ts';

// inside its home: the guards, and a floor it can dig into
const homeFloor = (e: any) => inOpenOverworld(e) && (e?.ground === undefined || isDiggable(e.ground));

/** Its spawn rules over a forest-floor test: rare, one at a time, day and night (a little more at night). */
export function serpentSpawnRules(test: (e: any) => boolean) {
  const ground = ['mineclaude:grass', 'mineclaude:dirt'];
  return [
    { when: 'night', weight: 4, cap: 1, group: [1, 1], ground, test },
    { when: 'creatures:serpent_day', weight: 3, cap: 1, group: [1, 1], ground, test },
    // home: the Floresta Musgosa (biome worlds only; elsewhere these never match and the draw is the old one)
    ...homeRules(HOME.mossy_forest, HOME_GROUND.mossy_forest, [
      { when: 'night', weight: 16, cap: 2, group: [1, 1], test: homeFloor },
      { when: 'creatures:home_day', weight: 12, cap: 1, group: [1, 1], test: homeFloor },
    ]),
  ];
}

/** @param {any} ctx */
export function registerSerpent(ctx: any) {
  for (const name of SOUND_NAMES) ctx.sounds.file(`serpent_${name}`, `sounds/serpent/${name}.wav`);
  ctx.particles.register('serpent_soil', new SerpentSoil());
  ctx.effects.register('serpent_coil', new SerpentCoil());
  ctx.damage.type('serpent_bite', new SerpentBite());
  ctx.damage.type('serpent_squeeze', new SerpentSqueeze());
  registerBark(ctx);
  // the world, for the spawn test: read lazily (only the server draws spawns; ctx.dimensions.world exists only there)
  let world: any = null;
  const getBlock = (pos: { x: number, y: number, z: number }) => {
    try { world ??= ctx.dimensions.world(OVERWORLD); return world.getBlock(pos); } catch { return null; }
  };
  const test = rootFloor(getBlock);
  // by day it is a named condition of the 'day' situation (a hostile's own rules are for the night)
  ctx.mobs.spawnCondition('serpent_day', { situation: 'day', test });
  ctx.mobs.register(SERPENT_PATH, new RootSerpent({ spawn: serpentSpawnRules(test) }));
}

/** @param {any} ctx */
export function registerSerpentClient(ctx: any) {
  ctx.render.mobModel(SERPENT_PATH, new SerpentRenderer(ctx.client));
}
