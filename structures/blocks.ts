// @ts-check
// The blocks of the structures (the abandoned village and the goblin camp): building blocks (thatch, old planks, mossy
// cobblestone), and the non-cube props drawn by geometry boxes (furniture, lanterns, tents, totems, the campfire...). Every
// texture is code (structures/art.ts -> textures/structures/*.png via tools/gen-structure-textures.ts).
//
// Directional props (vines on a wall, a shelf against a wall, a sloped tent panel) come as FOUR blocks, one per side, like
// the base game's stairs (`planks_stairs`, `_e`, `_s`, `_w`): the boxes are written for north and rotated here. Only the
// north one is in the creative palette; the others are `hidden` and drop it.
//
// The two loot chests (`village_chest`, `goblin_chest`) are inventory blocks: the game's chest screen, 27 slots, and the
// loot table rolled ONCE, the first time a player opens it (canOpenInventory: `looted` in the block data), like the base
// game's ruin chests. Breaking one spills what is inside and drops a plain chest (a looted structure chest cannot be carried
// off to be refilled), and one placed by hand starts looted (onPlace).

export const ns = (path: string) => `creatures:${path}`;
export const FACINGS = ['n', 'e', 's', 'w'] as const;
export type Facing = typeof FACINGS[number];
/** The block of a directional prop for a side: `vines` (north), `vines_e`, `vines_s`, `vines_w`. */
export const facingBlock = (path: string, f: Facing) => (f === 'n' ? path : `${path}_${f}`);

type Box = [number, number, number, number, number, number];
const p = (n: number) => n / 16;
const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [p(x0), p(y0), p(z0), p(x1), p(y1), p(z1)];
/** A box turned 90 degrees clockwise seen from above (north -> east): (x, z) -> (1 - z, x). */
const turn = (b: Box): Box => [1 - b[5], b[1], b[0], 1 - b[2], b[4], b[3]];
const turned = (boxes: Box[], times: number) => boxes.map((b) => { let r = b; for (let i = 0; i < times; i++) r = turn(r); return r.map((v) => Math.round(v * 16) / 16) as Box; });

const tx = (name: string) => ns(name);
const all = (name: string) => ({ top: tx(name), side: tx(name), bottom: tx(name) });

// a prop: drawn by boxes, see-through for the light (the furniture must not darken the room), broken by hand
const prop = (name: string, tiles: Record<string, string>, model: Box[], extra: Record<string, unknown> = {}) => ({
  name, solid: true, transparent: true, cutout: true, hardness: 0.8, tool: 'axe', tiles, geometry: { model }, ...extra,
});

const LEGS = (top: number, w = 2, inset = 1) => [
  box(inset, 0, inset, inset + w, top, inset + w), box(16 - inset - w, 0, inset, 16 - inset, top, inset + w),
  box(inset, 0, 16 - inset - w, inset + w, top, 16 - inset), box(16 - inset - w, 0, 16 - inset - w, 16 - inset, top, 16 - inset),
];

// directional boxes, written for NORTH (the side the prop leans on / its back is the -z side of the cell)
const VINE_N: Box[] = [box(0, 0, 0, 16, 16, 1)];
const SHELF_N: Box[] = [box(0, 0, 0, 16, 16, 2), box(0, 0, 0, 16, 1, 8), box(0, 7.5, 0, 16, 8.5, 8), box(0, 15, 0, 16, 16, 8), box(0, 0, 0, 1, 16, 8), box(15, 0, 0, 16, 16, 8)];
// a hide panel of a tent, three steps rising to the north (the ridge side)
const SLOPE_N: Box[] = [box(0, 0, 0, 16, 5.34, 16), box(0, 5.34, 0, 16, 10.67, 10.67), box(0, 10.67, 0, 16, 16, 5.34)];

// The paths of every block this file registers, in registration order (the block ids follow it: new ones go at the end).
export const STRUCTURE_BLOCKS = Object.freeze({
  thatch: ns('thatch'), thatchSlab: ns('thatch_slab'), oldPlanks: ns('old_planks'), mossyCobble: ns('mossy_cobble'),
  vines: ns('vines'), table: ns('table'), stool: ns('stool'), barrel: ns('barrel'), shelf: ns('shelf'), strawBed: ns('straw_bed'),
  lantern: ns('old_lantern'), crate: ns('crate'), villageBanner: ns('village_banner'), goblinBanner: ns('goblin_banner'),
  hideSlope: ns('hide_slope'), hideCanvas: ns('hide_canvas'), hideRidge: ns('hide_ridge'), stickPole: ns('stick_pole'),
  totemPole: ns('totem_pole'), totemSkull: ns('totem_skull'), dryingRack: ns('drying_rack'), campfire: ns('goblin_campfire'),
  wellWinch: ns('well_winch'), villageChest: ns('village_chest'), goblinChest: ns('goblin_chest'),
});

export const LOOT = Object.freeze({ village: ns('abandoned_village_chest'), camp: ns('goblin_camp_chest') });
export const CAMPFIRE_LIGHT = 14;
export const LANTERN_LIGHT = 12;
export const CHEST_SLOTS = 27;

/**
 * Fills a structure chest with its loot table the first time someone opens it; true once it is (or was) filled.
 * `e` is the hook's event (canOpenInventory): e.world, e.pos. Spread over random slots, like the base game's chests.
 * @param {any} e @param {string} table
 */
export function fillOnce(e: any, table: string): boolean {
  const data = e.world.getBlockData(e.pos);
  if (!data || data.looted) return true;
  const storage = e.world.getItemStorage(e.pos);
  if (!storage) return true; // locked or unloaded: open as it is, try again next time
  const stacks = e.world.rollLoot(table, { day: e.world.isDay?.() ?? true });
  e.world.transact((t: any) => {
    const free = Array.from({ length: CHEST_SLOTS }, (_, i) => i);
    for (const s of stacks) {
      if (!free.length) break;
      const i = free.splice(Math.floor(Math.random() * free.length), 1)[0];
      const got = storage.slot(i).insert(s.item, s.n, t);
      if (got < s.n) storage.insert(s.item, s.n - got, t); // a slot that holds less (a tool): the rest anywhere
    }
  });
  e.world.setBlockData(e.pos, { looted: true });
  return true;
}

const chest = (name: string, side: string, top: string, table: string, model: Box[]) => ({
  name, solid: true, transparent: true, cutout: true, hardness: 2.5, tool: 'axe', drop: 'mineclaude:chest',
  tiles: { top: tx(top), side: tx(side), bottom: tx(top) }, geometry: { model },
  data: { schema: { looted: 'boolean' }, default: { looted: false } },
  inventory: { slots: CHEST_SLOTS, screen: true },
  canOpenInventory(e: any) { return fillOnce(e, table); },
  onPlace(e: any) { try { e.world.setBlockData(e.pos, { looted: true }); } catch { /* the block went away already */ } },
});

/** @param {any} ctx */
export function registerStructureBlocks(ctx: any) {
  // the building blocks
  ctx.blocks.register('thatch', { name: 'Palha de Telhado', solid: true, hardness: 0.5, tool: 'axe', tiles: { top: tx('thatch_top'), side: tx('thatch_side'), bottom: tx('thatch_top') } });
  ctx.blocks.register('thatch_slab', prop('Beiral de Palha', { top: tx('thatch_top'), side: tx('thatch_side'), bottom: tx('thatch_top') }, [box(0, 0, 0, 16, 8, 16)], { tool: 'axe', hardness: 0.4 }));
  ctx.blocks.register('old_planks', { name: 'Tábuas Velhas', solid: true, hardness: 1.6, tool: 'axe', tiles: all('old_planks') });
  ctx.blocks.register('mossy_cobble', { name: 'Pedregulho Musgoso', solid: true, hardness: 2.5, tool: 'pickaxe', tiles: all('mossy_cobble') });
  // vines on a wall: a thin see-through panel against the side it hangs on, walked through
  FACINGS.forEach((f, i) => ctx.blocks.register(facingBlock('vines', f), {
    name: 'Trepadeira', solid: false, noCollide: true, transparent: true, cutout: true, replaceable: true, hardness: 0.2,
    tiles: all('vines'), geometry: { model: turned(VINE_N, i), selection: turned(VINE_N, i) },
    ...(f !== 'n' && { hidden: true, drop: ns('vines') }),
  }));
  // furniture
  ctx.blocks.register('table', prop('Mesa Rústica', { top: tx('table_top'), side: tx('old_planks'), bottom: tx('old_planks') }, [box(0, 13, 0, 16, 16, 16), ...LEGS(13)]));
  ctx.blocks.register('stool', prop('Banquinho', { top: tx('table_top'), side: tx('old_planks'), bottom: tx('old_planks') }, [box(3, 7, 3, 13, 9, 13), ...LEGS(7, 2, 4)]));
  ctx.blocks.register('barrel', prop('Barril', { top: tx('barrel_top'), side: tx('barrel_side'), bottom: tx('barrel_top') }, [box(2, 0, 2, 14, 16, 14), box(1, 3, 1, 15, 13, 15)]));
  FACINGS.forEach((f, i) => ctx.blocks.register(facingBlock('shelf', f), prop('Prateleira', { top: tx('old_planks'), side: tx('shelf'), bottom: tx('old_planks') }, turned(SHELF_N, i),
    f !== 'n' ? { hidden: true, drop: ns('shelf') } : {})));
  ctx.blocks.register('straw_bed', prop('Colchão de Palha', { top: tx('straw_bed_top'), side: tx('straw_side'), bottom: tx('straw_side') }, [box(0, 0, 0, 16, 3, 16), box(2, 3, 1, 14, 5, 5)], { hardness: 0.3 }));
  ctx.blocks.register('old_lantern', prop('Lanterna Velha', all('old_lantern'), [box(5, 0, 5, 11, 7, 11), box(6, 7, 6, 10, 9, 10), box(7.5, 9, 7.5, 8.5, 11, 8.5)],
    { light: LANTERN_LIGHT, emissive: true, hardness: 0.3, tool: 'pickaxe' }));
  ctx.blocks.register('crate', prop('Caixote', all('crate'), [box(1, 0, 1, 15, 14, 15)]));
  // banners: a pole with a cross bar and a cloth that hangs from it (set one on a fence post to raise it)
  const BANNER: Box[] = [box(7, 0, 7, 9, 16, 9), box(2, 14, 7, 14, 15, 9), box(3, 2, 7.5, 13, 14, 8.5)];
  ctx.blocks.register('village_banner', prop('Estandarte Desbotado', { top: tx('stick'), side: tx('village_banner'), bottom: tx('stick') }, BANNER, { hardness: 0.4 }));
  ctx.blocks.register('goblin_banner', prop('Estandarte Goblin', { top: tx('stick'), side: tx('goblin_banner'), bottom: tx('stick') }, BANNER, { hardness: 0.4 }));
  // the goblin camp: hide-and-stick tents, poles, the totem of skulls, drying racks and the campfire
  FACINGS.forEach((f, i) => ctx.blocks.register(facingBlock('hide_slope', f), prop('Lona de Couro', all('hide'), turned(SLOPE_N, i),
    { hardness: 0.5, ...(f !== 'n' && { hidden: true, drop: ns('hide_slope') }) })));
  ctx.blocks.register('hide_canvas', { name: 'Couro Esticado', solid: true, hardness: 0.5, tool: 'axe', tiles: all('hide') });
  ctx.blocks.register('hide_ridge', prop('Cumeeira de Couro', all('hide'), [box(0, 0, 0, 16, 6, 16), box(7, 6, 0, 9, 9, 16)], { hardness: 0.5 }));
  ctx.blocks.register('stick_pole', prop('Estaca', all('stick'), [box(7, 0, 7, 9, 16, 9)], { hardness: 0.3 }));
  ctx.blocks.register('totem_pole', prop('Totem de Gravetos', { top: tx('stick'), side: tx('totem'), bottom: tx('stick') }, [box(5, 0, 5, 11, 16, 11), box(4, 6, 4, 12, 8, 12)], { hardness: 0.6 }));
  ctx.blocks.register('totem_skull', prop('Caveira do Totem', { top: tx('skull'), side: tx('skull'), bottom: tx('stick') },
    [box(6, 0, 6, 10, 16, 10), box(3, 3, 3, 13, 12, 13), box(4, 1, 3, 12, 3, 10), box(0, 9, 7, 3, 11, 9), box(13, 9, 7, 16, 11, 9)], { hardness: 0.6, tool: 'pickaxe' }));
  ctx.blocks.register('drying_rack', prop('Varal de Secagem', { top: tx('stick'), side: tx('drying_rack'), bottom: tx('stick') },
    [box(0, 0, 7, 2, 16, 9), box(14, 0, 7, 16, 16, 9), box(0, 14, 7, 16, 15.5, 9), box(3, 4, 7.5, 7, 14, 8.5), box(9, 6, 7.5, 13, 14, 8.5)], { hardness: 0.4 }));
  // the campfire: an ash bed ringed with stones and two crossed logs; it lights the camp (the flames and the smoke are its
  // block entity renderer in the browser, structures/client.ts)
  ctx.blocks.register('goblin_campfire', prop('Fogueira Goblin', { top: tx('campfire_top'), side: tx('campfire_side'), bottom: tx('campfire_side') },
    [box(0, 0, 0, 16, 2, 16), box(1, 2, 6, 15, 5, 10), box(6, 5, 1, 10, 8, 15)], { light: CAMPFIRE_LIGHT, hardness: 1, tool: 'axe' }));
  ctx.blocks.register('well_winch', prop('Sarilho do Poço', { top: tx('well_winch'), side: tx('well_winch'), bottom: tx('well_winch') },
    [box(0, 6, 6, 16, 10, 10), box(7.5, 0, 7.5, 8.5, 6, 8.5), box(15, 2, 7, 16, 10, 9)], { hardness: 1 }));
  // the loot chests
  ctx.blocks.register('village_chest', chest('Baú Velho', 'village_chest_side', 'village_chest_top', LOOT.village, [box(1, 0, 1, 15, 14, 15)]));
  ctx.blocks.register('goblin_chest', chest('Baú do Saque', 'goblin_chest_side', 'goblin_chest_top', LOOT.camp, [box(1, 0, 1, 15, 12, 15), box(2, 12, 2, 14, 13, 14)]));
}

/** Texture names the blocks cite (each one a painter in art.ts). */
export const STRUCTURE_TEXTURES = ['thatch_top', 'thatch_side', 'old_planks', 'mossy_cobble', 'vines', 'table_top', 'barrel_side', 'barrel_top', 'shelf',
  'straw_bed_top', 'straw_side', 'old_lantern', 'crate', 'village_banner', 'goblin_banner', 'hide', 'stick', 'totem', 'skull', 'drying_rack',
  'campfire_top', 'campfire_side', 'well_winch', 'village_chest_side', 'village_chest_top', 'goblin_chest_side', 'goblin_chest_top'];
