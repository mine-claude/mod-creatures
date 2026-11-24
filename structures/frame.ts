// @ts-check
// Shared pieces of the structure stages (village.ts, camp.ts):
//   - Canvas: a chunk being generated, read and written in WORLD coordinates (writes outside the chunk are dropped, reads
//     outside it answer -1). A stage only reads its own chunk, so whatever order the chunks are generated in, the result is
//     the same: the plan of a structure comes from the seed and the terrain columns (pure), never from another chunk's blocks.
//   - Frame: a building's local frame. u runs along its front wall, v from the front (0, where the door is) to the back;
//     `facing` is the side the front looks at (n/e/s/w). Directional props are turned with `side()`.
//   - claim helpers: which chunks a structure claims and the base game's structures it must never share a chunk with.
import type { Facing } from './blocks.ts';

export const CS = 16;
const VEC: Record<Facing, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
export const letterOf = (dx: number, dz: number): Facing => (dx > 0 ? 'e' : dx < 0 ? 'w' : dz > 0 ? 's' : 'n');
/** The side a point at (dx, dz) from here mostly lies toward. */
export const towards = (dx: number, dz: number): Facing => (Math.abs(dx) >= Math.abs(dz) ? letterOf(Math.sign(dx), 0) : letterOf(0, Math.sign(dz)));

export class Canvas {
  chunk: any; x0: number; z0: number; H: number;
  constructor(chunk: any, height: number) { this.chunk = chunk; this.x0 = chunk.x0; this.z0 = chunk.z0; this.H = height; }
  inside(x: number, z: number) { return x >= this.x0 && x < this.x0 + CS && z >= this.z0 && z < this.z0 + CS; }
  get(x: number, y: number, z: number) {
    if (!this.inside(x, z) || y < 0 || y >= this.H) return -1;
    return this.chunk.data[(y * CS + (z - this.z0)) * CS + (x - this.x0)];
  }
  set(x: number, y: number, z: number, id: number) { if (id >= 0) this.chunk.set(x, y, z, id, false); }
}

export class Frame {
  ox: number; oz: number; facing: Facing; R: [number, number]; B: [number, number]; W: number; D: number;
  /** A W x D building whose CENTRE is at (cx, cz), its front looking `facing`. W and D are odd. */
  constructor(cx: number, cz: number, W: number, D: number, facing: Facing) {
    const F = VEC[facing];
    this.facing = facing; this.W = W; this.D = D;
    this.B = [-F[0], -F[1]];
    this.R = [-F[1], F[0]];
    const hu = (W - 1) / 2, hv = (D - 1) / 2;
    this.ox = cx - (hu * this.R[0] + hv * this.B[0]);
    this.oz = cz - (hu * this.R[1] + hv * this.B[1]);
  }
  x(u: number, v: number) { return this.ox + u * this.R[0] + v * this.B[0]; }
  z(u: number, v: number) { return this.oz + u * this.R[1] + v * this.B[1]; }
  /** The world side of a local direction: 'front' (the door's), 'back', 'left' (-u), 'right' (+u). */
  side(local: 'front' | 'back' | 'left' | 'right'): Facing {
    const [dx, dz] = local === 'front' ? [-this.B[0], -this.B[1]] : local === 'back' ? this.B : local === 'right' ? this.R : [-this.R[0], -this.R[1]];
    return letterOf(dx, dz);
  }
  /** World bounds of the local box u0..u1, v0..v1 (inclusive): [minX, minZ, maxX, maxZ]. */
  bounds(u0: number, v0: number, u1: number, v1: number): [number, number, number, number] {
    const xs = [this.x(u0, v0), this.x(u1, v1)], zs = [this.z(u0, v0), this.z(u1, v1)];
    return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
  }
}

/** Do two world rectangles [minX, minZ, maxX, maxZ] come within `gap` blocks of each other? */
export const near = (a: number[], b: number[], gap: number) => a[0] - gap <= b[2] && b[0] - gap <= a[2] && a[1] - gap <= b[3] && b[1] - gap <= a[3];

// The base game's structures, by the lookups its stages provide: a structure of this mod never shares a chunk with any of
// them (the dungeons under the ground, the ruins, the trader's camps, lakes, wells, rivers, dry river beds, crypts).
const BASE_LOOKUPS = ['dungeonAt', 'ruinAt', 'campAt', 'lakeAt', 'wellAt', 'riverInChunk', 'dryInChunk', 'cryptInChunk'];
export function baseStructureIn(locate: Record<string, any>, cx: number, cz: number) {
  for (const k of BASE_LOOKUPS) { const at = locate[k]; if (typeof at === 'function' && at(cx, cz)) return true; }
  return false;
}

/** A small bounded cache (the plans are asked per chunk and per spawn attempt). */
export class Memo<T> {
  map = new Map<string, T>();
  get(key: string, make: () => T): T {
    if (this.map.has(key)) return this.map.get(key) as T;
    if (this.map.size > 2048) this.map.delete(this.map.keys().next().value as string);
    const v = make();
    this.map.set(key, v);
    return v;
  }
}
