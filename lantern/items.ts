// @ts-check
// The Lure Lantern's drop, "Glândula Luminosa" (creatures:glow_gland): the organ that lit its lure, still faintly warm.
// Its icon is painted in code (original pixel art, the lantern's own palette): a teardrop gland in a deep-teal membrane
// with dark veins, amber glowing through from the core (lit from the top left), two mint bioluminescent beads, and a
// torn stalk at the top. A use for it: with a stick it makes torches.
import { GLAND } from './tuning.ts';

export function paintGlandIcon(ctx) {
  ctx.textures.paint('glow_gland', (t) => {
    // the teardrop: rows [from, to] from the top (y = 3) down
    const rows = [[7, 8], [6, 9], [5, 10], [4, 11], [4, 11], [3, 12], [3, 12], [3, 12], [4, 11], [4, 11], [5, 10], [6, 9]];
    rows.forEach(([a, b], i) => {
      const y = 3 + i;
      for (let x = a; x <= b; x++) {
        const edge = x === a || x === b || i === rows.length - 1 || i === 0;
        const cx = x - 7.5, cy = y - 9.5, r = Math.hypot(cx * 0.9, cy);
        const lit = (cx + cy) < -2.5; // the top-left rim catches the light
        const c = edge ? (lit ? '#3e6a5c' : '#1a2a26') : r < 1.5 ? '#fff2c0' : r < 2.8 ? '#ffc65a' : r < 4.0 ? '#f09a34' : r < 4.8 ? '#8a5a2e' : (lit ? '#3e6a5c' : '#24403a');
        t.set(x, y, c);
      }
    });
    // dark veins on the membrane, the mint beads, a highlight on the core, the torn stalk
    for (const [x, y] of [[4, 9], [5, 11], [11, 7], [11, 10], [10, 12], [5, 6]]) t.set(x, y, '#1a2a26');
    t.set(4, 8, '#9fe8c8'); t.set(11, 11, '#9fe8c8');
    t.set(6, 7, '#fff8e0'); t.set(7, 7, '#ffe7a8');
    t.set(7, 1, '#2e4a44'); t.set(8, 2, '#2e4a44'); t.set(7, 2, '#1a2a26');
  });
}

/** @param {any} ctx */
export function registerGland(ctx) {
  paintGlandIcon(ctx);
  ctx.items.register('glow_gland', {
    name: 'Glândula Luminosa', icon: GLAND, group: 'mineclaude:items',
    lore: [ctx.lang.text('lantern.gland.lore1', undefined, 'O órgão que acendia a isca de um Lampiraço.'), ctx.lang.text('lantern.gland.lore2', undefined, 'Ainda morna, ainda brilha um pouco.')],
  });
  ctx.recipes.add({ key: 'torches_from_glow_gland', out: 'mineclaude:torch', n: 4, in: [[GLAND, 1], ['mineclaude:stick', 1]] });
}
