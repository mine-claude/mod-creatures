// @ts-check
// The Ruined Castle as a stage of the Overworld's generator (a StructureFeature, like the base game's ruins and dungeons):
// it decides WHERE the castles are (castleAt / castlesNear, the lookups the engine and this mod ask) and writes each chunk's
// slice of the castle that covers it.
//
// Only in NEW worlds: a world is born with biomes (owner's decision, 2026-11-21) and an old one never gets them, so the stage
// does nothing at all in a world without biomes (ctx.biomes === null) — every chunk of an existing world comes out byte for
// byte as before. In a world with biomes the generator ERA of each region (docs/modding.md 22.3) keeps the regions that were
// generated before this mod was installed exactly as they were; only regions generated from now on can hold a castle.
//
// Where: at most one per region of REGION x REGION chunks (CHANCE of the regions try), anchored anywhere in the region so
// the footprint always fits in it; of three candidate spots the highest and flattest that qualifies wins: dry land well above
// the sea, no more than MAX_SPREAD blocks between its lowest and highest column, never over a chunk with a structure of the
// base game (ruin, camp, lake, well, river; a dungeon only when it comes up near the crypt), never in the lobby or the
// Quarantine. Everything is a pure
// function of the seed and of the terrain columns (ctx.columnInfo, terrain steps included), so the server, the page and the
// workers agree, in any generation order. The structure KIND (index.ts) makes the declarative structures of other mods
// keep out of the castle's chunks.
import { StructureFeature } from '../../mineclaude-sdk.js';
import { buildPlan, FACING_BLOCKS, HV, S, splitFacing, Y_BELOW } from './plan.ts';
import { isTerrain2 } from '../sets.ts';
import { applySkirts, sitesReaching } from '../skirts.ts';

export const REGION = 12; // chunks
export const CHANCE = 0.4;
export const CANDIDATES = 8;
export const MAX_SPREAD = 9; // blocks between the lowest and highest sampled column
const SALT = 0x3ca571e5;
const BAD_ZONES = new Set(['lobby', 'quarentena']);
// The biomes of the `biomes` mod (names only compared, no dependency) a castle never stands in, sampled over its whole
// footprint. Every biome's decoration is a feature step, which runs AFTER every stage, so whatever it grows from the ground
// grows through the castle's courtyard and towers: the tall canopy's, the ipe forest's and the mossy forest's trees, the snowy taiga's conifers,
// the coral coast's palms, the mushroom grove's giant caps, the red dunes' cacti and arches; the glow marsh and the coral
// coast are water and shore besides.
export const BAD_BIOMES = new Set([
  'biomes:tall_canopy', 'biomes:ipe_forest', 'biomes:mossy_forest', 'biomes:snowy_taiga', 'biomes:coral_coast', 'biomes:glow_marsh', 'biomes:red_dunes', 'biomes:mushroom_grove',
]);
// High ground first: of the region's candidate spots the highest, flattest one wins (score), and a spot whose middle is on
// the Planalto das Ruínas (a plateau of old stones: the castle belongs there) gets this much more.
export const PLATEAU = 'biomes:ruin_plateau';
export const PLATEAU_BONUS = 12;
// what the plateau's decoration takes for its own ground (its GROUND / FACE sets), and what the castle lays there instead
const GROUND_LIKE = new Set(['mineclaude:grass', 'mineclaude:gravel', 'mineclaude:dirt', 'mineclaude:stone']);
const PAVING = 'mineclaude:cobblestone';
// the base game's structure lookups a castle must keep away from (each (cx, cz) => value | null). A dungeon is buried: it
// only counts when it comes up to the crypt's depth (DUNGEON_CLEARANCE under the floor); a dry bed is carved terrain that
// the castle's own ground and foundation cover, so it does not count.
const AVOID = ['ruinAt', 'campAt', 'lakeAt', 'wellAt', 'riverInChunk'];
const DUNGEON_CLEARANCE = Y_BELOW + 3;

/** The live stages by world seed (server side: the spawn rules, the chests and the crypt read the castles from here). */
export const liveStages = new Map();
/** The castle locator of a world seed, or null (no world with biomes was generated with this seed in this process). */
export const stageForSeed = (seed: number) => (Number.isFinite(seed) ? liveStages.get(seed >>> 0) ?? null : null);
/** The seed of the only world with biomes generated in this process (a server has one), or NaN. */
export const liveSeed = () => (liveStages.size === 1 ? [...liveStages.keys()][0] : NaN);

// set by index.ts once the content registry is frozen: block name (+ facing) -> effective id
let resolveState: ((name: string, facing: string | null) => number) | null = null;
export function setStateResolver(fn: (name: string, facing: string | null) => number) { resolveState = fn; }

export default class RuinedCastleStage extends StructureFeature {
  [key: string]: any;
  constructor(ctx: any) {
    super(ctx);
    this.on = !!ctx.biomes; // only a world born with biomes (a new world) has castles
    this.anchors = new Map(); // region -> site | null (pure: a cache)
    this.plans = new Map(); // site key -> { plan, ids } (pure: a cache)
    if (this.on) liveStages.set(ctx.seed >>> 0, this);
    // terrain 2: an earth bank (`beard` site, ../skirts.ts) ramps up to the castle's plinth on its low sides, and the
    // features that run after the stages stand on it
    this.t2 = this.on && isTerrain2(ctx);
    this.groundSites = new Map(); // site key -> [the castle's ground site]
    if (this.t2) ctx.structures.ground((x: number, z: number, h: number) => {
      const s = sitesReaching(x, z, x, z, 1, (cx: number, cz: number) => this.sitesOf(cx, cz));
      return s.length ? ctx.structures.adapt.height(s, x, z, h) : null;
    });
  }

  /** Terrain 2: the ground site of the castle covering chunk (cx, cz) (its footprint, the floor under the yard), as a list. */
  sitesOf(cx: number, cz: number): any[] {
    const site = this.castleAt(cx, cz);
    if (!site) return [];
    let s = this.groundSites.get(site.key);
    if (!s) {
      s = [Object.freeze({ x0: site.x0, z0: site.z0, x1: site.x0 + S - 1, z1: site.z0 + S - 1, floor: site.F - 1, mode: 'beard', skirt: 4 })];
      if (this.groundSites.size > 64) this.groundSites.clear();
      this.groundSites.set(site.key, s);
    }
    return s;
  }

  hash(salt: number, x: number, y: number, z: number) { return this.ctx.hash3((this.ctx.seed ^ SALT) >>> 0, Math.floor(x) | 0, (Math.floor(y) * 131 + salt) | 0, Math.floor(z) | 0); }

  /** Does a footprint at (x, z) (north-west corner) qualify? -> { F, score } or null. */
  evaluate(x: number, z: number) {
    const ctx = this.ctx, CS = ctx.size, H = ctx.height;
    for (const [dx, dz] of [[0, 0], [S - 1, 0], [0, S - 1], [S - 1, S - 1], [21, 21]]) if (BAD_ZONES.has(ctx.zoneAt(x + dx, z + dz).key)) return null;
    const c0x = Math.floor(x / CS), c1x = Math.floor((x + S - 1) / CS), c0z = Math.floor(z / CS), c1z = Math.floor((z + S - 1) / CS);
    for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) for (const k of AVOID) { const at = ctx.locate[k]; if (typeof at === 'function' && at(cx, cz)) return null; }
    const hs = [];
    for (let dz = 0; dz < S; dz += 3) for (let dx = 0; dx < S; dx += 3) {
      const h = ctx.columnInfo(x + dx, z + dz).h;
      if (h <= ctx.seaLevel + 2) return null; // water, a beach or a marsh pool: never
      if (BAD_BIOMES.has(ctx.biomeAt(x + dx, z + dz)?.key)) return null;
      hs.push(h);
    }
    hs.sort((a, b) => a - b);
    const spread = hs[hs.length - 1] - hs[0];
    if (spread > MAX_SPREAD) return null;
    const F = hs[Math.floor(hs.length * 0.3)] + 1;
    if (F - Y_BELOW < 4 || F + 18 >= H - 1) return null;
    const dungeonAt = ctx.locate.dungeonAt;
    if (typeof dungeonAt === 'function') {
      for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) { const d = dungeonAt(cx, cz); if (d && d.y + d.h >= F - DUNGEON_CLEARANCE) return null; }
    }
    return { F, score: F - 1.5 * spread + (ctx.biomeAt(x + 21, z + 21)?.key === PLATEAU ? PLATEAU_BONUS : 0) };
  }

  /** The castle of region (rx, rz): { x0, z0, F, rot, key, c0x.. } or null. */
  siteOf(rx: number, rz: number) {
    if (!this.on) return null;
    const key = `${rx},${rz}`;
    if (this.anchors.has(key)) return this.anchors.get(key);
    let site = null;
    if (this.hash(1, rx, 0, rz) < CHANCE) {
      const span = REGION * this.ctx.size - S;
      let best = null;
      for (let k = 0; k < CANDIDATES; k++) {
        const x0 = rx * REGION * this.ctx.size + Math.floor(this.hash(10 + k, rx, 0, rz) * span);
        const z0 = rz * REGION * this.ctx.size + Math.floor(this.hash(20 + k, rx, 0, rz) * span);
        const ev = this.evaluate(x0, z0);
        if (ev && (!best || ev.score > best.score)) best = { x0, z0, F: ev.F, score: ev.score };
      }
      if (best) {
        const CS = this.ctx.size, rot = Math.floor(this.hash(30, rx, 0, rz) * 4);
        site = Object.freeze({ x0: best.x0, z0: best.z0, F: best.F, rot, key: `${best.x0},${best.z0}`, size: S,
          c0x: Math.floor(best.x0 / CS), c1x: Math.floor((best.x0 + S - 1) / CS), c0z: Math.floor(best.z0 / CS), c1z: Math.floor((best.z0 + S - 1) / CS),
          center: Object.freeze({ x: best.x0 + 21, z: best.z0 + 21 }) });
      }
    }
    if (this.anchors.size >= 1024) this.anchors.clear();
    this.anchors.set(key, site);
    return site;
  }

  /** The castle whose footprint covers chunk (cx, cz), or null. */
  castleAt(cx: number, cz: number) {
    if (!this.on) return null;
    const s = this.siteOf(Math.floor(cx / REGION), Math.floor(cz / REGION));
    return s && cx >= s.c0x && cx <= s.c1x && cz >= s.c0z && cz <= s.c1z ? s : null;
  }

  /** The castle whose footprint covers the column (x, z), or null. */
  castleAtBlock(x: number, z: number) {
    const s = this.castleAt(Math.floor(x / this.ctx.size), Math.floor(z / this.ctx.size));
    return s && x >= s.x0 && x < s.x0 + S && z >= s.z0 && z < s.z0 + S ? s : null;
  }

  /** The castles within `max` blocks of (x, z), the closest first: [{ c: { x, z }, d }]. */
  castlesNear(x: number, z: number, max: number) {
    if (!this.on) return [];
    const R = REGION * this.ctx.size, out = [];
    const lim = Math.min(Math.max(0, max | 0), 4096);
    for (let rx = Math.floor((x - lim) / R); rx <= Math.floor((x + lim) / R); rx++) {
      for (let rz = Math.floor((z - lim) / R); rz <= Math.floor((z + lim) / R); rz++) {
        const s = this.siteOf(rx, rz);
        if (!s) continue;
        const d = Math.hypot(s.center.x - x, s.center.z - z);
        if (d <= lim) out.push({ c: { x: s.center.x, z: s.center.z, y: s.F }, d });
      }
    }
    return out.sort((a, b) => a.d - b.d);
  }

  /** The full plan of a site (cached): what every chunk under it copies. */
  planOf(site: any) {
    let entry = this.plans.get(site.key);
    if (!entry) {
      const plan = buildPlan(site, (wx, wz) => this.ctx.columnInfo(wx, wz).h, (salt, x, y, z) => this.hash(100 + salt, x, y, z));
      const ids = plan.palette.map((name, i) => {
        if (i === 0) return -1;
        const [block, facing] = splitFacing(name);
        if (facing && resolveState && FACING_BLOCKS.includes(block)) return resolveState(block, facing);
        return this.ctx.block(block);
      });
      // the plateau's decoration (a feature step, after every stage) dresses the ground it finds at the TERRAIN height: it
      // paints cliff faces of grass/dirt/gravel/stone and sets its fallen pillars on that ground. In a column of the plateau
      // the castle's own ground-like blocks up to the terrain height are cobblestone instead, which it leaves alone.
      const paved = new Int16Array(S * S).fill(-32768);
      for (let lz = 0; lz < S; lz++) for (let lx = 0; lx < S; lx++) {
        const wx = site.x0 + lx, wz = site.z0 + lz;
        if (this.ctx.biomeAt(wx, wz)?.key === PLATEAU) paved[lz * S + lx] = this.ctx.columnInfo(wx, wz).h;
      }
      const cobble = this.ctx.block(PAVING);
      const groundLike = plan.palette.map((name) => GROUND_LIKE.has(name));
      entry = { plan, ids, paved, cobble, groundLike };
      if (this.plans.size >= 8) this.plans.delete(this.plans.keys().next().value);
      this.plans.set(site.key, entry);
    }
    return entry;
  }

  provides() {
    return {
      ruinedCastleAt: (cx: number, cz: number) => this.castleAt(cx, cz),
      ruinedCastlesNear: (x: number, z: number, max: number) => this.castlesNear(x, z, max),
    };
  }

  generate(chunk: any) {
    if (this.t2) applySkirts(this.ctx, chunk, ['ruinedCastleAt'], sitesReaching(chunk.x0, chunk.z0, chunk.x0 + 15, chunk.z0 + 15, 1, (cx: number, cz: number) => this.sitesOf(cx, cz)));
    const site = this.castleAt(chunk.cx, chunk.cz);
    if (!site) return;
    const { plan, ids, paved, cobble, groundLike } = this.planOf(site);
    const CS = this.ctx.size, data = chunk.data, H = this.ctx.height;
    const lx0 = Math.max(0, site.x0 - chunk.x0), lx1 = Math.min(CS - 1, site.x0 + S - 1 - chunk.x0);
    const lz0 = Math.max(0, site.z0 - chunk.z0), lz1 = Math.min(CS - 1, site.z0 + S - 1 - chunk.z0);
    for (let k = 0; k < HV; k++) {
      const y = plan.yBase + k;
      if (y < 0 || y >= H) continue;
      for (let lz = lz0; lz <= lz1; lz++) {
        const pz = chunk.z0 + lz - site.z0;
        const row = (k * S + pz) * S, base = (y * CS + lz) * CS;
        for (let lx = lx0; lx <= lx1; lx++) {
          const px = chunk.x0 + lx - site.x0, p = plan.vol[row + px];
          if (p) data[base + lx] = groundLike[p] && y <= paved[pz * S + px] ? cobble : ids[p];
        }
      }
    }
  }
}
