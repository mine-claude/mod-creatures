// @ts-check
// Where the Dune Widow may be born: on the sand of a DESERT. The spawn rules already ask for sand under the feet; this
// test adds "a desert, not a beach": above the sea's edge (the base game's beaches are the sand at sea level + 1 and
// below; its deserts are sand columns from there up) and sand all around (a ring of columns sampled around the spot),
// and keeps it out of anything that is not the open overworld — the lobby and the minigame rooms never see one.

export const OVERWORLD = 'mineclaude:overworld';
// The base game's sea level is 30 (packages/shared/src/constants.ts SEA_LEVEL) and its beaches are sand up to sea + 1:
// a desert spot stands on sand at sea + 2 or higher. Written here, not imported: a content file reachable from the
// modloader must not pull engine tables in at load time (tests/suites/creatures-widow.js checks the number).
export const DESERT_MIN_Y = 32;
// columns sampled around the spot (x, z offsets) and how many of them must be sand on top
export const RING: ReadonlyArray<readonly [number, number]> = Object.freeze([[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3], [4, 4], [-4, 4], [4, -4], [-4, -4]]);
export const MIN_SAND = 7;

const isSand = (name) => typeof name === 'string' && /(^|[:_])sand$/.test(name);
const isOpen = (name) => name === null || name === undefined || /(^|:)air$/.test(String(name));

/**
 * desertSand(getBlock) -> test(e) for a spawn rule. getBlock({ x, y, z }) answers a full block name or null (the
 * WorldApi's); e is the spawn spot { x, y, z, player } (y = the feet, on top of the ground). Unloaded columns count as
 * nothing (no spawn), never as an error.
 * @param {(pos: { x: number, y: number, z: number }) => string | null} getBlock
 */
export function desertSand(getBlock) {
  return (e) => {
    const p = e?.player;
    if (p && p.room && p.room !== 'mundo') return false; // a lobby or a minigame
    if (p && (p.dimension ?? OVERWORLD) !== OVERWORLD) return false; // another dimension (lobby, quarantine, nether...)
    const x = Math.floor(e.x), y = Math.floor(e.y), z = Math.floor(e.z);
    if (y < DESERT_MIN_Y) return false; // the beach and the sea floor
    let sand = 0;
    for (const [dx, dz] of RING) {
      // the column's top within a step of the spot: sand with open air over it (dunes rise and fall a block or two)
      for (const dy of [-1, 0, -2, 1]) {
        const top = getBlock({ x: x + dx, y: y + dy, z: z + dz });
        if (isSand(top) && isOpen(getBlock({ x: x + dx, y: y + dy + 1, z: z + dz }))) { sand++; break; }
      }
    }
    return sand >= MIN_SAND;
  };
}
