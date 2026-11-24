// @ts-check
// The Canopy Sentinel (creatures:canopy_sentinel, "Sentinela das Copas"): a hooded forest hunter with a carved wooden
// mask, a feathered mantle and a tall recurve longbow. Small bands (2-3) come out of the forests at dusk and at night
// (and, now and then, one or two on the hills); they keep their distance, take the high ground, duck behind cover, lead
// their shots and never loose together. Also: its two arrows (the plain one and the smoke arrow that blinds for a moment
// and slows), the smoke itself (a particle and the effect that holds it around the eyes) and the spawn rules.
import { EffectType, GoalMob, ParticleType, ProjectileType, WanderGoal } from '../mineclaude-sdk.js';
import { SentinelArcherGoal, SentinelCoverGoal } from './goals.ts';
import { ARROW, SENTINEL, SMOKE, SMOKE_EFFECT, SOUNDS } from './tactics.ts';
import { HOME, HOME_GROUND, homeRules } from '../src/biome-homes.ts';
import { inOpenOverworld } from '../src/spawn.ts';

export const SENTINEL_DROPS = [['mineclaude:arrow', 1, 3], ['creatures:feather', 1, 3], ['creatures:sentinel_bow', 1, 1, 0.06]];
export const OVERWORLD = 'mineclaude:overworld';
export const SMOKE_PARTICLE = 'creatures:sentinel_smoke';

// never in the lobby, a minigame room or another dimension
const openWorld = (e) => {
  const p = e?.player;
  if (p && p.room && p.room !== 'mundo') return false;
  if (p && (p.dimension ?? OVERWORLD) !== OVERWORLD) return false;
  return true;
};

/**
 * Its spawn rules (`forest(e)` is the forest-floor test of src/spawn.ts): out of the forests at night in a band of 2-3;
 * at dusk too (the condition 'creatures:sentinel_dusk': the daylight fading, registered in index.ts); and now and then
 * one or two on the hills (high open grass) at night. Home (biome worlds only, src/biome-homes.ts): the Bosque de Copas
 * Altas at dusk and at night, and the meadow at its edge (`edge(e)`: src/spawn.ts canopyEdge); the Taiga Nevada's snowy woods
 * at dusk and at night — elsewhere these never match.
 */
export function sentinelSpawnRules(forest, edge = (_e) => false) {
  const inForest = (e) => openWorld(e) && forest(e);
  return [
    { when: 'night', ground: ['mineclaude:grass'], weight: 7, group: [2, 3], spread: 'pack', cap: 4, test: inForest },
    { when: 'creatures:sentinel_dusk', ground: ['mineclaude:grass'], light: { max: 0.5 }, weight: 6, group: [2, 3], spread: 'pack', cap: 3, test: inForest },
    { when: 'night', ground: ['mineclaude:grass'], weight: 2, group: [1, 2], spread: 'pack', cap: 2, test: (e) => openWorld(e) && e.y >= HILL_Y },
    // home: under the tall canopy, and out on the meadow along its edge
    ...homeRules(HOME.tall_canopy, HOME_GROUND.tall_canopy, [
      { when: 'night', weight: 18, group: [2, 3], spread: 'pack', cap: 4, test: inOpenOverworld },
      { when: 'creatures:sentinel_dusk', light: { max: 0.5 }, weight: 14, group: [2, 3], spread: 'pack', cap: 3, test: inOpenOverworld },
    ]),
    ...homeRules(HOME.flower_meadow, HOME_GROUND.flower_meadow, [
      { when: 'night', weight: 10, group: [2, 3], spread: 'pack', cap: 3, test: edge },
      { when: 'creatures:sentinel_dusk', light: { max: 0.5 }, weight: 10, group: [2, 3], spread: 'pack', cap: 3, test: edge },
    ]),
    // home: the snowy conifer woods of the Taiga Nevada, hunting at dusk and at night (fewer than under the tall canopy)
    ...homeRules(HOME.snowy_taiga, HOME_GROUND.snowy_taiga, [
      { when: 'night', weight: 14, group: [2, 3], spread: 'pack', cap: 3, test: inOpenOverworld },
      { when: 'creatures:sentinel_dusk', light: { max: 0.5 }, weight: 12, group: [2, 3], spread: 'pack', cap: 3, test: inOpenOverworld },
    ]),
  ];
}
export const HILL_Y = 84;
/** The dusk condition's test: the light is going (daylight 0.12..0.5), out in the open world. */
export const duskTest = (e) => openWorld(e) && e.daylight >= 0.12 && e.daylight <= 0.5;

export class CanopySentinel extends GoalMob {
  key = 'canopy_sentinel';
  name = 'Sentinela das Copas';
  emoji = '🏹';
  halfW = 0.3;
  height = 1.85;
  /** @type {'hostile'} */ behavior = 'hostile';
  burn = false;
  hp = 18;
  speed = 2.8;
  damage = 3; // its knife, when cornered
  xp = 7;
  sound = 'sentinel_rustle';
  drops = SENTINEL_DROPS;
  aiEvery = 1;
  aiBudget = 150; // its own work is a few ms (the high-ground search reads ~1000 cells every 3 s); measured ticks of 45-130 ms
  // on a loaded test machine were scheduling/GC pauses landing on whatever ran — past the budget the engine hands the
  // mob the zombie's default for 5 s, so the slack is deliberate
  spawn;
  goals;
  /** @param {{ forest: (e: any) => boolean, edge?: (e: any) => boolean }} opts */
  constructor({ forest, edge }) {
    super();
    this.spawn = sentinelSpawnRules(forest, edge);
    this.goals = [
      [1, new SentinelCoverGoal()],
      [2, new SentinelArcherGoal()],
      [3, new WanderGoal()],
    ];
  }
  ai(e) {
    e.mob.data.mode = 'wander';
    return super.ai(e);
  }
  onHurt(e) {
    super.onHurt(e);
    const d = e.mob.data;
    if (!(e.now / 1000 < (d.cc ?? -1))) d.cr = 1; // hit: take cover (unless it just did)
    if (e.attacker && !e.attacker.creative) d.tg = e.attacker.id;
    if (e.mob.hp > 0) e.server.playSound(SOUNDS.hurt, e.mob.pos, { radius: 16 });
  }
  onDeath(e) {
    e.server.playSound(SOUNDS.death, e.mob.pos, { radius: 16 });
  }
}

// a sentinel's arrow (no player owner) never hurts another sentinel: a band shooting past each other is safe
const friendly = (e) => !e.owner && e.target?.mob?.name === SENTINEL;

export class SentinelArrow extends ProjectileType {
  name = 'Flecha da Sentinela';
  shape = 'arrow';
  color = '#4c7a46'; // its green vane
  gravity = 1;
  life = 8;
  damage = ARROW.damage;
  size = 0.1;
  onHitEntity(e) { if (friendly(e)) e.cancel(); }
}

export class SmokeArrow extends ProjectileType {
  name = 'Flecha de Fumaça';
  shape = 'arrow';
  color = '#8a8a8a';
  gravity = 1;
  life = 8;
  damage = SMOKE.damage;
  size = 0.1;
  onHitEntity(e) {
    if (friendly(e)) { e.cancel(); return; }
    const pos = e.projectile.pos;
    try { e.world.spawnParticles(SMOKE_PARTICLE, pos, { count: 40 }); } catch { /* no viewers */ }
    e.target.player?.addEffect(SMOKE_EFFECT, SMOKE.seconds, 1);
  }
  onHitBlock(e) {
    try { e.world.spawnParticles(SMOKE_PARTICLE, { x: e.pos.x + 0.5, y: e.pos.y + 1, z: e.pos.z + 0.5 }, { count: 40 }); } catch { /* no viewers */ }
  }
}

// the smoke: soft grey puffs that drift up and spread
export class SentinelSmoke extends ParticleType {
  colors = ['#9a9a96', '#7e7e7a', '#b4b4ae', '#6a6a66'];
  size = 0.32;
  life = 1.6;
  gravity = -0.04;
  speed = 0.9;
  spread = 0.55;
  rise = 0.25;
  drag = 2.2;
  shrink = false;
  burst = 64;
}

// "Fumaça nos Olhos": the smoke clings around the eyes (a thick cloud kept in front of the face) and the legs falter
export class SmokeBlind extends EffectType {
  name = 'Fumaça nos Olhos';
  color = '#8a8a8a';
  beneficial = false;
  every = 0.25;
  attributes = [{ attribute: 'mineclaude:movement_speed', amount: -0.35, operation: 'add_multiplied_total' }];
  onApply(e) { this.puff(e, 24); }
  onTick(e) { this.puff(e, 10); }
  puff(e, count) {
    const { eye, look } = e.player;
    try { e.world.spawnParticles(SMOKE_PARTICLE, { x: eye.x + look.x * 0.45, y: eye.y, z: eye.z + look.z * 0.45 }, { count }); } catch { /* no viewers */ }
  }
}
