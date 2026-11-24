// @ts-check
// Who lives in the Ruined Castle. HOME rules added to the creatures' own (their general rules stay exactly as they were; a
// rule that does not fit is filtered out BEFORE the weighted draw, so outside a castle — and in every world without biomes,
// which has no castles — the draw and its random numbers are the old ones):
//   - creatures:ruin_colossus, the guardian: ONE dormant colossus on the courtyard floor (cap 1, by night and by day, and
//     never while the castle already has its guardian);
//   - creatures:canopy_sentinel, archers on the walls and the tower tops, at night and at dusk;
//   - creatures:crystal_beetle in the crypt: the engine only draws a spawn spot 22..42 blocks from the player, never inside
//     a room under the player's feet, so the crypt's beetles come from the castle's own spawner (warden.ts), not a rule.
// The same spawner also makes sure the guardian and a couple of archers are there when the night's hostile cap is full.
// Pure: the castle comes from `castleAt(x, z)` -> { site, plan } | null and the world from getBlock({ x, y, z }).
import { CLS, S } from './plan.ts';
import { fitsBody } from '../../colossus/spawn.ts';

export const OVERWORLD = 'mineclaude:overworld';
export const COLOSSUS = 'creatures:ruin_colossus';
export const SENTINEL = 'creatures:canopy_sentinel';
export const BEETLE = 'creatures:crystal_beetle';
/** The courtyard's floor blocks (what the colossus kneels on). */
export const YARD_FLOOR = Object.freeze(['mineclaude:cobblestone', 'mineclaude:gravel', 'creatures:castle_brick', 'creatures:castle_brick_mossy', 'creatures:castle_brick_cracked', 'mineclaude:grass', 'mineclaude:dirt']);
/** The masonry of the walls and towers (what the archers stand on). */
export const WALL_TOP = Object.freeze(['creatures:castle_brick', 'creatures:castle_brick_mossy', 'creatures:castle_brick_cracked', 'mineclaude:cobblestone']);

/** In the open overworld (not the lobby, a minigame room or another dimension). */
export function openWorld(e: any) {
  const p = e?.player;
  if (p && p.room && p.room !== 'mundo') return false;
  if (p && (p.dimension ?? OVERWORLD) !== OVERWORLD) return false;
  return true;
}

/** The column class of (x, z) in its castle, and the castle, or null. */
export function castleColumn(castleAt: (x: number, z: number) => any, x: number, z: number) {
  const hit = castleAt(Math.floor(x), Math.floor(z));
  if (!hit) return null;
  const lx = Math.floor(x) - hit.site.x0, lz = Math.floor(z) - hit.site.z0;
  return { ...hit, cls: hit.plan.cls[lz * S + lx] };
}

/** test(e): a courtyard cell, on the floor, with room for the colossus's body, in a castle without its guardian (one per
 * castle: `guarded(siteKey)`, warden.ts). */
export function inCourtyard(castleAt: any, getBlock: any, guarded = (_key: string) => false) {
  return (e: any) => {
    if (!openWorld(e)) return false;
    const c = castleColumn(castleAt, e.x, e.z);
    if (!c || c.cls !== CLS.YARD || Math.floor(e.y) !== c.site.F || guarded(c.site.key)) return false;
    return fitsBody(getBlock, Math.floor(e.x), Math.floor(e.y), Math.floor(e.z));
  };
}

/** test(e): on top of the curtain wall, the gatehouse or a tower (5 or more above the courtyard floor). */
export function onWalls(castleAt: any) {
  return (e: any) => {
    if (!openWorld(e)) return false;
    const c = castleColumn(castleAt, e.x, e.z);
    if (!c || !(c.cls === CLS.WALL || c.cls === CLS.TOWER || c.cls === CLS.GATE)) return false;
    return Math.floor(e.y) - c.site.F >= 5;
  };
}

/** The castle's spawn rules, as [mob, rule] pairs. `ruinsDay`/`dusk` are the full names of the creatures' day conditions. */
export function castleSpawnRules(castleAt: any, getBlock: any, guarded = (_key: string) => false, ruinsDay = 'creatures:colossus_ruins_day', dusk = 'creatures:sentinel_dusk') {
  const yard = inCourtyard(castleAt, getBlock, guarded), walls = onWalls(castleAt);
  return [
    [COLOSSUS, { when: 'night', ground: YARD_FLOOR.slice(), weight: 40, group: [1, 1], cap: 1, test: yard }],
    [COLOSSUS, { when: ruinsDay, ground: YARD_FLOOR.slice(), weight: 40, group: [1, 1], cap: 1, test: yard }],
    [SENTINEL, { when: 'night', ground: WALL_TOP.slice(), weight: 30, group: [1, 2], spread: 'pack', cap: 4, test: walls }],
    [SENTINEL, { when: dusk, ground: WALL_TOP.slice(), light: { max: 0.5 }, weight: 30, group: [1, 2], spread: 'pack', cap: 3, test: walls }],
  ];
}
