// @ts-check
// The two outposts as PLANS: pure lists of [dx, dy, dz, block] relative to the structure's north-west corner (dx, dz) and its
// standing level (dy = 0 is the first cell of air over the floor). The generator stage (stage.ts) clears the footprint, lays
// the foundations and then writes the plan in order (a later entry wins); the tests read the same plans to check that the
// floors are connected, the chest is reachable and the altar sits in the middle of the ring. No world access here: only
// `rand(salt, wx, wz)` (a hash of WORLD coordinates) for the shrine's wear, so every side draws the same ruin.
import { BASE, BLOCK } from './names.ts';

/** @typedef {[number, number, number, string]} Cell */

// ---------------------------------------------------------------- the Watchtower (Torre de Vigia)
// Footprint 9 (x) by 12 (z): the tower's body is the 7 x 7 at x 1..7, z 1..7 (posts at its corners), the lookout above it
// overhangs to the whole 9 x 9 (x 0..8, z 0..8), and the practice yard with the archery target is z 9..11, in front of the
// door (south side). Three rooms (ground dy 0..2, middle dy 4..6, upper dy 8..10 with wide lookout windows) and the lookout
// on top (dy 12), joined by three straight flights of planks stairs (the engine has no ladder; stairs are what a body
// climbs without jumping): west wall going north, east wall going south, west wall going north again.
export const TOWER = Object.freeze({
  W: 9, D: 12,
  floors: [-1, 3, 7, 11], // dy of the floor blocks: ground, middle, upper, lookout
  lookout: 12, // dy a body stands at on the lookout
  roof: 16,
  chest: [6, 12, 6],
  lantern: [4, 14, 4],
  target: [4, 0, 11],
  door: [4, 0, 7],
  // where the garrison stands on the lookout (none under a beam: summon looks for the ground from 4 above)
  garrison: [[3, 12, 6], [5, 12, 2], [3, 12, 2]],
  body: [1, 7], // x and z range of the body (walls on its border)
});

const STAIRS: Array<[number, number, number, string]> = [
  // flight A, ground -> middle: along the west wall, climbing north (high side north = 'n')
  [2, 0, 6, BASE.stairsN], [2, 1, 5, BASE.stairsN], [2, 2, 4, BASE.stairsN], [2, 3, 3, BASE.stairsN],
  // flight B, middle -> upper: along the east wall, climbing south
  [6, 4, 2, BASE.stairsS], [6, 5, 3, BASE.stairsS], [6, 6, 4, BASE.stairsS], [6, 7, 5, BASE.stairsS],
  // flight C, upper -> lookout: along the west wall, climbing north
  [2, 8, 6, BASE.stairsN], [2, 9, 5, BASE.stairsN], [2, 10, 4, BASE.stairsN], [2, 11, 3, BASE.stairsN],
];
// the stairwell openings in the floor above each flight (head room)
const HOLES: Array<[number, number, number]> = [[2, 3, 4], [2, 3, 5], [6, 7, 3], [6, 7, 4], [2, 11, 4], [2, 11, 5]];
export const TOWER_STAIRS = Object.freeze(STAIRS.map((s) => Object.freeze([...s])));

/** The watchtower's plan, in writing order. @returns {Cell[]} */
export function towerPlan() {
  const out: Array<[number, number, number, string]> = [];
  const put = (x: number, y: number, z: number, b: string) => { out.push([x, y, z, b]); };
  const [b0, b1] = TOWER.body;
  const border = (x: number, z: number) => x === b0 || x === b1 || z === b0 || z === b1;
  const corner = (x: number, z: number) => (x === b0 || x === b1) && (z === b0 || z === b1);
  // the ground floor and the two inner floors
  for (let z = b0; z <= b1; z++) for (let x = b0; x <= b1; x++) put(x, -1, z, BASE.planks);
  for (const fy of [3, 7]) for (let z = b0 + 1; z < b1; z++) for (let x = b0 + 1; x < b1; x++) put(x, fy, z, BASE.planks);
  // the walls (planks) with a band of squared timber at each floor
  for (let z = b0; z <= b1; z++) for (let x = b0; x <= b1; x++) {
    if (!border(x, z) || corner(x, z)) continue;
    for (let y = 0; y <= 10; y++) put(x, y, z, y === 3 || y === 7 ? BLOCK.post : BASE.planks);
  }
  // the door (south), two small windows below, a row of three in the middle room, wide lookout windows in the upper room
  put(4, 0, b1, BASE.air); put(4, 1, b1, BASE.air);
  put(b0, 1, 4, BASE.air); put(b1, 1, 4, BASE.air);
  for (let k = 3; k <= 5; k++) {
    for (const y of [5]) { put(k, y, b0, BASE.air); put(k, y, b1, BASE.air); put(b0, y, k, BASE.air); put(b1, y, k, BASE.air); }
    for (const y of [8, 9]) { put(k, y, b0, BASE.air); put(k, y, b1, BASE.air); put(b0, y, k, BASE.air); put(b1, y, k, BASE.air); }
  }
  // the lookout floor, overhanging the body by one on every side
  for (let z = 0; z <= 8; z++) for (let x = 0; x <= 8; x++) put(x, 11, z, BASE.planks);
  // the stairs and their openings
  for (const [x, y, z, b] of STAIRS) put(x, y, z, b);
  for (const [x, y, z] of HOLES) put(x, y, z, BASE.air);
  // the four corner posts, from the ground to the roof beams
  for (const [x, z] of [[b0, b0], [b1, b0], [b0, b1], [b1, b1]]) for (let y = 0; y <= 14; y++) put(x, y, z, BLOCK.post);
  // the lookout's railing on its rim (each piece runs along the rim), and around the stairwell
  for (let x = 0; x <= 8; x++) { put(x, 12, 0, BLOCK.railing); put(x, 12, 8, BLOCK.railing); }
  for (let z = 1; z <= 7; z++) { put(0, 12, z, BLOCK.railingZ); put(8, 12, z, BLOCK.railingZ); }
  put(1, 12, 4, BLOCK.railingZ); put(1, 12, 5, BLOCK.railingZ); put(3, 12, 4, BLOCK.railingZ); put(3, 12, 5, BLOCK.railingZ); put(2, 12, 6, BLOCK.railing);
  // the roof: a frame of beams on the posts (a ring and one across the middle) under a roof of planks slabs
  for (let k = b0; k <= b1; k++) { put(k, 15, b0, BLOCK.post); put(k, 15, b1, BLOCK.post); put(b0, 15, k, BLOCK.post); put(b1, 15, k, BLOCK.post); put(k, 15, 4, BLOCK.post); }
  for (let z = 0; z <= 8; z++) for (let x = 0; x <= 8; x++) put(x, TOWER.roof, z, BASE.slab);
  // the showpiece: a lantern hanging from the middle beam over the lookout; the chest of the archers in its corner
  put(...TOWER.lantern as [number, number, number], BLOCK.lantern);
  put(...TOWER.chest as [number, number, number], BASE.chest);
  // inside: a weapon rack on the north wall of the ground room and of the middle room, a torch on each floor
  put(4, 0, 2, BLOCK.rack); put(4, 4, 2, BLOCK.rack);
  put(5, 0, 5, BASE.torch); put(4, 4, 5, BASE.torch); put(4, 8, 3, BASE.torch);
  // the practice yard: a gravel path from the door to the target
  for (let z = 8; z <= 11; z++) put(4, -1, z, BASE.gravel);
  put(...TOWER.target as [number, number, number], BLOCK.target);
  return out;
}

// ---------------------------------------------------------------- the Forgotten Shrine (Santuário Esquecido)
// Footprint 9 x 9 (x, z 0..8), centre (4, 4): a round floor of old flagstones (cobblestone, ancient stone and a few glyph
// stones near the altar), a ring of eight mossy pillars (radius 3: the four cardinal ones whole, three drums high, the
// diagonal ones broken by the years), the offering altar in the middle with four candles around it, the chest behind it
// and creeping vines at the foot of the pillars and over the broken tops.
export const SHRINE = Object.freeze({
  W: 9, D: 9,
  centre: [4, 4],
  altar: [4, 0, 4],
  chest: [4, 0, 6],
  pillars: Object.freeze([[1, 4], [7, 4], [4, 1], [4, 7], [2, 2], [6, 2], [2, 6], [6, 6]].map((p) => Object.freeze(p))),
  candles: Object.freeze([[3, 3], [5, 5], [3, 5], [5, 3]].map((p) => Object.freeze(p))),
  floorR2: 18, // squared radius of the floor
  clearR2: 20, // squared radius cleared of terrain and plants above the floor
  // where the disguised lurkers lie (inside the ring, off the paths)
  garrison: [[1, 0, 1], [7, 0, 7]],
});

/**
 * The shrine's plan, in writing order.
 * @param {(salt: number, wx: number, wz: number) => number} rand a hash in [0, 1) of world coordinates
 * @param {number} ox world x of the north-west corner
 * @param {number} oz world z of the north-west corner
 * @returns {Cell[]}
 */
export function shrinePlan(rand: (salt: number, wx: number, wz: number) => number, ox: number, oz: number) {
  const out: Array<[number, number, number, string]> = [];
  const put = (x: number, y: number, z: number, b: string) => { out.push([x, y, z, b]); };
  const [cx, cz] = SHRINE.centre;
  // the floor: old flagstones, the glyph stones close to the altar, a crumbled (gravel) one here and there
  for (let z = 0; z < SHRINE.D; z++) for (let x = 0; x < SHRINE.W; x++) {
    const d2 = (x - cx) ** 2 + (z - cz) ** 2;
    if (d2 > SHRINE.floorR2) continue;
    const r = rand(1, ox + x, oz + z);
    const b = d2 <= 2 && r < 0.5 ? BASE.glyph : r < 0.07 ? BASE.gravel : r < 0.55 ? BASE.cobble : BASE.ancient;
    put(x, -1, z, b);
  }
  // the ring of pillars: cardinal ones whole (3 drums), diagonal ones broken (1..3)
  SHRINE.pillars.forEach(([x, z], i) => {
    const whole = i < 4;
    const height = whole ? 3 : 1 + Math.floor(rand(2, ox + x, oz + z) * 3);
    for (let y = 0; y < height; y++) put(x, y, z, BLOCK.pillar);
    // vines: over a broken top, and creeping at the foot on the outer side
    if (!whole && height < 3 && rand(3, ox + x, oz + z) < 0.75) put(x, height, z, BLOCK.vine);
    const ux = Math.sign(x - cx), uz = Math.sign(z - cz);
    const fx = x + ux, fz = z + uz;
    if (fx >= 0 && fx < SHRINE.W && fz >= 0 && fz < SHRINE.D && (fx - cx) ** 2 + (fz - cz) ** 2 <= SHRINE.floorR2 && rand(4, ox + fx, oz + fz) < 0.6) put(fx, 0, fz, BLOCK.vine);
  });
  // the altar (with its floating relic: a block-entity renderer) and the four candles around it
  put(...SHRINE.altar as [number, number, number], BLOCK.altar);
  for (const [x, z] of SHRINE.candles) put(x, 0, z, BLOCK.candle);
  // the offerings' chest, behind the altar
  put(...SHRINE.chest as [number, number, number], BASE.chest);
  return out;
}
