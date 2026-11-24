// @ts-check
// Where the Root Serpent may be born: on the FLOOR of a forest or a jungle, day and night, rarely. The forest test is the
// Moss Lurker's (src/spawn.ts: leaves overhead and trunks around); a world with a jungle/rainforest biome (biomes are
// opt-in per world, and the base game has none) lets it be born anywhere on that biome's floor with a little canopy over
// it. The ground must be one it can dig into (grass, dirt). Never in the lobby, a minigame room or another dimension.
import { OVERWORLD, forestFloor } from '../src/spawn.ts';
import { isDiggable } from './tuning.ts';

export { OVERWORLD };
export const JUNGLE_BIOME = /(jungle|rainforest|selva|floresta[_ ]?tropical|mata)/i;

const isLeaves = (name: unknown) => typeof name === 'string' && /(^|[:_])leaves$/.test(name);

/**
 * rootFloor(getBlock) -> test(e) for a spawn rule. getBlock({ x, y, z }) answers a full block name or null; e is the
 * spawn spot { x, y, z (the feet), biome, ground, player }. Unloaded cells count as nothing (no spawn), never as an error.
 * @param {(pos: { x: number, y: number, z: number }) => string | null} getBlock
 */
export function rootFloor(getBlock: (pos: { x: number, y: number, z: number }) => string | null) {
  const safe = (pos: { x: number, y: number, z: number }) => { try { return getBlock(pos); } catch { return null; } };
  const forest = forestFloor(safe);
  return (e: any) => {
    const p = e?.player;
    if (p && p.room && p.room !== 'mundo') return false; // a lobby or a minigame
    if (p && (p.dimension ?? OVERWORLD) !== OVERWORLD) return false; // another dimension
    if (e?.underground === true) return false; // a cave is not a forest floor
    const x = Math.floor(e.x), y = Math.floor(e.y), z = Math.floor(e.z);
    const under = e?.ground ?? safe({ x, y: y - 1, z });
    if (!isDiggable(under)) return false; // it must be able to dig in where it lives
    if (typeof e?.biome === 'string' && JUNGLE_BIOME.test(e.biome)) {
      // a jungle: any of its floor with some canopy straight overhead
      let leaves = 0;
      for (let dy = 2; dy <= 12; dy++) if (isLeaves(safe({ x, y: y + dy, z }))) leaves++;
      if (leaves >= 1) return true;
    }
    return forest(e);
  };
}
