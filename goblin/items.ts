// @ts-check
// The goblin's two items, with their icons painted in code (original pixel art):
//   goblin_pebble  "Pedrinha"        — what it throws; a player can throw it too (right click, small damage)
//   goblin_pouch   "Bolsa de Goblin" — right click opens it: a handful of pebbles and, sometimes, a small find
import { ItemType } from '../mineclaude-sdk.js';
import { PEBBLE_PROJECTILE } from './goals.ts';

const PLAYER_THROW_SPEED = 18;

export class GoblinPebbleItem extends ItemType {
  name = 'Pedrinha';
  icon = 'creatures:goblin_pebble';
  stack = 64;
  lore = ['Clique direito: arremessa.'];
  onUse(e) {
    const { eye, look } = e.player;
    const from = { x: eye.x + look.x * 0.6, y: eye.y + look.y * 0.6, z: eye.z + look.z * 0.6 };
    const id = e.world.shootProjectile(PEBBLE_PROJECTILE, { from, velocity: { x: look.x * PLAYER_THROW_SPEED, y: look.y * PLAYER_THROW_SPEED + 2, z: look.z * PLAYER_THROW_SPEED }, owner: e.player });
    if (id !== null) e.player.take('creatures:goblin_pebble', 1);
    return 'success';
  }
}

// what a pouch may hold besides pebbles: [item, count, chance]
export const POUCH_FINDS = [['mineclaude:coal', 1, 0.35], ['mineclaude:iron_ingot', 1, 0.12], ['mineclaude:bone', 1, 0.25]];

export class GoblinPouchItem extends ItemType {
  name = 'Bolsa de Goblin';
  icon = 'creatures:goblin_pouch';
  stack = 16;
  lore = ['Clique direito: abre a bolsa.'];
  onUse(e) {
    if (!e.player.take('creatures:goblin_pouch', 1)) return 'fail';
    e.player.give('creatures:goblin_pebble', 2 + Math.floor(Math.random() * 3), { partial: true });
    for (const [item, n, chance] of POUCH_FINDS) if (Math.random() < chance) e.player.give(item, n, { partial: true });
    return 'success';
  }
}

export function paintGoblinIcons(ctx) {
  // a rounded grey pebble with a lighter top and a dark underside
  ctx.textures.paint('goblin_pebble', (t) => {
    const rows = [[6, 9], [4, 11], [3, 12], [3, 12], [3, 12], [4, 11], [5, 10]];
    rows.forEach(([a, b], i) => { for (let x = a; x <= b; x++) t.set(x, 5 + i, i < 2 ? '#a8a8a0' : i > 4 ? '#5e5e58' : t.pick(['#8a8a84', '#7e7e78', '#929289'])); });
    t.set(6, 6, '#c4c4bc'); t.set(7, 6, '#c4c4bc'); t.set(9, 8, '#6a6a64');
  });
  // a patched leather pouch tied with a cord, a pebble peeking out
  ctx.textures.paint('goblin_pouch', (t) => {
    for (let y = 6; y <= 13; y++) {
      const half = y < 8 ? 3 + (y - 6) : y > 11 ? 5 - (y - 11) : 5;
      for (let x = 8 - half; x <= 7 + half; x++) t.set(x, y, x === 8 - half || x === 7 + half || y === 13 ? '#4e361c' : t.pick(['#7d5a32', '#76552f', '#86623a']));
    }
    for (let x = 6; x <= 9; x++) t.set(x, 5, '#5e4224'); // the gathered neck
    for (let x = 5; x <= 10; x++) t.set(x, 6, '#c9b07a'); // the cord
    t.set(4, 7, '#c9b07a'); t.set(3, 8, '#c9b07a');
    for (let y = 9; y <= 11; y++) for (let x = 9; x <= 11; x++) t.set(x, y, '#8c3b2e'); // a red patch
    t.set(10, 10, '#d9c9a0');
    t.set(7, 3, '#8a8a84'); t.set(8, 3, '#8a8a84'); t.set(7, 4, '#6a6a64'); t.set(8, 4, '#8a8a84'); // a pebble at the mouth
  });
}
