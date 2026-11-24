// @ts-check
// The beetle's drop: "Fragmento de Cristal" (creatures:crystal_shard), a sliver of its glowing shell, with an icon painted
// in code (original pixel art). Its use: the shard still holds light — one shard and one stick make six torches
// (coal makes four).

// The icon (16 x 16, original pixel art): a long six-sided crystal lying on the diagonal, broken off at the lower end
// and pointed at the upper one, cut into three faces — the lit face along the upper edge, the cyan middle and the shaded
// lower face — with a vein of violet light down its core, a dark rim and a sparkle at the tip.
const SHARD_ART = [
  '..............s.',
  '.............sWs',
  '............oLMo',
  '...........oLMDo',
  '..........oLMDdo',
  '.........oLMVDdo',
  '........oLMVDdo.',
  '.......oLMVDdo..',
  '......oLMVvDo...',
  '.....oLMVvDdo...',
  '....oLMMvDdo....',
  '...oLMVvDdo.....',
  '..oLMvDdo.......',
  '.oLMvDo.........',
  '.oMvDo..........',
  '..ooo...........',
];
const SHARD_INK = { o: '#141a33', L: '#d8faff', M: '#7fe8ff', D: '#3f7fc7', d: '#2b5aa0', V: '#b48cff', v: '#6f4fc4', W: '#ffffff', s: '#bff4ff' };
export function paintShardIcon(ctx) {
  ctx.textures.paint('crystal_shard', (t) => {
    SHARD_ART.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== '.') t.set(x, y, SHARD_INK[row[x]]); });
  });
}

/** @param {any} ctx */
export function registerShard(ctx) {
  paintShardIcon(ctx);
  ctx.items.register('crystal_shard', {
    name: 'Fragmento de Cristal', icon: 'creatures:crystal_shard', group: 'mineclaude:items', stack: 64,
    lore: [
      ctx.lang.text('beetle.shard_lore1', undefined, 'Um pedaço da carapaça de um Escaravelho de Cristal.'),
      ctx.lang.text('beetle.shard_lore2', undefined, 'Ainda brilha no escuro.'),
    ],
  });
  ctx.recipes.add({ key: 'torch_from_crystal_shard', out: 'mineclaude:torch', n: 6, in: [['creatures:crystal_shard', 1], ['mineclaude:stick', 1]] });
}
