// @ts-check
// The Musgarretes' things (mods/creatures/folk): the blocks of their villages, painted in code (ctx.textures.paint: no
// file, the browser paints them). Every one is something only THEIR culture makes — moss, roots and hollow stone:
//   - Sino de Pedra-Oca (folk_bell): the hollow ringing stone in the plaza; rung at dawn, it wakes the village. It is also
//     the village's marker (the spawner checks it before anyone moves in: a region of an older era never has one).
//   - Ninho de Musgo (moss_nest): where a Musgarrete sleeps, curled up like a boulder.
//   - Suporte de Picaretas (pick_rack): the miner's post, at the mouth of the village mine.
//   - Bancada de Pedreiro (mason_bench): the builder's bench (a slab of stone on root legs, a chisel on it).
//   - Cesto de Brotos (sprout_basket): the grower's basket, by the field.
//   - Lâmpada de Fungo (glowcap_lamp): a glowing cap on a root stalk — their light (light 13).
//   - Estaca de Obra (lot_stake): the four corners of a building lot, where the builder raises a new house.
// Ids: these register after every block the mod had (new ones always at the end of the mod's own list).

type Box = [number, number, number, number, number, number];
const p = (n: number) => n / 16;
const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [p(x0), p(y0), p(z0), p(x1), p(y1), p(z1)];

export const FOLK_BLOCKS = Object.freeze({
  bell: 'creatures:folk_bell', nest: 'creatures:moss_nest', pickRack: 'creatures:pick_rack', masonBench: 'creatures:mason_bench',
  sproutBasket: 'creatures:sprout_basket', lamp: 'creatures:glowcap_lamp', stake: 'creatures:lot_stake',
});
/** The workstation of each job (a Musgarrete's job is the station of its house). */
export const STATION_OF = Object.freeze({ miner: FOLK_BLOCKS.pickRack, builder: FOLK_BLOCKS.masonBench, grower: FOLK_BLOCKS.sproutBasket });
export const LAMP_LIGHT = 13;

const prop = (name: string, tiles: Record<string, string>, model: Box[], extra: Record<string, unknown> = {}) => ({
  name, solid: true, transparent: true, cutout: true, hardness: 1, tool: 'pickaxe', tiles, geometry: { model }, ...extra,
});
const t = (n: string) => `creatures:${n}`;

// ---------------------------------------------------------------- the painters (browser only; deterministic per texture)
type Painter = (t: any) => void;
const STONE = ['#6f7468', '#7a7f72', '#666b60', '#83887a'];
const MOSS = ['#4f7a2e', '#5d8a35', '#466e29', '#6a9a3d'];
const ROOT = ['#6b4a2e', '#5e4027', '#7a5636', '#523822'];
const PAINT: Record<string, Painter> = {
  folk_bell_side: (x) => {
    x.fill(STONE);
    for (let i = 0; i < x.S; i++) { x.set(i, 0, '#4f544a'); x.set(i, x.S - 1, '#4f544a'); }
    for (let y = 5; y < 11; y++) for (let i = 6; i < 10; i++) x.set(i, y, '#2c2f29'); // the hollow
    x.speckle(MOSS, 0.12);
    for (let i = 0; i < x.S; i += 3) x.set(i, 2, '#9aa08f');
  },
  folk_bell_top: (x) => { x.fill(STONE); x.speckle(MOSS, 0.35); },
  moss_nest_top: (x) => {
    x.fill(MOSS);
    for (let r = 0; r < 3; r++) for (let a = 0; a < 24; a++) { const ang = (a / 24) * Math.PI * 2, rr = 2.5 + r * 1.6; x.set(Math.round(7.5 + Math.cos(ang) * rr), Math.round(7.5 + Math.sin(ang) * rr), r % 2 ? '#3c5f22' : '#79a947'); }
  },
  moss_nest_side: (x) => { x.fill(ROOT); for (let i = 0; i < x.S; i++) for (let y = 0; y < 6; y++) x.set(i, y, x.pick(MOSS)); },
  pick_rack: (x) => {
    x.fill(ROOT);
    for (let y = 0; y < x.S; y++) { x.set(3, y, '#3e2a18'); x.set(12, y, '#3e2a18'); }
    for (let i = 2; i < 14; i++) { x.set(i, 4, '#8d9186'); x.set(i, 10, '#8d9186'); }
    x.set(5, 3, '#b8bcb0'); x.set(10, 9, '#b8bcb0');
  },
  mason_bench_top: (x) => { x.fill(STONE); for (let i = 3; i < 12; i++) x.set(i, 8, '#3a3d36'); x.set(12, 8, '#b5b9ad'); x.set(13, 8, '#b5b9ad'); },
  mason_bench_side: (x) => { x.fill(ROOT); for (let i = 0; i < x.S; i++) for (let y = 0; y < 4; y++) x.set(i, y, x.pick(STONE)); },
  sprout_basket_side: (x) => {
    x.fill(['#a07a44', '#8e6a3a', '#b38a52']);
    for (let y = 0; y < x.S; y += 3) for (let i = 0; i < x.S; i++) x.set(i, y, '#6b4c28');
  },
  sprout_basket_top: (x) => { x.fill(['#6b4c28']); x.speckle(['#8fd14f', '#6fb83a', '#c7e86b'], 0.55); },
  glowcap: (x) => {
    x.fill(['#f2c14e', '#f7d36b', '#e9ad3a']);
    x.speckle(['#fff1b0'], 0.18);
  },
  root_stalk: (x) => { x.fill(ROOT); x.speckle(['#8a6a44'], 0.2); },
  lot_stake: (x) => { x.fill(['#8a6a44', '#7a5c3a']); for (let y = 0; y < 4; y++) for (let i = 0; i < x.S; i++) x.set(i, y, '#c8452f'); },
};
export const FOLK_TEXTURES = Object.keys(PAINT);

/** @param {any} ctx */
export function registerFolkBlocks(ctx: any) {
  for (const [name, fn] of Object.entries(PAINT)) ctx.textures.paint(name, fn);
  ctx.blocks.register('folk_bell', prop('Sino de Pedra-Oca', { top: t('folk_bell_top'), side: t('folk_bell_side'), bottom: t('folk_bell_top') },
    [box(2, 0, 2, 14, 3, 14), box(3, 3, 3, 13, 13, 13), box(5, 13, 5, 11, 16, 11)], { hardness: 4 }));
  // the nest is walked into (no collision): its owner sleeps curled up IN it
  ctx.blocks.register('moss_nest', prop('Ninho de Musgo', { top: t('moss_nest_top'), side: t('moss_nest_side'), bottom: t('moss_nest_side') },
    [box(0, 0, 0, 16, 2, 16), box(0, 2, 0, 16, 6, 2), box(0, 2, 14, 16, 6, 16), box(0, 2, 2, 2, 6, 14), box(14, 2, 2, 16, 6, 14)], { hardness: 0.4, tool: 'axe', solid: false, noCollide: true }));
  ctx.blocks.register('pick_rack', prop('Suporte de Picaretas', { top: t('root_stalk'), side: t('pick_rack'), bottom: t('root_stalk') },
    [box(2, 0, 6, 4, 16, 10), box(12, 0, 6, 14, 16, 10), box(2, 12, 7, 14, 14, 9), box(2, 5, 7, 14, 7, 9)], { hardness: 1, tool: 'axe' }));
  ctx.blocks.register('mason_bench', prop('Bancada de Pedreiro', { top: t('mason_bench_top'), side: t('mason_bench_side'), bottom: t('root_stalk') },
    [box(0, 10, 1, 16, 14, 15), box(1, 0, 2, 4, 10, 5), box(12, 0, 2, 15, 10, 5), box(1, 0, 11, 4, 10, 14), box(12, 0, 11, 15, 10, 14)]));
  ctx.blocks.register('sprout_basket', prop('Cesto de Brotos', { top: t('sprout_basket_top'), side: t('sprout_basket_side'), bottom: t('sprout_basket_side') },
    [box(2, 0, 2, 14, 10, 14), box(1, 8, 1, 15, 11, 15)], { hardness: 0.5, tool: 'axe' }));
  ctx.blocks.register('glowcap_lamp', prop('Lâmpada de Fungo', { top: t('glowcap'), side: t('glowcap'), bottom: t('root_stalk') },
    [box(7, 0, 7, 9, 9, 9), box(3, 9, 3, 13, 13, 13), box(5, 13, 5, 11, 14, 11)], { light: LAMP_LIGHT, emissive: true, hardness: 0.3, tool: 'axe' }));
  ctx.blocks.register('lot_stake', prop('Estaca de Obra', { top: t('lot_stake'), side: t('lot_stake'), bottom: t('lot_stake') },
    [box(7, 0, 7, 9, 12, 9)], { hardness: 0.2, tool: 'axe' }));
}
