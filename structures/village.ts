// @ts-check
// The Abandoned Village (creatures:abandoned_village): 3 to 6 small empty houses (a cottage, a longhouse, a workshop) around a
// dry well, with paths of gravel between them. Broken windows, holes in the thatch, a corner fallen in now and then, the
// furniture left behind (straw beds, tables, stools, barrels, shelves, a lantern still burning) and one or two old chests with
// loot. In the damp forest it is overgrown: vines on the walls, moss on the stones, grass on the floors.
//
// A STAGE of the generator (a StructureFeature, like the base game's camps and ruins), not a declarative structure: it
// provides the lookups `creaturesVillageAt` / `creaturesVillagesNear`, which the structure kind declares (role
// `abandoned_village`, `protects`: the mods' declarative structures keep out of its chunks), and which the spawn rules and
// the browser check use.
//
// Where: at most one per region of 12 x 12 chunks, claiming a square of 3 x 3 chunks; ONLY in a world with biomes
// (`ctx.biomes`: a world without biomes — every world created before biomes, the official one included — never gets one,
// byte for byte); on fairly flat grass above the sea (the base game's grass, the Prado Florido, the Floresta Musgosa),
// never in the lobby, never in a chunk of a base structure (dungeon, ruin, camp, lake, well, river, dry bed, crypt), never in
// a chunk of a Ruined Castle (claims.ts: the castle comes first).
// Chunk-safe: the plan is a pure function of the seed and the terrain columns, each chunk under the claim writes its own
// part of the same plan, so the result is the same in any generation order.
//
// TERRAIN 2 (Phase 4, docs/worldgen.md "Structures"): the places come from the engine's structure set `creatures:villages`
// (sets.ts) and the plan is ASSEMBLED from pieces (village-pieces.ts): the well's plaza grows lanes, the lanes grow houses
// with their door on the lane, and every house, the plaza and the yards stand on a levelled PAD (cut and fill with a sloped
// skirt: no house floats over a dip or sinks into a slope). Terrain 1 keeps the ring of houses around the well, byte for byte.
import { StructureFeature } from '../mineclaude-sdk.js';
import { STRUCTURE_BLOCKS as SB, facingBlock, type Facing } from './blocks.ts';
import { CS, Canvas, Frame, baseStructureIn, near, towards } from './frame.ts';
import { claimedAbove } from './claims.ts';
import { VILLAGE_SET, isTerrain2, villageSetSpec } from './sets.ts';

export const VILLAGE_REGION = 12; // chunks
export const VILLAGE_CLAIM = 3; // chunks per side
export const VILLAGE_CHANCE = 0.6; // a candidate per region (the terrain filters then keep fewer)
export const VILLAGE_TRIES = 10; // places tried in a region
const INNER = 5; // blocks of margin inside the claim nothing is built in
// the biome at the well (the village's own), and the biomes the rest of the claim may be in: the tall canopy only around it
// (its tall trees then stand in the yards: a trunk only grows from grass and its crown only fills air, high over the roofs);
// never the marsh or the dunes, which reshape the ground and its floor after this stage
export const VILLAGE_BIOMES = new Set([null, 'biomes:flower_meadow', 'biomes:mossy_forest']);
export const VILLAGE_EDGE_BIOMES = new Set([...VILLAGE_BIOMES, 'biomes:tall_canopy']);
const DAMP_BIOMES = new Set(['biomes:mossy_forest']);
const ZONES = new Set(['campos', 'ermos', 'sombrias']);
const SALT = 0x51a7e5; // this structure's own stream of the seed
/** The piece set of terrain 2 (village-pieces.ts, registered by index.ts). */
export const VILLAGE_PIECES_NAME = 'creatures:abandoned_village';

type HouseType = 'cottage' | 'longhouse' | 'workshop';
export const TYPES: Record<HouseType, { W: number; D: number; WH: number }> = {
  cottage: { W: 7, D: 5, WH: 3 },
  longhouse: { W: 11, D: 7, WH: 3 },
  workshop: { W: 7, D: 7, WH: 4 },
};
// where a chest stands in each type (local u, v inside the walls)
export const CHEST_AT: Record<HouseType, [number, number]> = { cottage: [5, 1], longhouse: [5, 5], workshop: [2, 1] };

export interface House { type: HouseType; cx: number; cz: number; facing: Facing; F: number; collapse: number; chest: boolean; door: { x: number; y: number; z: number } }
export interface Village {
  x: number; y: number; z: number; // the well (x, z: its centre; y: the paving's level)
  claim: { cx: number; cz: number; n: number };
  damp: boolean; houses: House[]; chests: { x: number; y: number; z: number }[]; biome: string | null;
  // terrain 2: the assembled pieces, the ground sites (pads) and the lanes' and yards' pieces
  layout?: any; sites?: any[]; lanes?: any[]; yards?: any[];
}

export default class VillageStage extends StructureFeature {
  [key: string]: any;
  constructor(ctx: any) {
    super(ctx);
    const id = (n: string) => ctx.block(n);
    const g = (n: string) => id(`mineclaude:${n}`);
    this.ids = {
      air: 0, grass: g('grass'), dirt: g('dirt'), stone: g('stone'), cobble: g('cobblestone'), log: g('log'), leaves: g('leaves'), planks: g('planks'),
      glass: g('glass'), gravel: g('gravel'), fence: g('fence'), torch: g('torch'), table: g('crafting_table'), furnace: g('furnace'), tallGrass: g('tall_grass'),
      plants: new Set([g('tall_grass'), g('sunpetal'), g('embercap'), g('duskbell')]),
      thatch: id(SB.thatch), slab: id(SB.thatchSlab), old: id(SB.oldPlanks), mossy: id(SB.mossyCobble), rTable: id(SB.table), stool: id(SB.stool),
      barrel: id(SB.barrel), bed: id(SB.strawBed), lantern: id(SB.lantern), crate: id(SB.crate), banner: id(SB.villageBanner), winch: id(SB.wellWinch),
      chest: id(SB.villageChest),
      vines: Object.fromEntries((['n', 'e', 's', 'w'] as Facing[]).map((f) => [f, id(facingBlock(SB.vines, f))])),
      shelf: Object.fromEntries((['n', 'e', 's', 'w'] as Facing[]).map((f) => [f, id(facingBlock(SB.shelf, f))])),
    };
    // the places: the structure set `creatures:villages` (sets.ts) — terrain 2 its registered numbers, terrain 1 the original
    // 12-chunk regions — with this stage's own rolls, so every old world keeps its villages where they were
    this.t2 = isTerrain2(ctx);
    this.starts = ctx.structures.starts(VILLAGE_SET, (c: any) => this.planAt(c), {
      spec: villageSetSpec(ctx, { region: VILLAGE_REGION, tries: VILLAGE_TRIES, chance: VILLAGE_CHANCE, salt: SALT }),
      rolls: { chance: (rx: number, rz: number) => this.rand(rx, 91001, rz), at: (rx: number, rz: number, k: number, axis: number) => this.rand(rx, 91002 + axis + k * 16, rz) },
    });
    // terrain 2: the features that run after the stages (biome decoration) stand on the pads, not on the ground under them
    if (this.t2) ctx.structures.ground((x: number, z: number, h: number) => this.adaptedGround(x, z, h));
  }

  rand(a: number, b: number, c: number) { return this.ctx.hash3((this.ctx.seed ^ SALT) >>> 0, a | 0, b | 0, c | 0); }

  /** The village whose claim covers chunk (cx, cz), or null. */
  villageAt(cx: number, cz: number): Village | null {
    return (this.starts.at(cx, cz)?.data as Village) ?? null;
  }

  /** The villages within `max` blocks of (x, z), nearest first ({ c, d }). One per region at most. */
  villagesNear(x: number, z: number, max: number) {
    const out: { c: Village; d: number }[] = [];
    for (const { start } of this.starts.near(x, z, max + 2)) {
      const c = start.data as Village, d = Math.hypot(c.x + 0.5 - x, c.z + 0.5 - z);
      if (d <= max) out.push({ c, d });
    }
    return out.sort((a, b) => a.d - b.d);
  }

  /** Terrain 2: the ground of a column after the village's pads (null outside every village's sites). */
  adaptedGround(x: number, z: number, h: number): number | null {
    const v = this.villageAt(Math.floor(x / CS), Math.floor(z / CS));
    if (!v?.sites) return null;
    return this.ctx.structures.adapt.target(v.sites, x, z, h) ? this.ctx.structures.adapt.height(v.sites, x, z, h) : null;
  }

  /** The ground a builder stands on: the pads' in terrain 2, the natural column elsewhere. */
  groundOf(v: Village, x: number, z: number) {
    const h = this.ctx.columnInfo(x, z).h;
    return v.sites ? this.ctx.structures.adapt.height(v.sites, x, z, h) : h;
  }

  provides() {
    return { creaturesVillageAt: (cx: number, cz: number) => this.villageAt(cx, cz), creaturesVillagesNear: (x: number, z: number, max: number) => this.villagesNear(x, z, max) };
  }

  // ------------------------------------------------------------------------------------------------ the plan (pure)
  /** Dry grass above the sea, below the snow: ground a house may stand on (sand, snow, rock and the sea bed are not). */
  goodGround(x: number, z: number) {
    const { ctx } = this, info = ctx.columnInfo(x, z);
    if (info.desert || info.h <= ctx.seaLevel + 1 || info.h >= ctx.seaLevel + 28) return false;
    const surface = ctx.stage('mineclaude:surface');
    return !surface || typeof surface.surfaceAt !== 'function' || surface.surfaceAt(info, x, z) === this.ids.grass;
  }

  // A candidate of the set (a 3 x 3 claim; the set's frequency roll and the order of the places are the old ones): the
  // village, or null when the place does not fit. Only in a world with biomes (see the README: new worlds only).
  planAt(c: { rx: number; rz: number; cx: number; cz: number; n: number }): Village | null {
    if (!this.ctx.biomes) return null;
    return this.t2 ? this.tryPieces(c.rx, c.rz, c.cx, c.cz, c.n) : this.tryAt(c.rx, c.rz, c.cx, c.cz);
  }

  // Terrain 2, the claim as a whole: its zone, the well's biome, and no base structure nor an older structure of this mod in
  // any of its chunks (the ground and the biomes are checked piece by piece: a lane may cross a dip a house may not).
  claimFits(ccx: number, ccz: number, N: number): { centre: string | null } | null {
    const { ctx } = this, X0 = ccx * CS, Z0 = ccz * CS, SIZE = N * CS, cx = X0 + SIZE / 2, cz = Z0 + SIZE / 2;
    if (!ZONES.has(ctx.zoneAt(cx, cz).key)) return null;
    const centre = ctx.biomeAt(cx, cz)?.key ?? null;
    if (!VILLAGE_BIOMES.has(centre)) return null;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (baseStructureIn(ctx.locate, ccx + i, ccz + j)) return null;
      if (claimedAbove(ctx.locate, 'creaturesVillageAt', ccx + i, ccz + j)) return null; // a castle there (claims.ts)
    }
    return { centre };
  }

  // Terrain 2: the village ASSEMBLED from pieces (village-pieces.ts) around the well, every piece on good dry ground inside
  // the claim's inner square; houses, the plaza and the yards get pads (their floor: the median of the ground under them).
  tryPieces(rx: number, rz: number, ccx: number, ccz: number, N: number): Village | null {
    const { ctx } = this, X0 = ccx * CS, Z0 = ccz * CS, SIZE = N * CS, cx = X0 + SIZE / 2, cz = Z0 + SIZE / 2;
    const fit = this.claimFits(ccx, ccz, N);
    if (!fit) return null;
    const inner = [X0 + INNER, Z0 + INNER, X0 + SIZE - 1 - INNER, Z0 + SIZE - 1 - INNER];
    const h = (x: number, z: number) => ctx.columnInfo(x, z).h;
    const fits = (p: any) => {
      if (p.x0 < inner[0] || p.z0 < inner[1] || p.x1 > inner[2] || p.z1 > inner[3]) return null;
      // the biomes around (every other block: never the marsh or the dunes, which reshape the ground after this stage)
      for (let z = p.z0 - 2; z <= p.z1 + 2; z += 2) for (let x = p.x0 - 2; x <= p.x1 + 2; x += 2) if (!VILLAGE_EDGE_BIOMES.has(ctx.biomeAt(x, z)?.key ?? null)) return null;
      const lane = p.id === 'lane' || p.id === 'lane_short';
      if (!this.padGround(p, lane)) return null;
      const s = ctx.structures.adapt.survey(p.x0, p.z0, p.x1, p.z1, h);
      if (!lane && s.max - s.min > (p.id === 'plaza' ? 5 : 7)) return null; // a pad cuts or fills a few blocks at most; lanes follow the ground
      return s.median;
    };
    const layout = ctx.structures.assemble(VILLAGE_PIECES_NAME, (ctx.seed ^ SALT ^ Math.imul(rx, 0x27d4eb2d) ^ Math.imul(rz, 0x165667b1)) >>> 0, { x: cx, z: cz }, fits);
    if (!layout) return null;
    const plaza = layout.pieces[0], houses: House[] = [], sites: any[] = [], lanes: any[] = [], yards: any[] = [];
    sites.push({ x0: plaza.x0, z0: plaza.z0, x1: plaza.x1, z1: plaza.z1, floor: plaza.y, mode: 'pad', skirt: 3 });
    for (const p of layout.pieces) {
      if (p.id === 'lane' || p.id === 'lane_short') { lanes.push(p); continue; }
      if (p.id === 'yard') { yards.push(p); sites.push({ x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1, floor: p.y, mode: 'pad', skirt: 2 }); continue; }
      const t = TYPES[p.id as HouseType];
      if (!t) continue;
      const i = houses.length, [hx, hz] = p.toWorld((t.W - 1) / 2 + 1, (t.D - 1) / 2 + 2), facing = p.sideOf('n'), fr = new Frame(hx, hz, t.W, t.D, facing), mid = (t.W - 1) / 2;
      const collapse = this.rand(rx, 91040 + i, rz) < 0.35 ? (this.rand(rx, 91050 + i, rz) < 0.5 ? 1 : 2) : 0;
      houses.push({ type: p.id as HouseType, cx: hx, cz: hz, facing, F: p.y, collapse, chest: false, door: { x: fr.x(mid, 0), y: p.y + 1, z: fr.z(mid, 0) } });
      sites.push({ x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1, floor: p.y, mode: 'pad', skirt: 3 });
    }
    if (houses.length < 3) return null;
    const chests = this.pickChests(rx, rz, houses);
    return { x: cx, y: plaza.y, z: cz, claim: { cx: ccx, cz: ccz, n: N }, damp: DAMP_BIOMES.has(fit.centre as string), houses, chests, biome: fit.centre, layout, sites, lanes, yards };
  }

  // Terrain 2: may a piece stand here? Never at the water (a column at or near the sea level: the sea, a river, a shore);
  // what stands on a pad mostly on grass (the pad turns a few columns of sand or rock into its grass); a lane anywhere dry.
  padGround(p: { x0: number; z0: number; x1: number; z1: number }, lane = false) {
    const { ctx } = this;
    let bad = 0;
    const cells = (p.x1 - p.x0 + 1) * (p.z1 - p.z0 + 1);
    for (let z = p.z0; z <= p.z1; z++) for (let x = p.x0; x <= p.x1; x++) {
      if (ctx.columnInfo(x, z).h <= ctx.seaLevel + 1) return false;
      if (!lane && !this.goodGround(x, z) && ++bad > cells * 0.15) return false;
    }
    return true;
  }

  // one or two chests, in houses picked by the seed (a collapsed corner never buries one: the chest stands away from it)
  pickChests(rx: number, rz: number, houses: House[]) {
    const chests: { x: number; y: number; z: number }[] = [];
    const want = this.rand(rx, 91060, rz) < 0.45 ? 2 : 1;
    const first = Math.floor(this.rand(rx, 91061, rz) * houses.length);
    for (let k = 0; k < want; k++) {
      const h = houses[(first + k * 2) % houses.length];
      if (h.chest) continue;
      h.chest = true;
      const { W, D } = TYPES[h.type], fr = new Frame(h.cx, h.cz, W, D, h.facing), [u, v] = CHEST_AT[h.type];
      chests.push({ x: fr.x(u, v), y: h.F + 1, z: fr.z(u, v) });
    }
    return chests;
  }

  tryAt(rx: number, rz: number, ccx: number, ccz: number): Village | null {
    const { ctx } = this;
    const N = VILLAGE_CLAIM;
    const X0 = ccx * CS, Z0 = ccz * CS, SIZE = N * CS;
    const cx = X0 + SIZE / 2, cz = Z0 + SIZE / 2;
    if (!ZONES.has(ctx.zoneAt(cx, cz).key)) return null;
    const biomeKey = (x: number, z: number) => ctx.biomeAt(x, z)?.key ?? null;
    const centre = biomeKey(cx, cz);
    if (!VILLAGE_BIOMES.has(centre)) return null;
    // the ground: the claim's biomes all allowed (no tall canopy tree may grow into it), and grass (or the biome's floor
    // over grass) above the sea nearly everywhere it is sampled — a pond or a sandy dip here and there is kept out of the
    // houses' and the well's own ground below
    // (the biomes first: they are cheap, the columns are not)
    for (let z = Z0 + INNER - 2; z < Z0 + SIZE - INNER + 2; z += 3) for (let x = X0 + INNER - 2; x < X0 + SIZE - INNER + 2; x += 3) {
      if (!VILLAGE_EDGE_BIOMES.has(biomeKey(x, z))) return null;
    }
    let lo = Infinity, hi = -Infinity, bad = 0, n = 0;
    for (let z = Z0 + INNER - 2; z < Z0 + SIZE - INNER + 2; z += 3) for (let x = X0 + INNER - 2; x < X0 + SIZE - INNER + 2; x += 3) {
      n++;
      if (!this.goodGround(x, z)) { bad++; if (bad > 40) return null; continue; }
      const h = ctx.columnInfo(x, z).h;
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    if (bad > n * 0.2) return null;
    if (hi - lo > 5) return null;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (baseStructureIn(ctx.locate, ccx + i, ccz + j)) return null;
      if (claimedAbove(ctx.locate, 'creaturesVillageAt', ccx + i, ccz + j)) return null; // a castle there (claims.ts)
    }
    const damp = DAMP_BIOMES.has(centre);
    // the well
    let wy = -Infinity;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (!this.goodGround(cx + dx, cz + dz)) return null;
      wy = Math.max(wy, ctx.columnInfo(cx + dx, cz + dz).h);
    }
    // the houses, in a ring around the well, each looking at it
    const K = 4 + Math.floor(this.rand(rx, 91004, rz) * 4); // slots tried (4..7); 3 to 6 houses stand
    const a0 = this.rand(rx, 91005, rz) * Math.PI * 2;
    const houses: House[] = [];
    const rects: number[][] = [[cx - 3, cz - 3, cx + 3, cz + 3]];
    const inner = [X0 + INNER, Z0 + INNER, X0 + SIZE - 1 - INNER, Z0 + SIZE - 1 - INNER];
    const order: HouseType[] = ['cottage', 'longhouse', 'workshop'];
    for (let i = 0; i < K && houses.length < 6; i++) {
      const t0 = order[i < 3 ? (i + Math.floor(this.rand(rx, 91006, rz) * 3)) % 3 : Math.floor(this.rand(rx, 91010 + i, rz) * 3)];
      // a few variants of the slot (a little nearer or farther, turned a little, a cottage when the big one does not fit)
      for (let j = 0; j < 4; j++) {
        const t: HouseType = j >= 2 ? 'cottage' : t0;
        const { W, D } = TYPES[t];
        const ang = a0 + (i * Math.PI * 2) / K + (this.rand(rx, 91020 + i * 8 + j, rz) - 0.5) * 0.6;
        const r = 11 + (t === 'longhouse' ? 2 : 0) + Math.floor(this.rand(rx, 91030 + i * 8 + j, rz) * 3) + (j === 1 ? -1 : j === 3 ? 1 : 0);
        const hx = cx + Math.round(Math.cos(ang) * r), hz = cz + Math.round(Math.sin(ang) * r);
        const facing = towards(cx - hx, cz - hz);
        const fr = new Frame(hx, hz, W, D, facing);
        const rect = fr.bounds(-1, -2, W, D); // with the roof's overhang and the step in front of the door
        if (rect[0] < inner[0] || rect[1] < inner[1] || rect[2] > inner[2] || rect[3] > inner[3]) continue;
        if (rects.some((o) => near(o, rect, 2))) continue;
        // the floor sits at the highest ground of the house AND the ring around it (no trench is cut into a slope beside it);
        // the low side stands on a stone foundation
        let F = -Infinity, low = Infinity, dry = true;
        for (let v = -2; v <= D; v++) for (let u = -1; u <= W; u++) {
          if (!this.goodGround(fr.x(u, v), fr.z(u, v))) dry = false;
          const h = ctx.columnInfo(fr.x(u, v), fr.z(u, v)).h;
          F = Math.max(F, h);
          if (v >= 0 && v < D && u >= 0 && u < W) low = Math.min(low, h);
        }
        if (!dry || F - low > 3) continue;
        rects.push(rect);
        const mid = (W - 1) / 2;
        const collapse = this.rand(rx, 91040 + i, rz) < 0.35 ? (this.rand(rx, 91050 + i, rz) < 0.5 ? 1 : 2) : 0; // 1: back-left corner, 2: back-right
        houses.push({ type: t, cx: hx, cz: hz, facing, F, collapse, chest: false, door: { x: fr.x(mid, 0), y: F + 1, z: fr.z(mid, 0) } });
        break;
      }
    }
    if (houses.length < 3) return null;
    // one or two chests, in houses picked by the seed (a collapsed corner never buries one: the chest stands away from it)
    const chests: { x: number; y: number; z: number }[] = [];
    const want = this.rand(rx, 91060, rz) < 0.45 ? 2 : 1;
    const first = Math.floor(this.rand(rx, 91061, rz) * houses.length);
    for (let k = 0; k < want; k++) {
      const h = houses[(first + k * 2) % houses.length];
      if (h.chest) continue;
      h.chest = true;
      const { W, D } = TYPES[h.type], fr = new Frame(h.cx, h.cz, W, D, h.facing), [u, v] = CHEST_AT[h.type];
      chests.push({ x: fr.x(u, v), y: h.F + 1, z: fr.z(u, v) });
    }
    return { x: cx, y: wy, z: cz, claim: { cx: ccx, cz: ccz, n: N }, damp, houses, chests, biome: centre };
  }

  // ------------------------------------------------------------------------------------------------ building
  generate(chunk: any) {
    const v = this.villageAt(chunk.cx, chunk.cz);
    if (!v) return;
    const c = new Canvas(chunk, this.ctx.height);
    if (v.sites) { // terrain 2: the pads first (cut and fill with sloped skirts), on the natural ground of the columns
      this.ctx.structures.adapt.chunk(chunk, CS, this.ctx.height, v.sites, (x: number, z: number) => this.ctx.columnInfo(x, z).h);
    }
    for (const h of v.houses) this.clearTrees(c, h);
    for (const h of v.houses) this.house(c, v, h);
    this.well(c, v);
    if (v.lanes) { for (const l of v.lanes) this.lane(c, v, l); for (const y of v.yards ?? []) this.yard(c, v, y); for (const h of v.houses) this.doorPath(c, v, h); }
    else for (const h of v.houses) this.path(c, v, h);
  }

  // terrain 2: a lane of gravel and trodden dirt down the middle of a lane piece (its side rows: grass, a stone here and
  // there), following the ground; plants and leaves cleared above it
  lane(c: Canvas, v: Village, l: any) {
    const I = this.ids, d = l.rot & 1 ? l.x1 - l.x0 + 1 : l.z1 - l.z0 + 1;
    for (let vv = 0; vv < d; vv++) for (let u = 0; u < 3; u++) {
      const [x, z] = l.toWorld(u, vv);
      if (!c.inside(x, z) || !this.goodGround(x, z)) continue;
      const g = this.groundOf(v, x, z), r = this.rand(x, 92003, z);
      if (u === 1) c.set(x, g, z, r < 0.65 ? I.gravel : I.dirt);
      else if (r < 0.12) c.set(x, g, z, I.gravel);
      for (let y = g + 1; y <= g + 2; y++) { const b = c.get(x, y, z); if (I.plants.has(b) || b === I.leaves || b === I.log) c.set(x, y, z, 0); }
    }
  }

  // terrain 2: the two blocks from a house's door step to its lane
  doorPath(c: Canvas, v: Village, h: House) {
    const I = this.ids, { W, D } = TYPES[h.type], fr = new Frame(h.cx, h.cz, W, D, h.facing), mid = (W - 1) / 2;
    const x = fr.x(mid, -2), z = fr.z(mid, -2);
    if (!c.inside(x, z)) return;
    const g = this.groundOf(v, x, z);
    c.set(x, g, z, this.rand(x, 92002, z) < 0.65 ? I.gravel : I.dirt);
    for (let y = g + 1; y <= g + 2; y++) { const b = c.get(x, y, z); if (I.plants.has(b) || b === I.leaves || b === I.log) c.set(x, y, z, 0); }
  }

  // terrain 2: a yard where no house fit — a woodpile against the back, a crate and a barrel left out
  yard(c: Canvas, v: Village, p: any) {
    const I = this.ids, Y = p.y + 1;
    for (const [u, vv, id] of [[1, 2, I.log], [2, 2, I.log], [3, 2, I.log], [1, 1, I.crate], [3, 1, I.barrel]] as number[][]) {
      const [x, z] = p.toWorld(u, vv);
      if (c.inside(x, z)) c.set(x, Y, z, id);
    }
    const [x, z] = p.toWorld(2, 2);
    if (c.inside(x, z)) c.set(x, Y + 1, z, I.log); // the pile is two logs high in the middle
  }

  // the trees around a house go (trunks and leaves only: the ground and its grass stay)
  clearTrees(c: Canvas, h: House) {
    const { W, D } = TYPES[h.type], fr = new Frame(h.cx, h.cz, W, D, h.facing), { log, leaves } = this.ids;
    const [x0, z0, x1, z1] = fr.bounds(-5, -5, W + 4, D + 4);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (!c.inside(x, z)) continue;
      for (let y = this.ctx.columnInfo(x, z).h + 1; y <= h.F + 16; y++) { const b = c.get(x, y, z); if (b === log || b === leaves) c.set(x, y, z, 0); }
    }
  }

  house(c: Canvas, v: Village, h: House) {
    const I = this.ids, { W, D, WH } = TYPES[h.type], fr = new Frame(h.cx, h.cz, W, D, h.facing), F = h.F, mid = (W - 1) / 2;
    const r = (u: number, vv: number, y: number, salt: number) => this.rand(fr.x(u, vv) * 7 + salt, y, fr.z(u, vv));
    const put = (u: number, vv: number, y: number, id: number) => c.set(fr.x(u, vv), y, fr.z(u, vv), id);
    const at = (u: number, vv: number, y: number) => c.get(fr.x(u, vv), y, fr.z(u, vv));
    const stone = (u: number, vv: number, y: number) => (v.damp && r(u, vv, y, 1) < 0.5 ? I.mossy : I.cobble);
    const ridgeK = (D + 1) / 2;
    const top = F + WH + ridgeK + 2;
    // the collapsed corner: how far (in local cells) a point is from it, or Infinity
    const corner = h.collapse === 1 ? [0, D - 1] : h.collapse === 2 ? [W - 1, D - 1] : null;
    const fall = (u: number, vv: number) => (corner ? Math.abs(u - corner[0]) + Math.abs(vv - corner[1]) : Infinity);
    // clear the volume (walls, roof and its overhang), and the step in front of the door
    for (let vv = -1; vv <= D; vv++) for (let u = -1; u <= W; u++) for (let y = F + 1; y <= top; y++) put(u, vv, y, 0);
    // foundation and floor
    for (let vv = 0; vv < D; vv++) for (let u = 0; u < W; u++) {
      const x = fr.x(u, vv), z = fr.z(u, vv), g = this.groundOf(v, x, z);
      for (let y = g + 1; y < F; y++) c.set(x, y, z, stone(u, vv, y));
      const edge = u === 0 || vv === 0 || u === W - 1 || vv === D - 1;
      const broken = !edge && r(u, vv, F, 2) < 0.08;
      c.set(x, F, z, edge || h.type === 'workshop' ? stone(u, vv, F) : broken ? I.dirt : I.old);
    }
    // the walls
    for (let vv = 0; vv < D; vv++) for (let u = 0; u < W; u++) {
      const edge = u === 0 || vv === 0 || u === W - 1 || vv === D - 1;
      if (!edge) continue;
      const cornerPost = (u === 0 || u === W - 1) && (vv === 0 || vv === D - 1);
      const openSide = h.type === 'workshop' && u === W - 1 && !cornerPost; // the workshop opens on one side
      const d = fall(u, vv);
      for (let y = F + 1; y <= F + WH; y++) {
        if (d <= 3 && y > F + d) continue; // fallen in: the corner is lowest
        let id;
        if (cornerPost) id = I.log;
        else if (openSide) id = y === F + WH ? I.log : 0;
        else if (y === F + 1 || h.type === 'workshop') id = stone(u, vv, y);
        else id = I.old;
        // the doorway (the door rotted away long ago)
        if (vv === 0 && u === mid && y <= F + 2) id = 0;
        // windows: on the side walls and beside the door, at eye height; most of the glass is broken
        const win = y === F + 2 && !cornerPost && !openSide && ((vv === (D - 1) / 2 && (u === 0 || u === W - 1)) || (vv === 0 && (u === 1 || u === W - 2) && W > 7) || (vv === D - 1 && u === mid && W > 7));
        if (win) id = r(u, vv, y, 3) < 0.3 ? I.glass : 0;
        put(u, vv, y, id);
      }
    }
    // the step in front of the doorway
    {
      const x = fr.x(mid, -1), z = fr.z(mid, -1), g = this.groundOf(v, x, z);
      for (let y = g + 1; y < F; y++) c.set(x, y, z, stone(mid, -1, y));
      c.set(x, F, z, stone(mid, -1, F));
    }
    // the roof: eaves of thatch at the top of the walls, then rows stepping in to the ridge; gables of planks (cobble in the
    // workshop) at both ends; a few holes, and none over a fallen corner
    const gable = h.type === 'workshop' ? I.cobble : I.old;
    for (let u = 0; u < W; u++) for (const vv of [-1, D]) if (fall(u, vv) > 3 && r(u, vv, F + WH, 4) > 0.06) put(u, vv, F + WH, I.slab);
    for (let k = 1; k <= ridgeK; k++) {
      const a = k - 1, b = D - k, y = F + WH + k;
      if (a > b) break;
      for (let u = 0; u < W; u++) { // no overhang at the gable ends: the gables keep their daylight
        for (const vv of a === b ? [a] : [a, b]) if (fall(u, vv) > 3 && r(u, vv, y, 5) > 0.07) put(u, vv, y, I.thatch);
        if ((u === 0 || u === W - 1)) for (let vv = a + 1; vv < b; vv++) if (fall(u, vv) > 3) put(u, vv, y, gable);
      }
      if (a === b) for (let u = 0; u < W; u++) if (fall(u, a) > 3 && r(u, a, y + 1, 6) > 0.15) put(u, a, y + 1, I.slab);
    }
    // the furniture left behind
    const y1 = F + 1, back = fr.side('back');
    const free = (u: number, vv: number) => at(u, vv, y1) === 0 && fall(u, vv) > 3;
    const place = (u: number, vv: number, id: number) => { if (free(u, vv)) put(u, vv, y1, id); };
    const onTop = (u: number, vv: number, id: number) => { if (at(u, vv, y1) !== 0 && at(u, vv, y1 + 1) === 0) put(u, vv, y1 + 1, id); };
    if (h.chest) { const [u, vv] = CHEST_AT[h.type]; put(u, vv, y1, I.chest); }
    if (h.type === 'cottage') {
      place(1, 3, I.bed); place(5, 3, I.barrel); place(4, 2, I.rTable); onTop(4, 2, I.lantern); place(5, 2, I.stool);
      place(2, 3, I.shelf[back]); place(1, 1, I.crate);
    } else if (h.type === 'longhouse') {
      place(1, 5, I.bed); place(1, 4, I.bed); place(9, 5, I.bed);
      for (const u of [3, 4, 6, 7]) place(u, 3, I.rTable);
      onTop(4, 3, I.lantern); onTop(6, 3, I.lantern);
      place(3, 2, I.stool); place(4, 4, I.stool); place(6, 2, I.stool); place(7, 4, I.stool);
      for (const u of [3, 4, 6, 7]) place(u, 5, I.shelf[back]);
      place(9, 1, I.barrel); place(9, 2, I.barrel); place(1, 1, I.crate); place(1, 2, I.crate); onTop(1, 1, I.crate);
    } else {
      place(1, 5, I.table); place(2, 5, I.furnace); place(4, 5, I.shelf[back]);
      place(5, 5, I.crate); place(5, 4, I.crate); onTop(5, 5, I.crate); onTop(5, 4, I.lantern);
      place(1, 1, I.barrel); place(1, 2, I.barrel); place(1, 3, I.rTable); place(2, 3, I.stool);
    }
    // what fell in: stones and boards on the floor by the broken corner
    if (corner) for (const [du, dv] of [[1, -1], [2, -1], [1, -2]]) {
      const u = corner[0] === 0 ? du : W - 1 - du, vv = D - 1 + dv;
      if (at(u, vv, y1) === 0 && r(u, vv, y1, 7) < 0.7) put(u, vv, y1, r(u, vv, y1, 8) < 0.5 ? I.gravel : stone(u, vv, y1));
    }
    // overgrowth: grass on the floor, vines down the outside of the walls (much more in the damp forest)
    if (v.damp) for (let vv = 1; vv < D - 1; vv++) for (let u = 1; u < W - 1; u++) {
      if (u !== mid && at(u, vv, y1) === 0 && at(u, vv, F) !== I.dirt && r(u, vv, y1, 9) < 0.12) put(u, vv, y1, I.tallGrass);
    }
    const vineChance = v.damp ? 0.35 : 0.06;
    const walls: Array<[number, number, number, number, Facing]> = []; // the cell outside each wall column, and the side the wall is on
    for (let u = 0; u < W; u++) { walls.push([u, -1, u, 0, back]); walls.push([u, D, u, D - 1, fr.side('front')]); }
    for (let vv = 0; vv < D; vv++) { walls.push([-1, vv, 0, vv, fr.side('right')]); walls.push([W, vv, W - 1, vv, fr.side('left')]); }
    for (const [ou, ov, wu, wv, side] of walls) {
      if (ov === -1 && Math.abs(ou - mid) <= 1) continue; // keep the doorway clear
      if (r(ou, ov, 0, 10) >= vineChance) continue;
      const topY = F + WH - 1, len = 1 + Math.floor(r(ou, ov, 1, 11) * (WH - 1));
      for (let y = topY; y > topY - len && y > F; y--) {
        if (at(wu, wv, y) === 0 || at(ou, ov, y) !== 0) break;
        put(ou, ov, y, I.vines[side]);
      }
    }
  }

  // the dry well in the middle: a paved square, a ring of stones over a lined shaft, two posts with the winch, a little roof
  well(c: Canvas, v: Village) {
    const I = this.ids, { x: cx, z: cz } = v, Y = v.y;
    const stone = (x: number, y: number, z: number) => (v.damp && this.rand(x, y + 3, z) < 0.5 ? I.mossy : I.cobble);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx, z = cz + dz, g = this.groundOf(v, x, z);
      for (let y = g + 1; y < Y; y++) c.set(x, y, z, stone(x, y, z));
      c.set(x, Y, z, this.rand(x, 92001, z) < 0.6 ? I.gravel : stone(x, Y, z));
      for (let y = Y + 1; y <= Y + 6; y++) c.set(x, y, z, 0);
    }
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx, z = cz + dz;
      if (dx || dz) { for (let y = Y - 4; y <= Y + 1; y++) c.set(x, y, z, stone(x, y, z)); }
      else { for (let y = Y - 4; y <= Y + 1; y++) c.set(x, y, z, 0); c.set(x, Y - 5, z, I.gravel); }
      c.set(x, Y + 4, z, I.slab);
    }
    for (const dx of [-1, 1]) { c.set(cx + dx, Y + 2, cz, I.fence); c.set(cx + dx, Y + 3, cz, I.fence); }
    c.set(cx, Y + 3, cz, I.winch);
    // a faded banner on a post at a corner of the paving
    c.set(cx + 2, Y + 1, cz + 2, I.fence);
    c.set(cx + 2, Y + 2, cz + 2, I.banner);
  }

  // a path of gravel and trodden dirt from the doorway's step to the well, following the ground
  path(c: Canvas, v: Village, h: House) {
    const I = this.ids, { W, D } = TYPES[h.type], fr = new Frame(h.cx, h.cz, W, D, h.facing), mid = (W - 1) / 2;
    const sx = fr.x(mid, -2), sz = fr.z(mid, -2);
    const steps = Math.max(Math.abs(v.x - sx), Math.abs(v.z - sz));
    let prev = h.F;
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(sx + ((v.x - sx) * i) / Math.max(1, steps)), z = Math.round(sz + ((v.z - sz) * i) / Math.max(1, steps));
      if (Math.abs(x - v.x) <= 2 && Math.abs(z - v.z) <= 2) break; // reached the paving
      if (v.houses.some((o) => { const t = TYPES[o.type], f = new Frame(o.cx, o.cz, t.W, t.D, o.facing), b = f.bounds(-1, -1, t.W, t.D); return x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3]; })) continue;
      if (!this.goodGround(x, z)) continue; // never over water (nor sand by it)
      const g = this.groundOf(v, x, z), lvl = Math.max(g, prev - 1);
      prev = lvl;
      if (!c.inside(x, z)) continue;
      for (let y = g + 1; y < lvl; y++) c.set(x, y, z, I.dirt);
      c.set(x, lvl, z, this.rand(x, 92002, z) < 0.65 ? I.gravel : I.dirt);
      for (let y = lvl + 1; y <= lvl + 2; y++) { const b = c.get(x, y, z); if (I.plants.has(b) || b === I.leaves || b === I.log) c.set(x, y, z, 0); }
    }
  }
}
