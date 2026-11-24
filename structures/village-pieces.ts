// @ts-check
// The PIECES of the Abandoned Village in terrain 2 (the engine's piece assembly: docs/modding.md 22.8). The village keeps
// what it was — a dry well in the middle, three to six empty houses (cottage, longhouse, workshop), gravel paths — but its
// plan is now ASSEMBLED: the well's plaza grows streets on its four sides, the streets grow houses (their door on the
// street) and more street, so the houses line up along lanes instead of a ring, and each sits on a levelled pad.
//
//   piece        size (w x d)   connectors (local: u east, v south, the piece unturned; houses face north = their door)
//   plaza        7 x 7          4 x "edge" (n, e, s, w): grow a street
//   lane         3 x 16         n "end" (joins), s "end" (grows a lane), e "side" at v 7 and w "side" at v 15 (a house or a yard)
//   lane_short   3 x 9          n "end" (joins), e "side" at v 7 — a dead end
// Why the sides are staggered: a house on the e side of the north lane and one on the w side of the east lane share the
// north-east quarter; at v 7 and v 15 both fit (a 13-wide house keeps its gap from the plaza and from the other).
//   cottage      9 x 8          n "door": the house with its roof overhang (1 each side) and the door step row (2 in front)
//   longhouse    13 x 10        n "door"
//   workshop     9 x 10         n "door"
//   yard         5 x 4          n "door": a woodpile and crates where no house fits
// Sizes of the houses = TYPES (village.ts) + 2 across and + 3 in depth (Frame bounds(-1, -2, W, D)).
export const HOUSE_PIECES = Object.freeze({ cottage: [9, 8], longhouse: [13, 10], workshop: [9, 10] } as Record<string, [number, number]>);

const door = (w: number) => ({ at: [(w - 1) / 2, 0], side: 'n', name: 'door' });
const side = (s: 'w' | 'e', v: number) => ({ at: [s === 'w' ? 0 : 2, v], side: s, name: 'side', pool: 'lots', target: 'door' });

export const VILLAGE_PIECES = Object.freeze({
  start: 'center',
  maxDepth: 4,
  maxRadius: 27, // blocks from the well: the claim (terrain 2) is 4 x 4 chunks, 64 wide, and 5 of each border stay free
  gap: 1,
  pieces: [
    { id: 'plaza', size: [7, 7], height: 7, connectors: [
      { at: [3, 0], side: 'n', name: 'edge', pool: 'streets', target: 'end' },
      { at: [6, 3], side: 'e', name: 'edge', pool: 'streets', target: 'end' },
      { at: [3, 6], side: 's', name: 'edge', pool: 'streets', target: 'end' },
      { at: [0, 3], side: 'w', name: 'edge', pool: 'streets', target: 'end' },
    ] },
    { id: 'lane', size: [3, 16], connectors: [{ at: [1, 0], side: 'n', name: 'end' }, { at: [1, 15], side: 's', name: 'end', pool: 'streets_far', target: 'end' }, side('e', 7), side('w', 15)] },
    { id: 'lane_short', size: [3, 9], connectors: [{ at: [1, 0], side: 'n', name: 'end' }, side('e', 7)] },
    { id: 'cottage', size: HOUSE_PIECES.cottage, height: 9, maxCount: 2, connectors: [door(9)] },
    { id: 'longhouse', size: HOUSE_PIECES.longhouse, height: 10, maxCount: 2, connectors: [door(13)] },
    { id: 'workshop', size: HOUSE_PIECES.workshop, height: 10, maxCount: 2, connectors: [door(9)] },
    { id: 'yard', size: [5, 4], height: 3, connectors: [door(5)] },
  ],
  pools: {
    center: [{ piece: 'plaza', weight: 1 }],
    streets: [{ piece: 'lane', weight: 3 }, { piece: 'lane_short', weight: 2 }],
    streets_far: [{ piece: 'lane_short', weight: 1 }],
    lots: [{ piece: 'cottage', weight: 4 }, { piece: 'longhouse', weight: 3 }, { piece: 'workshop', weight: 3 }, { piece: 'yard', weight: 1 }],
  },
});
