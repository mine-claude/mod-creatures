// @ts-check
// Where the Lure Lantern may be born: over the WET LOW ground of the open overworld, at night — the edge of a pond, a
// marshy shore, the bank of a river at sea level. The base game has no swamp biome (biomes are opt-in per world); when a
// world does have one whose key reads like a swamp or a marsh, the rule is looser there (any water nearby, a little
// higher ground). Never in the lobby, a minigame room or another dimension.
//
// The rule's own filters ask for the night (the 'night' situation and light <= 0.3); this test adds the water.

export const OVERWORLD = 'mineclaude:overworld';
// sea level is 30 in the base world: "low" is at most a few blocks above it
export const WET_MAX_Y = 34;
export const SWAMP_EXTRA_Y = 6;
export const SWAMP_BIOME = /(swamp|marsh|bog|fen|mire|brejo|pantano|pântano|mangue|alagad)/i;
export const WATER_RADIUS = 3; // the square looked at around the spot (7 x 7 columns)
export const MIN_WATER = 3; // water cells needed there (1 in a swamp)

export const isWater = (name: unknown) => typeof name === 'string' && /(^|:)water(_\d+)?$/.test(name);

/**
 * swampNight(getBlock) -> test(e) for a spawn rule. getBlock({ x, y, z }) answers a full block name or null; `e` is the
 * spawn spot { x, y, z (the feet), biome, player }. Unloaded cells count as dry (no spawn), never as an error.
 * @param {(pos: { x: number, y: number, z: number }) => string | null} getBlock
 */
export function swampNight(getBlock: (pos: { x: number, y: number, z: number }) => string | null) {
  return (e: any) => {
    const p = e?.player;
    if (p && p.room && p.room !== 'mundo') return false; // a lobby or a minigame
    if (p && (p.dimension ?? OVERWORLD) !== OVERWORLD) return false; // another dimension
    if (e?.underground === true || e?.day === true) return false;
    const swamp = typeof e?.biome === 'string' && SWAMP_BIOME.test(e.biome);
    if (!(e.y <= WET_MAX_Y + (swamp ? SWAMP_EXTRA_Y : 0))) return false;
    const x = Math.floor(e.x), y = Math.floor(e.y), z = Math.floor(e.z);
    const need = swamp ? 1 : MIN_WATER;
    let water = 0;
    for (let dx = -WATER_RADIUS; dx <= WATER_RADIUS; dx++) {
      for (let dz = -WATER_RADIUS; dz <= WATER_RADIUS; dz++) {
        // the water's surface is level with the ground the spot stands on, or one below it
        for (let dy = -2; dy <= 0; dy++) {
          let b = null;
          try { b = getBlock({ x: x + dx, y: y + dy, z: z + dz }); } catch { b = null; }
          if (isWater(b) && ++water >= need) return true;
        }
      }
    }
    return false;
  };
}
