// @ts-check
// The hermit's drop: "Garra de Ermitão" (creatures:hermit_claw), the big claw, with an icon painted in code (original
// pixel art). It is food (the sweet meat inside the claw) and a little crafting: two claws and a stick make three arrows
// (the claw's dark tip is a fine arrowhead).

// The icon (16 x 16): the big claw seen from the side, OPEN — the heavy coral-red palm (lit from above: a light orange
// top, a dark red underside, cream tubercles), the fixed finger pointing right and the hinged finger raised to the upper
// right, both serrated with cream teeth and ending in dark hooked tips, the pale underside and a stub of the wrist at
// the lower left.
const CLAW_ART = [
  '................',
  '............kk..',
  '..........kkLtk.',
  '.........kLMMtk.',
  '........kLMMDk..',
  '.......kLMSDk...',
  '...kkkkLMMSk....',
  '..kLLLLMMSMk....',
  '.kLMMTMMMMMkkkk.',
  '.kMMMMMTMMSMMMtk',
  '.kMMTMMMMMSDDDtk',
  'kWMMMMMTMDDDkkk.',
  'kWWMMMMMDDDk....',
  'kWWkkDDDDkk.....',
  '.kk..kkkk.......',
  '................',
];
const CLAW_INK = { k: '#3a1a10', L: '#f08a56', M: '#d8542c', D: '#8c3018', t: '#2c150d', W: '#f0c9a0', T: '#f7e2bc', S: '#f7e2bc' };
export function paintClawIcon(ctx) {
  ctx.textures.paint('hermit_claw', (t) => {
    CLAW_ART.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== '.') t.set(x, y, CLAW_INK[row[x]]); });
  });
}

/** @param {any} ctx */
export function registerClaw(ctx) {
  paintClawIcon(ctx);
  ctx.items.register('hermit_claw', {
    name: 'Garra de Ermitão', icon: 'creatures:hermit_claw', group: 'mineclaude:items', stack: 64, food: 4,
    lore: [
      ctx.lang.text('hermit.claw_lore1', undefined, 'A garra grande de um Ermitão das Marés.'),
      ctx.lang.text('hermit.claw_lore2', undefined, 'Carne doce por dentro; a ponta serve de flecha.'),
    ],
  });
  ctx.recipes.add({ key: 'arrows_from_hermit_claw', out: 'mineclaude:arrow', n: 3, in: [['creatures:hermit_claw', 2], ['mineclaude:stick', 1]] });
}
