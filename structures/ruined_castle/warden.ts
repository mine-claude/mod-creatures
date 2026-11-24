// @ts-check
// The castle's server side: where its castles are (the live generator stage of this world's seed), its chests (filled from
// their loot table the first time anyone opens them, once per chest, remembered in the world's mod storage) and its
// residents (the castle's own spawner, every 5 s while a player is within NEAR blocks of its middle): the guardian colossus
// (one per castle, a rest after it falls), up to SENTINELS archers on the walls at dusk and night, and up to CRYPT_CAP
// crystal beetles on the crypt floor while the player is inside the castle — never born within a few blocks of the player.
//
// A castle is real only if its stones are there: a region generated BEFORE the mod existed keeps its old era (no castle) even
// though the locator would place one, so everything here first checks a marker block (the fountain's pillar).
import { liveSeed, stageForSeed } from './stage.ts';
import { FOUNTAIN, toLocal } from './plan.ts';
import { openWorld, BEETLE, COLOSSUS, SENTINEL } from './spawn.ts';

/** Does this castle (site key) have its guardian (alive, or resting after it fell)? Set once the warden runs. */
let hasGuardian = (_key: string) => false;
export const castleGuarded = (key: string) => hasGuardian(key);

export const OVERWORLD = 'mineclaude:overworld';
export const LOOTED_KEY = 'structures.castle.looted';
export const CRYPT_CAP = 3;
export const WARDEN_EVERY = 100; // ticks between two rounds of the castle's spawner (5 s)
export const NEAR = 48; // a player this close to a castle's middle wakes its spawner
export const SENTINELS = 2, SENTINEL_CHANCE = 0.35;
export const GUARDIAN_REST_MS = 5 * 60 * 1000; // after the guardian falls, the castle stays unguarded for a while
export const CRYPT_CHANCE = 0.5;
const MARKER = 'creatures:castle_brick';

/** The world's seed: a number on the WorldApi (`world.seed`); some world views forward every field as a call. */
function seedOf(w: any) {
  const s = w.seed;
  if (typeof s === 'number') return s;
  try { const v = typeof s === 'function' ? s() : NaN; if (Number.isFinite(v)) return v; } catch { /* a forwarding view */ }
  return liveSeed(); // the one world with biomes this process generates
}

/** The castle locator of a world: (x, z) -> { site, plan } | null, null cells for unreal (old-era) castles. */
export function castleLocator(getWorld: () => any) {
  const real = new Map(); // site key -> true (seen standing)
  return (x: number, z: number) => {
    let w;
    try { w = getWorld(); } catch { return null; }
    if (!w) return null;
    const stage = stageForSeed(seedOf(w));
    const site = stage?.castleAtBlock(Math.floor(x), Math.floor(z));
    if (!site) return null;
    if (!real.has(site.key)) {
      const [lx, lz] = toLocal(FOUNTAIN.u, FOUNTAIN.v, site.rot);
      // `load: true`: the fountain's chunk may not be in memory yet (a player at a far chest of the castle, a bot that
      // never asks for chunks); without it the first open of that chest found "no castle" and showed it empty
      const b = w.getBlock({ x: site.x0 + lx, y: site.F + 1, z: site.z0 + lz }, { load: true });
      if (b !== MARKER) return null; // a region of an older era (its terrain has no castle): no castle
      real.set(site.key, true);
    }
    return { site, plan: stage.planOf(site).plan };
  };
}

/** The castle chest at this cell (world coordinates), or null. */
export function castleChestAt(castleAt: any, pos: { x: number, y: number, z: number }) {
  const hit = castleAt(pos.x, pos.z);
  return hit?.plan.chests.find((c: any) => c.x === pos.x && c.y === pos.y && c.z === pos.z) ?? null;
}

/** @param {any} ctx */
export function registerCastleWarden(ctx: any) {
  const getWorld = () => ctx.dimensions.world(OVERWORLD);
  const castleAt = castleLocator(getWorld);
  // the castle whose middle is within r blocks of (x, z), standing (checked like castleAt), or null
  const castleNear = (x: number, z: number, r: number) => {
    const w = getWorld(), stage = w && stageForSeed(seedOf(w));
    const n = stage?.castlesNear(x, z, r)?.[0];
    return n ? castleAt(n.c.x, n.c.z) : null;
  };

  // ---- the chests: filled the first time they are opened (the native chest screen's onOpen runs before the contents are sent).
  // ONE filler per chest (structures/README.md "Baús"): the castle's kind declares no `loot.chest`, so the engine's filler
  // (server/chests.ts prepareChest, for a kind WITH one: the watchtower, the shrine) never touches these six; and this wrap
  // fills only a cell that IS one of a standing castle's chests (castleChestAt), never another structure's chest.
  ctx.screens.wrap('mineclaude:chest', {
    onOpen(e: any, previous: any) {
      try { fillOnce(e); } catch (err) { console.warn(`[creatures] castle chest: ${err?.message ?? err}`); }
      return previous(e);
    },
  });
  function fillOnce(e: any) {
    const pos = e.pos;
    if (!pos || (e.player && !openWorld({ player: e.player }))) return;
    const chest = castleChestAt(castleAt, pos);
    if (!chest) return;
    const key = `${pos.x},${pos.y},${pos.z}`;
    const looted = ctx.storage.world.get(LOOTED_KEY) ?? [];
    if (looted.includes(key)) return;
    const world = e.world ?? getWorld();
    const storage = world.getItemStorage(pos);
    if (!storage) return; // not readable now: left unmarked, so the next open fills it (never marked looted and empty)
    ctx.storage.world.set(LOOTED_KEY, [...looted, key]);
    const roll = world.rollLoot(chest.table);
    world.transact((tx: any) => { for (const { item, n } of roll) storage.insert(item, n, tx); });
  }

  // ---- the residents. The spawn rules (spawn.ts) are the natural way in; the castle's own spawner makes sure the place is
  // lived in even when the hostile cap of the night is full of zombies: the GUARDIAN (one colossus, bound to the castle:
  // none while one lives, and a rest after it dies), archers on the walls at dusk and night, and the crypt's beetles (the
  // only way in for them: the engine never draws a spawn spot inside a room under the player's feet).
  const residents = new Map(); // site key -> { guardian, sentinels, beetles: Set(mob id), restUntil }
  const homeOf = (key: string) => { let r = residents.get(key); if (!r) residents.set(key, r = { guardian: new Set(), sentinels: new Set(), beetles: new Set(), restUntil: 0 }); return r; };
  const ROLE = { [COLOSSUS]: 'guardian', [SENTINEL]: 'sentinels', [BEETLE]: 'beetles' };
  ctx.events.on('mobSpawn', (e: any) => {
    const role = ROLE[e.mob?.name];
    if (!role) return;
    const hit = castleAt(e.mob.pos.x, e.mob.pos.z);
    if (hit) homeOf(hit.site.key)[role].add(e.mob.id);
  });
  ctx.events.on('entityUnload', (e: any) => {
    for (const r of residents.values()) {
      if (r.guardian.delete(e.mobId) && e.reason === 'death') r.restUntil = Date.now() + GUARDIAN_REST_MS;
      r.sentinels.delete(e.mobId); r.beetles.delete(e.mobId);
    }
  });
  hasGuardian = (key: string) => (residents.get(key)?.guardian.size ?? 0) > 0 || Date.now() < (residents.get(key)?.restUntil ?? 0);
  const far = (cells: any[], p: any, d: number) => cells.filter((c: any) => Math.hypot(c.x - p.pos.x, c.y - p.pos.y, c.z - p.pos.z) >= d);
  const pick = (cells: any[]) => cells[Math.floor(Math.random() * cells.length)];
  const free = (world: any, c: any, h: number) => { for (let dy = 0; dy < h; dy++) if (world.getBlock({ x: c.x, y: c.y + dy, z: c.z }) !== 'mineclaude:air') return false; return true; };
  const spawn = (world: any, c: any, name: string) => world.spawnMob({ x: c.x + 0.5, y: c.y, z: c.z + 0.5 }, name);
  let tick = 0;
  ctx.events.on('worldTick', (e: any) => {
    if (e.dimension !== OVERWORLD || ++tick % WARDEN_EVERY !== 0) return;
    const world = e.world ?? getWorld();
    const night = world.daylight() <= 0.5;
    for (const p of e.server.players()) {
      if (p.dimension !== OVERWORLD || !openWorld({ player: p })) continue;
      const hit = castleNear(p.pos.x, p.pos.z, NEAR);
      if (!hit) continue;
      const home = homeOf(hit.site.key), plan = hit.plan;
      // the guardian: kneeling in the courtyard, away from whoever comes
      if (!hasGuardian(hit.site.key)) {
        const c = pick(far(plan.yardCells, p, 12));
        if (c && free(world, c, 3)) { const m = spawn(world, c, COLOSSUS); if (m) home.guardian.add(m.id); }
      }
      // the archers: on the walls and the tower tops when the light goes
      if (night && home.sentinels.size < SENTINELS && Math.random() < SENTINEL_CHANCE) {
        const c = pick(far(plan.wallCells, p, 12));
        if (c && free(world, c, 2)) { const m = spawn(world, c, SENTINEL); if (m) home.sentinels.add(m.id); }
      }
      // the crypt's beetles, only while someone is inside the castle; the treasury's guard first
      if (castleAt(p.pos.x, p.pos.z) && home.beetles.size < CRYPT_CAP && Math.random() < CRYPT_CHANCE) {
        const cells = far(plan.cryptCells, p, 6);
        const pool = home.beetles.size === 0 ? cells.filter((c: any) => c.treasury) : cells;
        const c = pick(pool.length ? pool : cells);
        if (c && free(world, c, 2)) { const m = spawn(world, c, BEETLE); if (m) home.beetles.add(m.id); }
      }
    }
  });
  return { castleAt, hasGuardian: (key: string) => hasGuardian(key) };
}
