// @ts-check
// The Ruin Colossus's drop, "Núcleo Rúnico" (creatures:rune_core): the heart-stone that kept it moving, still warm with
// light. Its icon is painted in code (original pixel art): a rough faceted lump of basalt lit from the top left (a pale
// facet up there, the underside nearly black), cut by amber rune CHANNELS that run as a circuit — a spine, branches with
// right-angle turns — to a teal sigil (a ring round a white-hot centre) in the middle, with a glint of amber at the
// channels' ends and two chips of carved sandstone still mortared to its lower right. Epic rarity: its slot glows.
// A use: with a stick it makes torches that burn long (eight).
import { RUNE_CORE } from './tuning.ts';

const CORE_ART = [
  '................',
  '.....ooooo......',
  '...ooLLLgBbo....',
  '..oLLLgBBaBbo...',
  '..oLgBBBBaBBbo..',
  '.oLgBaaaaaaBbbo.',
  '.oLBBaBtTtBaBbo.',
  '.ogBBaBTWTBaAao.',
  '.oBBBaBtTtBaBbo.',
  '.oBBBaaaaaaaBso.',
  '.oBbBBBBaBBBSso.',
  '..obBBBBaBBbSo..',
  '..ooBbbbAbbbso..',
  '...oobbbbbboo...',
  '.....ooooooo....',
  '................',
];
const CORE_INK = {
  o: '#121417', L: '#7d8891', g: '#5a646b', B: '#2f353a', b: '#1f2427',
  A: '#ffd27a', a: '#f59a2e', t: '#3fd9c4', T: '#9ff7e8', W: '#ffffff', S: '#b3966d', s: '#7a7260',
};

export function paintCoreIcon(ctx) {
  ctx.textures.paint('rune_core', (t) => {
    CORE_ART.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== '.') t.set(x, y, CORE_INK[row[x]]); });
  });
}

/** @param {any} ctx */
export function registerCore(ctx) {
  paintCoreIcon(ctx);
  ctx.items.register('rune_core', {
    name: 'Núcleo Rúnico', icon: RUNE_CORE, group: 'mineclaude:items', stack: 16, rarity: 'epic',
    lore: [
      ctx.lang.text('colossus.core.lore1', undefined, 'O coração de pedra de um Colosso de Ruína.'),
      ctx.lang.text('colossus.core.lore2', undefined, 'As runas ainda brilham, mornas.'),
    ],
  });
  ctx.recipes.add({ key: 'torches_from_rune_core', out: 'mineclaude:torch', n: 8, in: [[RUNE_CORE, 1], ['mineclaude:stick', 1]] });
}
