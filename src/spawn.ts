// @ts-check
// Where the Moss Lurker may be born: on the floor of a forest. The spawn rule's own filters already ask for grass under
// the feet; this test adds "under trees" by looking up through a small ring of columns above the spot for leaves and
// trunks (the base game's forests have no biome of their own: they are where the tree noise grows them), and keeps it
// out of anything that is not the open overworld — the lobby and the minigame rooms never see one.

export const OVERWORLD = 'mineclaude:overworld';
// columns sampled around the spot (x, z offsets) and how high above the ground the canopy is looked for
const RING = [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2], [3, 3], [-3, 3], [3, -3], [-3, -3]];
const FROM = 2, TO = 9;
export const MIN_LEAVES = 4, MIN_WOOD = 6; // leaves overhead, and leaves + trunks around

const isLeaves = (name) => typeof name === 'string' && /(^|[:_])leaves$/.test(name);
const isLog = (name) => typeof name === 'string' && /(^|[:_])log$/.test(name);

/**
 * The guards every spawn test shares: the open overworld (never a lobby, a minigame room or another dimension) and not a cave.
 * What a home rule (src/biome-homes.ts) asks for: inside its biome, the forest heuristics are not needed.
 * @param {any} e the spawn spot
 */
export function inOpenOverworld(e) {
  const p = e?.player;
  if (p && p.room && p.room !== 'mundo') return false;
  if (p && (p.dimension ?? OVERWORLD) !== OVERWORLD) return false;
  return e?.underground !== true;
}

/**
 * forestFloor(getBlock) -> test(e) for a spawn rule. getBlock({ x, y, z }) answers a full block name or null (the
 * WorldApi's); e is the spawn spot { x, y, z, player }. Unloaded columns count as nothing (no spawn), never as an error.
 * @param {(pos: { x: number, y: number, z: number }) => string | null} getBlock
 */
export function forestFloor(getBlock) {
  return (e) => {
    const p = e?.player;
    if (p && p.room && p.room !== 'mundo') return false; // a lobby or a minigame
    if (p && (p.dimension ?? OVERWORLD) !== OVERWORLD) return false; // another dimension (lobby, quarantine, nether...)
    const x = Math.floor(e.x), y = Math.floor(e.y), z = Math.floor(e.z);
    let leaves = 0, logs = 0;
    for (const [dx, dz] of RING) {
      for (let dy = FROM; dy <= TO; dy++) {
        const b = getBlock({ x: x + dx, y: y + dy, z: z + dz });
        if (isLeaves(b)) leaves++;
        else if (isLog(b)) logs++;
      }
    }
    return leaves >= MIN_LEAVES && leaves + logs >= MIN_WOOD;
  };
}

// The edge of the Bosque de Copas Altas (mod biomes): open sky over the spot, and the tall canopy's leaves close by. Where
// the meadow meets the tall woods — the Canopy Sentinel's lookout and the goblins' night gathering (their home rules).
export const CANOPY_LEAVES = 'biomes:canopy_leaves';
const EDGE_RING = [[5, 0], [-5, 0], [0, 5], [0, -5], [4, 4], [-4, 4], [4, -4], [-4, -4]];
const EDGE_FROM = 4, EDGE_TO = 18; // the canopy's height above the ground (tall trunks: 9..14, crowns a few above)

/**
 * canopyEdge(getBlock) -> test(e): out in the open overworld, NO leaves of any kind over the spot (2..18 above it) and the
 * canopy's own leaves over at least one point of a ring 5 blocks away. Unloaded cells count as nothing (no spawn).
 * @param {(pos: { x: number, y: number, z: number }) => string | null} getBlock
 */
export function canopyEdge(getBlock) {
  const at = (x, y, z) => { try { return getBlock({ x, y, z }); } catch { return null; } };
  return (e) => {
    if (!inOpenOverworld(e)) return false;
    const x = Math.floor(e.x), y = Math.floor(e.y), z = Math.floor(e.z);
    for (let dy = 2; dy <= EDGE_TO; dy++) if (isLeaves(at(x, y + dy, z))) return false;
    for (const [dx, dz] of EDGE_RING) for (let dy = EDGE_FROM; dy <= EDGE_TO; dy++) if (at(x + dx, y + dy, z + dz) === CANOPY_LEAVES) return true;
    return false;
  };
}

// The termite mounds of the Savana Dourada (mod biomes): where the goblins gather at night. Open overworld, and a piece of a
// mound within a few blocks of the spot (a ring of columns 3 and 6 away, from 1 below the spot to 4 above it).
export const TERMITE_MOUND = /^biomes:termite_mound_(base|mid|top)$/;
const MOUND_RING: Array<[number, number]> = [];
for (let dx = -6; dx <= 6; dx += 3) for (let dz = -6; dz <= 6; dz += 3) if (dx || dz) MOUND_RING.push([dx, dz]);

/**
 * nearTermiteMound(getBlock) -> test(e): out in the open overworld with a termite mound close by. Unloaded cells count as
 * nothing (no spawn).
 * @param {(pos: { x: number, y: number, z: number }) => string | null} getBlock
 */
export function nearTermiteMound(getBlock) {
  const at = (x, y, z) => { try { return getBlock({ x, y, z }); } catch { return null; } };
  return (e) => {
    if (!inOpenOverworld(e)) return false;
    const x = Math.floor(e.x), y = Math.floor(e.y), z = Math.floor(e.z);
    for (const [dx, dz] of MOUND_RING) for (let dy = -1; dy <= 4; dy++) if (TERMITE_MOUND.test(at(x + dx, y + dy, z + dz) ?? '')) return true;
    return false;
  };
}
