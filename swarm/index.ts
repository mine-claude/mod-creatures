// @ts-check
// Everything of the Sting Swarm (Enxame-Ferrão), registered in two calls so the mod's entries stay one line each:
//   registerSwarm(ctx)        content (src/main.ts, both sides): sounds, the Picada effect, the damage types, the Wild Honey
//                             and the Stinger (items, icons, recipe), the meadow spawn and the mob; on the server, the
//                             listener that tells the swarms a player broke flowers near them
//   registerSwarmClient(ctx)  browser (src/client.ts): the procedural flock renderer
import { StingSwarm, noteDisturbance } from './mob.ts';
import { registerSwarmItems } from './items.ts';
import { SwarmRenderer } from './renderer.ts';
import { SOUND_NAMES, SWARM_PATH } from './tuning.ts';
import { OVERWORLD, isFlower, isHive, meadowDay, ipeBloomDay } from './spawn.ts';
import { HOME, HOME_GROUND, homeRules } from '../src/biome-homes.ts';

/** @param {any} ctx */
export function registerSwarm(ctx) {
  for (const name of SOUND_NAMES) ctx.sounds.file(`swarm_${name}`, `sounds/swarm/${name}.wav`);
  registerSwarmItems(ctx);
  // the world, for the spawn test and the brain's look around: read lazily (only the server has ctx.dimensions.world)
  let world = null;
  const getBlock = (pos) => {
    try { world ??= ctx.dimensions.world(OVERWORLD); return world.getBlock(pos); } catch { return null; }
  };
  // a meadow by day: grass under open sky with flowers around; rare, alone, at most one near a player
  const spawn = [
    { when: 'day', weight: 3, cap: 1, group: [1, 1], ground: ['mineclaude:grass'], test: meadowDay(getBlock) },
    // home: the Prado Florido by day (biome worlds only; elsewhere it never matches and the draw is the old one)
    ...homeRules(HOME.flower_meadow, HOME_GROUND.flower_meadow, [{ when: 'creatures:home_day', weight: 12, cap: 2, group: [1, 1], test: meadowDay(getBlock) }]),
    // home: the Ipezal by day, under the blooming ipê crowns (fallen petals near)
    ...homeRules(HOME.ipe_forest, HOME_GROUND.ipe_forest, [{ when: 'creatures:home_day', weight: 10, cap: 2, group: [1, 1], test: ipeBloomDay(getBlock) }]),
  ];
  ctx.mobs.register(SWARM_PATH, new StingSwarm({ getBlock, spawn }));
  // flowers (or a wild hive, mod biomes) broken by a player: the swarms near them take it badly (server only: the browser has no such event)
  if (ctx.side !== 'client') {
    ctx.events.on('blockBreak', (e) => {
      try {
        if (!e?.player || !(isFlower(e.block) || isHive(e.block))) return;
        if ((e.player.dimension ?? OVERWORLD) !== OVERWORLD) return;
        noteDisturbance(e.pos.x + 0.5, e.pos.y + 0.5, e.pos.z + 0.5, e.player.id);
      } catch { /* never in the way of a block breaking */ }
    });
  }
}

/** @param {any} ctx */
export function registerSwarmClient(ctx) {
  ctx.render.mobModel(SWARM_PATH, new SwarmRenderer(ctx.client));
}
