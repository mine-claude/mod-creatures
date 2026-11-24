// @ts-check
// Who lives at the outposts. Two layers, both on top of the creatures' own rules (which stay exactly as they were):
//
//  1. HOME RULES bound to the structure (ctx.mobs.spawnRule: appended after the mob's own rules). The Canopy Sentinel at dusk
//     and at night, and the Moss Lurker by night and by day, are drawn much more often within RADIUS blocks of their outpost.
//     Each rule carries `biomes` (the outpost's biomes), so in a world without biomes it is dropped BEFORE the weighted draw
//     and the draw — its random numbers included — is the old one (tests/suites/structures-watchtower-shrine.js).
//  2. THE GARRISON: the natural spawn puts a mob on the ground near a player, never on top of a tower. So, once per night
//     and per tower, when a player comes within GARRISON_RANGE of it at dusk or at night, 2-3 sentinels are summoned on the
//     lookout; once per day cycle and per shrine, 1-2 lurkers lie disguised inside its ring when a player comes close. Server
//     only, every 2 s, a handful of lookups per player (the generator caches them). The bookkeeping is in memory: a restart
//     at night may post one more watch, which is harmless.
import { inOpenOverworld, OVERWORLD } from '../../src/spawn.ts';
import { BASE, ROLE, SHRINE_BIOMES, TOWER_BIOMES } from './names.ts';

export const SENTINEL = 'creatures:canopy_sentinel', LURKER = 'creatures:moss_lurker';
export const RADIUS = 20, GARRISON_RANGE = 40, GARRISON_EVERY = 40; // ticks (20 per second)
const DUSK = 0.5, MORNING = 0.6;

/** near(role, e) for a spawn test: the spot is within RADIUS of an outpost of that role. */
export function nearOutpost(getWorld: () => any, role: string) {
  return (e: any) => {
    if (!inOpenOverworld(e)) return false;
    try { return !!getWorld()?.nearestStructure(role, { x: Math.floor(e.x), y: Math.floor(e.y), z: Math.floor(e.z) }, RADIUS); } catch { return false; }
  };
}

/** The home rules of the outposts, as appended to each mob. */
export function outpostRules(getWorld: () => any) {
  const atTower = nearOutpost(getWorld, ROLE.tower), atShrine = nearOutpost(getWorld, ROLE.shrine);
  const biomesT = [...TOWER_BIOMES], biomesS = [...SHRINE_BIOMES];
  return {
    [SENTINEL]: [
      { when: 'night', biomes: biomesT, weight: 16, group: [2, 3], spread: 'pack', cap: 4, test: atTower },
      { when: 'creatures:sentinel_dusk', biomes: biomesT, light: { max: 0.5 }, weight: 14, group: [2, 3], spread: 'pack', cap: 3, test: atTower },
    ],
    [LURKER]: [
      { when: 'night', biomes: biomesS, weight: 30, cap: 3, test: atShrine },
      { when: 'creatures:home_day', biomes: biomesS, weight: 14, cap: 2, test: atShrine },
    ],
  };
}

/** The y a body stands at on the tower's lookout, read from the world (the chest's column), or null when it is gone. */
export function lookoutY(world: any, c: { x: number, z: number }) {
  const top = world.topBlock({ x: c.x, z: c.z });
  if (!(top > 0)) return null;
  for (let y = top; y >= top - 8; y--) if (world.getBlock({ x: c.x, y, z: c.z }) === BASE.chest) return y;
  return world.getBlock({ x: c.x, y: top, z: c.z }) === BASE.slab ? top - 4 : null; // the chest taken: under the roof
}

/** @param {any} ctx */
export function registerOutpostSpawns(ctx: any) {
  let world: any = null;
  const getWorld = () => { try { return (world ??= ctx.dimensions.world(OVERWORLD)); } catch { return null; } };
  for (const [mob, rules] of Object.entries(outpostRules(getWorld))) for (const r of rules) ctx.mobs.spawnRule(mob, r);
  if (ctx.side !== 'server') return;

  // the garrison (see the top of the file)
  let tick = 0, cycle = 0, day = true;
  const posted = new Map<string, number>(); // outpost key -> the cycle it was manned in
  ctx.events.on('serverTick', (e: any) => {
    if (++tick % GARRISON_EVERY) return;
    try {
      const w = getWorld();
      if (!w) return;
      const light = w.daylight();
      if (light > MORNING && !day) { day = true; cycle++; } else if (light < DUSK && day) day = false;
      for (const p of e.server.players()) {
        if (p.room && p.room !== 'mundo') continue;
        if ((p.dimension ?? OVERWORLD) !== OVERWORLD) continue;
        const pos = { x: Math.floor(p.pos.x), y: Math.floor(p.pos.y), z: Math.floor(p.pos.z) };
        if (light <= DUSK) {
          const t = w.nearestStructure(ROLE.tower, pos, GARRISON_RANGE);
          if (t) postGarrison(w, posted, `t:${t.x},${t.z}`, cycle, () => manTower(w, t));
        }
        const s = w.nearestStructure(ROLE.shrine, pos, GARRISON_RANGE * 0.6);
        if (s) postGarrison(w, posted, `s:${s.x},${s.z}`, cycle, () => manShrine(w, s));
      }
    } catch (err) { console.warn(`[creatures] outpost garrison: ${(err as any)?.message ?? err}`); }
  });
}

function postGarrison(_w: any, posted: Map<string, number>, key: string, cycle: number, man: () => number) {
  if (posted.get(key) === cycle) return;
  posted.set(key, cycle);
  if (posted.size > 512) posted.delete(posted.keys().next().value as string);
  man();
}

// 2-3 sentinels on the lookout: the cells of layout.ts TOWER.garrison, found from the chest's column (x 6, z 6 of the plan)
function manTower(w: any, t: { x: number, z: number }) {
  const y = lookoutY(w, t);
  if (y === null) return 0;
  const cells = [[-3, 0], [-1, -4], [-3, -4]]; // TOWER.garrison relative to the chest
  const n = 2 + (Math.random() < 0.5 ? 1 : 0);
  let made = 0;
  for (let i = 0; i < n; i++) {
    const [dx, dz] = cells[i];
    // summon looks for the ground from 4 above: start at the lookout floor so the roof (5 up) is never taken for ground
    if (w.spawnMob({ x: t.x + dx + 0.5, y: y - 1, z: t.z + dz + 0.5 }, SENTINEL)) made++;
  }
  return made;
}

// 1-2 lurkers lying in the ring: the cells of layout.ts SHRINE.garrison, from the chest's column (x 4, z 6 of the plan)
function manShrine(w: any, s: { x: number, z: number }) {
  const top = w.topBlock({ x: s.x, z: s.z });
  if (!(top > 0)) return 0;
  const cells = [[-3, -5], [3, 1]];
  const n = 1 + (Math.random() < 0.5 ? 1 : 0);
  let made = 0;
  for (let i = 0; i < n; i++) {
    const [dx, dz] = cells[i];
    if (w.spawnMob({ x: s.x + dx + 0.5, y: top, z: s.z + dz + 0.5 }, LURKER)) made++;
  }
  return made;
}
