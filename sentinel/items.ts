// @ts-check
// The Canopy Sentinel's items, with their icons painted in code (original pixel art):
//   feather       "Pena"                      — what its mantle sheds; with a stick and gravel it fletches six arrows
//   sentinel_bow  "Arco Longo da Sentinela"   — its rare drop: a USABLE bow (the engine's charge bow, `ranged`), with the
//                                              game's arrows as ammo
import { ItemType } from '../mineclaude-sdk.js';

export class FeatherItem extends ItemType {
  name = 'Pena';
  icon = 'creatures:feather';
  stack = 64;
  lore = ['Do manto de uma Sentinela das Copas.', 'Com graveto e cascalho vira flecha.'];
}

export class SentinelBowItem extends ItemType {
  name = 'Arco Longo da Sentinela';
  icon = 'creatures:sentinel_bow';
  stack = 1;
  rarity = 'rare';
  ranged = { mode: 'charge', ammo: 'mineclaude:arrow' };
  lore = ['Teixo curvado, cabo de musgo trançado.', 'Segure o clique direito para puxar.'];
}

export const FEATHER_RECIPE = { key: 'arrows_from_feather', out: 'mineclaude:arrow', n: 6, in: [['creatures:feather', 1], ['mineclaude:stick', 1], ['mineclaude:gravel', 1]] };

export function paintSentinelIcons(ctx) {
  // a curved forest feather lying diagonally (quill at the bottom left, tip at the top right): a pale quill down the
  // middle, a dark-green vane with a lit edge, two dark bands across it, a split in the barbs and an ochre tip
  ctx.textures.paint('feather', (t) => {
    const VANE = ['#3c4f3a', '#46603f', '#56704f'], LIT = '#6a8560', DARK = '#27352a', QUILL = '#d8cfa8', TIP = '#c9ad74';
    const inside = (x, y) => x >= 0 && y >= 0 && x <= 15 && y <= 15;
    // the spine: a gentle arc from (2,14) to (13,2); the vane sits across it (along the (1,1) diagonal), both sides
    const spine = [];
    for (let i = 0; i <= 11; i++) spine.push([2 + i, 14 - i - (i > 7 ? 1 : 0)]);
    spine.forEach(([x, y], i) => {
      const w = i < 2 ? 0 : i < 4 ? 1 : i < 9 ? 2 : 1; // the vane's half-width: bare quill, widening, tapering to the tip
      for (let k = -w; k <= w; k++) {
        if (k === 0) continue;
        let c = t.pick(VANE);
        if (i === 5 || i === 8) c = DARK; // two dark bands across the vane
        if (k === -w) c = LIT; // the lit edge, toward the light (upper left)
        if (i >= 10) c = TIP;
        // two pixels per step across the diagonal, so the vane is solid (one parity alone leaves a checkerboard)
        if (inside(x + k, y + k)) t.set(x + k, y + k, c);
        if (inside(x + k + 1, y + k)) t.set(x + k + 1, y + k, c);
      }
    });
    spine.forEach(([x, y], i) => t.set(x, y, i >= 10 ? TIP : QUILL));
    t.set(1, 15, QUILL); t.set(14, 1, TIP); // the bare quill's end and the very tip
    t.set(8, 10, '#000000', 0); t.set(9, 11, '#000000', 0); // a split in the barbs, cut in from the lower edge
  });
  // a recurve longbow strung: the stave is an arc bulging to the upper left (dark yew back, pale sapwood belly on the
  // string side), horn tips that hook back, a leather grip wrapped in red cord at the arc's middle, and the string a
  // straight pale line from tip to tip across the lower right
  ctx.textures.paint('sentinel_bow', (t) => {
    const BACK = '#6e381c', DARKW = '#4a2212', BELLY = '#a8703a', HORN = '#d9cbab', HORND = '#8c7a5a', GRIP = '#4a3220', CORD = '#8a3a2e', STR = '#e8dfc4', STRD = '#cfc5aa';
    const inside = (x, y) => x >= 0 && y >= 0 && x <= 15 && y <= 15;
    // the stave, upper tip to lower tip, symmetric about the x = y diagonal, bulging to the upper left (the grip at
    // (5,5)); the horn tips hook back toward the string; the string runs tip to tip along x + y = 18, three pixels
    // behind the grip's belly (the brace height)
    const stave = [[15, 2], [14, 1], [13, 1], [12, 1], [11, 1], [10, 1], [9, 2], [8, 2], [7, 3], [6, 4], [5, 5], [4, 6], [3, 7], [2, 8], [2, 9], [1, 10], [1, 11], [1, 12], [1, 13], [1, 14], [2, 15]];
    stave.forEach(([x, y], i) => {
      const horn = i < 2 || i > 18, grip = i >= 9 && i <= 11;
      t.set(x, y, horn ? HORN : grip ? (i === 10 ? GRIP : CORD) : i % 4 === 2 ? DARKW : BACK);
      if (horn) return;
      t.set(x + 1, y + 1, grip ? (i === 10 ? CORD : GRIP) : BELLY); // the belly, one pixel toward the string
    });
    t.set(14, 2, HORND); t.set(2, 14, HORND); // the horn's dark underside, where the string's loop sits
    for (let i = 0; i <= 12; i++) t.set(15 - i, 3 + i, i % 3 === 1 ? STRD : STR); // the string, tip to tip
  });
}
