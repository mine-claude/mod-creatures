// @ts-check
// The Musgarretes MOVE IN: a generator only places blocks, so the villagers of a Musgarrete village are born the first time
// a player comes near it (server only). Every 2 s, for each player in the overworld, the nearest village plan within 96
// blocks (the stage's own pure plan, folk/village.ts) is checked: its bell must really be there (a region of an older
// generation era has the plan but not the village — nothing moves into it) and its chunks loaded; then one villager per hut
// is born in it, with the hut's nest as home, the job of the hut, the village's places and the boxes it may edit, and the
// village chest gets its first stockpile. The village is written down in the world's storage, so it is populated once,
// for ever (a restart keeps the villagers themselves: they are persistent NPCs).
import { stageFor, tunnelCells, type FolkVillage } from './village.ts';
import { FOLK_BLOCKS as FB } from './blocks.ts';
import { MUSGARRETE } from './musgarrete.ts';
import { musgarreteName } from './names.ts';
import { OVERWORLD } from '../src/spawn.ts';

export const POPULATE_RADIUS = 96;
const KEY = 'mossfolk_villages';
const TOOLS: Record<string, string> = { miner: 'mineclaude:stone_pickaxe', builder: 'mineclaude:stone_pickaxe', grower: 'mineclaude:wood_hoe' };

const bbox = (cells: { x: number; y: number; z: number }[]) => {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const c of cells) { b[0] = Math.min(b[0], c.x); b[1] = Math.min(b[1], c.y); b[2] = Math.min(b[2], c.z); b[3] = Math.max(b[3], c.x); b[4] = Math.max(b[4], c.y); b[5] = Math.max(b[5], c.z); }
  return b;
};

/** The records of the villagers of a village (pure: tests read them too). */
export function villagersOf(v: FolkVillage, seedOf: (i: number) => number, rngOf: (seed: number) => () => number) {
  const bell = { x: v.x, y: v.y + 1, z: v.z };
  return v.huts.map((h, i) => {
    const seed = seedOf(i);
    const ang = (i / v.huts.length) * Math.PI * 2;
    const plaza = { x: v.x + Math.round(Math.cos(ang) * 2), y: v.y + 1, z: v.z + Math.round(Math.sin(ang) * 2) };
    const data: any = { tun: 0, ringer: i === 0 };
    let work = h.station, areas: number[][] = [];
    if (h.role === 'miner' && v.mine) { data.mine = v.mine; work = { x: v.mine.x - v.mine.dx, y: v.mine.y, z: v.mine.z - v.mine.dz }; areas = [bbox(tunnelCells(v.mine))]; }
    if (h.role === 'builder' && v.lot) { data.lot = v.lot; areas = [[v.lot.x0, v.lot.y + 1, v.lot.z0, v.lot.x1, v.lot.y + 6, v.lot.z1]]; }
    if (h.role === 'grower' && v.field) { data.field = v.field; areas = [[v.field.x0, v.field.y + 1, v.field.z0, v.field.x1, v.field.y + 1, v.field.z1]]; }
    return {
      seed, name: musgarreteName(rngOf(seed)), role: h.role, home: h.nest, work, held: TOOLS[h.role] ?? null,
      places: { bell, chest: v.chest, plaza, door: h.door }, areas, data, inv: h.role === 'grower' ? [['mineclaude:apple', 4], ['mineclaude:seeds', 6]] : [['mineclaude:apple', 4]],
      spawnAt: { x: h.nest.x + 0.5, y: h.nest.y, z: h.nest.z + 0.5 },
    };
  });
}

/** @param {any} ctx */
export function registerFolkSpawner(ctx: any) {
  let world: any = null, count = 0, populated: Set<string> | null = null;
  const save = () => { try { ctx.storage.world.set(KEY, [...populated!].slice(-512)); } catch { /* */ } };
  /** Moves the villagers into village `v` now (also /npc-free tests use it). Returns how many were born, or -1 (not ready). */
  const populate = (w: any, v: FolkVillage) => {
    const key = `${v.x},${v.z}`;
    populated ??= new Set(ctx.storage.world.get(KEY) ?? []);
    if (populated.has(key)) return 0;
    const bellAt = w.getBlock({ x: v.x, y: v.y + 1, z: v.z });
    if (bellAt === null || bellAt === undefined) return -1; // not loaded yet
    if (bellAt !== FB.bell) { populated.add(key); save(); return 0; } // an older era's region: no village here
    for (const h of v.huts) if (w.getBlock(h.nest) === null) return -1;
    const L = ctx.npcs.lib;
    const people = villagersOf(v, (i) => ((w.seed ^ Math.imul(v.x, 73856093) ^ Math.imul(v.z, 19349663) ^ (i * 83492791)) >>> 0), L.rng);
    let born = 0;
    for (const p of people) {
      const { spawnAt, ...init } = p;
      if (ctx.npcs.spawn(MUSGARRETE, w, spawnAt, init)) born++;
    }
    // the village's first stockpile: stone for the builders, wheat for the table
    try { const s = w.getItemStorage(v.chest); if (s) w.transact((tx: any) => { s.insert('mineclaude:cobblestone', 48, tx); s.insert('mineclaude:wheat', 8, tx); }); } catch { /* */ }
    populated.add(key); save();
    return born;
  };
  ctx.events.on('serverTick', () => {
    if (++count % 40) return;
    try { world ??= ctx.dimensions.world(OVERWORLD); } catch { return; }
    const stage = stageFor(world.seed);
    if (!stage) return;
    for (const p of ctx.server.players()) {
      if (p.dimension && p.dimension !== OVERWORLD) continue;
      if (p.room && p.room !== 'mundo') continue;
      for (const { c } of stage.villagesNear(p.pos.x, p.pos.z, POPULATE_RADIUS)) populate(world, c);
    }
  });
  return { populate };
}
