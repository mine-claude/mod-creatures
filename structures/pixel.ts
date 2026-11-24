// @ts-check
// Tiny deterministic pixel-art kit for the structures' textures (only tools/gen-structure-textures.ts runs it; nothing here
// runs in the game). A texture is a function (x, y) -> [r, g, b, a] on a 16 x 16 tile; `hash` is a pure integer hash, so the
// same code always paints the same pixels.

export type Rgba = [number, number, number, number];
export type Painter = (x: number, y: number) => Rgba;

/** Pure hash of integer coordinates and a salt -> [0, 1). */
export function hash(x: number, y: number, salt = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** '#rrggbb' -> [r, g, b, 255]. */
export function hex(c: string): Rgba {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255];
}

export const CLEAR: Rgba = [0, 0, 0, 0];

/** Picks from a palette by a [0, 1) value. */
export const pick = (palette: string[], v: number): Rgba => hex(palette[Math.max(0, Math.min(palette.length - 1, Math.floor(v * palette.length)))]);

/** Darker (k < 1) or lighter (k > 1) copy of a colour. */
export const shade = (c: Rgba, k: number): Rgba => [Math.min(255, Math.round(c[0] * k)), Math.min(255, Math.round(c[1] * k)), Math.min(255, Math.round(c[2] * k)), c[3]];

/** Smooth-ish blobs: the average of a few hashed cells, wrapping at 16 so the tile repeats without a seam. */
export function blob(x: number, y: number, salt: number, cell = 4): number {
  const s = 16;
  const cx = Math.floor(x / cell), cy = Math.floor(y / cell), n = s / cell;
  const fx = (x % cell) / cell, fy = (y % cell) / cell;
  const at = (i: number, j: number) => hash(((i % n) + n) % n, ((j % n) + n) % n, salt);
  const a = at(cx, cy), b = at(cx + 1, cy), c = at(cx, cy + 1), d = at(cx + 1, cy + 1);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
