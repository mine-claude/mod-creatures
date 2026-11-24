// @ts-check
// The blocks of the two outposts, every one but the timber post drawn by a declared model (docs/sdk-block-models.md: boxes in
// pixels of the cell, a texture per face) with its own physics/aim boxes (docs/sdk-block-geometry.md). The textures are PNGs
// painted by code (art.ts -> tools/gen-structure-textures.ts). Registered in the order of names.ts BLOCK, after every block
// the mod had before: the ids follow the registration order, so never reorder, new ones at the end.
import { ART } from './art.ts';
import { BLOCK, ns } from './names.ts';

const TEX = Object.keys(ART);
export const TEXTURE_NAMES = Object.freeze(TEX);
const t = (name: string) => ns(name);
const P = 1 / 16;

type Faces = Record<string, any>;
/** an element with the same texture on its six faces (`emissive` for a glowing one) */
const box = (from: number[], to: number[], tex: string, extra: Record<string, any> = {}) => ({
  from, to, faces: { all: { texture: tex, ...(extra.emissive && { emissive: true, shade: false }) } }, ...(extra.rotation && { rotation: extra.rotation }),
});
/** an element with a texture for its sides and another for top and bottom */
const capped = (from: number[], to: number[], side: string, top: string, bottom = top) => ({
  from, to, faces: {
    north: { texture: side }, south: { texture: side }, east: { texture: side }, west: { texture: side },
    up: { texture: top }, down: { texture: bottom },
  } as Faces,
});
/** boxes in pixels -> the geometry's cell units */
const cell = (...boxes: number[][]) => boxes.map((b) => b.map((v) => v * P));

// ---------------------------------------------------------------- the railing (two blocks: one along x, one along z)
function railingModel(alongZ: boolean) {
  // [x0, y0, z0, x1, y1, z1] along x; swapped to run along z
  const parts = [
    [0, 13, 6.5, 16, 15.5, 9.5], // the hand rail
    [0, 4.5, 7, 16, 6, 9], // the low rail
    [1, 0, 7, 3, 13, 9], [7, 0, 7, 9, 13, 9], [13, 0, 7, 15, 13, 9], // three balusters
  ];
  const sw = (b: number[]) => (alongZ ? [b[2], b[1], b[0], b[5], b[4], b[3]] : b);
  return { textures: { w: t('rail_wood') }, elements: parts.map(sw).map((b) => box(b.slice(0, 3), b.slice(3), '#w')) };
}
const railingGeometry = (alongZ: boolean) => {
  const b = alongZ ? [6, 0, 0, 10, 16, 16] : [0, 0, 6, 16, 16, 10];
  return { model: cell(b), collision: cell(b), selection: cell(b), occlusion: [], rotate: false };
};

// ---------------------------------------------------------------- the archery target (faces north and south)
const targetModel = {
  textures: { face: t('target_face'), straw: t('target_straw'), wood: t('rail_wood') },
  elements: [
    { from: [2, 4, 6], to: [14, 16, 10], faces: {
      north: { texture: '#face' }, south: { texture: '#face' },
      east: { texture: '#straw' }, west: { texture: '#straw' }, up: { texture: '#straw' }, down: { texture: '#straw' } } },
    box([3, 0, 7], [5, 4, 9], '#wood'), box([11, 0, 7], [13, 4, 9], '#wood'),
    // the back strut, leaning on the boss
    box([7, 0, 10], [9, 11, 12], '#wood', { rotation: { axis: 'x', angle: -22.5, origin: [8, 0, 11] } }),
  ],
};

// ---------------------------------------------------------------- the weapon rack (against a wall on its north side)
function bow(x: number) {
  return [
    box([x, 6, 4], [x + 1, 10, 5], '#bow'), // the grip
    box([x, 10, 4], [x + 1, 15, 5], '#bow', { rotation: { axis: 'z', angle: 14, origin: [x + 0.5, 10, 4.5] } }),
    box([x, 1, 4], [x + 1, 6, 5], '#bow', { rotation: { axis: 'z', angle: -14, origin: [x + 0.5, 6, 4.5] } }),
    box([x + 1.6, 1.6, 4.25], [x + 2.1, 14.4, 4.75], '#linen'), // the string
  ];
}
function arrow(x: number, z: number, angle: number) {
  const rot = { axis: 'z', angle, origin: [x + 0.25, 0, z + 0.25] };
  return [
    box([x, 0, z], [x + 0.6, 11, z + 0.6], '#linen', { rotation: rot }),
    box([x - 0.4, 8.5, z], [x + 1, 11, z + 0.6], '#fletch', { rotation: rot }),
  ];
}
const rackModel = {
  textures: { wood: t('rack_wood'), bow: t('rack_bow'), linen: t('rack_linen'), fletch: t('rack_fletch') },
  elements: [
    box([1, 0, 1], [3, 15, 4], '#wood'), box([13, 0, 1], [15, 15, 4], '#wood'),
    box([1, 5, 2], [15, 7, 4], '#wood'), box([1, 12, 2], [15, 14, 4], '#wood'),
    box([3, 13, 4], [4, 14, 6], '#wood'), box([8, 13, 4], [9, 14, 6], '#wood'), // the pegs the bows hang on
    ...bow(3.5), ...bow(8.5),
    ...arrow(11.5, 5.5, 7), ...arrow(12.5, 6.5, -5), ...arrow(13.2, 5.2, 11),
  ],
};

// ---------------------------------------------------------------- the hanging lantern (the lantern itself is the renderer's)
const lanternModel = {
  textures: { iron: t('lantern_iron') },
  elements: [box([6, 15, 6], [10, 16, 10], '#iron'), box([7.5, 13, 7.5], [8.5, 15, 8.5], '#iron')],
};

// ---------------------------------------------------------------- the shrine
const pillarModel = {
  textures: { side: t('pillar_side'), top: t('pillar_top') },
  elements: [
    capped([2, 0, 2], [14, 2, 14], '#side', '#top'), // the base ring
    capped([3, 2, 3], [13, 14, 13], '#side', '#top'), // the shaft
    capped([2, 14, 2], [14, 16, 14], '#side', '#top'), // the capital
  ],
};
const altarModel = {
  textures: { side: t('altar_side'), top: t('altar_top'), bronze: t('altar_bronze'), ember: t('altar_ember') },
  elements: [
    capped([1, 0, 1], [15, 3, 15], '#side', '#top'),
    capped([3, 3, 3], [13, 10, 13], '#side', '#top'),
    capped([1, 10, 1], [15, 13, 15], '#side', '#top'),
    // the offering bowl on top, and the ember of light inside it
    box([5, 13, 5], [11, 15, 6], '#bronze'), box([5, 13, 10], [11, 15, 11], '#bronze'),
    box([5, 13, 6], [6, 15, 10], '#bronze'), box([10, 13, 6], [11, 15, 10], '#bronze'),
    box([6, 13, 6], [10, 14, 10], '#ember', { emissive: true }),
  ],
};
const candleModel = {
  textures: { wax: t('candle_wax'), flame: t('candle_flame') },
  elements: [
    box([4, 0, 5], [6, 5, 7], '#wax'), box([4.5, 5, 5.5], [5.5, 7, 6.5], '#flame', { emissive: true }),
    box([9, 0, 8], [11, 7, 10], '#wax'), box([9.5, 7, 8.5], [10.5, 9, 9.5], '#flame', { emissive: true }),
    box([6, 0, 10], [8, 3.5, 12], '#wax'), box([6.5, 3.5, 10.5], [7.5, 5.5, 11.5], '#flame', { emissive: true }),
  ],
};

export const LANTERN_LIGHT = 14, ALTAR_LIGHT = 9, CANDLE_LIGHT = 6;

/** @param {any} ctx */
export function registerOutpostBlocks(ctx: any) {
  for (const name of TEX) ctx.textures.png(name, `textures/structures/watchtower/${name}.png`, { size: 16 });
  const reg = (full: string, props: Record<string, any>) => ctx.blocks.register(full.slice(full.indexOf(':') + 1), props);

  reg(BLOCK.post, {
    name: 'Tronco Lavrado', solid: true, hardness: 2, tool: 'axe',
    tiles: { top: t('tower_post_top'), side: t('tower_post_side'), bottom: t('tower_post_top') },
  });
  for (const alongZ of [false, true]) {
    reg(alongZ ? BLOCK.railingZ : BLOCK.railing, {
      name: 'Parapeito de Vigia', solid: true, cutout: true, hardness: 1, tool: 'axe',
      tiles: { all: t('rail_wood') }, geometry: railingGeometry(alongZ), model: railingModel(alongZ),
      ...(alongZ && { hidden: true, drop: BLOCK.railing }),
    });
  }
  reg(BLOCK.target, {
    name: 'Alvo de Palha', solid: true, cutout: true, hardness: 0.8,
    tiles: { all: t('target_straw') },
    geometry: { model: cell([2, 0, 6, 14, 16, 10]), collision: cell([2, 0, 6, 14, 16, 10]), occlusion: [], rotate: false },
    model: targetModel,
  });
  reg(BLOCK.rack, {
    name: 'Suporte de Armas', solid: true, cutout: true, hardness: 1, tool: 'axe',
    tiles: { all: t('rack_wood') },
    geometry: { model: cell([1, 0, 1, 15, 15, 7]), collision: cell([1, 0, 1, 15, 15, 4]), selection: cell([1, 0, 1, 15, 15, 7]), occlusion: [], rotate: false },
    model: rackModel,
  });
  reg(BLOCK.lantern, {
    name: 'Lanterna de Vigia', solid: false, noCollide: true, cutout: true, hardness: 0.5, light: LANTERN_LIGHT,
    tiles: { all: t('lantern_iron') }, icon: t('lantern_icon'),
    geometry: { model: cell([6, 13, 6, 10, 16, 10]), collision: [], selection: cell([4, 2, 4, 12, 16, 12]), support: [], occlusion: [], rotate: false },
    model: lanternModel,
  });
  reg(BLOCK.pillar, {
    name: 'Pilar Musgoso', solid: true, cutout: true, hardness: 2.5, tool: 'pickaxe',
    tiles: { top: t('pillar_top'), side: t('pillar_side'), bottom: t('pillar_top') },
    geometry: { model: cell([2, 0, 2, 14, 16, 14]), collision: cell([2, 0, 2, 14, 16, 14]), occlusion: [], rotate: false },
    model: pillarModel,
  });
  reg(BLOCK.altar, {
    name: 'Altar de Oferendas', solid: true, cutout: true, hardness: 3, tool: 'pickaxe', light: ALTAR_LIGHT,
    tiles: { top: t('altar_top'), side: t('altar_side'), bottom: t('altar_top') },
    geometry: { model: cell([1, 0, 1, 15, 15, 15]), collision: cell([1, 0, 1, 15, 13, 15]), occlusion: [], rotate: false },
    model: altarModel,
  });
  reg(BLOCK.candle, {
    name: 'Velas do Santuário', solid: false, noCollide: true, cutout: true, hardness: 0, needsFloor: true, light: CANDLE_LIGHT,
    tiles: { all: t('candle_wax') },
    geometry: { model: cell([4, 0, 5, 11, 9, 12]), collision: [], selection: cell([3, 0, 4, 12, 9, 13]), support: [], occlusion: [], rotate: false },
    model: candleModel,
  });
  reg(BLOCK.vine, {
    name: 'Trepadeira Antiga', solid: false, noCollide: true, transparent: true, cutout: true, hardness: 0, shape: 'cross', replaceable: true, needsFloor: true,
    tiles: { top: t('shrine_vine'), side: t('shrine_vine'), bottom: t('shrine_vine') },
  });

  // salvage: the timber and the railing back to planks (the rest only drops itself)
  ctx.recipes.add({ key: 'planks_from_tower_post', out: 'mineclaude:planks', n: 4, in: [[BLOCK.post, 1]], category: 'mineclaude:building_blocks' });
  ctx.recipes.add({ key: 'planks_from_tower_railing', out: 'mineclaude:planks', n: 1, in: [[BLOCK.railing, 1]], category: 'mineclaude:building_blocks' });
}
