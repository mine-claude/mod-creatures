// @ts-check
// Everything of the Tide Hermit, registered in two calls so the mod's entries stay one line each:
//   registerHermit(ctx)        content (src/main.ts, both sides): its six sounds, the snap's damage type, the claw (item,
//                              icon, recipe), the beach spawn and the mob
//   registerHermitClient(ctx)  browser (src/client.ts): the procedural renderer, which reads ctx.client
import { DamageType } from '../mineclaude-sdk.js';
import { TideHermit } from './mob.ts';
import { registerClaw } from './items.ts';
import { HermitRenderer } from './renderer.ts';
import { HERMIT_SOUNDS, MOB_PATH } from './tuning.ts';
import { OVERWORLD, beachSpot } from './shore.ts';
import { HOME, HOME_GROUND, homeRules } from '../src/biome-homes.ts';

export class HermitSnap extends DamageType {
  name = 'Beliscão';
  armored = true;
  shield = true;
  pvp = false;
  deathMessage(e) { return `${e.player} foi beliscado por um Ermitão das Marés`; }
}

/** @param {any} ctx */
export function registerHermit(ctx) {
  for (const name of HERMIT_SOUNDS) ctx.sounds.file(`${MOB_PATH}_${name}`, `sounds/hermit/${name}.wav`);
  ctx.damage.type('hermit_snap', new HermitSnap());
  registerClaw(ctx);
  // the world, for the spawn test: read lazily (only the server draws spawns; ctx.dimensions.world exists only there)
  let world = null;
  const getBlock = (pos) => {
    try { world ??= ctx.dimensions.world(OVERWORLD); return world.getBlock(pos); } catch { return null; }
  };
  const test = beachSpot(getBlock);
  // on beach sand next to the sea, by day (a named condition of the 'day' situation, whose own floor is grass; the engine
  // keeps neutral mobs to the day's spawns); rare and in ones and twos
  ctx.mobs.spawnCondition('beach_day', { situation: 'day', test });
  const spawn = [
    { when: 'creatures:beach_day', weight: 8, cap: 2, group: [1, 2], ground: ['mineclaude:sand'], test },
    // home: the Costa de Corais (biome worlds only; elsewhere this never matches and the draw is the old one). Same beach
    // test (shell sand counts as sand: shore.ts isSand), on its shell sand too, far more of them
    ...homeRules(HOME.coral_coast, HOME_GROUND.coral_coast, [
      { when: 'creatures:home_day', weight: 30, cap: 3, group: [1, 2], test },
    ]),
  ];
  ctx.mobs.register(MOB_PATH, new TideHermit({ spawn }));
}

/** @param {any} ctx */
export function registerHermitClient(ctx) {
  ctx.render.mobModel(MOB_PATH, new HermitRenderer(ctx.client));
}
