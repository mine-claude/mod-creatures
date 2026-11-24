// @ts-check
// Numbers of the Moss Lurker's body that more than one file needs: the asset generator (tools/gen-assets.ts) builds the
// model from them, and the browser layer (src/client.ts) puts the glowing eyes exactly over the eye cubes of the head.
// Units are the model editor's: pixels, 16 per block, x mirrored relative to the game (the engine flips it when drawing).

export const MOB_PATH = 'moss_lurker';

// The head bone's pivot (the eyes hang on the head, so they follow it when it rears, bites or tucks under).
export const HEAD_PIVOT: readonly [number, number, number] = Object.freeze([0, 8, -9]);

// The four eyes on the front of the skull: two big ones and two small ones above them. [origin, size] like a cube.
export const EYES: ReadonlyArray<readonly [readonly [number, number, number], readonly [number, number, number]]> = Object.freeze([
  [[-4, 7.5, -15.5], [2, 1.5, 0.5]],
  [[2, 7.5, -15.5], [2, 1.5, 0.5]],
  [[-2.5, 9.5, -15.5], [1, 1, 0.5]],
  [[1.5, 9.5, -15.5], [1, 1, 0.5]],
]);

// The six legs: [bone suffix, hip x (editor space), hip z, which tripod of the gait it walks with].
export const LEGS: ReadonlyArray<readonly [string, number, number, number]> = Object.freeze([
  ['fl', 5.5, -6, 0], ['fr', -5.5, -6, 1],
  ['ml', 6.5, 1.5, 1], ['mr', -6.5, 1.5, 0],
  ['bl', 6.5, 8.5, 0], ['br', -6.5, 8.5, 1],
]);
