// @ts-check
// The Goblin (creatures:goblin): small, hunched, big-eared and mischievous. Bands of 2-4 come out at night on the plains
// and the wild edges, and live in caves. They keep their distance and throw pebbles, stab when cornered, the last of a
// band runs away, and anything left on the ground nearby gets pocketed — dropped again when the thief dies.
import { GoalMob, ProjectileType, SpawnRuleType, WanderGoal } from '../mineclaude-sdk.js';
import { GOBLIN, GoblinFleeGoal, GoblinSkirmishGoal, GoblinStealGoal, SOUNDS } from './goals.ts';
import { HOME, HOME_GROUND, homeRules } from '../src/biome-homes.ts';

export const GOBLIN_DROPS = [['creatures:goblin_pebble', 1, 3], ['creatures:goblin_pouch', 0, 1, 0.3]];

// out at night on the open grass of the first two rings (the plains and the woods' edges), never up on the mountains
export class GoblinNightRule extends SpawnRuleType {
  when = 'night';
  zones = ['campos', 'ermos'];
  ground = ['mineclaude:grass'];
  light = { max: 0.3 };
  weight = 12;
  group = [2, 4];
  spread = 'pack';
  cap = 8;
  test(e) { return e.y < 90; }
}

// at home in the caves, day or night
export class GoblinCaveRule extends SpawnRuleType {
  when = 'underground';
  weight = 10;
  group = [2, 4];
  spread = 'pack';
  cap = 8;
}

/**
 * Home (biome worlds only, src/biome-homes.ts): at night, bands gather along the edge of the Bosque de Copas Altas — open sky
 * over them and the tall canopy close by (`edge(e)`: src/spawn.ts canopyEdge), on either side of the border. Appended to the
 * general rules by index.ts (which has the world to look at); in a world without biomes they never match.
 * And out on the Savana Dourada, at night, bands gather at the termite mounds (`mounds(e)`: src/spawn.ts nearTermiteMound).
 * @param {(e: any) => boolean} edge
 * @param {(e: any) => boolean} [mounds]
 */
export function goblinHomeRules(edge, mounds) {
  const band = { when: 'night', light: { max: 0.3 }, weight: 30, group: [2, 4], spread: 'pack', cap: 8, test: edge };
  const rules = [...homeRules(HOME.tall_canopy, HOME_GROUND.tall_canopy, [band]), ...homeRules(HOME.flower_meadow, HOME_GROUND.flower_meadow, [band])];
  if (mounds) rules.push(...homeRules(HOME.golden_savanna, HOME_GROUND.golden_savanna, [{ ...band, test: mounds }]));
  return rules;
}

export class Goblin extends GoalMob {
  key = 'goblin';
  name = 'Goblin';
  emoji = '👺';
  halfW = 0.3;
  height = 1.1;
  /** @type {'hostile'} */ behavior = 'hostile';
  burn = false;
  hp = 10;
  speed = 2.6;
  damage = 2;
  xp = 4;
  sound = 'goblin_chatter';
  drops = GOBLIN_DROPS;
  spawn: any[] = [new GoblinNightRule(), new GoblinCaveRule()]; // index.ts appends the home rules (plain objects)
  aiEvery = 1; // its timers count e.dt, the tick's step
  goals = [
    [1, new GoblinFleeGoal()],
    [2, new GoblinStealGoal()],
    [3, new GoblinSkirmishGoal()],
    [4, new WanderGoal()],
  ];
  // what it is doing this tick, in e.mob.data.mode (each goal writes its own; the stroll leaves 'wander')
  ai(e) {
    e.mob.data.mode = 'wander';
    return super.ai(e);
  }
  onHurt(e) {
    super.onHurt(e);
    if (e.mob.hp > 0) e.server.playSound(SOUNDS.hurt, e.mob.pos, { radius: 16 });
  }
  onDeath(e) {
    e.server.playSound(SOUNDS.death, e.mob.pos, { radius: 16 });
  }
}

// the pebble it throws (and that a player can throw too): a small grey stone on a short arc
export class GoblinPebble extends ProjectileType {
  name = 'Pedrinha';
  gravity = 1.3;
  life = 4;
  damage = 2;
  size = 0.1;
  color = '#8a8a84';
  // a goblin's pebble (no player owner) does not hurt another goblin: a band throwing from behind does not wipe itself out
  onHitEntity(e) {
    if (!e.owner && e.target.mob?.name === GOBLIN) e.cancel();
  }
}
