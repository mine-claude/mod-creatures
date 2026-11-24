// @ts-check
// The pixel art of the structures' blocks (the abandoned village and the goblin camp), painted by code: 16 x 16, original,
// no image from anywhere. tools/gen-structure-textures.ts writes each painter to textures/structures/<name>.png; `--check`
// compares with the committed files. A texture name here is the one the block's `tiles` cite (creatures:<name>).
import { CLEAR, blob, hash, hex, pick, shade, type Painter, type Rgba } from './pixel.ts';

const STRAW = ['#9a7a30', '#ae8a3a', '#c09a44', '#cfab52', '#dcbb62', '#e4c870'];
const WOOD = ['#5b4027', '#664a2e', '#715234', '#7c5b3a'];
const WOOD_DARK = ['#3d2a19', '#46311d', '#503822'];
const STONE = ['#6b6b66', '#77776f', '#83827a', '#8f8d84'];
const MOSS = ['#3d6b25', '#4a7c2b', '#579033', '#66a23c'];
const LEAF = ['#2f5c1e', '#3b6e24', '#4a822c', '#5a9634'];
const HIDE = ['#a98762', '#b8966d', '#c4a37a', '#cfb087', '#d8bc94'];
const HIDE_DARK = ['#7a5a3c', '#8a6846'];
const IRON = ['#4a4a4e', '#5b5b60', '#6e6e74'];
const BONE = ['#cfc6a8', '#ddd4b6', '#e8e0c4'];

// straw thatch: bundles of stalks laid down the slope, so the strands run VERTICALLY with a ragged, shadowed lip at the foot of
// each course (the courses overlap); a few dark, older stalks and pale sun-bleached ones. Never board-like: no straight seams.
const strand = (x: number, y: number, salt: number) => {
  const col = hash(x, Math.floor((y + (x * 7) % 5) / 6), salt) * 0.55 + hash(x, y, salt + 1) * 0.25 + (x % 2) * 0.12;
  if (hash(x, y >> 2, salt + 2) > 0.95) return hex('#8a6a28'); // an older, darker stalk (a short vertical line)
  if (hash(x, y >> 2, salt + 3) > 0.94) return hex('#ecd48a'); // a sun-bleached one
  return pick(STRAW, Math.min(0.99, col));
};
const thatchTop: Painter = (x, y) => {
  const lip = (y + Math.floor(hash(x, 0, 104) * 3)) % 6; // the foot of each course, a little ragged
  if (lip === 5) return shade(strand(x, y, 101), 0.62);
  if (lip === 4) return shade(strand(x, y, 101), 0.84);
  return strand(x, y, 101);
};
const thatchSide: Painter = (x, y) => {
  // the cut ends of the bundles: short stalk ends at the eave, darker between them
  const lip = (y + Math.floor(hash(x, 1, 114) * 2)) % 8;
  if (lip >= 6) return shade(strand(x, y, 111), lip === 7 ? 0.58 : 0.8);
  if ((x + Math.floor(y / 8)) % 3 === 0 && hash(x, y, 112) > 0.5) return shade(strand(x, y, 111), 0.88);
  return strand(x, y, 111);
};

// weathered planks: grey-brown boards, cracks, nail heads and a few greenish stains
const oldPlanks: Painter = (x, y) => {
  const board = Math.floor(y / 4), edge = y % 4 === 3;
  const shift = Math.floor(hash(board, 0, 121) * 16), seam = (x + shift) % 16 === 0;
  if (edge || seam) return pick(WOOD_DARK, hash(x, y, 122));
  if ((x + shift) % 16 === 1 && y % 4 === 1) return hex('#2a2622'); // a nail
  const grain = blob(x, y + board * 7, 123, 4) * 0.5 + hash(x, y, 124) * 0.5;
  const c = pick(WOOD, grain);
  const grey = (c[0] + c[1] + c[2]) / 3;
  const weathered: Rgba = [Math.round(c[0] * 0.6 + grey * 0.4), Math.round(c[1] * 0.6 + grey * 0.4), Math.round(c[2] * 0.6 + grey * 0.4), 255];
  return hash(x, y, 125) > 0.96 ? pick(MOSS, 0.2) : weathered;
};

// cobblestone half eaten by moss: rounded stones, mortar, moss in the gaps and over the tops
const mossyCobble: Painter = (x, y) => {
  const cx = Math.floor((x + (Math.floor(y / 5) % 2) * 2) / 5), cy = Math.floor(y / 5);
  const lx = (x + (Math.floor(y / 5) % 2) * 2) % 5, ly = y % 5;
  const gap = lx === 4 || ly === 4;
  const m = blob(x, y, 131, 4);
  if (gap) return m > 0.45 ? pick(MOSS, hash(x, y, 132)) : hex('#4a4842');
  if (m > 0.62) return pick(MOSS, hash(x, y, 133));
  const c = pick(STONE, hash(cx, cy, 134) * 0.7 + hash(x, y, 135) * 0.3);
  return lx === 0 || ly === 0 ? shade(c, 1.12) : c;
};

// vines: stems that wander down with leaves on both sides, the rest see-through
const vines: Painter = (x, y) => {
  for (const sx of [3, 8, 13]) {
    const stem = sx + Math.round(Math.sin((y + sx) * 0.7) * 1.2);
    if (x === stem && hash(sx, y, 141) > 0.1) return hex('#2c4a1a');
    if (Math.abs(x - stem) <= 2 && hash(x, y, 142 + sx) > 0.55 && (y + sx) % 3 !== 0) return pick(LEAF, hash(x, y, 143));
  }
  return CLEAR;
};

// a table top: three boards with a worn ring where a mug stood
const tableTop: Painter = (x, y) => {
  const board = Math.floor(x / 5.34);
  if (Math.floor((x + 1) / 5.34) !== board) return pick(WOOD_DARK, hash(x, y, 151));
  const dx = x - 10, dy = y - 5, r = Math.sqrt(dx * dx + dy * dy);
  if (r > 1.6 && r < 2.6) return shade(pick(WOOD, 0.5), 0.82);
  return pick(WOOD, blob(x, y, 152, 4) * 0.4 + hash(x, y, 153) * 0.6);
};

// barrel: vertical staves with two iron hoops; the lid with its boards and a bung
const barrelSide: Painter = (x, y) => {
  if (y === 3 || y === 4 || y === 11 || y === 12) return pick(IRON, hash(x, y, 161) * 0.5 + (y % 2) * 0.4);
  if (x % 4 === 0) return pick(WOOD_DARK, hash(x, y, 162));
  return pick(WOOD, hash(x, y, 163) * 0.7 + 0.2);
};
const barrelTop: Painter = (x, y) => {
  const dx = x - 7.5, dy = y - 7.5, r = Math.sqrt(dx * dx + dy * dy);
  if (r > 6.5) return pick(IRON, hash(x, y, 171));
  if (Math.abs(dx - 2) < 1 && Math.abs(dy + 1) < 1) return hex('#2e2116'); // the bung
  return x % 5 === 0 ? pick(WOOD_DARK, hash(x, y, 172)) : pick(WOOD, hash(x, y, 173));
};

// a shelf seen from the front: boards, with jars, a bundle of herbs and a few old books standing on them
const shelf: Painter = (x, y) => {
  if (y === 0 || y === 7 || y === 8 || y === 15) return pick(WOOD, hash(x, y, 181) * 0.5 + 0.4);
  if (x === 0 || x === 15) return pick(WOOD_DARK, hash(x, y, 182));
  const top = y < 7;
  const slot = Math.floor((x - 1) / 3.5), seed = slot + (top ? 0 : 10);
  const kind = Math.floor(hash(seed, 0, 183) * 4), lx = (x - 1) % 3.5;
  const base = top ? 6 : 14, tall = 3 + Math.floor(hash(seed, 1, 184) * 3);
  if (y > base - tall && lx >= 0.5 && lx < 3) {
    if (kind === 0) return y === base - tall + 1 ? hex('#7a5a3a') : pick(['#5b8fa8', '#6aa0b8', '#4d7d96'], hash(x, y, 185)); // a jar
    if (kind === 1) return shade(pick(['#7a2e2a', '#2e4a7a', '#4a6a2e', '#6a4a2a'], hash(Math.floor(x), seed, 186)), y === base - tall + 1 ? 1.25 : 1); // books
    if (kind === 2) return y < base - tall + 2 ? pick(LEAF, hash(x, y, 188)) : hex('#6b5a3a'); // herbs
  }
  return pick(WOOD_DARK, hash(x, y, 189) * 0.6);
};

// a straw pallet: a patched woollen blanket on top, straw bulging out of the sides
const strawBedTop: Painter = (x, y) => {
  if (y < 4) return pick(['#d8d0bc', '#e4dccb', '#ccc4ae'], hash(x, y, 191)); // the pillow end
  const patch = (Math.floor(x / 5) + Math.floor((y - 4) / 4)) % 3;
  const c = pick([['#7a3e34', '#86463a'], ['#5e5a72', '#6a667e'], ['#6e6238', '#7a6e42']][patch], hash(x, y, 192));
  if ((x % 5 === 0 || (y - 4) % 4 === 0) && hash(x, y, 193) > 0.3) return shade(c, 0.7); // stitches
  return c;
};
const strawSide: Painter = (x, y) => pick(STRAW, hash(x, y, 201) * 0.7 + (y % 2) * 0.2);

// an old lantern: dark iron frame, warm glass panes
const lantern: Painter = (x, y) => {
  if (x <= 1 || x >= 14 || y <= 1 || y >= 14 || x === 7 || x === 8) return pick(IRON, hash(x, y, 211));
  const d = Math.abs(x - 7.5) + Math.abs(y - 8);
  return d < 4 ? hex('#ffe9a0') : d < 7 ? hex('#ffc860') : hex('#e09a3a');
};

// a crate: a frame of darker slats with a diagonal brace
const crate: Painter = (x, y) => {
  if (x <= 1 || x >= 14 || y <= 1 || y >= 14) return pick(WOOD_DARK, hash(x, y, 221) * 0.6 + 0.3);
  if (Math.abs(x - y) <= 1) return pick(WOOD, 0.85 + hash(x, y, 222) * 0.1);
  return pick(WOOD, hash(x, y, 223) * 0.6);
};

// banners: the cloth (frayed at the bottom), hanging from a pole; the village's faded blue with a wheat sheaf,
// the goblins' rust red with a crude white hand
const banner = (cloth: string[], mark: (x: number, y: number) => boolean, salt: number): Painter => (x, y) => {
  if (y <= 1) return pick(WOOD, hash(x, y, salt));
  if (y >= 13 && hash(x, 0, salt + 1) * 3 + 13 < y) return CLEAR; // torn hem
  if (mark(x, y)) return hex('#e4dcc4');
  return pick(cloth, blob(x, y, salt + 2, 4) * 0.6 + hash(x, y, salt + 3) * 0.4);
};
const villageBanner = banner(['#3e5a78', '#4a6888', '#56769a', '#5f7f9e'],
  (x, y) => (x === 7 || x === 8) && y >= 4 && y <= 11 || (y === 5 && x >= 5 && x <= 10) || (y === 4 && (x === 5 || x === 10)), 231);
const goblinBanner = banner(['#7a2e1e', '#8a3624', '#963e2a', '#a24a30'],
  (x, y) => (y >= 8 && y <= 11 && x >= 5 && x <= 10) || (y >= 4 && y < 8 && (x === 5 || x === 7 || x === 9 || x === 10) && hash(x, y, 241) > 0.2), 245);

// hide: tanned skins stretched and lashed: pale, uneven leather with darker scraped patches, a stitched seam (a cross of
// thread) and the odd tuft of fur at the edge — soft blobs, no straight boards
const hide: Painter = (x, y) => {
  if ((x === 5 && y % 3 !== 2) || (y === 10 && x % 3 !== 0)) return hex('#4a3420'); // the seams' stitches
  if ((x === 4 || x === 6) && y % 3 === 1) return hex('#5a4028');
  if (y === 15 && hash(x, y, 254) > 0.4) return pick(HIDE_DARK, hash(x, y, 255)); // fur at the edge
  const p = blob(x, y, 251, 8) * 0.6 + blob(x, y, 256, 4) * 0.4;
  if (p > 0.72) return pick(HIDE_DARK, hash(x, y, 252));
  return pick(HIDE, Math.min(0.99, p * 0.7 + hash(x, y, 253) * 0.3 + 0.1));
};
// a stick pole: bark with knots
const stick: Painter = (x, y) => {
  if (hash(x >> 1, y >> 1, 261) > 0.94) return hex('#3e2c1a'); // a knot
  const grain = (x + Math.floor(hash(0, y >> 2, 263) * 2)) % 3 === 0;
  const c = pick(['#6e5232', '#7a5c38', '#86663e', '#90703f'], hash(x, y, 262) * 0.5 + 0.3);
  return grain ? shade(c, 0.8) : c;
};
// a totem: sticks lashed with cord, feathers tied on
const totem: Painter = (x, y) => {
  if (y % 6 === 2 || y % 6 === 3) return pick(['#b0905a', '#c0a066'], hash(x, y, 271)); // the lashing
  if ((y === 9 || y === 10) && x >= 11) return pick(['#2e6a7a', '#3a7a8a', '#d0c8b0'], hash(x, y, 272)); // a feather
  return stick(x, y);
};
// a skull: bone, two dark eye holes, a nose slit and teeth; a few painted ochre stripes
const skull: Painter = (x, y) => {
  const eye = (Math.abs(x - 4.5) < 1.6 || Math.abs(x - 10.5) < 1.6) && y >= 5 && y <= 7;
  if (eye) return hex('#1c1610');
  if (x >= 7 && x <= 8 && y >= 9 && y <= 10) return hex('#2a2018');
  if (y >= 12 && y <= 13 && x >= 3 && x <= 12) return x % 2 === 0 ? hex('#2a2018') : pick(BONE, 0.9);
  if (y === 2 && x >= 4 && x <= 11) return hex('#a84a24');
  return pick(BONE, blob(x, y, 281, 4) * 0.5 + hash(x, y, 282) * 0.5);
};
// a drying rack: strips of hide and meat hanging from a pole
const rack: Painter = (x, y) => {
  if (y <= 1) return stick(x, y);
  const strip = Math.floor(x / 4), lx = x % 4;
  const len = 9 + Math.floor(hash(strip, 0, 291) * 5);
  if (lx >= 1 && lx <= 2 && y <= len) return strip % 2 ? pick(['#7a2e22', '#8a3a2a', '#6a2a1e'], hash(x, y, 292)) : pick(HIDE, hash(x, y, 293));
  return CLEAR;
};
// the campfire: grey ash with glowing embers on top, the logs' bark and charred ends on the side
const campfireTop: Painter = (x, y) => {
  const dx = x - 7.5, dy = y - 7.5, r = Math.sqrt(dx * dx + dy * dy);
  if (r > 6.4) return pick(STONE, hash(x, y, 301));
  if (hash(x, y, 302) > 0.8) return pick(['#ff9a2a', '#ffcc4a', '#e2561e'], hash(x, y, 303));
  return pick(['#3a3430', '#4a423c', '#2c2622'], hash(x, y, 304));
};
const campfireSide: Painter = (x, y) => {
  if (y >= 13) return pick(STONE, hash(x, y, 311));
  if (x <= 1 || x >= 14) return pick(['#1e1814', '#2a221c'], hash(x, y, 312)); // charred ends
  return pick(['#4a3420', '#56402a', '#3e2c1a'], hash(x, y, 313) * 0.6 + (y % 3) * 0.15);
};
// the well's winch: a wooden roller wound with rope
const winch: Painter = (x, y) => {
  if (y >= 6 && y <= 9) return (x + y) % 3 === 0 ? hex('#8a7a54') : pick(['#b8a272', '#c8b282'], hash(x, y, 321));
  return pick(WOOD, hash(x, y, 322));
};
// the village's old chest: planks with iron bands and a lock plate
const villageChestSide: Painter = (x, y) => {
  if (y === 5 || y === 6) return pick(IRON, hash(x, y, 331)); // the seam band
  if (x === 1 || x === 14) return pick(IRON, hash(x, y, 332));
  if (x >= 7 && x <= 8 && y >= 6 && y <= 8) return hex('#8a7a3a'); // the lock
  return oldPlanks(x, y);
};
const villageChestTop: Painter = (x, y) => {
  if (x === 1 || x === 14 || y === 1 || y === 14) return pick(IRON, hash(x, y, 341));
  return oldPlanks(x, y);
};
// the goblins' loot chest: a box wrapped in hide, tied with cord, a bone toggle
const goblinChestSide: Painter = (x, y) => {
  if (x === 4 || x === 11) return pick(['#b0905a', '#c0a066'], hash(x, y, 351)); // the cord
  if (y >= 6 && y <= 8 && x >= 6 && x <= 9) return pick(BONE, hash(x, y, 352));
  return hide(x, y);
};
const goblinChestTop: Painter = (x, y) => {
  if (x === 4 || x === 11 || y === 7) return pick(['#b0905a', '#c0a066'], hash(x, y, 361));
  return hide(x, y);
};

/** Every painter, by texture name (textures/structures/<name>.png, registered as creatures:<name>). */
export const STRUCTURE_ART: Readonly<Record<string, Painter>> = Object.freeze({
  thatch_top: thatchTop, thatch_side: thatchSide, old_planks: oldPlanks, mossy_cobble: mossyCobble, vines,
  table_top: tableTop, barrel_side: barrelSide, barrel_top: barrelTop, shelf, straw_bed_top: strawBedTop, straw_side: strawSide,
  old_lantern: lantern, crate, village_banner: villageBanner, goblin_banner: goblinBanner, hide, stick, totem, skull, drying_rack: rack,
  campfire_top: campfireTop, campfire_side: campfireSide, well_winch: winch,
  village_chest_side: villageChestSide, village_chest_top: villageChestTop, goblin_chest_side: goblinChestSide, goblin_chest_top: goblinChestTop,
});
