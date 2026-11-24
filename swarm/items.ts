// @ts-check
// What the Sting Swarm leaves and what it does to you:
//   - "Mel Silvestre" (creatures:wild_honey): a comb dripping amber honey; food that also HEALS a little (onEaten), and it
//     can be eaten with a full belly (alwaysEdible) — a reason to face a swarm;
//   - "Ferrão do Enxame" (creatures:swarm_stinger): a barbed stinger; one with a stick makes arrows;
//   - "Picada" (creatures:swarm_sting, an effect): the venom of many stings — a point of damage every 2.5 s (2 at level
//     3), a little slower on your feet; it never finishes anyone (stops at 1 health), the stinging swarm does;
//   - "Ferroada" (creatures:swarm_sting, a damage type): armour helps, a shield does not (they come from every side).
// The icons are painted in code (original pixel art, lit from the top-left like the mod's other icons).
import { DamageType, EffectType, ItemType } from '../mineclaude-sdk.js';
import { HONEY, STINGER } from './tuning.ts';

export const HONEY_HEAL = 4; // health points (2 hearts) on eating it

export class SwarmSting extends EffectType {
  name = 'Picada';
  color = '#e0a020';
  beneficial = false;
  every = 2.5;
  attributes = [{ attribute: 'mineclaude:movement_speed', amount: -0.06, operation: 'add_multiplied_total' }];
  onTick(e) {
    if (e.player.dead || e.player.health <= 1) return;
    e.player.damage(Math.min(e.level >= 3 ? 2 : 1, e.player.health - 1), 'creatures:swarm_venom');
  }
}

export class SwarmStingDamage extends DamageType {
  name = 'Ferroada';
  armored = true;
  shield = false;
  pvp = false;
  deathMessage(e) { return `${e.player} foi picado até o fim por um Enxame-Ferrão`; }
}

export class SwarmVenomDamage extends DamageType {
  name = 'Picada';
  armored = false;
  shield = false;
  pvp = false;
  deathMessage(e) { return `${e.player} não resistiu às picadas de um Enxame-Ferrão`; }
}

export class WildHoneyItem extends ItemType {
  name = 'Mel Silvestre';
  icon = HONEY;
  stack = 16;
  food = 3;
  alwaysEdible = true;
  lore;
  constructor(lore) { super(); this.lore = lore; }
  onEaten(e) { try { e.player.heal(HONEY_HEAL); } catch { /* a test double */ } }
}

export class SwarmStingerItem extends ItemType {
  name = 'Ferrão do Enxame';
  icon = STINGER;
  stack = 64;
  lore;
  constructor(lore) { super(); this.lore = lore; }
}

// 16 x 16 pictures, one letter per pixel ('.' = transparent)
const draw = (t, rows, pal) => rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') t.set(x, y, pal[ch]); }));
// Wild Honey: a chunk of wax comb (two rows of hexagon cells, each a dark well with a lit left wall and a glint, the wax
// lit from the top-left), heavy with amber honey flooding the lower cells and running out below in two drips
const HONEY_ICON = [
  '................',
  '....ooooooo.....',
  '...owwwhhhhho...',
  '..owhcchhcchho..',
  '..owcKKccKKcho..',
  '..ohhcchhcchwo..',
  '..ohhhhcchhhho..',
  '..ohcchKKhcchho.',
  '..oAcchcchccAo..',
  '..oAAaaaaaaaaoo.',
  '..oaaaaaaaaddo..',
  '...oaaoaaaaddo..',
  '....Ado.oaddo...',
  '....ad..odo.....',
  '.....d...d......',
  '................',
];
// the Stinger: a thick glossy black barb curving up to the right out of the torn last segment of the abdomen (saffron
// and rust bands with a dark outline); a lit edge along its upper side, barbs notched on the underside, a bead of venom
// at the point
const STINGER_ICON = [
  '................',
  '.............vV.',
  '............gkv.',
  '...........gkk..',
  '..........gkkb..',
  '.........gkkb...',
  '.........gkk....',
  '........gkkb....',
  '.......gkkb.....',
  '......gkkk......',
  '...oookkko......',
  '..oyYrrkyyo.....',
  '..orryyyrro.....',
  '..oyyrrryyo.....',
  '..orrsyyrso.....',
  '...oooooo.......',
];
const PAL = {
  o: '#3e2208', w: '#f8e8a8', W: '#fff4c8', h: '#f0c850', c: '#b47a1e', K: '#7a4a10', H: '#ffd86a',
  a: '#e09420', A: '#f6b63a', d: '#b4600e',
  k: '#1a100a', g: '#7a6454', b: '#0c0604', v: '#d8f070', V: '#f4ffb0', y: '#f0ac2a', Y: '#ffd25c', r: '#4a1a0a', s: '#2a1008',
};

export function paintSwarmIcons(ctx) {
  ctx.textures.paint('wild_honey', (t) => draw(t, HONEY_ICON, PAL));
  ctx.textures.paint('swarm_stinger', (t) => draw(t, STINGER_ICON, PAL));
}

/** @param {any} ctx */
export function registerSwarmItems(ctx) {
  ctx.effects.register('swarm_sting', new SwarmSting());
  ctx.damage.type('swarm_sting', new SwarmStingDamage());
  ctx.damage.type('swarm_venom', new SwarmVenomDamage());
  paintSwarmIcons(ctx);
  const text = (key, fallback) => ctx.lang.text(key, undefined, fallback);
  ctx.items.register('wild_honey', new WildHoneyItem([text('swarm.honey.lore1', 'Um favo arrancado de um Enxame-Ferrão.'), text('swarm.honey.lore2', 'Doce e morno: cura um pouco.')]));
  ctx.items.register('swarm_stinger', new SwarmStingerItem([text('swarm.stinger.lore1', 'O ferrão farpado de um Enxame-Ferrão.'), text('swarm.stinger.lore2', 'Com um graveto vira flechas.')]));
  ctx.recipes.add({ key: 'arrows_from_swarm_stinger', out: 'mineclaude:arrow', n: 3, in: [[STINGER, 1], ['mineclaude:stick', 1]] });
}
