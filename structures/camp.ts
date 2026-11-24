// @ts-check
// The Goblin Camp (creatures:goblin_camp): a ring of crude tents and lean-tos of hide and sticks around a campfire, a totem
// of skulls and lashed sticks with the band's banner, drying racks, and the stockpile of what they stole — crates, a barrel
// and ONE chest of goblin loot. The goblins live here: bands come out around it at night and a few lounge about by day
// (spawns.ts). The fire's flames and smoke are a block entity renderer in the browser (client.ts).
//
// A stage of the generator, like the village (village.ts has the reasoning): lookups `creaturesGoblinCampAt` /
// `creaturesGoblinCampsNear`, structure kind role `goblin_camp`. At most one per region of 10 x 10 chunks, claiming 2 x 2
// chunks; ONLY in a world with biomes; on open, flat grass (the base game's grass and the Prado Florido); never in the
// lobby, never sharing a chunk with a base structure or with another structure of this mod (claims.ts: the camp comes last). Chunk-safe the same way.
import { StructureFeature } from '../mineclaude-sdk.js';
import { STRUCTURE_BLOCKS as SB, facingBlock, type Facing } from './blocks.ts';
import { CS, Canvas, Frame, Memo, baseStructureIn, towards } from './frame.ts';
import { claimedAbove } from './claims.ts';
import { isTerrain2 } from './sets.ts';

export const CAMP_REGION = 10; // chunks
export const CAMP_CLAIM = 2; // chunks per side
export const CAMP_CHANCE = 0.5;
export const CAMP_TRIES = 6; // places tried in a region
// the biome at the fire, and the ones its clearing may reach into (the edge of a forest: the tall canopy, the mossy wood)
export const CAMP_BIOMES = new Set([null, 'biomes:flower_meadow']);
export const CAMP_EDGE_BIOMES = new Set([...CAMP_BIOMES, 'biomes:tall_canopy', 'biomes:mossy_forest']);
const ZONES = new Set(['campos', 'ermos', 'sombrias']);
const SALT = 0x6b11c4;
const RING = 8; // the tents' distance from the fire
const CLEAR_R = 12; // trees within this radius of the fire are gone (the camp's clearing)

export interface Tent { kind: 'tent' | 'leanto'; cx: number; cz: number; facing: Facing; G: number }
export interface Camp {
  sites?: any[]; // terrain 2: the levelled clearing (a pad around the fire)
  x: number; y: number; z: number; // the campfire
  claim: { cx: number; cz: number; n: number };
  tents: Tent[]; chest: { x: number; y: number; z: number }; totem: { x: number; y: number; z: number };
  stock: { x: number; y: number; z: number }; racks: { x: number; y: number; z: number }[];
}

export default class GoblinCampStage extends StructureFeature {
  [key: string]: any;
  constructor(ctx: any) {
    super(ctx);
    const id = (n: string) => ctx.block(n), g = (n: string) => id(`mineclaude:${n}`);
    this.ids = {
      grass: g('grass'), dirt: g('dirt'), gravel: g('gravel'), log: g('log'), leaves: g('leaves'),
      plants: new Set([g('tall_grass'), g('sunpetal'), g('embercap'), g('duskbell')]),
      fire: id(SB.campfire), canvas: id(SB.hideCanvas), ridge: id(SB.hideRidge), pole: id(SB.stickPole), totem: id(SB.totemPole), skull: id(SB.totemSkull),
      rack: id(SB.dryingRack), banner: id(SB.goblinBanner), crate: id(SB.crate), barrel: id(SB.barrel), bed: id(SB.strawBed), chest: id(SB.goblinChest),
      slope: Object.fromEntries((['n', 'e', 's', 'w'] as Facing[]).map((f) => [f, id(facingBlock(SB.hideSlope, f))])),
    };
    this.plans = new Memo<Camp | null>();
    // terrain 2: the clearing is a PAD (the engine's terrain adaptation: cut and fill at the fire's floor, a sloped skirt)
    // and the features that run after the stages stand on it
    this.t2 = isTerrain2(ctx);
    if (this.t2) ctx.structures.ground((x: number, z: number, h: number) => {
      const c = this.campAt(Math.floor(x / CS), Math.floor(z / CS));
      return c?.sites && ctx.structures.adapt.target(c.sites, x, z, h) ? ctx.structures.adapt.height(c.sites, x, z, h) : null;
    });
  }

  /** The ground the builders stand on: the clearing's pad in terrain 2 (camp `this.cur`), the column elsewhere. */
  groundOf(x: number, z: number) {
    const h = this.ctx.columnInfo(x, z).h, c = this.cur as Camp | null;
    return c?.sites ? this.ctx.structures.adapt.height(c.sites, x, z, h) : h;
  }

  rand(a: number, b: number, c: number) { return this.ctx.hash3((this.ctx.seed ^ SALT) >>> 0, a | 0, b | 0, c | 0); }

  campAt(cx: number, cz: number): Camp | null {
    const R = CAMP_REGION, rx = Math.floor(cx / R), rz = Math.floor(cz / R);
    const c = this.plans.get(rx + ',' + rz, () => this.plan(rx, rz));
    if (!c) return null;
    return cx >= c.claim.cx && cx < c.claim.cx + c.claim.n && cz >= c.claim.cz && cz < c.claim.cz + c.claim.n ? c : null;
  }

  campsNear(x: number, z: number, max: number) {
    const R = CAMP_REGION * CS, n = Math.ceil(max / R) + 1, rx0 = Math.floor(x / R), rz0 = Math.floor(z / R), out: { c: Camp; d: number }[] = [];
    for (let rx = rx0 - n; rx <= rx0 + n; rx++) for (let rz = rz0 - n; rz <= rz0 + n; rz++) {
      const c = this.plans.get(rx + ',' + rz, () => this.plan(rx, rz));
      if (!c) continue;
      const d = Math.hypot(c.x + 0.5 - x, c.z + 0.5 - z);
      if (d <= max) out.push({ c, d });
    }
    return out.sort((a, b) => a.d - b.d);
  }

  provides() {
    return { creaturesGoblinCampAt: (cx: number, cz: number) => this.campAt(cx, cz), creaturesGoblinCampsNear: (x: number, z: number, max: number) => this.campsNear(x, z, max) };
  }

  plan(rx: number, rz: number): Camp | null {
    if (!this.ctx.biomes) return null; // new worlds (with biomes) only: see the README
    if (this.rand(rx, 93001, rz) > CAMP_CHANCE) return null;
    for (let k = 0; k < CAMP_TRIES; k++) { // a few places in the region, in an order fixed by the seed
      const c = this.tryAt(rx, rz, k);
      if (c) return c;
    }
    return null;
  }

  tryAt(rx: number, rz: number, k: number): Camp | null {
    const { ctx } = this;
    const N = CAMP_CLAIM, R = CAMP_REGION;
    const ccx = rx * R + Math.floor(this.rand(rx, 93002 + k * 16, rz) * (R - N + 1));
    const ccz = rz * R + Math.floor(this.rand(rx, 93003 + k * 16, rz) * (R - N + 1));
    const X0 = ccx * CS, Z0 = ccz * CS, SIZE = N * CS, cx = X0 + SIZE / 2, cz = Z0 + SIZE / 2;
    if (!ZONES.has(ctx.zoneAt(cx, cz).key)) return null;
    if (!CAMP_BIOMES.has(ctx.biomeAt(cx, cz)?.key ?? null)) return null;
    const surface = ctx.stage('mineclaude:surface'), grass = this.ids.grass;
    // the biomes first (cheap), then the columns
    for (let dz = -CLEAR_R + 1; dz <= CLEAR_R - 1; dz += 2) for (let dx = -CLEAR_R + 1; dx <= CLEAR_R - 1; dx += 2) {
      if (dx * dx + dz * dz <= (CLEAR_R - 1) ** 2 && !CAMP_EDGE_BIOMES.has(ctx.biomeAt(cx + dx, cz + dz)?.key ?? null)) return null;
    }
    let lo = Infinity, hi = -Infinity;
    for (let dz = -CLEAR_R + 1; dz <= CLEAR_R - 1; dz += 2) for (let dx = -CLEAR_R + 1; dx <= CLEAR_R - 1; dx += 2) {
      if (dx * dx + dz * dz > (CLEAR_R - 1) ** 2) continue;
      const x = cx + dx, z = cz + dz, info = ctx.columnInfo(x, z);
      if (info.desert || info.h <= ctx.seaLevel + 2 || info.h >= ctx.seaLevel + 28) return null;
      if (surface && typeof surface.surfaceAt === 'function' && surface.surfaceAt(info, x, z) !== grass) return null;
      lo = Math.min(lo, info.h); hi = Math.max(hi, info.h);
    }
    if (hi - lo > 3) return null;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (baseStructureIn(ctx.locate, ccx + i, ccz + j)) return null;
      // our other structures come first (claims.ts): a castle, a village, a watchtower or a shrine there
      if (claimedAbove(ctx.locate, 'creaturesGoblinCampAt', ccx + i, ccz + j)) return null;
    }
    const groundMax = (x0: number, z0: number, x1: number, z1: number) => { let m = -Infinity; for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) m = Math.max(m, ctx.columnInfo(x, z).h); return m; };
    const fy = groundMax(cx - 2, cz - 2, cx + 2, cz + 2) + 1;
    // the ring of tents, each opening toward the fire; between two of them the totem, the stockpile and the racks
    const K = 4 + Math.floor(this.rand(rx, 93004, rz) * 3);
    const a0 = this.rand(rx, 93005, rz) * Math.PI * 2, step = (Math.PI * 2) / K;
    const tents: Tent[] = [];
    for (let i = 0; i < K; i++) {
      const ang = a0 + i * step, kind = this.rand(rx, 93010 + i, rz) < 0.35 ? 'leanto' : 'tent';
      const tx = cx + Math.round(Math.cos(ang) * RING), tz = cz + Math.round(Math.sin(ang) * RING);
      const facing = towards(cx - tx, cz - tz), D = kind === 'tent' ? 3 : 2, fr = new Frame(tx, tz, 3, kind === 'tent' ? 3 : 1, facing);
      const [x0, z0, x1, z1] = fr.bounds(0, 0, 2, D - 1);
      tents.push({ kind, cx: tx, cz: tz, facing, G: groundMax(x0, z0, x1, z1) });
    }
    const between = (k: number, r: number) => { const ang = a0 + (k + 0.5) * step; return [cx + Math.round(Math.cos(ang) * r), cz + Math.round(Math.sin(ang) * r)]; };
    const [sx, sz] = between(0, 4), [tx, tz] = between(1, 5);
    const stockY = groundMax(sx - 1, sz - 1, sx + 1, sz + 1) + 1;
    const racks = [2, 3].slice(0, K >= 5 ? 2 : 1).map((k) => { const [x, z] = between(k, 6); return { x, y: groundMax(x - 1, z, x, z) + 1, z }; });
    if (this.t2) {
      // terrain 2: the clearing levelled at the fire's floor (a pad of RING + 3 around the fire, a skirt of 3, all inside the
      // claim); everything of the camp then stands on that floor
      const F = fy - 1, R = RING + 3;
      const sites = [Object.freeze({ x0: cx - R, z0: cz - R, x1: cx + R, z1: cz + R, floor: F, mode: 'pad', skirt: 3 })];
      for (const t of tents) t.G = F;
      for (const r of racks) r.y = F + 1;
      return {
        x: cx, y: fy, z: cz, claim: { cx: ccx, cz: ccz, n: N }, tents, sites,
        chest: { x: sx, y: F + 1, z: sz }, stock: { x: sx, y: F + 1, z: sz },
        totem: { x: tx, y: F + 1, z: tz }, racks,
      };
    }
    return {
      x: cx, y: fy, z: cz, claim: { cx: ccx, cz: ccz, n: N }, tents,
      chest: { x: sx, y: stockY, z: sz }, stock: { x: sx, y: stockY, z: sz },
      totem: { x: tx, y: ctx.columnInfo(tx, tz).h + 1, z: tz }, racks,
    };
  }

  generate(chunk: any) {
    const camp = this.campAt(chunk.cx, chunk.cz);
    if (!camp) return;
    this.cur = camp;
    if (camp.sites) this.ctx.structures.adapt.chunk(chunk, CS, this.ctx.height, camp.sites, (x: number, z: number) => this.ctx.columnInfo(x, z).h);
    const c = new Canvas(chunk, this.ctx.height), I = this.ids, { x: cx, z: cz } = camp;
    // the clearing: no trees, the ground trodden bare near the fire
    for (let dz = -CLEAR_R; dz <= CLEAR_R; dz++) for (let dx = -CLEAR_R; dx <= CLEAR_R; dx++) {
      const x = cx + dx, z = cz + dz;
      if (!c.inside(x, z) || dx * dx + dz * dz > CLEAR_R * CLEAR_R) continue;
      const g = this.groundOf(x, z);
      for (let y = g - 2; y <= g + 16; y++) { const b = c.get(x, y, z); if (b === I.log || b === I.leaves) c.set(x, y, z, 0); }
      const r2 = dx * dx + dz * dz, t = this.rand(x, 94001, z);
      if (r2 <= 20 && t < 0.75 && c.get(x, g, z) === I.grass) {
        c.set(x, g, z, t < 0.15 ? I.gravel : I.dirt);
        const above = c.get(x, g + 1, z); if (I.plants.has(above)) c.set(x, g + 1, z, 0);
      }
    }
    // the fire pit: levelled ground around it, the campfire, four stumps to sit on
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx, z = cz + dz, g = this.groundOf(x, z);
      for (let y = g + 1; y < camp.y; y++) c.set(x, y, z, I.dirt);
      c.set(x, camp.y - 1, z, Math.abs(dx) <= 1 && Math.abs(dz) <= 1 ? I.gravel : I.dirt);
      for (let y = camp.y; y <= camp.y + 4; y++) c.set(x, y, z, 0);
    }
    c.set(cx, camp.y, cz, I.fire);
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) if (this.rand(cx + dx, 94002, cz + dz) < 0.75) c.set(cx + dx, camp.y, cz + dz, I.log);
    for (const t of camp.tents) this.tent(c, t);
    // the stockpile: the chest, crates (one on top of another) and a barrel
    const s = camp.stock;
    this.pad(c, s.x - 1, s.z - 1, s.x + 1, s.z + 1, s.y);
    c.set(s.x, s.y, s.z, I.chest);
    c.set(s.x + 1, s.y, s.z, I.crate); c.set(s.x + 1, s.y + 1, s.z, I.crate);
    c.set(s.x, s.y, s.z + 1, I.crate); c.set(s.x - 1, s.y, s.z, I.barrel);
    // the totem: lashed sticks and skulls, the band's banner on a pole beside it
    const t = camp.totem;
    this.pad(c, t.x, t.z, t.x + 1, t.z, t.y);
    c.set(t.x, t.y, t.z, I.totem); c.set(t.x, t.y + 1, t.z, I.skull); c.set(t.x, t.y + 2, t.z, I.totem); c.set(t.x, t.y + 3, t.z, I.skull);
    c.set(t.x + 1, t.y, t.z, I.pole); c.set(t.x + 1, t.y + 1, t.z, I.banner);
    // drying racks
    for (const r of camp.racks) { this.pad(c, r.x - 1, r.z, r.x, r.z, r.y); c.set(r.x - 1, r.y, r.z, I.rack); c.set(r.x, r.y, r.z, I.rack); }
    this.cur = null;
  }

  // ground made level for a piece: filled up with dirt to y - 1, cleared above
  pad(c: Canvas, x0: number, z0: number, x1: number, z1: number, y: number) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const g = this.groundOf(x, z);
      for (let yy = g + 1; yy < y; yy++) c.set(x, yy, z, this.ids.dirt);
      for (let yy = y; yy <= y + 4; yy++) c.set(x, yy, z, 0);
    }
  }

  tent(c: Canvas, t: Tent) {
    const I = this.ids, D = t.kind === 'tent' ? 3 : 2, fr = new Frame(t.cx, t.cz, 3, t.kind === 'tent' ? 3 : 1, t.facing), G = t.G;
    const put = (u: number, v: number, y: number, id: number) => c.set(fr.x(u, v), y, fr.z(u, v), id);
    const [x0, z0, x1, z1] = fr.bounds(0, 0, 2, D - 1);
    this.pad(c, x0, z0, x1, z1, G + 1);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) c.set(x, G, z, I.dirt);
    if (t.kind === 'tent') {
      // an A-frame: two sloped hide sides rising to a ridge, the back closed, a bedroll inside, two stakes at the opening
      for (let v = 0; v < 3; v++) { put(0, v, G + 1, I.slope[fr.side('right')]); put(2, v, G + 1, I.slope[fr.side('left')]); put(1, v, G + 2, I.ridge); }
      put(1, 2, G + 1, I.canvas);
      put(1, 1, G + 1, I.bed);
      for (const u of [0, 2]) { const x = fr.x(u, -1), z = fr.z(u, -1); if (c.get(x, G + 1, z) === 0) c.set(x, G + 1, z, I.pole); }
    } else {
      // a lean-to: two stakes hold a hide sloping down to the back; stolen goods kept dry under it
      put(0, 0, G + 1, I.pole); put(2, 0, G + 1, I.pole);
      for (let u = 0; u < 3; u++) { put(u, 0, G + 2, I.slope[fr.side('front')]); put(u, 1, G + 1, I.slope[fr.side('front')]); }
      put(1, 0, G + 1, this.rand(t.cx, 94010, t.cz) < 0.5 ? I.crate : I.barrel);
    }
  }
}
