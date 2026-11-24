// @ts-check
// The Ruined Castle's blueprint: a PURE function of (origin, floor level, rotation, terrain heights, a hash of world
// coordinates) that fills a small voxel volume covering the whole castle (S x S columns, from 9 below the floor to 18
// above it). The generator stage (stage.ts) builds it ONCE per castle and every chunk under the footprint copies its own
// slice, so the stitched castle is the same whatever order the chunks are generated in (and the server, the page, the
// mesher Worker and the hosted Worker all build the same bytes).
//
// Everything is drawn in a CANONICAL frame (u = west->east, v = north->south, the gate on the south side, the keep to the
// north) and then turned by `rot` quarter turns as it is written; blocks with a facing turn with it.
//
// Layout (canonical, S = 43):
//   - four corner towers (9 x 9, cut corners) of different ruin heights, each with a spiral stair round a central pillar,
//     a floor at the wall-walk level with doors onto the walls, a door to the courtyard and a top platform;
//   - a curtain wall (3 thick, 5 tall, merlons) with one collapsed stretch (east or north) and rubble on both sides;
//   - a gatehouse on the south wall: a 3-wide passage under an arch, a broken portcullis, two guard rooms;
//   - a keep (21 x 15) with three floors: great hall (long table, chairs, banners, braziers), library (shelves) and the
//     throne room (throne, carpet, braziers, a roof half fallen in), joined by straight stairs;
//   - a crypt under the keep (stairs down from the hall) with pillars, sarcophagi and the walled treasury;
//   - barracks against the west wall, a stair up to the wall walk, a dry fountain and rubble in the courtyard;
//   - six chests, by value: gatehouse and barracks, great hall, library, throne room, treasury.

export const S = 43; // the footprint's side (blocks)
export const Y_BELOW = 9, Y_ABOVE = 18; // the volume: from floor - 9 to floor + 18
export const HV = Y_BELOW + Y_ABOVE + 1;
const MID = 21;

/** Column classes (the spawn rules and the tests read them). */
export const CLS = Object.freeze({ OUT: 0, YARD: 1, WALL: 2, TOWER: 3, KEEP: 4, GATE: 5, BARRACKS: 6, APRON: 7 });

export const B = Object.freeze({
  AIR: 'mineclaude:air', STONE: 'mineclaude:stone', COBBLE: 'mineclaude:cobblestone', GRAVEL: 'mineclaude:gravel',
  DIRT: 'mineclaude:dirt', GRASS: 'mineclaude:grass', PLANKS: 'mineclaude:planks', SLAB: 'mineclaude:stone_slab',
  CHEST: 'mineclaude:chest', BED: 'mineclaude:bed', CARPET: 'mineclaude:wool_red',
  BRICK: 'creatures:castle_brick', CRACKED: 'creatures:castle_brick_cracked', MOSSY: 'creatures:castle_brick_mossy',
  SHELF: 'creatures:castle_bookshelf', TABLE: 'creatures:castle_table', CHAIR: 'creatures:castle_chair',
  THRONE: 'creatures:castle_throne', BANNER: 'creatures:castle_banner', BANNER_TAIL: 'creatures:castle_banner_tail',
  BARS: 'creatures:castle_portcullis', SCONCE: 'creatures:castle_sconce', BRAZIER: 'creatures:castle_brazier',
});
/** Blocks that carry a facing (written as 'name#n|e|s|w'). */
export const FACING_BLOCKS: readonly string[] = Object.freeze([B.CHAIR, B.THRONE, B.BANNER, B.BANNER_TAIL, B.BARS, B.SCONCE]);
const FACES = ['n', 'e', 's', 'w'];

/** The chests: canonical cell (u, dy, v) and the loot table (creatures:<table>). */
export const CHESTS = Object.freeze([
  { room: 'gatehouse', u: 16, dy: 0, v: 40, table: 'castle_barracks' },
  { room: 'barracks', u: 7, dy: 0, v: 25, table: 'castle_barracks' },
  { room: 'hall', u: 30, dy: 0, v: 8, table: 'castle_hall' },
  { room: 'library', u: 28, dy: 6, v: 9, table: 'castle_library' },
  { room: 'throne', u: 13, dy: 11, v: 19, table: 'castle_library' },
  { room: 'treasury', u: 14, dy: -7, v: 14, table: 'castle_treasury' },
]);
export const KEEP = Object.freeze({ u0: 11, u1: 31, v0: 7, v1: 21 });
export const CRYPT = Object.freeze({ u0: 12, u1: 30, v0: 8, v1: 20, floor: -8, ceil: -2 });
export const TREASURY = Object.freeze({ u0: 13, u1: 16, v0: 9, v1: 19 });
export const FOUNTAIN = Object.freeze({ u: 21, v: 29 });
const TOWER_AT = [[4, 4], [38, 4], [4, 38], [38, 38]];
const TOWER_HEIGHTS = [15, 12, 9, 13]; // ruin heights (top platform above the floor), dealt round by the castle's hash
const RING8 = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];

/** Canonical (u, v) -> local (lx, lz) for `rot` quarter turns clockwise (seen from above). */
export function toLocal(u: number, v: number, rot: number) {
  switch (rot & 3) {
    case 1: return [S - 1 - v, u];
    case 2: return [S - 1 - u, S - 1 - v];
    case 3: return [v, S - 1 - u];
    default: return [u, v];
  }
}
/** The facing after `rot` quarter turns clockwise (n -> e -> s -> w). */
export const turnFacing = (f: string, rot: number) => FACES[(FACES.indexOf(f) + (rot & 3)) & 3];

const inTower = (du: number, dv: number) => Math.abs(du) <= 4 && Math.abs(dv) <= 4 && Math.abs(du) + Math.abs(dv) <= 6;
const inTowerInner = (du: number, dv: number) => Math.abs(du) <= 3 && Math.abs(dv) <= 3 && Math.abs(du) + Math.abs(dv) <= 4;

/**
 * Builds the castle. `site` = { x0, z0, F, rot }: the footprint's north-west corner in the world, the floor level (the
 * first air above the courtyard floor) and the rotation. `heightAt(wx, wz)` = the terrain height of a column (the
 * generator's, pure). `hash(salt, wx, y, wz)` = a pure hash in [0, 1) of WORLD coordinates.
 * Returns { vol (palette index per cell, 0 = keep what is there), palette (names, index 0 unused), cls (column class per
 * local column), yBase, chests (world cells + table), floors... }.
 */
export function buildPlan(site: { x0: number, z0: number, F: number, rot: number }, heightAt: (wx: number, wz: number) => number, hash: (salt: number, x: number, y: number, z: number) => number) {
  const { x0, z0, F, rot } = site;
  const yBase = F - Y_BELOW;
  const vol = new Uint8Array(S * S * HV);
  const cls = new Uint8Array(S * S);
  const palette: string[] = ['', B.AIR];
  const index = new Map<string, number>([[B.AIR, 1]]);
  const pal = (name: string) => {
    let i = index.get(name);
    if (i === undefined) { i = palette.length; palette.push(name); index.set(name, i); }
    return i;
  };
  // world coordinates of a canonical cell
  const world = (u: number, v: number) => { const [lx, lz] = toLocal(u, v, rot); return [x0 + lx, z0 + lz]; };
  const r = (salt: number, u: number, dy: number, v: number) => { const [wx, wz] = world(u, v); return hash(salt, wx, F + dy, wz); };
  const castleRand = (salt: number) => hash(salt, x0, F, z0);
  /** Writes `name` (or 'name#facing', the facing canonical) at canonical (u, dy, v). */
  const put = (u: number, dy: number, v: number, name: string) => {
    if (u < 0 || v < 0 || u >= S || v >= S || dy < -Y_BELOW || dy > Y_ABOVE) return;
    const [lx, lz] = toLocal(u, v, rot);
    const hashAt = name.indexOf('#');
    const full = hashAt < 0 ? name : `${name.slice(0, hashAt)}#${turnFacing(name.slice(hashAt + 1), rot)}`;
    vol[((dy + Y_BELOW) * S + lz) * S + lx] = pal(full);
  };
  const get = (u: number, dy: number, v: number) => {
    const [lx, lz] = toLocal(u, v, rot);
    return palette[vol[((dy + Y_BELOW) * S + lz) * S + lx]] ?? '';
  };
  const setCls = (u: number, v: number, c: number) => { const [lx, lz] = toLocal(u, v, rot); cls[lz * S + lx] = c; };
  const getCls = (u: number, v: number) => { const [lx, lz] = toLocal(u, v, rot); return cls[lz * S + lx]; };
  const ground = (u: number, v: number) => { const [wx, wz] = world(u, v); return heightAt(wx, wz); };
  const fill = (u0: number, u1: number, dy0: number, dy1: number, v0: number, v1: number, name: string | ((u: number, dy: number, v: number) => string)) => {
    for (let u = u0; u <= u1; u++) for (let v = v0; v <= v1; v++) for (let dy = dy0; dy <= dy1; dy++) put(u, dy, v, typeof name === 'function' ? name(u, dy, v) : name);
  };
  // the masonry: castle bricks, with moss low down, cracks and patched cobble
  const stone = (u: number, dy: number, v: number) => {
    const k = r(1, u, dy, v), moss = dy <= 1 ? 0.24 : dy <= 4 ? 0.1 : 0.05;
    return k < moss ? B.MOSSY : k < moss + 0.15 ? B.CRACKED : k < moss + 0.21 ? B.COBBLE : B.BRICK;
  };
  const cryptStone = (u: number, dy: number, v: number) => (r(2, u, dy, v) < 0.35 ? B.MOSSY : stone(u, dy, v));

  // ---------------------------------------------------------------- 1. which column is what
  const towers = TOWER_AT.map(([cu, cv], i) => ({ cu, cv, su: cu < MID ? 1 : -1, sv: cv < MID ? 1 : -1, th: TOWER_HEIGHTS[(i + Math.floor(castleRand(3) * 4)) & 3] }));
  const towerOf = (u: number, v: number) => towers.find((t) => inTower(u - t.cu, v - t.cv)) ?? null;
  const wallCell = (u: number, v: number) => ((u >= 3 && u <= 5) || (u >= 37 && u <= 39)) && v >= 3 && v <= 39 || ((v >= 3 && v <= 5) || (v >= 37 && v <= 39)) && u >= 3 && u <= 39;
  const gateCell = (u: number, v: number) => u >= 15 && u <= 27 && v >= 34 && v <= 41;
  const keepCell = (u: number, v: number) => u >= KEEP.u0 && u <= KEEP.u1 && v >= KEEP.v0 && v <= KEEP.v1;
  const barracksCell = (u: number, v: number) => u >= 6 && u <= 10 && v >= 14 && v <= 26;
  for (let u = 0; u < S; u++) for (let v = 0; v < S; v++) {
    let c: number = CLS.OUT;
    if (towerOf(u, v)) c = CLS.TOWER;
    else if (gateCell(u, v)) c = CLS.GATE;
    else if (wallCell(u, v)) c = CLS.WALL;
    else if (u >= 6 && u <= 36 && v >= 6 && v <= 36) c = keepCell(u, v) ? CLS.KEEP : barracksCell(u, v) ? CLS.BARRACKS : CLS.YARD;
    else if (u >= 18 && u <= 24 && v >= 42) c = CLS.APRON;
    setCls(u, v, c);
  }

  // ---------------------------------------------------------------- 2. the ground: clear above, floor, foundation below
  for (let u = 0; u < S; u++) for (let v = 0; v < S; v++) {
    const c = getCls(u, v);
    if (c === CLS.OUT) continue;
    const h = ground(u, v);
    const top = c === CLS.APRON ? 7 : Y_ABOVE;
    for (let dy = 0; dy <= top; dy++) put(u, dy, v, B.AIR);
    const k = r(4, u, -1, v);
    const floor = c === CLS.YARD ? (k < 0.34 ? B.COBBLE : k < 0.52 ? B.GRAVEL : k < 0.66 ? B.BRICK : k < 0.74 ? B.MOSSY : k < 0.92 ? B.GRASS : B.DIRT)
      : c === CLS.APRON ? (k < 0.5 ? B.COBBLE : B.GRAVEL)
        : c === CLS.KEEP || c === CLS.BARRACKS ? (k < 0.55 ? B.BRICK : k < 0.8 ? B.COBBLE : B.CRACKED) : B.BRICK;
    put(u, -1, v, floor);
    const under = floor === B.GRASS ? B.DIRT : B.COBBLE;
    put(u, -2, v, under);
    // the foundation down to the ground (a castle on a slope stands on a plinth)
    for (let dy = -3; dy >= -Y_BELOW && F + dy > h; dy--) put(u, dy, v, r(5, u, dy, v) < 0.5 ? B.STONE : B.COBBLE);
  }

  // ---------------------------------------------------------------- 3. the curtain wall
  const collapseSide = castleRand(6) < 0.5 ? 'E' : 'N';
  const s0 = 13 + Math.floor(castleRand(7) * 12), s1 = s0 + 5 + Math.floor(castleRand(8) * 3);
  const collapsed = (u: number, v: number) => (collapseSide === 'E' ? u >= 37 && v >= s0 && v <= s1 : v <= 5 && u >= s0 && u <= s1);
  for (let u = 0; u < S; u++) for (let v = 0; v < S; v++) {
    if (getCls(u, v) !== CLS.WALL) continue;
    const outer = u === 3 || u === 39 || v === 3 || v === 39;
    const along = (u >= 3 && u <= 5) || (u >= 37 && u <= 39) ? v : u;
    if (collapsed(u, v)) {
      const top = -1 + Math.floor(r(9, u, 0, v) * 3); // what still stands: 0..2 blocks
      for (let dy = 0; dy <= top; dy++) put(u, dy, v, r(10, u, dy, v) < 0.5 ? B.COBBLE : stone(u, dy, v));
      continue;
    }
    for (let dy = 0; dy <= 4; dy++) put(u, dy, v, stone(u, dy, v));
    if (outer && along % 2 === 0 && r(11, u, 5, v) > 0.22) put(u, 5, v, stone(u, 5, v));
  }
  // rubble where the wall came down: inside the courtyard (and the next cell outside when it is ours)
  for (let t = s0 - 1; t <= s1 + 1; t++) {
    for (let d = 1; d <= 4; d++) {
      const [u, v] = collapseSide === 'E' ? [37 - d, t] : [t, 5 + d];
      if (getCls(u, v) !== CLS.YARD) continue;
      const hgt = Math.floor((4 - d) * 0.7 + r(12, u, 0, v) * 1.6) - (t < s0 || t > s1 ? 1 : 0);
      for (let dy = 0; dy < Math.min(2, hgt); dy++) { const k = r(13, u, dy, v); put(u, dy, v, k < 0.4 ? B.COBBLE : k < 0.65 ? B.GRAVEL : k < 0.85 ? B.MOSSY : B.CRACKED); }
    }
  }

  // ---------------------------------------------------------------- 4. the corner towers, each with a spiral stair
  for (const t of towers) {
    const { cu, cv, su, sv, th } = t;
    const ruined = th < 12;
    const start = Math.floor(r(14, cu, 0, cv) * 8);
    const ringCell = (k: number) => RING8[(k + start) & 7];
    const open = new Set([`${ringCell(th - 1)}`, `${ringCell(th - 2)}`, `${ringCell(th - 3)}`]); // headroom for the last three steps
    for (let du = -4; du <= 4; du++) for (let dv = -4; dv <= 4; dv++) {
      if (!inTower(du, dv)) continue;
      const u = cu + du, v = cv + dv;
      put(u, -1, v, B.BRICK);
      if (!inTowerInner(du, dv)) { // the shell
        const jag = ruined ? Math.floor(r(15, u, th, v) * 3) - 1 : 1; // a ruined top is ragged
        const top = th + Math.max(0, jag);
        for (let dy = 0; dy <= top; dy++) put(u, dy, v, stone(u, dy, v));
        if (!ruined && (du + dv) % 2 === 0 && r(16, u, th + 2, v) > 0.15) put(u, th + 2, v, stone(u, th + 2, v));
        continue;
      }
      const cheb = Math.max(Math.abs(du), Math.abs(dv));
      if (cheb === 0) { for (let dy = 0; dy <= th; dy++) put(u, dy, v, stone(u, dy, v)); continue; } // the pillar
      if (cheb >= 2) { put(u, 4, v, B.BRICK); put(u, th, v, r(17, u, th, v) < 0.2 ? B.CRACKED : B.BRICK); continue; } // floors
      if (!open.has(`${[du, dv]}`)) put(u, th, v, B.BRICK); // the top over the stair ring, but the cells the stair climbs through
    }
    for (let k = 0; k < th; k++) { const [du, dv] = ringCell(k); put(cu + du, k, cv + dv, k % 4 === 3 ? B.CRACKED : B.BRICK); }
    // the doors: to the courtyard (a corner of three cells) and, at the wall walk, onto both walls
    for (const [du, dv] of [[3, 2], [2, 3], [3, 3]]) for (let dy = 0; dy <= 2; dy++) put(cu + du * su, dy, cv + dv * sv, B.AIR);
    for (const k of [0, 1]) for (const dy of [5, 6]) { put(cu + 4 * su, dy, cv + k * sv, B.AIR); put(cu + k * su, dy, cv + 4 * sv, B.AIR); }
    // arrow slits on the two faces that look out of the castle
    for (const dy of [2, 7, 11]) if (dy < th) { put(cu - 4 * su, dy, cv, B.AIR); put(cu, dy, cv - 4 * sv, B.AIR); }
  }

  // ---------------------------------------------------------------- 5. the gatehouse
  for (let u = 15; u <= 27; u++) for (let v = 34; v <= 41; v++) {
    for (let dy = 0; dy <= 4; dy++) put(u, dy, v, stone(u, dy, v));
    if ((v === 41 || v === 34) && (u % 2 === 1) && r(18, u, 5, v) > 0.2) put(u, 5, v, stone(u, 5, v)); // the parapet
  }
  for (const [u, v] of [[15, 41], [27, 41], [15, 34], [27, 34]]) for (let dy = 5; dy <= 6 + Math.floor(r(19, u, 0, v) * 2); dy++) put(u, dy, v, stone(u, dy, v));
  fill(20, 22, 0, 3, 34, 41, B.AIR); // the passage
  fill(20, 22, -1, -1, 34, 41, (u, dy, v) => (r(20, u, dy, v) < 0.6 ? B.COBBLE : B.GRAVEL));
  fill(16, 18, 0, 3, 35, 40, B.AIR); // the guard rooms
  fill(24, 26, 0, 3, 35, 40, B.AIR);
  for (const u of [19, 23]) for (const dy of [0, 1]) put(u, dy, 37, B.AIR);
  // the broken portcullis: three bars hanging at different lengths
  for (const dy of [1, 2, 3]) put(20, dy, 39, `${B.BARS}#n`);
  put(21, 3, 39, `${B.BARS}#n`);
  for (const dy of [2, 3]) put(22, dy, 39, `${B.BARS}#n`);
  put(18, 2, 35, `${B.SCONCE}#n`);
  put(26, 2, 40, `${B.SCONCE}#s`);
  fill(18, 24, -1, -1, 42, 42, (u, dy, v) => (r(21, u, dy, v) < 0.5 ? B.COBBLE : B.GRAVEL)); // the apron in front of the gate

  // ---------------------------------------------------------------- 6. the barracks against the west wall
  for (let u = 6; u <= 10; u++) for (let v = 14; v <= 26; v++) {
    const edge = u === 6 || u === 10 || v === 14 || v === 26;
    if (edge) for (let dy = 0; dy <= 3; dy++) put(u, dy, v, stone(u, dy, v));
    if (r(22, u, 4, v) > 0.22) put(u, 4, v, edge ? B.BRICK : B.PLANKS); // the roof, with holes
  }
  for (const dy of [0, 1, 2]) put(8, dy, 26, B.AIR); // the door, at the south end (the keep stands right against its east side)
  for (const u of [7, 9]) put(u, 2, 26, B.AIR); // windows
  for (const v of [16, 19, 22]) put(7, 0, v, B.BED);
  put(9, 0, 16, B.TABLE);
  put(8, 2, 15, `${B.SCONCE}#n`);
  // the stair up to the wall walk, along the south wall west of the gate
  for (let k = 0; k <= 4; k++) for (let dy = 0; dy <= k; dy++) put(9 + k, dy, 36, stone(9 + k, dy, 36));

  // ---------------------------------------------------------------- 7. the courtyard: a dry fountain and rubble
  for (let du = -3; du <= 3; du++) for (let dv = -3; dv <= 3; dv++) {
    const u = FOUNTAIN.u + du, v = FOUNTAIN.v + dv, m = Math.max(Math.abs(du), Math.abs(dv));
    if (m === 3) { put(u, -1, v, B.BRICK); put(u, 0, v, r(23, u, 0, v) < 0.25 ? B.CRACKED : r(23, u, 0, v) < 0.4 ? B.MOSSY : B.BRICK); continue; }
    put(u, -1, v, B.AIR); // the dry basin, one deep
    put(u, -2, v, r(24, u, -2, v) < 0.5 ? B.GRAVEL : B.DIRT);
  }
  for (let dy = -2; dy <= 2; dy++) put(FOUNTAIN.u, dy, FOUNTAIN.v, dy === 2 ? B.MOSSY : B.BRICK);
  put(FOUNTAIN.u, 3, FOUNTAIN.v, B.SLAB);
  // the ways in and out stay clear of rubble: the tower doors, the barracks door, the stair to the walls, the keep door
  const keepClear = (u: number, v: number) => towers.some((t) => Math.abs(u - t.cu) + Math.abs(v - t.cv) <= 9) || (Math.abs(u - 8) <= 2 && v >= 26 && v <= 29) || (v >= 34 && u <= 14) || (v <= 23 && Math.abs(u - 21) <= 3);
  for (let i = 0; i < 6; i++) {
    const cu = 7 + Math.floor(castleRand(40 + i) * 29), cv = 23 + Math.floor(castleRand(50 + i) * 13);
    if (Math.abs(cu - 21) <= 3 || Math.max(Math.abs(cu - FOUNTAIN.u), Math.abs(cv - FOUNTAIN.v)) <= 4 || (cu <= 14 && cv >= 34)) continue;
    const rad = 1 + Math.floor(castleRand(60 + i) * 2);
    for (let du = -rad; du <= rad; du++) for (let dv = -rad; dv <= rad; dv++) {
      const u = cu + du, v = cv + dv;
      if (getCls(u, v) !== CLS.YARD || keepClear(u, v)) continue;
      const hgt = Math.floor(rad + 0.6 - Math.hypot(du, dv) + r(25, u, 0, v) * 0.8);
      for (let dy = 0; dy < Math.min(2, hgt); dy++) { const k = r(26, u, dy, v); put(u, dy, v, k < 0.45 ? B.COBBLE : k < 0.7 ? B.GRAVEL : k < 0.88 ? B.MOSSY : B.CRACKED); }
    }
  }

  // ---------------------------------------------------------------- 8. the keep
  const { u0, u1, v0, v1 } = KEEP;
  for (let u = u0; u <= u1; u++) for (let v = v0; v <= v1; v++) {
    const edge = u === u0 || u === u1 || v === v0 || v === v1;
    if (edge) {
      const drop = r(27, u, 16, v) < 0.3 ? 1 + Math.floor(r(28, u, 16, v) * 3) : 0; // a ragged crown
      for (let dy = 0; dy <= 16 - drop; dy++) put(u, dy, v, stone(u, dy, v));
      const along = u === u0 || u === u1 ? v : u;
      if (!drop && along % 2 === 0 && !((u === u0 || u === u1) && (v === v0 || v === v1))) put(u, 17, v, stone(u, 17, v));
      continue;
    }
    put(u, 5, v, B.PLANKS); // the library floor
    put(u, 10, v, B.PLANKS); // the throne room floor
    if (r(29, u, 15, v) > 0.45) put(u, 15, v, r(30, u, 15, v) < 0.3 ? B.MOSSY : B.BRICK); // the roof, half fallen in
  }
  // windows: every fourth cell of each face, on each floor
  for (let u = u0; u <= u1; u++) for (let v = v0; v <= v1; v++) {
    const onEW = u === u0 || u === u1, onNS = v === v0 || v === v1;
    if (onEW === onNS) continue; // not an edge, or a corner
    const along = onEW ? v - v0 : u - u0;
    if (along % 4 === 2) for (const dy of [2, 7, 12]) put(u, dy, v, B.AIR);
  }
  fill(20, 22, 0, 3, v1, v1, B.AIR); // the main door, to the courtyard
  // stair 1, great hall -> library (west side, climbing north)
  for (let k = 0; k <= 5; k++) for (let dy = 0; dy <= k; dy++) for (const u of [12, 13]) put(u, dy, 19 - k, k === 5 && dy === 5 ? B.PLANKS : stone(u, dy, 19 - k));
  fill(12, 13, 5, 5, 15, 20, B.AIR);
  // stair 2, library -> throne room (east side, climbing north)
  for (let k = 0; k <= 4; k++) for (let dy = 6; dy <= 6 + k; dy++) for (const u of [29, 30]) put(u, dy, 19 - k, k === 4 && dy === 10 ? B.PLANKS : stone(u, dy, 19 - k));
  fill(29, 30, 10, 10, 16, 20, B.AIR);
  // the great hall (floor 0..4): the long table, chairs, banners, braziers, sconces, the hall chest
  fill(15, 25, 0, 0, 13, 14, B.TABLE);
  for (let u = 16; u <= 24; u += 2) { put(u, 0, 12, `${B.CHAIR}#s`); put(u, 0, 15, `${B.CHAIR}#n`); }
  for (const u of [14, 18, 22, 26]) { put(u, 3, 8, `${B.BANNER}#n`); put(u, 2, 8, `${B.BANNER_TAIL}#n`); }
  put(14, 0, 9, B.BRAZIER); put(25, 0, 9, B.BRAZIER);
  put(15, 2, 20, `${B.SCONCE}#s`); put(25, 2, 20, `${B.SCONCE}#s`); put(12, 2, 10, `${B.SCONCE}#w`); put(30, 2, 13, `${B.SCONCE}#e`);
  // the library (floor 6..9): shelves on the walls and in two rows, a reading table
  fill(14, 28, 6, 8, 8, 8, B.SHELF);
  for (const v of [11, 17]) { fill(16, 19, 6, 7, v, v, B.SHELF); fill(23, 26, 6, 7, v, v, B.SHELF); }
  fill(15, 26, 6, 8, 20, 20, B.SHELF);
  fill(20, 22, 6, 6, 14, 14, B.TABLE);
  put(21, 6, 13, `${B.CHAIR}#s`); put(21, 6, 15, `${B.CHAIR}#n`);
  put(12, 8, 10, `${B.SCONCE}#w`); put(30, 8, 10, `${B.SCONCE}#e`);
  // the throne room (floor 11..14): a carpet runway, the throne between two braziers, banners
  fill(20, 22, 10, 10, 10, 19, B.CARPET);
  put(21, 11, 9, `${B.THRONE}#s`);
  put(18, 11, 9, B.BRAZIER); put(24, 11, 9, B.BRAZIER);
  for (const u of [15, 27]) { put(u, 13, 8, `${B.BANNER}#n`); put(u, 12, 8, `${B.BANNER_TAIL}#n`); }
  put(16, 13, 20, `${B.SCONCE}#s`); put(26, 13, 20, `${B.SCONCE}#s`);

  // ---------------------------------------------------------------- 9. the crypt and the treasury, under the keep
  const C = CRYPT;
  for (let u = C.u0; u <= C.u1; u++) for (let v = C.v0; v <= C.v1; v++) {
    const edge = u === C.u0 || u === C.u1 || v === C.v0 || v === C.v1;
    put(u, C.floor - 1, v, B.STONE);
    for (let dy = C.floor; dy <= C.ceil; dy++) {
      if (edge || dy === C.floor || dy === C.ceil) put(u, dy, v, dy === C.floor && !edge ? (r(31, u, dy, v) < 0.55 ? B.BRICK : B.COBBLE) : cryptStone(u, dy, v));
      else put(u, dy, v, B.AIR);
    }
  }
  for (let v = C.v0; v <= C.v1; v++) for (let dy = C.floor + 1; dy < C.ceil; dy++) put(17, dy, v, cryptStone(17, dy, v)); // the treasury's wall
  put(17, C.floor + 1, 14, B.AIR); put(17, C.floor + 2, 14, B.AIR); // its narrow doorway
  put(17, C.floor + 3, 14, `${B.BARS}#e`); // what is left of its grate
  for (const u of [21, 25]) for (const v of [12, 16]) for (let dy = C.floor + 1; dy < C.ceil; dy++) put(u, dy, v, cryptStone(u, dy, v)); // pillars
  for (const [ua, ub, v] of [[19, 20, 10], [19, 20, 18], [23, 24, 18]]) for (const u of [ua, ub]) { put(u, C.floor + 1, v, B.BRICK); put(u, C.floor + 2, v, B.SLAB); } // sarcophagi
  for (const [u, v, f] of [[19, 9, 'n'], [23, 9, 'n'], [21, 19, 's'], [25, 19, 's'], [14, 9, 'n'], [14, 19, 's']]) put(u as number, C.floor + 3, v as number, `${B.SCONCE}#${f}`);
  // the stair down from the great hall (north-east corner): a trench in the hall floor over a ramp of steps
  for (let k = 1; k <= 7; k++) {
    const v = 9 + k;
    for (const u of [27, 28]) {
      for (let dy = C.floor; dy <= -1 - k; dy++) put(u, dy, v, dy === -1 - k ? (k % 3 === 0 ? B.CRACKED : B.BRICK) : cryptStone(u, dy, v));
      for (let dy = -k; dy <= -1; dy++) put(u, dy, v, B.AIR);
    }
  }

  // ---------------------------------------------------------------- 10. the chests
  for (const c of CHESTS) put(c.u, c.dy, c.v, B.CHEST);

  // what the rest of the mod reads: the chests (world cells), the crypt's floor cells, the levels
  const chests = CHESTS.map((c) => { const [wx, wz] = world(c.u, c.v); return Object.freeze({ room: c.room, table: `creatures:${c.table}`, x: wx, y: F + c.dy, z: wz }); });
  const cryptCells = [];
  for (let u = C.u0 + 1; u < C.u1; u++) for (let v = C.v0 + 1; v < C.v1; v++) {
    if (get(u, C.floor + 1, v) !== B.AIR || get(u, C.floor + 2, v) !== B.AIR || get(u, C.floor, v) === B.AIR) continue;
    const [wx, wz] = world(u, v);
    cryptCells.push(Object.freeze({ x: wx, y: F + C.floor + 1, z: wz, treasury: u <= TREASURY.u1 }));
  }
  // where the residents can stand: the courtyard floor (3 cells of air for the colossus) and the tops of the walls and towers
  const OPEN = new Set(['', B.AIR, B.SCONCE, B.BANNER, B.BANNER_TAIL]);
  const at = (lx: number, dy: number, lz: number) => splitFacing(palette[vol[((dy + Y_BELOW) * S + lz) * S + lx]] ?? '')[0];
  const yardCells = [], wallCells = [];
  for (let lz = 0; lz < S; lz++) for (let lx = 0; lx < S; lx++) {
    const c = cls[lz * S + lx];
    if (c === CLS.YARD && !OPEN.has(at(lx, -1, lz)) && [0, 1, 2].every((dy) => at(lx, dy, lz) === B.AIR)) yardCells.push(Object.freeze({ x: x0 + lx, y: F, z: z0 + lz }));
    if (c === CLS.WALL || c === CLS.TOWER || c === CLS.GATE) {
      for (let dy = Y_ABOVE - 2; dy >= 5; dy--) {
        if (OPEN.has(at(lx, dy - 1, lz))) continue;
        if (at(lx, dy, lz) === B.AIR && at(lx, dy + 1, lz) === B.AIR) wallCells.push(Object.freeze({ x: x0 + lx, y: F + dy, z: z0 + lz }));
        break;
      }
    }
  }
  const center = world(MID, MID);
  return Object.freeze({
    x0, z0, F, rot, yBase, vol, cls, palette: Object.freeze(palette), chests: Object.freeze(chests), cryptCells: Object.freeze(cryptCells), yardCells: Object.freeze(yardCells), wallCells: Object.freeze(wallCells),
    towers: Object.freeze(towers.map((t) => { const [wx, wz] = world(t.cu, t.cv); return Object.freeze({ x: wx, z: wz, top: F + t.th }); })),
    center: Object.freeze({ x: center[0], z: center[1] }),
    gate: Object.freeze((() => { const [wx, wz] = world(21, 42); return { x: wx, y: F, z: wz }; })()),
    collapseSide,
    world, get, getCls,
  });
}

/** The palette entry -> [block name, facing | null]. */
export function splitFacing(entry: string) {
  const i = entry.indexOf('#');
  return i < 0 ? [entry, null] : [entry.slice(0, i), entry.slice(i + 1)];
}
