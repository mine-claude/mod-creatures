// @ts-check
// Where the Sting Swarm may be born: over a MEADOW by day — grass under open sky with flowers around it. The base world
// puts a flower in ~1.5% of its grass columns (one kind per zone); the Campos (the open plains) count as a meadow with a
// single flower near, anywhere else it takes two. A world with biomes (opt-in) that has a flower field / meadow / plain
// needs only one. Never in the lobby, a minigame room, a cave or another dimension. The rule itself asks for the 'day'
// situation; this test adds the flowers.

export const OVERWORLD = 'mineclaude:overworld';
export const FLOWERS = /(^|:)(sunpetal|duskbell|embercap|[a-z_]*flower[a-z_]*|[a-z_]*tulip|[a-z_]*daisy|[a-z_]*poppy)$/;
export const MEADOW_BIOME = /(flower|meadow|plain|prado|campo|florid|clareira|pasto)/i;
export const FLOWER_RADIUS = 4; // the square looked at around the spot (9 x 9 columns)
export const MIN_FLOWERS = 2; // flowers needed outside a meadow (1 in the Campos / a meadow biome)

export const isFlower = (name: unknown) => typeof name === 'string' && FLOWERS.test(name);
/** A wild hive (the Prado Florido's, mod biomes): breaking it provokes the swarms near, like broken flowers. */
export const isHive = (name: unknown) => typeof name === 'string' && /(^|:)wild_hive$/.test(name);

/**
 * meadowDay(getBlock) -> test(e) for a spawn rule. getBlock({ x, y, z }) answers a full block name or null; `e` is the
 * spawn spot { x, y, z (the feet), zone, biome, day, underground, player }. An unloaded cell is no flower, never an error.
 * @param {(pos: { x: number, y: number, z: number }) => string | null} getBlock
 */
export function meadowDay(getBlock: (pos: { x: number, y: number, z: number }) => string | null) {
  return (e: any) => {
    const p = e?.player;
    if (p && p.room && p.room !== 'mundo') return false; // a lobby or a minigame
    if (p && (p.dimension ?? OVERWORLD) !== OVERWORLD) return false; // another dimension
    if (e?.underground === true || e?.day === false) return false;
    const meadow = e?.zone === 'campos' || (typeof e?.biome === 'string' && MEADOW_BIOME.test(e.biome));
    const need = meadow ? 1 : MIN_FLOWERS;
    const x = Math.floor(e.x), y = Math.floor(e.y), z = Math.floor(e.z);
    let n = 0;
    for (let dx = -FLOWER_RADIUS; dx <= FLOWER_RADIUS; dx++) {
      for (let dz = -FLOWER_RADIUS; dz <= FLOWER_RADIUS; dz++) {
        // a flower stands on the grass: level with the spot's feet, or a step up or down
        for (let dy = -1; dy <= 1; dy++) {
          let b = null;
          try { b = getBlock({ x: x + dx, y: y + dy, z: z + dz }); } catch { b = null; }
          if (isFlower(b) && ++n >= need) return true;
        }
      }
    }
    return false;
  };
}

/** The fallen petals of a flowering ipê (the Ipezal's, mod biomes): what the swarm looks for under the blooming crowns. */
export const IPE_PETALS = /(^|:)petal_carpet_[a-z_]+$/;
export const IPE_RADIUS = 3; // the square looked at around the spot (7 x 7 columns)

/**
 * ipeBloomDay(getBlock) -> test(e) for the swarm's home rule in the Ipezal (biomes:ipe_forest): by day, under the blooming
 * crowns — fallen ipê petals near the spot. The same guards as meadowDay; an unloaded cell is no petal, never an error.
 * @param {(pos: { x: number, y: number, z: number }) => string | null} getBlock
 */
export function ipeBloomDay(getBlock: (pos: { x: number, y: number, z: number }) => string | null) {
  return (e: any) => {
    const p = e?.player;
    if (p && p.room && p.room !== 'mundo') return false; // a lobby or a minigame
    if (p && (p.dimension ?? OVERWORLD) !== OVERWORLD) return false; // another dimension
    if (e?.underground === true || e?.day === false) return false;
    const x = Math.floor(e.x), y = Math.floor(e.y), z = Math.floor(e.z);
    for (let dx = -IPE_RADIUS; dx <= IPE_RADIUS; dx++) {
      for (let dz = -IPE_RADIUS; dz <= IPE_RADIUS; dz++) {
        for (let dy = -1; dy <= 1; dy++) {
          let b = null;
          try { b = getBlock({ x: x + dx, y: y + dy, z: z + dz }); } catch { b = null; }
          if (typeof b === 'string' && IPE_PETALS.test(b)) return true;
        }
      }
    }
    return false;
  };
}
