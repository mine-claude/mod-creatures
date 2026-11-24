// @ts-check
// Where the Crystal Beetle may be born: in the dark of a cave, on rock, under a rock ceiling, with rock (or ore) around.
// The rule itself already asks for the 'underground' situation (the engine only draws it when the player is well below
// the surface, in the dark) and for a rocky floor; this test adds "a real cave in the rock" and keeps it out of anything
// that is not the open overworld — the lobby, the minigame rooms and the other dimensions never see one.

export const OVERWORLD = 'mineclaude:overworld';

/** Rock the beetle walks on (and the walls it lives between): stone-like blocks and any ore, from any mod. */
export const isRock = (name) => typeof name === 'string' && (/(^|[:_])(stone|cobblestone|gravel|deepslate|granite|andesite|diorite|tuff|basalt)$/.test(name) || /_ore$/.test(name));
export const isOre = (name) => typeof name === 'string' && /_ore$/.test(name);

/** The floors of its rule (the engine's `ground` filter): the game's rock and ores. */
export const ROCK_FLOOR = Object.freeze(['mineclaude:stone', 'mineclaude:cobblestone', 'mineclaude:gravel', 'mineclaude:coal_ore', 'mineclaude:iron_ore', 'mineclaude:gold_ore', 'mineclaude:diamond_ore']);

// around the spot: [dx, dz] columns, sampled from the floor up to the head; how high a ceiling is looked for
const RING = [[2, 0], [-2, 0], [0, 2], [0, -2], [3, 3], [-3, 3], [3, -3], [-3, -3]];
const CEILING = 8;
export const MIN_ROCK = 5; // rock cells seen around at body height (walls, pillars): a cave, not an open floor

/**
 * crystalCave(getBlock) -> test(e) for a spawn rule. getBlock({ x, y, z }) answers a full block name or null (the
 * WorldApi's); e is the spawn spot { x, y, z, ground, underground, player }. Unloaded cells count as nothing (no spawn).
 * @param {(pos: { x: number, y: number, z: number }) => string | null} getBlock
 */
export function crystalCave(getBlock) {
  return (e) => {
    const p = e?.player;
    if (p && p.room && p.room !== 'mundo') return false; // a lobby or a minigame
    if (p && (p.dimension ?? OVERWORLD) !== OVERWORLD) return false; // another dimension (lobby, quarantine, nether...)
    if (e?.underground === false) return false; // under the open sky
    if (e?.ground !== undefined && !isRock(e.ground)) return false;
    const x = Math.floor(e.x), y = Math.floor(e.y), z = Math.floor(e.z);
    let roof = false;
    for (let dy = 2; dy <= CEILING && !roof; dy++) { const b = getBlock({ x, y: y + dy, z }); if (b && b !== 'mineclaude:air') roof = true; }
    if (!roof) return false;
    let rock = 0;
    for (const [dx, dz] of RING) for (let dy = 0; dy <= 2; dy++) if (isRock(getBlock({ x: x + dx, y: y + dy, z: z + dz }))) rock++;
    return rock >= MIN_ROCK;
  };
}

// Its home: the crystal geodes of the `biomes` mod (biomes:crystal_geodes). The rule's `ground` filter already asks for the
// geode's own floor (amethyst or calcite, src/biome-homes.ts FEATURE_GROUND); this test keeps the room/dimension guards and
// asks for the geode around: a roof over the spot and amethyst under and beside the ring around it.
export const isAmethyst = (name) => typeof name === 'string' && /amethyst/.test(name);
export const MIN_AMETHYST = 3; // amethyst cells seen around (the ring, from under the floor to the head): inside a geode

/** geodeHome(getBlock) -> test(e) for the home rule. @param {(pos: { x: number, y: number, z: number }) => string | null} getBlock */
export function geodeHome(getBlock) {
  return (e) => {
    const p = e?.player;
    if (p && p.room && p.room !== 'mundo') return false; // a lobby or a minigame
    if (p && (p.dimension ?? OVERWORLD) !== OVERWORLD) return false; // another dimension
    if (e?.underground === false) return false; // under the open sky
    const x = Math.floor(e.x), y = Math.floor(e.y), z = Math.floor(e.z);
    let roof = false;
    for (let dy = 2; dy <= 14 && !roof; dy++) { const b = getBlock({ x, y: y + dy, z }); if (b && b !== 'mineclaude:air') roof = true; }
    if (!roof) return false;
    let n = 0;
    for (const [dx, dz] of RING) for (let dy = -1; dy <= 2; dy++) if (isAmethyst(getBlock({ x: x + dx, y: y + dy, z: z + dz }))) n++;
    return n >= MIN_AMETHYST;
  };
}
