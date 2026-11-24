// @ts-check
// The MUSGARRETE VILLAGE (creatures:mossfolk_village): where the moss-and-stone folk live, in the Floresta Musgosa. Their
// culture shows in the place: round stone huts with domed mossy roofs (they quarry their own stone), glowing fungus lamps
// on root stalks, a plaza of mossy cobble around the Sino de Pedra-Oca (the hollow stone they ring at dawn), a field of
// wheat by a water channel, a MINE whose mouth is marked by a rack of picks (the tunnel itself is dug by the miners, block
// by block, after the village is born), and a building LOT staked at its corners, where the builders raise new houses.
//
// Inhabited: nobody lives here at generation (a generator only places blocks); the villagers move in when a player first
// comes near (folk/spawner.ts), each with a hut, a nest to sleep in and a job by the station of the hut.
//
// A STAGE of the generator like the Abandoned Village (structures/village.ts, whose helpers it uses): one per region of
// 12 x 12 chunks at most, claiming 3 x 3; ONLY in a world with biomes; the plaza in the Floresta Musgosa; never on a chunk of
// a base structure nor of any other structure of this mod (claims.ts: it is the LAST in the precedence). Pure and chunk-safe.
//
// TERRAIN 2 (Phase 4): the places come from the engine's structure set `creatures:mossfolk_villages` (structures/sets.ts:
// 24-chunk regions, kept 17 chunks from an Abandoned Village by the set's EXCLUSION) and the plan is ASSEMBLED from pieces
// (pieces.ts): footpaths leave the plaza, the huts, the field, the lot and the mine open onto them, and each stands on a
// levelled pad. Terrain 1 keeps the ring around the plaza, byte for byte.
import { StructureFeature } from '../mineclaude-sdk.js';
import { Canvas, Frame, baseStructureIn, near, towards, CS } from '../structures/frame.ts';
import { claimedAbove } from '../structures/claims.ts';
import { FOLK_SET, isTerrain2, villageSetSpec } from '../structures/sets.ts';
import { FOLK_BLOCKS as FB } from './blocks.ts';

export const FOLK_REGION = 12, FOLK_CLAIM = 3, FOLK_CHANCE = 0.75, FOLK_TRIES = 10;
const INNER = 4;
export const FOLK_BIOMES = new Set(['biomes:mossy_forest']);
const EDGE_BIOMES = new Set(['biomes:mossy_forest', 'biomes:tall_canopy', 'biomes:flower_meadow', null]);
const ZONES = new Set(['campos', 'ermos', 'sombrias']);
const SALT = 0x6d055a;
export const HUT = 7; // a hut's side
export const ROLES = ['miner', 'builder', 'grower', 'grower', 'miner'] as const;
export const MINE_DEPTH = 7;

export interface Hut { cx: number; cz: number; facing: any; F: number; role: string; door: { x: number; y: number; z: number }; nest: { x: number; y: number; z: number }; station: { x: number; y: number; z: number } | null }
/** The piece set of terrain 2 (pieces.ts, registered by structures/index.ts). */
export const FOLK_PIECES_NAME = 'creatures:mossfolk_village';

export interface FolkVillage {
  // terrain 2: the assembled pieces, the pads, the footpaths
  layout?: any; sites?: any[]; paths?: any[];
  x: number; y: number; z: number; // the bell (y: the plaza's floor)
  claim: { cx: number; cz: number; n: number };
  huts: Hut[];
  chest: { x: number; y: number; z: number };
  field: { x0: number; z0: number; x1: number; z1: number; y: number } | null;
  lot: { x0: number; z0: number; x1: number; z1: number; y: number } | null;
  mine: { x: number; y: number; z: number; dx: number; dz: number } | null; // the rack (on the ground) and the tunnel's direction
}

export default class FolkVillageStage extends StructureFeature {
  [key: string]: any;
  constructor(ctx: any) {
    super(ctx);
    const g = (n: string) => ctx.block(`mineclaude:${n}`);
    this.ids = {
      grass: g('grass'), dirt: g('dirt'), stone: g('stone'), cobble: g('cobblestone'), log: g('log'), leaves: g('leaves'), gravel: g('gravel'),
      glass: g('glass'), door: g('door'), chest: g('chest'), farmland: g('farmland'), water: g('water'), wheat: [g('wheat_0'), g('wheat_1'), g('wheat_2'), g('wheat_3')],
      tallGrass: g('tall_grass'), mossy: ctx.block('creatures:mossy_cobble'),
      bell: ctx.block(FB.bell), nest: ctx.block(FB.nest), rack: ctx.block(FB.pickRack), bench: ctx.block(FB.masonBench), basket: ctx.block(FB.sproutBasket),
      lamp: ctx.block(FB.lamp), stake: ctx.block(FB.stake),
    };
    // the places: the structure set `creatures:mossfolk_villages` (structures/sets.ts) with this stage's own rolls (terrain 1
    // keeps its original 12-chunk regions and every old village where it was)
    this.t2 = isTerrain2(ctx);
    this.starts = ctx.structures.starts(FOLK_SET, (c: any) => this.planAt(c), {
      spec: villageSetSpec(ctx, { region: FOLK_REGION, tries: FOLK_TRIES, chance: FOLK_CHANCE, salt: SALT }),
      rolls: { chance: (rx: number, rz: number) => this.rand(rx, 1, rz), at: (rx: number, rz: number, k: number, axis: number) => this.rand(rx, 2 + axis + k * 16, rz) },
    });
    if (this.t2) ctx.structures.ground((x: number, z: number, h: number) => this.adaptedGround(x, z, h));
    // the server's spawner asks the plan of ITS world (by seed; only a generator with biomes can have a village); the
    // tests reach it from another mod through globalThis
    if (ctx.biomes) {
      stages.set(ctx.seed >>> 0, this);
      if (stages.size > 8) stages.delete(stages.keys().next().value as number);
      (globalThis as any).__mcFolkVillageStages = stages;
    }
  }

  rand(a: number, b: number, c: number) { return this.ctx.hash3((this.ctx.seed ^ SALT) >>> 0, a | 0, b | 0, c | 0); }

  villageAt(cx: number, cz: number): FolkVillage | null {
    return (this.starts.at(cx, cz)?.data as FolkVillage) ?? null;
  }

  villagesNear(x: number, z: number, max: number) {
    const out: { c: FolkVillage; d: number }[] = [];
    for (const { start } of this.starts.near(x, z, max + 2)) {
      const c = start.data as FolkVillage, d = Math.hypot(c.x + 0.5 - x, c.z + 0.5 - z);
      if (d <= max) out.push({ c, d });
    }
    return out.sort((a, b) => a.d - b.d);
  }

  /** Terrain 2: the ground of a column after the village's pads (null outside them). */
  adaptedGround(x: number, z: number, h: number): number | null {
    const v = this.villageAt(Math.floor(x / CS), Math.floor(z / CS));
    if (!v?.sites) return null;
    return this.ctx.structures.adapt.target(v.sites, x, z, h) ? this.ctx.structures.adapt.height(v.sites, x, z, h) : null;
  }

  /** The ground the builders stand on (the village being built: `this.cur`): its pads in terrain 2, else the column's. */
  groundOf(x: number, z: number) {
    const h = this.ctx.columnInfo(x, z).h, v = this.cur as FolkVillage | null;
    return v?.sites ? this.ctx.structures.adapt.height(v.sites, x, z, h) : h;
  }

  provides() {
    return { creaturesMossfolkVillageAt: (cx: number, cz: number) => this.villageAt(cx, cz), creaturesMossfolkVillagesNear: (x: number, z: number, max: number) => this.villagesNear(x, z, max) };
  }

  goodGround(x: number, z: number) {
    const { ctx } = this, info = ctx.columnInfo(x, z);
    if (info.desert || info.h <= ctx.seaLevel + 1 || info.h >= ctx.seaLevel + 28) return false;
    const surface = ctx.stage('mineclaude:surface');
    return !surface || typeof surface.surfaceAt !== 'function' || surface.surfaceAt(info, x, z) === this.ids.grass;
  }

  // A candidate of the set: the village, or null (only in a world with biomes: new worlds only).
  planAt(c: { rx: number; rz: number; cx: number; cz: number; n: number }): FolkVillage | null {
    if (!this.ctx.biomes) return null;
    return this.t2 ? this.tryPieces(c.rx, c.rz, c.cx, c.cz, c.n) : this.tryAt(c.rx, c.rz, c.cx, c.cz);
  }

  // Terrain 2: the village ASSEMBLED from pieces (pieces.ts) around the plaza; huts, plaza, field and lot on pads.
  tryPieces(rx: number, rz: number, ccx: number, ccz: number, N: number): FolkVillage | null {
    const { ctx } = this, X0 = ccx * CS, Z0 = ccz * CS, SIZE = N * CS, cx = X0 + SIZE / 2, cz = Z0 + SIZE / 2;
    if (!ZONES.has(ctx.zoneAt(cx, cz).key)) return null;
    const biomeKey = (x: number, z: number) => ctx.biomeAt(x, z)?.key ?? null;
    if (!FOLK_BIOMES.has(biomeKey(cx, cz))) return null;
    // (the ground and the biomes are checked piece by piece below: a footpath may cross a dip a hut may not)
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (baseStructureIn(ctx.locate, ccx + i, ccz + j)) return null;
      if (claimedAbove(ctx.locate, 'creaturesMossfolkVillageAt', ccx + i, ccz + j)) return null;
    }
    const inner = [X0 + INNER, Z0 + INNER, X0 + SIZE - 1 - INNER, Z0 + SIZE - 1 - INNER];
    const h = (x: number, z: number) => ctx.columnInfo(x, z).h;
    // a piece fits where: inside the claim's inner square; among the allowed biomes (never the marsh or the dunes, which
    // reshape the ground after this stage); never at the water (a column at or near the sea level); and, for what stands on
    // a pad, mostly on grass with a relief a pad can level. A footpath only needs dry land: it follows the ground.
    const fits = (p: any) => {
      if (p.x0 < inner[0] || p.z0 < inner[1] || p.x1 > inner[2] || p.z1 > inner[3]) return null;
      for (let z = p.z0 - 2; z <= p.z1 + 2; z += 2) for (let x = p.x0 - 2; x <= p.x1 + 2; x += 2) if (!EDGE_BIOMES.has(biomeKey(x, z))) return null;
      const path = p.id === 'path' || p.id === 'path_end', cells = (p.x1 - p.x0 + 1) * (p.z1 - p.z0 + 1);
      let bad = 0;
      for (let z = p.z0; z <= p.z1; z++) for (let x = p.x0; x <= p.x1; x++) {
        if (ctx.columnInfo(x, z).h <= ctx.seaLevel + 1) return null;
        if (!path && !this.goodGround(x, z) && ++bad > cells * 0.15) return null;
      }
      const s = ctx.structures.adapt.survey(p.x0, p.z0, p.x1, p.z1, h);
      if (!path && s.max - s.min > (p.id === 'plaza' ? 5 : 7)) return null;
      return s.median;
    };
    const layout = ctx.structures.assemble(FOLK_PIECES_NAME, (ctx.seed ^ SALT ^ Math.imul(rx, 0x27d4eb2d) ^ Math.imul(rz, 0x165667b1)) >>> 0, { x: cx, z: cz }, fits);
    if (!layout) return null;
    const plaza = layout.pieces[0], Y = plaza.y, huts: Hut[] = [], sites: any[] = [], paths: any[] = [];
    let field: FolkVillage['field'] = null, lot: FolkVillage['lot'] = null, mine: FolkVillage['mine'] = null;
    sites.push({ x0: plaza.x0, z0: plaza.z0, x1: plaza.x1, z1: plaza.z1, floor: Y, mode: 'pad', skirt: 3 });
    const mid = (HUT - 1) / 2;
    for (const p of layout.pieces) {
      if (p.id === 'path' || p.id === 'path_end') { paths.push(p); continue; }
      if (p.id === 'hut') {
        const [hx, hz] = p.toWorld(mid + 1, mid + 2), facing = p.sideOf('n'), fr = new Frame(hx, hz, HUT, HUT, facing), F = p.y;
        huts.push({ cx: hx, cz: hz, facing, F, role: ROLES[huts.length], door: { x: fr.x(mid, 0), y: F + 1, z: fr.z(mid, 0) }, nest: { x: fr.x(1, HUT - 2), y: F + 1, z: fr.z(1, HUT - 2) }, station: null });
        sites.push({ x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1, floor: F, mode: 'pad', skirt: 3 });
      } else if (p.id === 'field') {
        field = { x0: p.x0 + 1, z0: p.z0 + 1, x1: p.x1 - 1, z1: p.z1 - 1, y: p.y };
        sites.push({ x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1, floor: p.y, mode: 'pad', skirt: 2 });
      } else if (p.id === 'lot') {
        lot = { x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1, y: p.y };
        sites.push({ x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1, floor: p.y, mode: 'pad', skirt: 2 });
      } else if (p.id === 'mine') {
        const [mx, mz] = p.toWorld(1, 1);
        const ddx = Math.abs(cx - mx) >= Math.abs(cz - mz) ? Math.sign(cx - mx) : 0, ddz = ddx ? 0 : Math.sign(cz - mz);
        mine = { x: mx, y: ctx.columnInfo(mx, mz).h + 1, z: mz, dx: ddx, dz: ddz };
      }
    }
    if (huts.length < 3) return null;
    if (mine && !huts.some((hh) => hh.role === 'miner')) mine = null;
    for (const hh of huts) {
      const fr = new Frame(hh.cx, hh.cz, HUT, HUT, hh.facing);
      if (hh.role !== 'miner') hh.station = { x: fr.x(HUT - 2, HUT - 2), y: hh.F + 1, z: fr.z(HUT - 2, HUT - 2) };
    }
    const chest = { x: cx + 2, y: Y + 1, z: cz - 2 };
    return { x: cx, y: Y, z: cz, claim: { cx: ccx, cz: ccz, n: N }, huts, chest, field, lot, mine, layout, sites, paths };
  }

  tryAt(rx: number, rz: number, ccx: number, ccz: number): FolkVillage | null {
    const { ctx } = this, N = FOLK_CLAIM;
    const X0 = ccx * CS, Z0 = ccz * CS, SIZE = N * CS, cx = X0 + SIZE / 2, cz = Z0 + SIZE / 2;
    if (!ZONES.has(ctx.zoneAt(cx, cz).key)) return null;
    const biomeKey = (x: number, z: number) => ctx.biomeAt(x, z)?.key ?? null;
    if (!FOLK_BIOMES.has(biomeKey(cx, cz))) return null;
    for (let z = Z0 + INNER; z < Z0 + SIZE - INNER; z += 4) for (let x = X0 + INNER; x < X0 + SIZE - INNER; x += 4) if (!EDGE_BIOMES.has(biomeKey(x, z))) return null;
    let lo = Infinity, hi = -Infinity, bad = 0, n = 0;
    for (let z = Z0 + INNER; z < Z0 + SIZE - INNER; z += 3) for (let x = X0 + INNER; x < X0 + SIZE - INNER; x += 3) {
      n++;
      if (!this.goodGround(x, z)) { bad++; continue; }
      const h = ctx.columnInfo(x, z).h; lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    if (bad > n * 0.2 || hi - lo > 6) return null;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (baseStructureIn(ctx.locate, ccx + i, ccz + j)) return null;
      if (claimedAbove(ctx.locate, 'creaturesMossfolkVillageAt', ccx + i, ccz + j)) return null;
    }
    // the plaza: 7 x 7 at the highest ground under it
    let Y = -Infinity;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { if (!this.goodGround(cx + dx, cz + dz)) return null; Y = Math.max(Y, ctx.columnInfo(cx + dx, cz + dz).h); }
    const inner = [X0 + INNER, Z0 + INNER, X0 + SIZE - 1 - INNER, Z0 + SIZE - 1 - INNER];
    const rects: number[][] = [[cx - 4, cz - 4, cx + 4, cz + 4]];
    const fits = (r: number[]) => r[0] >= inner[0] && r[1] >= inner[1] && r[2] <= inner[2] && r[3] <= inner[3] && !rects.some((o) => near(o, r, 1));
    // the floor of a footprint: the highest ground of it (+ a ring), refused over bad ground or a slope of more than 3
    const floorOf = (x0: number, z0: number, x1: number, z1: number) => {
      let F = -Infinity, low = Infinity;
      for (let z = z0 - 1; z <= z1 + 1; z++) for (let x = x0 - 1; x <= x1 + 1; x++) {
        if (!this.goodGround(x, z)) return null;
        const h = ctx.columnInfo(x, z).h; F = Math.max(F, h); low = Math.min(low, h);
      }
      return F - low > 3 ? null : F;
    };
    // eight slots around the plaza; the huts take some, the field and the lot others
    const a0 = this.rand(rx, 5, rz) * Math.PI * 2, SLOTS = 8;
    const ang = (i: number) => a0 + (i * Math.PI * 2) / SLOTS;
    const huts: Hut[] = [];
    const want = 4 + (this.rand(rx, 6, rz) < 0.5 ? 1 : 0);
    const used = new Set<number>();
    for (let i = 0; i < SLOTS && huts.length < want; i += 2) {
      for (const r of [12, 13, 11]) {
        const hx = cx + Math.round(Math.cos(ang(i)) * r), hz = cz + Math.round(Math.sin(ang(i)) * r);
        const facing = towards(cx - hx, cz - hz), fr = new Frame(hx, hz, HUT, HUT, facing);
        const rect = fr.bounds(-1, -2, HUT, HUT);
        if (!fits(rect)) continue;
        const F = floorOf(rect[0] + 1, rect[1] + 1, rect[2] - 1, rect[3] - 1);
        if (F === null) continue;
        rects.push(rect); used.add(i);
        const role = ROLES[huts.length];
        const mid = (HUT - 1) / 2;
        huts.push({ cx: hx, cz: hz, facing, F, role, door: { x: fr.x(mid, 0), y: F + 1, z: fr.z(mid, 0) }, nest: { x: fr.x(1, HUT - 2), y: F + 1, z: fr.z(1, HUT - 2) }, station: null });
        break;
      }
    }
    if (huts.length < 3) return null;
    // the odd slots (between the huts) hold, in this order of need: the mine's mouth, the field, the lot — each tried at a
    // few distances on every free slot. The mine's mouth sits out on the ring's rim and its tunnel heads IN, down under the
    // village (all of it under the claim, so it never reaches another structure)
    let field: FolkVillage['field'] = null, lot: FolkVillage['lot'] = null, mine: FolkVillage['mine'] = null;
    const freeSlots = [1, 3, 5, 7, 0, 2, 4, 6].filter((i) => !used.has(i));
    const take = (want: 'mine' | 'field' | 'lot') => {
      for (const i of freeSlots) {
        if (used.has(i)) continue;
        for (const r of want === 'mine' ? [17, 16, 18] : want === 'field' ? [14, 13, 15, 12] : [15, 14, 16, 13]) {
          const mx = cx + Math.round(Math.cos(ang(i)) * r), mz = cz + Math.round(Math.sin(ang(i)) * r);
          const [hw, hd] = want === 'mine' ? [1, 1] : want === 'field' ? [2, 2] : [4, 3];
          const rect = [mx - hw, mz - hd, mx + hw, mz + hd];
          if (!fits(rect)) continue;
          const F = floorOf(rect[0], rect[1], rect[2], rect[3]);
          if (F === null) continue;
          rects.push(rect); used.add(i);
          if (want === 'mine') {
            const ddx = Math.abs(cx - mx) >= Math.abs(cz - mz) ? Math.sign(cx - mx) : 0, ddz = ddx ? 0 : Math.sign(cz - mz);
            mine = { x: mx, y: ctx.columnInfo(mx, mz).h + 1, z: mz, dx: ddx, dz: ddz };
          } else if (want === 'field') field = { x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], y: F };
          else lot = { x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], y: F };
          return;
        }
      }
    };
    if (huts.some((h) => h.role === 'miner')) take('mine');
    take('field');
    take('lot');
    // the stations: the builder's bench and the grower's basket stand in the hut; the miner's rack at the mine's mouth
    for (const h of huts) {
      const fr = new Frame(h.cx, h.cz, HUT, HUT, h.facing);
      if (h.role !== 'miner') h.station = { x: fr.x(HUT - 2, HUT - 2), y: h.F + 1, z: fr.z(HUT - 2, HUT - 2) };
    }
    // the chest of the village (the miners fill it, the builders take from it) beside the bell
    const chest = { x: cx + 2, y: Y + 1, z: cz - 2 };
    return { x: cx, y: Y, z: cz, claim: { cx: ccx, cz: ccz, n: N }, huts, chest, field, lot, mine };
  }

  // ------------------------------------------------------------------------------------------------ building
  generate(chunk: any) {
    const v = this.villageAt(chunk.cx, chunk.cz);
    if (!v) return;
    this.cur = v;
    const c = new Canvas(chunk, this.ctx.height);
    if (v.sites) this.ctx.structures.adapt.chunk(chunk, CS, this.ctx.height, v.sites, (x: number, z: number) => this.ctx.columnInfo(x, z).h);
    for (const h of v.huts) this.clearAround(c, h.cx - 6, h.cz - 6, h.cx + 6, h.cz + 6, h.F);
    this.clearAround(c, v.x - 6, v.z - 6, v.x + 6, v.z + 6, v.y);
    for (const h of v.huts) this.hut(c, v, h);
    this.plaza(c, v);
    if (v.field) this.field(c, v.field);
    if (v.lot) this.lot(c, v.lot);
    if (v.mine) this.mineMouth(c, v.mine);
    if (v.paths) { for (const p of v.paths) this.footpath(c, p); for (const h of v.huts) this.doorStep(c, h); }
    else for (const h of v.huts) this.path(c, v, h);
    this.cur = null;
  }

  // terrain 2: a footpath of gravel and dirt down the middle of a path piece, on the ground, plants cleared above it
  footpath(c: Canvas, p: any) {
    const I = this.ids, d = p.rot & 1 ? p.x1 - p.x0 + 1 : p.z1 - p.z0 + 1;
    for (let vv = 0; vv < d; vv++) {
      const [x, z] = p.toWorld(1, vv);
      if (!c.inside(x, z) || !this.goodGround(x, z)) continue;
      const g = this.groundOf(x, z);
      c.set(x, g, z, this.rand(x, 11, z) < 0.6 ? I.gravel : I.dirt);
      for (let y = g + 1; y <= g + 3; y++) { const b = c.get(x, y, z); if (b !== 0 && b !== I.door && b !== I.lamp) c.set(x, y, z, 0); }
    }
  }

  // terrain 2: the block between a hut's door step and its footpath
  doorStep(c: Canvas, h: Hut) {
    const I = this.ids, fr = new Frame(h.cx, h.cz, HUT, HUT, h.facing), mid = (HUT - 1) / 2, x = fr.x(mid, -2), z = fr.z(mid, -2);
    if (!c.inside(x, z)) return;
    const g = this.groundOf(x, z);
    c.set(x, g, z, I.gravel);
    for (let y = g + 1; y <= g + 3; y++) { const b = c.get(x, y, z); if (b !== 0 && b !== I.door && b !== I.lamp) c.set(x, y, z, 0); }
  }

  clearAround(c: Canvas, x0: number, z0: number, x1: number, z1: number, F: number) {
    const { log, leaves } = this.ids;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (!c.inside(x, z)) continue;
      for (let y = this.ctx.columnInfo(x, z).h + 1; y <= F + 16; y++) { const b = c.get(x, y, z); if (b === log || b === leaves) c.set(x, y, z, 0); }
    }
  }

  stone(x: number, y: number, z: number) { return this.rand(x * 3, y + 7, z) < 0.45 ? this.ids.mossy : this.ids.cobble; }

  // a round hut: the corners of the 7 x 7 square cut, walls of 3, a domed roof of mossy stone in two steps, a door to the
  // plaza, one window, the nest at the back, the lamp, the station
  hut(c: Canvas, v: FolkVillage, h: Hut) {
    const I = this.ids, fr = new Frame(h.cx, h.cz, HUT, HUT, h.facing), F = h.F, mid = (HUT - 1) / 2, E = HUT - 1;
    const put = (u: number, vv: number, y: number, id: number) => c.set(fr.x(u, vv), y, fr.z(u, vv), id);
    const corner = (u: number, vv: number) => (u === 0 || u === E) && (vv === 0 || vv === E);
    for (let vv = -1; vv <= HUT; vv++) for (let u = -1; u <= HUT; u++) for (let y = F + 1; y <= F + 7; y++) put(u, vv, y, 0);
    for (let vv = 0; vv < HUT; vv++) for (let u = 0; u < HUT; u++) {
      if (corner(u, vv)) continue;
      const x = fr.x(u, vv), z = fr.z(u, vv), g = this.groundOf(x, z);
      for (let y = g + 1; y < F; y++) c.set(x, y, z, this.stone(x, y, z));
      const edge = u === 0 || vv === 0 || u === E || vv === E;
      c.set(x, F, z, edge ? this.stone(x, F, z) : I.dirt);
      if (!edge) continue;
      for (let y = F + 1; y <= F + 3; y++) {
        let id = this.stone(x, y, z);
        if (vv === 0 && u === mid && y <= F + 2) id = I.door;
        if (y === F + 2 && vv === mid && u === E) id = I.glass;
        put(u, vv, y, id);
      }
    }
    // the dome: the 5 x 5 over the room at F+4 (resting on the walls' inner edge), the 3 x 3 cap at F+5
    for (let vv = 1; vv < E; vv++) for (let u = 1; u < E; u++) {
      put(u, vv, F + 4, I.mossy);
      if (u > 1 && vv > 1 && u < E - 1 && vv < E - 1) put(u, vv, F + 5, this.rand(fr.x(u, vv), 13, fr.z(u, vv)) < 0.3 ? I.cobble : I.mossy);
    }
    // inside: the nest at the back left, a lamp at the back right, the station
    put(1, E - 1, F + 1, I.nest);
    put(E - 1, 1, F + 1, I.lamp);
    if (h.role === 'builder') put(E - 1, E - 1, F + 1, I.bench);
    else if (h.role === 'grower') put(E - 1, E - 1, F + 1, I.basket);
    // the step and a lamp by the door
    const sx = fr.x(mid, -1), sz = fr.z(mid, -1), g = this.groundOf(sx, sz);
    for (let y = g + 1; y <= F; y++) c.set(sx, y, sz, I.cobble);
    put(mid + 2, -1, F + 1, I.lamp);
  }

  plaza(c: Canvas, v: FolkVillage) {
    const I = this.ids, Y = v.y;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const x = v.x + dx, z = v.z + dz, g = this.groundOf(x, z);
      for (let y = g + 1; y < Y; y++) c.set(x, y, z, I.cobble);
      c.set(x, Y, z, Math.abs(dx) === 3 || Math.abs(dz) === 3 ? I.mossy : this.rand(x, 7, z) < 0.5 ? I.gravel : I.mossy);
      for (let y = Y + 1; y <= Y + 6; y++) c.set(x, y, z, 0);
    }
    c.set(v.x, Y + 1, v.z, I.bell);
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) c.set(v.x + dx, Y + 1, v.z + dz, I.lamp);
    c.set(v.chest.x, v.chest.y, v.chest.z, I.chest);
  }

  field(c: Canvas, f: NonNullable<FolkVillage['field']>) {
    const I = this.ids, mz = (f.z0 + f.z1) >> 1;
    for (let z = f.z0 - 1; z <= f.z1 + 1; z++) for (let x = f.x0 - 1; x <= f.x1 + 1; x++) {
      const g = this.groundOf(x, z);
      for (let y = g + 1; y < f.y; y++) c.set(x, y, z, I.dirt);
      for (let y = f.y + 1; y <= f.y + 4; y++) c.set(x, y, z, 0);
      const rim = x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1;
      if (rim) { c.set(x, f.y, z, I.mossy); continue; }
      if (z === mz) { c.set(x, f.y, z, I.water); continue; }
      c.set(x, f.y, z, I.farmland);
      c.set(x, f.y + 1, z, I.wheat[Math.floor(this.rand(x, 9, z) * 4)]);
    }
    c.set(f.x0 - 1, f.y + 1, f.z0 - 1, I.basket);
  }

  lot(c: Canvas, l: NonNullable<FolkVillage['lot']>) {
    const I = this.ids;
    for (let z = l.z0; z <= l.z1; z++) for (let x = l.x0; x <= l.x1; x++) {
      const g = this.groundOf(x, z);
      for (let y = g + 1; y <= l.y; y++) c.set(x, y, z, y === l.y ? I.grass : I.dirt);
      for (let y = l.y + 1; y <= l.y + 8; y++) c.set(x, y, z, 0);
    }
    for (const [x, z] of [[l.x0, l.z0], [l.x1, l.z0], [l.x0, l.z1], [l.x1, l.z1]]) c.set(x, l.y + 1, z, I.stake);
  }

  // the mouth of the mine: a rack of picks on the ground and the first step down, the rest the miners dig
  mineMouth(c: Canvas, m: NonNullable<FolkVillage['mine']>) {
    const I = this.ids;
    c.set(m.x - m.dx, m.y, m.z - m.dz, I.rack);
    c.set(m.x - m.dx + (m.dz ? 1 : 0), m.y, m.z - m.dz + (m.dx ? 1 : 0), I.lamp);
  }

  // a path from the hut's door step to the plaza: it never rises or drops more than one block per step (a walker's
  // step), filled with dirt under it where the ground is lower and cut into it where it is higher, its plants cleared
  path(c: Canvas, v: FolkVillage, h: Hut) {
    const I = this.ids, fr = new Frame(h.cx, h.cz, HUT, HUT, h.facing), mid = (HUT - 1) / 2;
    const sx = fr.x(mid, -2), sz = fr.z(mid, -2), steps = Math.max(Math.abs(v.x - sx), Math.abs(v.z - sz));
    let prev = h.F;
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(sx + ((v.x - sx) * i) / Math.max(1, steps)), z = Math.round(sz + ((v.z - sz) * i) / Math.max(1, steps));
      if (Math.abs(x - v.x) <= 3 && Math.abs(z - v.z) <= 3) break;
      if (v.huts.some((o) => { const f = new Frame(o.cx, o.cz, HUT, HUT, o.facing), b = f.bounds(-1, -1, HUT, HUT); return x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3]; })) continue;
      const g = this.ctx.columnInfo(x, z).h, left = steps - i;
      // one block per step, and never further from the plaza's level than the steps left can make up
      let lvl = Math.max(prev - 1, Math.min(prev + 1, g));
      lvl = Math.max(v.y - left, Math.min(v.y + left, lvl));
      prev = lvl;
      if (!c.inside(x, z)) continue;
      for (let y = Math.min(g, lvl) - 2; y < lvl; y++) { const b = c.get(x, y, z); if (b === 0 || b === I.tallGrass || b === I.water) c.set(x, y, z, I.dirt); }
      c.set(x, lvl, z, this.rand(x, 11, z) < 0.6 ? I.gravel : I.dirt);
      for (let y = lvl + 1; y <= Math.max(g, lvl) + 3; y++) { const b = c.get(x, y, z); if (b !== 0 && b !== I.door) c.set(x, y, z, 0); }
    }
  }
}

/** The stages built in this process with biomes, by world seed (the server's spawner reads its world's). */
const stages = new Map<number, FolkVillageStage>();
// (a world API reached through ctx.dimensions.world does not carry its seed: then the one stage built with biomes)
export const stageFor = (seed?: number) => (typeof seed === "number" ? stages.get(seed >>> 0) : null) ?? [...stages.values()].at(-1) ?? null;

/** The tunnel the miners dig from a mine's mouth: a list of cells (in order), the branches after the main one. */
export function tunnelCells(m: NonNullable<FolkVillage['mine']>) {
  const out: { x: number; y: number; z: number }[] = [];
  const G = m.y - 1; // the ground's top under the rack
  const main = 18, side = 8;
  const col = (x: number, z: number, f: number, tall: boolean) => { out.push({ x, y: f, z }, { x, y: f + 1, z }); if (tall) out.push({ x, y: f + 2, z }); };
  let f = G + 1;
  for (let i = 0; i < main; i++) {
    const nf = G + 1 - Math.min(MINE_DEPTH, Math.ceil((i + 1) / 2));
    col(m.x + m.dx * i, m.z + m.dz * i, nf, nf !== f);
    f = nf;
  }
  // two side galleries at the end, left and right
  const ex = m.x + m.dx * (main - 1), ez = m.z + m.dz * (main - 1);
  for (const s of [1, -1]) for (let j = 1; j <= side; j++) col(ex + m.dz * s * j, ez + m.dx * s * j, f, false);
  return out;
}
