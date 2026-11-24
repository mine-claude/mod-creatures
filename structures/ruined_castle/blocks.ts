// @ts-check
// The Ruined Castle's blocks and their pixel art (painted by code at load: ctx.textures.paint, nothing copied from any
// game). The base game has no stone bricks, so the castle brings its own masonry (plain, cracked and mossy), plus the
// furniture of its rooms as non-cube geometry: the long table and chairs of the great hall, the throne, the banners, the
// bookshelves of the library, the broken portcullis bars, the wall sconces (lit: emissive) and the brazier (lit; its
// flickering fire is a block-entity renderer, renderer.ts).

const PX = 1 / 16;
const FACING_STATES = { properties: { facing: ['n', 'e', 's', 'w'] }, default: { facing: 'n' }, bind: { facing: 'facing' }, placement: { facing: 'horizontal_facing' } };

/** Pure hash of integer pixel coordinates and a salt -> [0, 1) (the art is the same on every machine). */
export function px(x: number, y: number, salt = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const pickOf = (pal: string[], v: number) => pal[Math.min(pal.length - 1, Math.floor(v * pal.length))];

// ---------------------------------------------------------------- the painters: (x, y) -> [color, alpha] | null (clear)
type Ink = [string, number] | null;
const STONE = ['#7f858c', '#888e95', '#767c83', '#8f949a'];
const MORTAR = ['#4f5358', '#565a5f'];
/** Ashlar: rows of 4 px, blocks 8 px long, every other row offset by 4; a lit top edge, a dark bottom edge. */
function brickInk(x: number, y: number, salt: number): Ink {
  const row = y >> 2, off = (row & 1) * 4, bx = ((x + off) & 15) >> 3;
  const mortar = (y & 3) === 3 || ((x + off) & 7) === 7;
  if (mortar) return [pickOf(MORTAR, px(x, y, salt + 1)), 255];
  const tone = px(bx, row, salt + 2); // one tone per block
  const base = tone < 0.25 ? '#7a8087' : tone < 0.5 ? '#858b92' : tone < 0.75 ? '#8d9299' : '#7f858c';
  if ((y & 3) === 0) return ['#9aa0a6', 255];
  if ((y & 3) === 2 && px(x, y, salt + 3) < 0.4) return ['#6f757c', 255];
  return [px(x, y, salt + 4) < 0.12 ? pickOf(STONE, px(y, x, salt)) : base, 255];
}
const brick = (x: number, y: number) => brickInk(x, y, 10);
const cracked = (x: number, y: number): Ink => {
  // two jagged cracks running across the blocks
  const c1 = Math.round(4 + x * 0.55 + Math.sin(x * 1.7) * 1.2), c2 = Math.round(13 - x * 0.4 + Math.cos(x * 1.3));
  if (y === c1 && x > 1 && x < 13) return ['#3c3f43', 255];
  if (y === c2 && x > 5) return ['#41454a', 255];
  if (y === c1 + 1 && x > 1 && x < 13 && px(x, y, 3) < 0.5) return ['#5d6267', 255];
  return brickInk(x, y, 20);
};
const MOSS = ['#4f7d2e', '#5f9136', '#3f6a26', '#6fa043'];
const mossy = (x: number, y: number): Ink => {
  const base = brickInk(x, y, 30);
  // moss grows down from the top and sits in the mortar lines
  const reach = 4 + Math.floor(px(x, 0, 31) * 6);
  if (y < reach && px(x, y, 32) < 0.85 - y * 0.05) return [pickOf(MOSS, px(x, y, 33)), 255];
  if (base && (base[0] === MORTAR[0] || base[0] === MORTAR[1]) && px(x, y, 34) < 0.55) return [pickOf(MOSS, px(y, x, 35)), 255];
  return base;
};
const mossyTop = (x: number, y: number): Ink => (px(x, y, 36) < 0.7 ? [pickOf(MOSS, px(x, y, 37)), 255] : brickInk(x, y, 38));
const WOOD = ['#5b3a22', '#664229', '#53341e', '#6e4a2e'];
const wood = (x: number, y: number): Ink => {
  const plank = y >> 2;
  if ((y & 3) === 3) return ['#3a2414', 255];
  const grain = px(Math.floor(x / 3) + plank * 7, y, 40);
  return [grain < 0.15 ? '#47301b' : pickOf(WOOD, px(plank, Math.floor(x / 4), 41)), 255];
};
const BOOKS = ['#7a2323', '#2f4f7a', '#3d6b37', '#8a6a2a', '#5b2f6e', '#a0522d', '#2e5e5e', '#6b6b6b'];
const shelfSide = (x: number, y: number): Ink => {
  if (y === 0 || y === 15 || y === 7 || y === 8 || x === 0 || x === 15) return [y === 7 || y === 8 ? '#47301b' : '#5b3a22', 255];
  const half = y < 8 ? 0 : 1, top = half ? 9 : 1;
  let col = 1, i = 0;
  while (col < 15) { // books of 1..2 px, some short, an empty gap now and then
    const w = 1 + Math.floor(px(i, half, 50) * 2), gap = px(i, half, 51) < 0.1;
    if (x >= col && x < col + w) {
      if (gap) return ['#24170d', 255];
      const hgt = 4 + Math.floor(px(i, half, 52) * 3);
      if (y < top + (6 - hgt)) return ['#24170d', 255];
      const c = BOOKS[Math.floor(px(i, half, 53) * BOOKS.length)];
      return [y === top + 6 - hgt + 1 && px(i, half, 54) < 0.5 ? '#d9c27a' : c, 255];
    }
    col += w; i++;
  }
  return ['#24170d', 255];
};
const RED = ['#8e1f24', '#9b2328', '#821b20'];
const bannerArt = (tail: boolean) => (x: number, y: number): Ink => {
  // a deep red cloth with a gold border and, on the upper part, an original emblem: a tower over two crossed lines
  if (!tail && y <= 1) return ['#3a2414', 255]; // the rod it hangs from
  if (tail) {
    const cut = 9 + Math.floor(px(x, 0, 60) * 6) - (x % 5 === 2 ? 3 : 0); // tattered, torn hem
    if (y > cut) return null;
    if (px(x, y, 61) < 0.05) return null; // moth holes
  }
  if (x <= 1 || x >= 14) return [x === 0 || x === 15 ? '#5a1014' : '#c9a23a', 255];
  if (!tail) {
    const cx = x - 7.5;
    const tower = Math.abs(cx) <= 2 && y >= 5 && y <= 11 && !(y === 5 && Math.abs(cx) < 1);
    const cross = y >= 12 && Math.abs(Math.abs(cx) - (y - 11)) < 0.8;
    if (tower || cross) return ['#e0bb48', 255];
  }
  return [pickOf(RED, px(x, y, 62)), 255];
};
const bars = (x: number, y: number): Ink => {
  const bar = x % 4 === 1 || x % 4 === 2, cross = y === 7 || y === 8;
  if (!bar && !cross) return null;
  const rust = px(x, y, 70);
  return [rust < 0.25 ? '#7a4a2a' : rust < 0.45 ? '#5c3a24' : (x % 4 === 1 ? '#4a4e54' : '#33363a'), 255];
};
const sconceSide = (x: number, y: number): Ink => {
  // the flame (upper middle), the iron cup and bracket below
  if (y <= 6) {
    const d = Math.abs(x - 7.5) + (6 - y) * 0.35;
    if (d < 1.2) return ['#fff4c2', 255];
    if (d < 2.2) return ['#ffcf4a', 255];
    if (d < 3) return ['#f08a24', 255];
    return null;
  }
  return [px(x, y, 80) < 0.3 ? '#2c2f33' : '#3d4146', 255];
};
const sconceTop = (x: number, y: number): Ink => {
  const d = Math.hypot(x - 7.5, y - 7.5);
  return d < 1.5 ? ['#fff4c2', 255] : d < 2.6 ? ['#ffcf4a', 255] : d < 3.4 ? ['#f08a24', 255] : ['#3d4146', 255];
};
const brazierSide = (x: number, y: number): Ink => {
  if (y >= 5 && y <= 6) return [x % 3 === 0 ? '#ff9a3c' : '#c8501e', 255]; // embers glowing over the rim
  return [px(x, y, 90) < 0.2 ? '#2a2d31' : y < 5 ? '#4a4e54' : '#3a3d42', 255];
};
const brazierTop = (x: number, y: number): Ink => {
  const k = px(x, y, 91);
  return [k < 0.35 ? '#ffb347' : k < 0.6 ? '#e8642a' : k < 0.85 ? '#7a2a14' : '#2a1a12', 255];
};
const throneArt = (x: number, y: number): Ink => {
  // dark wood with gilded edges and a red cushion band in the middle
  if (x === 0 || x === 15 || y === 0 || y === 15) return ['#b38a2e', 255];
  if (y >= 6 && y <= 9) return [pickOf(RED, px(x, y, 100)), 255];
  return wood(x, y);
};
const tome = (x: number, y: number): Ink => {
  const inBook = x >= 3 && x <= 12 && y >= 2 && y <= 13;
  if (!inBook) return null;
  if (x === 3) return ['#3b1f10', 255]; // the spine
  if (x >= 11) return [y % 2 ? '#e8dcb5' : '#d6c89c', 255]; // the page edges
  if ((x === 6 || x === 9) && y >= 4 && y <= 11) return ['#c9a23a', 255];
  if (y === 7 && x > 5 && x < 10) return ['#c9a23a', 255];
  return [px(x, y, 110) < 0.15 ? '#5a2a18' : '#6e3a22', 255];
};
export const ART = Object.freeze({
  castle_brick: brick, castle_brick_cracked: cracked, castle_brick_mossy: mossy, castle_brick_mossy_top: mossyTop,
  castle_wood: wood, castle_shelf: shelfSide, castle_banner: bannerArt(false), castle_banner_tail: bannerArt(true),
  castle_bars: bars, castle_sconce: sconceSide, castle_sconce_top: sconceTop, castle_brazier: brazierSide,
  castle_brazier_top: brazierTop, castle_throne: throneArt, old_tome: tome,
});

function paintAll(ctx: any) {
  for (const [name, ink] of Object.entries(ART)) {
    ctx.textures.paint(name, (t: any) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const c = ink(x, y); if (c) t.set(x, y, c[0], c[1]); else t.set(x, y, '#000000', 0); }
    });
  }
}

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => [x0 * PX, y0 * PX, z0 * PX, x1 * PX, y1 * PX, z1 * PX];

/** Registers the textures, the blocks and the loot-only Old Tome. Returns the full names. */
export function registerCastleBlocks(ctx: any) {
  paintAll(ctx);
  const t = (n: string) => `creatures:${n}`;
  const all = (n: string) => ({ top: t(n), side: t(n), bottom: t(n) });
  const masonry = { solid: true, hardness: 2, tool: 'pickaxe', soundGroup: 'mineclaude:stone', group: 'mineclaude:blocks' };
  ctx.blocks.register('castle_brick', { name: 'Tijolo de Castelo', tiles: all('castle_brick'), ...masonry });
  ctx.blocks.register('castle_brick_cracked', { name: 'Tijolo de Castelo Rachado', tiles: all('castle_brick_cracked'), ...masonry });
  ctx.blocks.register('castle_brick_mossy', { name: 'Tijolo de Castelo Musgoso', tiles: { top: t('castle_brick_mossy_top'), side: t('castle_brick_mossy'), bottom: t('castle_brick') }, ...masonry });
  ctx.blocks.register('castle_bookshelf', { name: 'Estante Antiga', solid: true, hardness: 1.5, tool: 'axe', tiles: { top: t('castle_wood'), side: t('castle_shelf'), bottom: t('castle_wood') } });

  // furniture: drawn as boxes; collision a little simpler than the drawing
  const legs = (h: number, w = 2) => [box(1, 0, 1, 1 + w, h, 1 + w), box(15 - w, 0, 1, 15, h, 1 + w), box(1, 0, 15 - w, 1 + w, h, 15), box(15 - w, 0, 15 - w, 15, h, 15)];
  ctx.blocks.register('castle_table', {
    name: 'Mesa Longa', solid: true, cutout: true, transparent: true, hardness: 1.5, tool: 'axe', tiles: all('castle_wood'),
    geometry: { model: [box(0, 13, 0, 16, 16, 16), ...legs(13)], collision: [box(0, 0, 0, 16, 16, 16)] },
  });
  ctx.blocks.register('castle_chair', {
    name: 'Cadeira do Salão', solid: true, cutout: true, transparent: true, hardness: 1, tool: 'axe', tiles: all('castle_wood'),
    // facing n = whoever sits looks north: the backrest stands on the south side
    geometry: { model: [box(3, 7, 3, 13, 9, 13), box(3, 0, 3, 5, 7, 5), box(11, 0, 3, 13, 7, 5), box(3, 0, 11, 5, 7, 13), box(11, 0, 11, 13, 7, 13), box(3, 9, 11, 13, 16, 13), box(5, 12, 11.5, 11, 14, 12.5)],
      collision: [box(3, 0, 3, 13, 9, 13), box(3, 9, 11, 13, 16, 13)] },
    states: FACING_STATES,
  });
  ctx.blocks.register('castle_throne', {
    name: 'Trono em Ruínas', solid: true, cutout: true, transparent: true, hardness: 3, tool: 'pickaxe', tiles: all('castle_throne'),
    geometry: { model: [box(1, 0, 1, 15, 6, 15), box(1, 6, 1, 15, 9, 15), box(1, 9, 12, 15, 16, 15), box(1, 9, 1, 3, 12, 12), box(13, 9, 1, 15, 12, 12), box(0, 12, 12, 2, 16, 16), box(14, 12, 12, 16, 16, 16)],
      collision: [box(1, 0, 1, 15, 9, 15), box(1, 9, 12, 15, 16, 15)] },
    states: FACING_STATES,
  });
  // the banners hang on a wall: facing n = mounted on the north side of the cell
  const cloth = { solid: false, noCollide: true, cutout: true, transparent: true, doubleSided: true, hardness: 0.5, needsFloor: false };
  ctx.blocks.register('castle_banner', {
    name: 'Estandarte do Castelo', ...cloth, tiles: all('castle_banner'),
    geometry: { model: [box(0, 0, 0.5, 16, 16, 1.5), box(0, 14, 0, 16, 16, 2.5)], collision: [], selection: [box(0, 0, 0, 16, 16, 3)] },
    states: FACING_STATES,
  });
  ctx.blocks.register('castle_banner_tail', {
    name: 'Ponta Rasgada do Estandarte', ...cloth, tiles: all('castle_banner_tail'), drop: 'creatures:castle_banner',
    geometry: { model: [box(0, 0, 0.5, 16, 16, 1.5)], collision: [], selection: [box(0, 0, 0, 16, 16, 2)] },
    states: FACING_STATES,
  });
  ctx.blocks.register('castle_portcullis', {
    name: 'Grade de Ferro Torta', solid: true, cutout: true, transparent: true, hardness: 5, tool: 'pickaxe', tiles: all('castle_bars'),
    // a plane of bars across the cell (facing n: the plane runs east-west)
    geometry: { model: [box(1, 0, 7, 3, 16, 9), box(5, 0, 7, 7, 16, 9), box(9, 0, 7, 11, 16, 9), box(13, 0, 7, 15, 16, 9), box(0, 7, 6.5, 16, 9, 9.5)],
      collision: [box(0, 0, 6.5, 16, 16, 9.5)] },
    states: FACING_STATES,
  });
  ctx.blocks.register('castle_sconce', {
    name: 'Arandela Acesa', solid: false, noCollide: true, cutout: true, transparent: true, hardness: 0.5, light: 12, emissive: true,
    tiles: { top: t('castle_sconce_top'), side: t('castle_sconce'), bottom: t('castle_sconce') },
    // a plate on the wall (north side for facing n), an arm, the cup and the flame
    geometry: { model: [box(6, 2, 0, 10, 9, 1.5), box(7, 6, 1.5, 9, 8, 6), box(5.5, 8, 4, 10.5, 10, 9), box(6.5, 10, 5, 9.5, 14, 8)], collision: [], selection: [box(5, 2, 0, 11, 14, 9)] },
    states: FACING_STATES,
  });
  ctx.blocks.register('castle_brazier', {
    name: 'Braseiro', solid: true, cutout: true, transparent: true, hardness: 2, tool: 'pickaxe', light: 14, emissive: true,
    tiles: { top: t('castle_brazier_top'), side: t('castle_brazier'), bottom: t('castle_brazier') },
    geometry: { model: [box(2, 6, 2, 14, 11, 14), box(3, 0, 3, 5, 6, 5), box(11, 0, 3, 13, 6, 5), box(3, 0, 11, 5, 6, 13), box(11, 0, 11, 13, 6, 13), box(1, 10, 1, 15, 11, 15)],
      collision: [box(2, 0, 2, 14, 11, 14)] },
  });

  // what only the castle's chests hold: the Old Tome (the Torn Map they also hold is the watchtower's item, creatures:torn_map,
  // registered once by structures/watchtower/index.ts)
  ctx.items.register('old_tome', { name: 'Tomo Antigo', icon: t('old_tome'), group: 'mineclaude:items', stack: 16, rarity: 'uncommon',
    lore: [ctx.lang.text('structures.castle.tome.lore1', undefined, 'Um livro da biblioteca do castelo.'), ctx.lang.text('structures.castle.tome.lore2', undefined, 'As letras são de uma língua esquecida.')] });
  // the castle masonry is also craftable: 4 stone -> 4 bricks, and a brick with a leaf of moss... kept simple
  ctx.recipes.add({ key: 'castle_brick_from_stone', out: t('castle_brick'), n: 4, in: [['mineclaude:stone', 4]], category: 'mineclaude:building_blocks' });
  ctx.recipes.add({ key: 'castle_brick_mossy_from_brick', out: t('castle_brick_mossy'), n: 1, in: [[t('castle_brick'), 1], ['mineclaude:leaves', 1]], category: 'mineclaude:building_blocks' });
}
