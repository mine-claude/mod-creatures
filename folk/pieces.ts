// @ts-check
// The PIECES of the Musgarrete village in terrain 2 (the engine's piece assembly: docs/modding.md 22.8). The village keeps
// its culture — the plaza with the Sino de Pedra-Oca, round stone huts, the field by its channel, the builders' lot, the
// mine's mouth — but its plan is ASSEMBLED: footpaths leave the plaza on its four sides and the huts, the field, the lot
// and the mine open onto them; every hut, the plaza, the field and the lot stand on a levelled pad.
//
//   piece      size (w x d)   connectors (local: u east, v south, unturned; the door side is north)
//   plaza      9 x 9          4 x "edge": grow a footpath
//   path       3 x 13         n "end" (joins), s "end" (grows a short path), e "side" at v 5, w "side" at v 12
//   path_end   3 x 9          n "end" (joins), e "side" at v 5
// Why the sides are staggered: a hut on the e side of the north path and one on the w side of the east path share the
// north-east quarter; at v 5 and v 12 both fit, each keeping its gap from the plaza and from the other.
//   hut        9 x 10         n "door": the 7 x 7 hut with its ring (1 each side) and the door step row (2 in front)
//   field      7 x 7          n "door": 5 x 5 of wheat with the water channel, and its mossy rim
//   lot        9 x 7          n "door": the builders' staked lot
//   mine       3 x 3          n "door": the mouth with the rack of picks; the tunnel heads in, under the village
const door = (w: number) => ({ at: [(w - 1) / 2, 0], side: 'n', name: 'door' });
const side = (s: 'w' | 'e', v: number) => ({ at: [s === 'w' ? 0 : 2, v], side: s, name: 'side', pool: 'yards', target: 'door' });

export const FOLK_PIECES = Object.freeze({
  start: 'center',
  maxDepth: 4,
  maxRadius: 27, // the claim (terrain 2) is 4 x 4 chunks: 64 blocks, 4 of each border stay free
  gap: 1,
  pieces: [
    { id: 'plaza', size: [9, 9], height: 6, connectors: [
      { at: [4, 0], side: 'n', name: 'edge', pool: 'paths', target: 'end' },
      { at: [8, 4], side: 'e', name: 'edge', pool: 'paths', target: 'end' },
      { at: [4, 8], side: 's', name: 'edge', pool: 'paths', target: 'end' },
      { at: [0, 4], side: 'w', name: 'edge', pool: 'paths', target: 'end' },
    ] },
    { id: 'path', size: [3, 13], connectors: [{ at: [1, 0], side: 'n', name: 'end' }, { at: [1, 12], side: 's', name: 'end', pool: 'paths_far', target: 'end' }, side('e', 5), side('w', 12)] },
    { id: 'path_end', size: [3, 9], connectors: [{ at: [1, 0], side: 'n', name: 'end' }, side('e', 5)] },
    { id: 'hut', size: [9, 10], height: 7, maxCount: 5, connectors: [door(9)] },
    { id: 'field', size: [7, 7], height: 2, maxCount: 1, connectors: [door(7)] },
    { id: 'lot', size: [9, 7], height: 2, maxCount: 1, connectors: [door(9)] },
    { id: 'mine', size: [3, 3], height: 2, maxCount: 1, connectors: [door(3)] },
  ],
  pools: {
    center: [{ piece: 'plaza', weight: 1 }],
    paths: [{ piece: 'path', weight: 3 }, { piece: 'path_end', weight: 2 }],
    paths_far: [{ piece: 'path_end', weight: 1 }],
    yards: [{ piece: 'hut', weight: 8 }, { piece: 'field', weight: 2 }, { piece: 'lot', weight: 2 }, { piece: 'mine', weight: 2 }],
  },
});
