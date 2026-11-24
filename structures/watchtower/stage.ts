// @ts-check
// The generator stage that places the two outposts (registered with ctx.worldgen.stage, so it runs inside the pipeline with
// the game's structures and can ask the game's lookups where those are). It provides four lookups, declared to the engine
// as two structure kinds (index.ts):
//   watchtowerAt(cx, cz)          the Watchtower of chunk (cx, cz), or null
//   watchtowersNear(x, z, max)    the ones within `max` blocks, nearest first ([{ c, d }]): world.nearestStructure reads it
//   forgottenShrineAt / forgottenShrinesNear   the same for the Forgotten Shrine
//
// ONLY IN WORLDS WITH BIOMES. `ctx.biomes` is the world's biome list, null in a world without biomes (every world created
// before 2026-11-21, and any created with MODLOADER_BIOMES=0): there the lookups answer null at once and generate() writes
// nothing, so those chunks come out byte for byte as before (tests/suites/structures-watchtower-shrine.js checks the base
// fixture). Every new world is born with biomes, and the outposts stand in biomes of the `biomes` mod only (names compared,
// no dependency): the tower in the Bosque de Copas Altas, the Floresta Musgosa and the Prado Florido at the canopy's edge;
// the shrine in the Floresta Musgosa (mostly) and, rarer, in the other two. In a world that already has biomes, the region a
// player already saw keeps its generator era (the engine's eras, docs/modding.md 22.3): only unexplored land gets them.
//
// Each is whole inside one chunk, at most one per region (tower: 8 x 8 chunks; shrine: 7 x 7, never in a tower's chunk),
// never in the lobby or the quarantine, never in a chunk of a dungeon, crypt, ruin, camp, lake, well, river or dry bed of
// the game, never on a shore or in water (every column of the footprint and of a ring around it stands above the sea), never
// in a chunk of another structure of this mod that comes first (../claims.ts: a castle, a village; the shrine also a tower).
// Pure: only the seed, the hash, the columns and the game's lookups; the result is cached per generator.
import { StructureFeature } from '../../mineclaude-sdk.js';
import { BASE, BIOME, BLOCK, LOCATOR, SHRINE_BIOMES, TOWER_BIOMES } from './names.ts';
import { SHRINE, TOWER, shrinePlan, towerPlan } from './layout.ts';
import { claimedAbove } from '../claims.ts';
import { isTerrain2 } from '../sets.ts';
import { applySkirts, sitesReaching } from '../skirts.ts';

export const TOWER_REGION = 8, TOWER_CHANCE = 0.4, TOWER_MAX_SLOPE = 3;
export const SHRINE_REGION = 7, SHRINE_CHANCE = 0.5, SHRINE_MAX_SLOPE = 2, SHRINE_ELSEWHERE = 0.35;
const SALT_TOWER = 91001, SALT_SHRINE = 92001; // far from the game's own salts (6001 ruins, 7001 camps...)
const OPEN_ZONES = new Set(['campos', 'ermos', 'sombrias']);
// the columns within this many blocks of a tower, inside the chunk's tree spots (4..11), lose their grass for trampled dirt:
// the tall canopy's trees (mod biomes, a feature step that runs AFTER every stage) grow only from grass and reach 4 blocks,
// so none of their leaves can fall into the tower
const TRAMPLED = 4, TREE_SPOTS = [4, 11];

const flag = (v: unknown) => v === undefined || !!v;

export default class Outposts extends StructureFeature {
  [key: string]: any;
  constructor(ctx: any) {
    super(ctx);
    const id = (n: string) => ctx.block(n);
    (this as any).ids = new Map();
    for (const n of [...Object.values(BASE), ...Object.values(BLOCK)]) (this as any).ids.set(n, id(n));
    // gated on the world having biomes (see the top of the file); `outposts: false` in the generator opts turns it off
    (this as any).on = !!ctx.biomes?.length && flag(ctx.opts?.outposts);
    (this as any).towers = new Map();
    (this as any).shrines = new Map();
    // terrain 2: an earth bank (`beard` site, ../skirts.ts) ramps up to the raised floor of each outpost, and the features
    // that run after the stages stand on it
    (this as any).t2 = (this as any).on && isTerrain2(ctx);
    (this as any).siteCache = new Map();
    if ((this as any).t2) ctx.structures.ground((x: number, z: number, h: number) => {
      const s = sitesReaching(x, z, x, z, 1, (cx: number, cz: number) => this.sitesOf(cx, cz));
      return s.length ? ctx.structures.adapt.height(s, x, z, h) : null;
    });
  }

  /** Terrain 2: the ground site of the outpost of chunk (cx, cz) (its footprint at the floor under it), as a list. */
  sitesOf(cx: number, cz: number): any[] {
    return this.cached((this as any).siteCache, cx, cz, () => {
      const t = this.watchtowerAt(cx, cz), s = t ? null : this.forgottenShrineAt(cx, cz), o = t ?? s;
      if (!o) return [];
      const W = t ? TOWER.W : SHRINE.W, D = t ? TOWER.D : SHRINE.D, { x, y, z } = o.origin;
      return [Object.freeze({ x0: x, z0: z, x1: x + W - 1, z1: z + D - 1, floor: y - 1, mode: 'beard', skirt: 2 })];
    });
  }

  // ------------------------------------------------------------------ shared checks
  /** a chunk where the game already built something (or a river runs): outposts keep out */
  gameStructureIn(cx: number, cz: number) {
    const loc = this.ctx.locate;
    for (const name of ['dungeonAt', 'ruinAt', 'campAt', 'lakeAt', 'wellAt']) if (typeof loc[name] === 'function' && loc[name](cx, cz)) return true;
    for (const name of ['riverInChunk', 'dryInChunk', 'cryptInChunk']) if (typeof loc[name] === 'function' && loc[name](cx, cz)) return true;
    return false;
  }

  biomeKey(wx: number, wz: number) { return this.ctx.biomeAt(wx, wz)?.key ?? null; }

  /** lo/hi of the ground over the footprint, or null when it is too steep, too low or a column of its ring is water */
  ground(x: number, z: number, w: number, d: number, maxSlope: number) {
    const { ctx } = this, sea = ctx.seaLevel;
    let lo = Infinity, hi = -Infinity;
    for (let dz = -1; dz <= d; dz++) {
      for (let dx = -1; dx <= w; dx++) {
        const h = ctx.columnInfo(x + dx, z + dz).h;
        if (h <= sea + 1) return null; // the sea, a pool, a shore
        if (dx < 0 || dz < 0 || dx >= w || dz >= d) continue;
        lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
    }
    if (hi - lo > maxSlope || hi + TOWER.roof + 3 >= ctx.height) return null;
    return { lo, hi };
  }

  cached(map: Map<string, any>, cx: number, cz: number, fn: () => any) {
    const key = cx + ',' + cz;
    if (map.has(key)) return map.get(key);
    if (map.size > 4096) map.delete(map.keys().next().value);
    const v = fn();
    map.set(key, v);
    return v;
  }

  // ------------------------------------------------------------------ the Watchtower
  watchtowerAt(cx: number, cz: number) { return this.cached((this as any).towers, cx, cz, () => this.towerRaw(cx, cz)); }

  towerRaw(cx: number, cz: number) {
    if (!(this as any).on) return null;
    const { ctx } = this, seed = ctx.seed, hash3 = ctx.hash3, CS = ctx.size;
    const rx = Math.floor(cx / TOWER_REGION), rz = Math.floor(cz / TOWER_REGION);
    if (hash3(seed, rx, SALT_TOWER, rz) >= TOWER_CHANCE) return null;
    if (cx !== rx * TOWER_REGION + Math.floor(hash3(seed, rx, SALT_TOWER + 1, rz) * TOWER_REGION)) return null;
    if (cz !== rz * TOWER_REGION + Math.floor(hash3(seed, rx, SALT_TOWER + 2, rz) * TOWER_REGION)) return null;
    // the footprint (9 x 12) whole inside the chunk, a block off its border
    const x = cx * CS + 1 + Math.floor(hash3(seed, rx, SALT_TOWER + 3, rz) * (CS - TOWER.W - 1));
    const z = cz * CS + 1 + Math.floor(hash3(seed, rx, SALT_TOWER + 4, rz) * (CS - TOWER.D - 1));
    const mx = x + 4, mz = z + 4;
    if (!OPEN_ZONES.has(ctx.zoneAt(mx, mz).key)) return null;
    const biome = this.biomeKey(mx, mz);
    if (!(TOWER_BIOMES as readonly string[]).includes(biome)) return null;
    // on the meadow only at the canopy's edge: the tall woods within 24 blocks
    if (biome === BIOME.meadow && !this.canopyNear(mx, mz)) return null;
    const g = this.ground(x, z, TOWER.W, TOWER.D, TOWER_MAX_SLOPE);
    if (!g || this.gameStructureIn(cx, cz)) return null;
    if (claimedAbove(ctx.locate, 'watchtowerAt', cx, cz)) return null; // a castle's or a village's chunk (../claims.ts)
    const y = g.hi + 1;
    const [chx, chy, chz] = TOWER.chest, [lx, ly, lz] = TOWER.lantern;
    // `x`/`z` (what world.nearestStructure answers) are the chest's column: the mod finds its chest by them (loot.ts)
    return Object.freeze({
      x: x + chx, z: z + chz, y: y + chy, biome,
      origin: Object.freeze({ x, y, z }), ground: g.lo,
      chest: Object.freeze({ x: x + chx, y: y + chy, z: z + chz }),
      lantern: Object.freeze({ x: x + lx, y: y + ly, z: z + lz }),
      garrison: Object.freeze(TOWER.garrison.map(([dx, dy, dz]) => Object.freeze({ x: x + dx, y: y + dy, z: z + dz }))),
    });
  }

  canopyNear(x: number, z: number) {
    for (const r of [8, 16, 24]) for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      if (this.biomeKey(x + ux * r, z + uz * r) === BIOME.canopy) return true;
    }
    return false;
  }

  watchtowersNear(x: number, z: number, max: number) {
    return this.near(x, z, max, TOWER_REGION, SALT_TOWER, TOWER_CHANCE, (cx: number, cz: number) => this.watchtowerAt(cx, cz));
  }

  // ------------------------------------------------------------------ the Forgotten Shrine
  forgottenShrineAt(cx: number, cz: number) { return this.cached((this as any).shrines, cx, cz, () => this.shrineRaw(cx, cz)); }

  shrineRaw(cx: number, cz: number) {
    if (!(this as any).on) return null;
    const { ctx } = this, seed = ctx.seed, hash3 = ctx.hash3, CS = ctx.size;
    const rx = Math.floor(cx / SHRINE_REGION), rz = Math.floor(cz / SHRINE_REGION);
    if (hash3(seed, rx, SALT_SHRINE, rz) >= SHRINE_CHANCE) return null;
    if (cx !== rx * SHRINE_REGION + Math.floor(hash3(seed, rx, SALT_SHRINE + 1, rz) * SHRINE_REGION)) return null;
    if (cz !== rz * SHRINE_REGION + Math.floor(hash3(seed, rx, SALT_SHRINE + 2, rz) * SHRINE_REGION)) return null;
    const x = cx * CS + 1 + Math.floor(hash3(seed, rx, SALT_SHRINE + 3, rz) * (CS - SHRINE.W - 1));
    const z = cz * CS + 1 + Math.floor(hash3(seed, rx, SALT_SHRINE + 4, rz) * (CS - SHRINE.D - 1));
    const [mx, mz] = [x + SHRINE.centre[0], z + SHRINE.centre[1]];
    if (!OPEN_ZONES.has(ctx.zoneAt(mx, mz).key)) return null;
    const biome = this.biomeKey(mx, mz);
    if (!(SHRINE_BIOMES as readonly string[]).includes(biome)) return null;
    if (biome !== BIOME.mossy && hash3(seed, rx, SALT_SHRINE + 5, rz) >= SHRINE_ELSEWHERE) return null;
    // a tower's chunk, or a castle's or a village's (../claims.ts: the shrine comes after all three)
    if (claimedAbove(ctx.locate, 'forgottenShrineAt', cx, cz)) return null;
    const g = this.ground(x, z, SHRINE.W, SHRINE.D, SHRINE_MAX_SLOPE);
    if (!g || this.gameStructureIn(cx, cz)) return null;
    const y = g.hi + 1;
    const [chx, chy, chz] = SHRINE.chest, [ax, ay, az] = SHRINE.altar;
    return Object.freeze({
      x: x + chx, z: z + chz, y: y + chy, biome,
      origin: Object.freeze({ x, y, z }), ground: g.lo,
      chest: Object.freeze({ x: x + chx, y: y + chy, z: z + chz }),
      altar: Object.freeze({ x: x + ax, y: y + ay, z: z + az }),
      garrison: Object.freeze(SHRINE.garrison.map(([dx, dy, dz]) => Object.freeze({ x: x + dx, y: y + dy, z: z + dz }))),
    });
  }

  forgottenShrinesNear(x: number, z: number, max: number) {
    return this.near(x, z, max, SHRINE_REGION, SALT_SHRINE, SHRINE_CHANCE, (cx: number, cz: number) => this.forgottenShrineAt(cx, cz));
  }

  // one lookup per region: each region has at most one, in its drawn chunk
  near(x: number, z: number, max: number, region: number, salt: number, chance: number, at: (cx: number, cz: number) => any) {
    const { ctx } = this, seed = ctx.seed, hash3 = ctx.hash3;
    if (!(this as any).on) return [];
    const R = region * ctx.size, n = Math.ceil(max / R);
    const rx0 = Math.floor(x / R), rz0 = Math.floor(z / R), out: any[] = [];
    for (let rx = rx0 - n; rx <= rx0 + n; rx++) {
      for (let rz = rz0 - n; rz <= rz0 + n; rz++) {
        if (hash3(seed, rx, salt, rz) >= chance) continue;
        const cx = rx * region + Math.floor(hash3(seed, rx, salt + 1, rz) * region);
        const cz = rz * region + Math.floor(hash3(seed, rx, salt + 2, rz) * region);
        const c = at(cx, cz);
        if (!c) continue;
        const d = Math.hypot(c.x + 0.5 - x, c.z + 0.5 - z);
        if (d <= max) out.push({ c, d });
      }
    }
    return out.sort((a, b) => a.d - b.d);
  }

  provides() {
    return {
      [LOCATOR.towerAt]: (cx: number, cz: number) => this.watchtowerAt(cx, cz),
      [LOCATOR.towersNear]: (x: number, z: number, max: number) => this.watchtowersNear(x, z, max),
      [LOCATOR.shrineAt]: (cx: number, cz: number) => this.forgottenShrineAt(cx, cz),
      [LOCATOR.shrinesNear]: (x: number, z: number, max: number) => this.forgottenShrinesNear(x, z, max),
    };
  }

  // ------------------------------------------------------------------ building
  generate(chunk: any) {
    if (!(this as any).on) return;
    if ((this as any).t2) applySkirts(this.ctx, chunk, ['watchtowerAt', 'forgottenShrineAt'], sitesReaching(chunk.x0, chunk.z0, chunk.x0 + 15, chunk.z0 + 15, 1, (cx: number, cz: number) => this.sitesOf(cx, cz)));
    const t = this.watchtowerAt(chunk.cx, chunk.cz);
    if (t) this.buildTower(chunk, t);
    const s = t ? null : this.forgottenShrineAt(chunk.cx, chunk.cz);
    if (s) this.buildShrine(chunk, s);
  }

  /** the block id of a full name */
  id(name: string) { return (this as any).ids.get(name); }

  topOf(chunk: any, wx: number, wz: number) { return chunk.info(wx - chunk.x0, wz - chunk.z0).h; }

  // the natural ground under a raised floor keeps no grass: the tall canopy's trees (a feature step that runs after every
  // stage) grow from any grass column and their trunk is written through whatever is above it
  unGrass(chunk: any, wx: number, y: number, wz: number) {
    const CS = this.ctx.size, i = (y * CS + (wz - chunk.z0)) * CS + (wx - chunk.x0);
    if (chunk.data[i] === this.id(BASE.grass)) chunk.data[i] = this.id(BASE.dirt);
  }

  buildTower(chunk: any, t: any) {
    const { x: ox, y: oy, z: oz } = t.origin, set = chunk.set, air = this.id(BASE.air);
    const [b0, b1] = TOWER.body;
    for (let dz = 0; dz < TOWER.D; dz++) {
      for (let dx = 0; dx < TOWER.W; dx++) {
        const wx = ox + dx, wz = oz + dz, h = this.topOf(chunk, wx, wz);
        const body = dx >= b0 && dx <= b1 && dz >= b0 && dz <= b1;
        this.unGrass(chunk, wx, h, wz);
        // foundations: stone under the body, packed earth under the rim and the yard (the ground is never cut: the floor is the highest column)
        for (let y = h + 1; y < oy - 1; y++) set(wx, y, wz, this.id(body ? BASE.cobble : BASE.dirt), false);
        if (!body) set(wx, oy - 1, wz, this.id(BASE.dirt), false);
        for (let y = oy; y <= oy + TOWER.roof + 1; y++) set(wx, y, wz, air, false);
      }
    }
    for (const [dx, dy, dz, b] of towerPlan()) set(ox + dx, oy + dy, oz + dz, this.id(b), false);
    // trampled ground around it (see TRAMPLED): grass -> dirt, only over the chunk's tree spots
    const grass = this.id(BASE.grass), dirt = this.id(BASE.dirt), CS = this.ctx.size;
    for (let lz = TREE_SPOTS[0]; lz <= TREE_SPOTS[1]; lz++) {
      for (let lx = TREE_SPOTS[0]; lx <= TREE_SPOTS[1]; lx++) {
        const wx = chunk.x0 + lx, wz = chunk.z0 + lz;
        const ddx = Math.max(ox - wx, 0, wx - (ox + TOWER.W - 1)), ddz = Math.max(oz - wz, 0, wz - (oz + TOWER.D - 1));
        if (Math.max(ddx, ddz) === 0 || Math.max(ddx, ddz) > TRAMPLED) continue;
        const h = this.topOf(chunk, wx, wz), i = (h * CS + lz) * CS + lx;
        if (chunk.data[i] === grass) chunk.data[i] = dirt;
      }
    }
  }

  buildShrine(chunk: any, s: any) {
    const { x: ox, y: oy, z: oz } = s.origin, set = chunk.set, air = this.id(BASE.air);
    const [cx, cz] = SHRINE.centre;
    for (let dz = 0; dz < SHRINE.D; dz++) {
      for (let dx = 0; dx < SHRINE.W; dx++) {
        const d2 = (dx - cx) ** 2 + (dz - cz) ** 2;
        if (d2 > SHRINE.clearR2) continue;
        const wx = ox + dx, wz = oz + dz, h = this.topOf(chunk, wx, wz);
        this.unGrass(chunk, wx, h, wz);
        for (let y = h + 1; y < oy - 1; y++) set(wx, y, wz, this.id(BASE.cobble), false);
        if (d2 > SHRINE.floorR2) set(wx, oy - 1, wz, this.id(BASE.dirt), false);
        for (let y = oy; y <= oy + 6; y++) set(wx, y, wz, air, false);
      }
    }
    const { ctx } = this, seed = ctx.seed;
    const rand = (salt: number, wx: number, wz: number) => ctx.hash3(seed ^ SALT_SHRINE, wx, 93000 + salt, wz);
    for (const [dx, dy, dz, b] of shrinePlan(rand, ox, oz)) set(ox + dx, oy + dy, oz + dz, this.id(b), false);
  }
}
