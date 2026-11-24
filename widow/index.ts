// @ts-check
// Everything of the Dune Widow (Viúva das Dunas), registered in one call so the mod's entry stays one line:
//   registerWidow(ctx)   content (src/main.ts, both sides): its sounds, the sand-burst particle, the venom (an effect)
//                        and the two damage types (the sting, the venom), the Chitin and Stinger items with their icons
//                        painted in code, the desert spawn condition and the mob.
// It has no browser-only part: the body is a file model (models/widow) with a code gait (widow/model.ts).
import { DamageType, EffectType, ItemType, ParticleType } from '../mineclaude-sdk.js';
import { MOB_PATH, SOUND_DIR } from './anatomy.ts';
import DuneWidow from './mob.ts';
import { OVERWORLD, desertSand } from './spawn.ts';
import { inOpenOverworld } from '../src/spawn.ts';
import { HOME, HOME_GROUND, homeRules } from '../src/biome-homes.ts';

export const WIDOW_SOUNDS = ['hiss', 'erupt', 'grab', 'sting', 'burrow', 'hurt', 'death'];

// the sand thrown up when it erupts or digs in: coarse grains in the desert's colours, falling back fast
export class WidowSand extends ParticleType {
  colors = ['#e3cf9a', '#d4b97c', '#c4a468', '#efe0b8', '#b08f55'];
  size = 0.09; life = 0.9; gravity = 1.2; speed = 4.2; spread = 0.6; rise = 3.5; drag = 0.5;
  collide = true; bounce = 0.15; shrink = true; burst = 64;
}

// the venom: one point of damage every 1.5 s per level; it weakens, it does not finish anyone off (stops at 1 health)
export class WidowVenom extends EffectType {
  name = 'Veneno da Viúva';
  color = '#a7c83a';
  beneficial = false;
  every = 1.5;
  onTick(e) {
    if (e.player.dead || e.player.health <= 1) return;
    e.player.damage(Math.min(e.level, e.player.health - 1), 'creatures:widow_venom');
  }
}

export class WidowSting extends DamageType {
  name = 'Ferroada';
  armored = true;
  shield = true;
  pvp = false;
  deathMessage(e) { return `${e.player} foi ferroado por uma Viúva das Dunas`; }
}

export class WidowVenomDamage extends DamageType {
  name = 'Veneno';
  armored = false; // it is in the blood: armour does not help
  shield = false;
  pvp = false;
  deathMessage(e) { return `${e.player} sucumbiu ao veneno da Viúva das Dunas`; }
}

export class ChitinItem extends ItemType {
  name = 'Quitina';
  icon = 'creatures:chitin';
  stack = 64;
  constructor(lore) { super(); this.lore = lore; }
  lore;
}

export class StingerItem extends ItemType {
  name = 'Ferrão da Viúva';
  icon = 'creatures:widow_stinger';
  stack = 16;
  constructor(lore) { super(); this.lore = lore; }
  lore;
}

// The two icons, drawn as 16 x 16 pictures (one letter per pixel, '.' = transparent) in the skin's own colours, lit from
// the top-left like the mod's other icons (a dark outline, a highlight on the upper-left, the shadow side on the right).
const draw = (t, rows, pal) => rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') t.set(x, y, pal[ch]); }));
// Chitin: a shield-shaped plate broken off the carapace, two dark bands across it, dusted with sand, a glossy crown
const CHITIN_ICON = [
  '................',
  '.....aaaaa......',
  '...aahhhhhaa....',
  '..ahhhhhhhhka...',
  '..ahhggggggka...',
  '..adddddddkka...',
  '..ahgggggggka...',
  '..aggsggggmka...',
  '..agdddddddka...',
  '...aggggggmka...',
  '...aggsggmkka...',
  '....aggggkka....',
  '.....agkkka.....',
  '......aaaa......',
  '................',
  '................',
];
// the Stinger: the venom bulb (a green glow through the sac) and the black hooked barb curving up from it, a drop of
// venom at the point, the torn stump of the last tail segment under it
const STINGER_ICON = [
  '................',
  '.............w..',
  '...........xkw..',
  '..........xkk...',
  '.........xkk....',
  '........xkk.....',
  '.......xkk......',
  '.....eekkk......',
  '....ehhekk......',
  '...ehhrrre......',
  '...ehrrrrre.....',
  '...errvvrre.....',
  '..tervvvee......',
  '.tttevvee.......',
  '.tdtt...........',
  '................',
];
const ICON_PALETTE = {
  a: '#3f2d14', h: '#f0dcaa', g: '#dcbf7e', m: '#ccab6c', k: '#a07f4c', d: '#75532f', s: '#fbf2d2',
  e: '#521410', r: '#8a2a18', v: '#a7c83a', w: '#d6f06a', t: '#dcbf7e', x: '#4a3a2c',
};
const STINGER_PALETTE = { ...ICON_PALETTE, h: '#c25a40', k: '#1c120a' };

export function paintWidowIcons(ctx) {
  ctx.textures.paint('chitin', (t) => draw(t, CHITIN_ICON, ICON_PALETTE));
  ctx.textures.paint('widow_stinger', (t) => draw(t, STINGER_ICON, STINGER_PALETTE));
}

/** @param {any} ctx */
export function registerWidow(ctx) {
  for (const name of WIDOW_SOUNDS) ctx.sounds.file(`widow_${name}`, `${SOUND_DIR}/${name}.wav`);
  const sound = (name) => `creatures:widow_${name}`;
  ctx.particles.register('widow_sand', new WidowSand());
  ctx.effects.register('widow_venom', new WidowVenom());
  ctx.damage.type('widow_sting', new WidowSting());
  ctx.damage.type('widow_venom', new WidowVenomDamage());

  paintWidowIcons(ctx);
  const text = (key, fallback) => ctx.lang.text(key, undefined, fallback);
  ctx.items.register('chitin', new ChitinItem([text('widow.chitin.lore1', 'Placa da carapaça de uma Viúva das Dunas.'), text('widow.chitin.lore2', 'Leve, dura e ainda quente do sol.')]));
  ctx.items.register('widow_stinger', new StingerItem([text('widow.stinger.lore1', 'O ferrão de uma Viúva das Dunas.'), text('widow.stinger.lore2', 'Ainda pinga veneno: cuidado.')]));

  // The world, for the spawn test: read lazily (only the server draws spawns; ctx.dimensions.world exists only there).
  let world = null;
  const getBlock = (pos) => {
    try { world ??= ctx.dimensions.world(OVERWORLD); return world.getBlock(pos); } catch { return null; }
  };
  const test = desertSand(getBlock);
  // On desert sand, day and night, and MORE at dusk and dawn (the twilight: a night spot with some light left adds its own
  // rule on top of the night's). By day it is a named condition of the 'day' situation (a hostile's own rules are for the
  // night). At most 2 near a player at night, 3 in the twilight, 1 by day.
  ctx.mobs.spawnCondition('desert_day', { situation: 'day', test });
  const ground = ['mineclaude:sand'];
  const spawn = [
    { when: 'night', weight: 8, cap: 2, ground, test },
    { when: 'night', light: { min: 0.08 }, weight: 14, cap: 3, ground, test },
    { when: 'creatures:desert_day', weight: 4, cap: 1, ground, test },
    // home: the Dunas Vermelhas (biome worlds only; elsewhere these never match and the draw is the old one). Its red sand
    // is sand to the widow (mob.ts isSand: any `*_sand`), so it erupts, burrows and comes up in it like in the desert.
    ...homeRules(HOME.red_dunes, HOME_GROUND.red_dunes, [
      { when: 'night', weight: 30, cap: 3, test: inOpenOverworld },
      { when: 'creatures:home_day', weight: 14, cap: 2, test: inOpenOverworld },
    ]),
  ];
  ctx.mobs.register(MOB_PATH, new DuneWidow({ spawn, sound }));
}
