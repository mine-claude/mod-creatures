// @ts-check
// The Root Serpent's drop, "Casca Viva" (creatures:living_bark): a strip of its bark that still pulses with sap. Its icon is
// painted in code (original pixel art, the serpent's own palette): a curled strip of bark lying diagonally — dark walnut
// outer bark with deep furrows and lighter weathered ridges, the pale inner wood showing at the curl, a vein of glowing
// AMBER sap down the middle (a drop of it run off the edge), and a tuft of moss on the top edge. A cheap use: one strip
// splits into two planks.
import { ItemType } from '../mineclaude-sdk.js';
import { BARK } from './tuning.ts';

export class LivingBarkItem extends ItemType {
  name = 'Casca Viva';
  icon = BARK;
  stack = 64;
  lore;
  constructor(lore) { super(); this.lore = lore; }
}

export const BARK_RECIPE = { key: 'planks_from_living_bark', out: 'mineclaude:planks', n: 2, in: [[BARK, 1]] };

export function paintBarkIcon(ctx) {
  ctx.textures.paint('living_bark', (t) => {
    const OUT = ['#4a3424', '#563c28', '#3b2a1c'], RIDGE = '#7d5f40', RIDGEL = '#9a7a52', FURROW = '#1f140d', INNER = '#c9a878', INNERD = '#a8865a';
    const SAP = '#e8a53a', SAPD = '#b5762a', MOSS = ['#4f7a2e', '#6fa040', '#3a5c21'], EDGE = '#1e150d';
    // the strip: a band 5 pixels wide along the (1, -1) diagonal, from the bottom left to the top right
    for (let i = 0; i <= 12; i++) {
      const cx = 2 + i, cy = 13 - i;
      for (let k = -2; k <= 2; k++) {
        const x = cx + Math.ceil(k / 2), y = cy + Math.floor(k / 2); // k diagonal levels across the strip (x + y = 15 + k): a solid band
        if (x < 0 || y < 0 || x > 15 || y > 15) continue;
        let c = t.pick(OUT);
        if (k === -2 || k === 2) c = EDGE;
        else if ((i + k) % 3 === 0) c = FURROW; // furrows across the ridges
        else if (k === -1) c = i % 5 === 2 ? RIDGEL : RIDGE; // the lit ridge, weathered paler in places
        if (k === 0) c = i % 4 === 1 ? SAPD : SAP; // the sap vein down the middle
        if (i >= 10 && k >= 0) c = k === 0 ? INNERD : INNER; // the curl at the top end shows the pale inner wood
        t.set(x, y, c);
      }
    }
    // the moss tuft on the upper edge, and a fleck of sap that has run
    for (const [x, y] of [[5, 8], [6, 7], [6, 8], [7, 7], [4, 9]]) t.set(x, y, t.pick(MOSS));
    t.set(9, 9, SAP); t.set(10, 10, SAPD); // a drop of sap that has run off the edge
    t.set(14, 2, EDGE); t.set(15, 1, INNERD);
  });
}

/** @param {any} ctx */
export function registerBark(ctx) {
  paintBarkIcon(ctx);
  const text = (key, fallback) => ctx.lang.text(key, undefined, fallback);
  ctx.items.register('living_bark', new LivingBarkItem([
    text('serpent.bark.lore1', 'A casca de uma Serpente de Raízes.'),
    text('serpent.bark.lore2', 'A seiva ainda corre por ela, devagar.'),
  ]));
  ctx.recipes.add(BARK_RECIPE);
}
