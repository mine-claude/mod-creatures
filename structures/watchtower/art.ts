// @ts-check
// The pixel art of the two outposts: 16 x 16 painters (x, y) -> [r, g, b, a], deterministic (a pure integer hash, no
// Math.random), original. tools/gen-structure-textures.ts writes them to textures/structures/watchtower/<name>.png (`--check`
// only compares). Nothing here runs in the game.

export type Rgba = [number, number, number, number];
export type Painter = (x: number, y: number) => Rgba;

function hash(x: number, y: number, salt = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const hex = (c: string): Rgba => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255];
const CLEAR: Rgba = [0, 0, 0, 0];
const pick = (palette: string[], v: number) => hex(palette[Math.min(palette.length - 1, Math.floor(v * palette.length))]);
const shade = (c: Rgba, k: number): Rgba => [Math.max(0, Math.min(255, Math.round(c[0] * k))), Math.max(0, Math.min(255, Math.round(c[1] * k))), Math.max(0, Math.min(255, Math.round(c[2] * k))), c[3]];

// ---------------------------------------------------------------- wood of the tower
const TIMBER = ['#6b4a2c', '#755233', '#7f5a38', '#6f4d2f'];
/** squared timber, side: vertical grain, a darker adze stripe on each edge, a few knots and nail heads */
const postSide: Painter = (x, y) => {
  if (x === 0 || x === 15) return hex('#4a321d');
  if (x === 1 || x === 14) return hex('#5a3d24');
  const grain = Math.floor(hash(x, 0, 11) * 4 + (y + Math.floor(hash(x, 1, 12) * 16)) / 6) % 4;
  let c = pick(TIMBER, grain / 4);
  if ((x === 5 || x === 10) && hash(x, y >> 2, 13) < 0.45) c = shade(c, 0.82);
  const kx = 7 + Math.floor(hash(1, 2, 14) * 3), ky = 4 + Math.floor(hash(2, 1, 15) * 6);
  if ((x - kx) ** 2 + (y - ky) ** 2 <= 2) c = hex((x - kx) ** 2 + (y - ky) ** 2 === 0 ? '#3e2a17' : '#553a22');
  if ((y === 2 || y === 13) && (x === 3 || x === 12)) c = hex('#8c8f92');
  return c;
};
/** squared timber, end grain: growth rings around an off-centre pith, a sawn edge */
const postTop: Painter = (x, y) => {
  if (x === 0 || y === 0 || x === 15 || y === 15) return hex('#4a321d');
  const d = Math.hypot(x - 7.2, y - 8.1) + hash(x, y, 21) * 0.6;
  const ring = Math.floor(d) % 3;
  return hex(ring === 0 ? '#8a6640' : ring === 1 ? '#a07a4e' : '#94704a');
};
/** the railing's lighter, weathered wood (grain along u) */
const railWood: Painter = (x, y) => {
  const g = Math.floor(hash(0, y, 31) * 3 + x / 5 + hash(x >> 2, y, 32) * 0.8) % 3;
  let c = hex(['#8d6b44', '#9a774d', '#82623d'][g]);
  if (y % 4 === 0) c = shade(c, 0.9);
  return c;
};
/** the weapon rack's dark stained wood with a carved notch pattern */
const rackWood: Painter = (x, y) => {
  let c = pick(['#4b3221', '#553928', '#4f3524'], hash(x, y >> 1, 41));
  if ((x + y) % 7 === 0 && y % 4 < 2) c = hex('#6b4a32');
  return c;
};
/** the yew of the racked bows: dark red-brown, a pale belly line */
const bowWood: Painter = (x, y) => (x % 4 === 1 ? hex('#a8703a') : pick(['#6e381c', '#7a4022', '#63321a'], hash(x, y, 51)));
/** the bowstrings and the arrows' shafts: pale linen and birch */
const linen: Painter = (x, y) => pick(['#e8dfc4', '#d8ceb0', '#efe7d0'], hash(x, y, 52));
/** fletching: the sentinels' four feather colours in bands */
const fletch: Painter = (x, y) => hex(['#3c5a3a', '#8a3a2e', '#2c2a28', '#a7804c'][Math.floor(x / 4)]);

// ---------------------------------------------------------------- the archery target
/** the face: a straw boss with painted rings (ochre straw, then leaf-green, cream, rust and a dark heart) */
const targetFace: Painter = (x, y) => {
  const d = Math.hypot(x - 7.5, y - 7.5);
  const straw = pick(['#c9a95a', '#b8964c', '#d6b866'], hash(x, y, 61));
  if (d > 7.3) return straw;
  const ring = d < 1.6 ? '#2a1d14' : d < 3.1 ? '#a3402a' : d < 4.6 ? '#eadfc0' : d < 6.1 ? '#4f7a3a' : null;
  if (!ring) return straw;
  let c = hex(ring);
  if (hash(x, y, 62) < 0.18) c = shade(c, 0.84); // the paint soaked unevenly into the straw
  if ((x === 9 && y === 6) || (x === 5 && y === 10) || (x === 10 && y === 10)) c = hex('#1a1410'); // old arrow holes
  return c;
};
/** the boss's sides: bundled straw with two cords around it */
const targetStraw: Painter = (x, y) => {
  if (y === 4 || y === 11) return hex('#6b4a2c');
  let c = pick(['#c9a95a', '#b8964c', '#a8873f', '#d6b866'], hash(x >> 1, y, 63));
  if (hash(x, y, 64) < 0.08) c = hex('#8f7234');
  return c;
};

// ---------------------------------------------------------------- the hanging lantern
/** black iron of the hook, the chain and the lantern's frame */
const iron: Painter = (x, y) => {
  let c = pick(['#2e2f33', '#36383c', '#292a2e'], hash(x, y, 71));
  if ((x + y) % 5 === 0) c = hex('#4a4d52');
  return c;
};
/** the item icon: the lantern as it hangs, warm glass in a dark frame */
const lanternIcon: Painter = (x, y) => {
  if (x === 7 || x === 8) { if (y <= 2) return hex('#3a3c40'); }
  if (y === 3 && x >= 5 && x <= 10) return hex('#2e2f33');
  if (y >= 4 && y <= 13 && x >= 4 && x <= 11) {
    if (x === 4 || x === 11 || y === 4 || y === 13 || x === 7 || x === 8 && y % 3 === 0) return hex('#2e2f33');
    const g = Math.hypot(x - 7.5, y - 9) < 2.2;
    return hex(g ? '#fff1b8' : y > 10 ? '#f2a640' : '#ffc95c');
  }
  if (y === 14 && x >= 6 && x <= 9) return hex('#2e2f33');
  return CLEAR;
};

// ---------------------------------------------------------------- the shrine's stone
const STONE = ['#7c8079', '#858a82', '#73776f', '#8e9289'];
const MOSS = ['#4d7a33', '#5d8c3c', '#3f6a2b'];
/** an old column drum: worn grey stone, vertical flutes, cracks and moss creeping up from the base and down from the top */
const pillarSide: Painter = (x, y) => {
  let c = pick(STONE, hash(x >> 1, y, 81) * 0.7 + hash(x, y, 82) * 0.3);
  if (x % 4 === 0) c = shade(c, 0.84); // the flutes
  if (hash(x, y, 83) < 0.04) c = hex('#5c6058');
  const mossy = y >= 12 - Math.floor(hash(x, 0, 84) * 5) || y <= Math.floor(hash(x, 1, 85) * 4) - 1;
  if (mossy && hash(x, y, 86) < 0.8) c = pick(MOSS, hash(x, y, 87));
  return c;
};
/** the drum's top: a worn disc of stone with moss in the cracks */
const pillarTop: Painter = (x, y) => {
  const d = Math.hypot(x - 7.5, y - 7.5);
  let c = pick(STONE, hash(x, y, 88));
  if (d > 6.5) c = shade(c, 0.85);
  if (hash(x >> 1, y >> 1, 89) < 0.25) c = pick(MOSS, hash(x, y, 90));
  return c;
};
/** the altar's side: dressed stone with a band of carved spirals (an original glyph, not a script) */
const altarSide: Painter = (x, y) => {
  let c = pick(['#6f7470', '#787d78', '#666b67'], hash(x, y, 91));
  if (y === 0 || y === 15) c = hex('#555a56');
  if (y >= 5 && y <= 10) {
    const u = x % 6, v = y - 5;
    const spiral = (u === 1 && v >= 1 && v <= 4) || (v === 1 && u >= 1 && u <= 4) || (u === 4 && v >= 1 && v <= 3) || (v === 3 && u >= 2 && u <= 4) || (u === 2 && v === 2);
    if (spiral) c = hex('#3f4441');
    else if (v === 0 || v === 5) c = hex('#5c615d');
  }
  if (y >= 13 && hash(x, y, 92) < 0.5) c = pick(MOSS, hash(x, y, 93));
  return c;
};
/** the altar's top slab: smooth stone, worn darker where the offerings stood */
const altarTop: Painter = (x, y) => {
  const d = Math.hypot(x - 7.5, y - 7.5);
  let c = pick(['#7d827d', '#858a85', '#767b76'], hash(x, y, 94));
  if (d < 4.5) c = shade(c, 0.86);
  if (x === 0 || y === 0 || x === 15 || y === 15) c = hex('#5f645f');
  return c;
};
/** the offering bowl: old bronze, green where the rain ran */
const bronze: Painter = (x, y) => {
  let c = pick(['#8a6a3a', '#9a7742', '#7d5f33'], hash(x, y, 95));
  if (hash(x, y >> 1, 96) < 0.22) c = hex('#4f8a72');
  return c;
};
/** what glows in the bowl: a pale green-gold ember of the relic's light */
const ember: Painter = (x, y) => {
  const d = Math.hypot(x - 7.5, y - 7.5);
  return hex(d < 3 ? '#f4ffd8' : d < 5.5 ? '#bff2a8' : '#7fd69a');
};
/** candle wax: cream, a drip down the side */
const wax: Painter = (x, y) => {
  let c = pick(['#e9dcb8', '#efe4c4', '#e2d3ab'], hash(x, y, 97));
  if (x % 5 === 2 && y > 3 + Math.floor(hash(x, 0, 98) * 6)) c = hex('#f5edd6');
  return c;
};
/** the flame: white heart, yellow, orange tip (drawn emissive) */
const flame: Painter = (x, y) => (y < 5 ? hex('#ff9a3c') : y < 10 ? hex('#ffd46a') : hex('#fff6d6'));
/** the vine: a creeping strand with small leaves, see-through around it */
const vine: Painter = (x, y) => {
  const sx = 7 + Math.round(Math.sin(y * 0.7) * 2.2);
  if (Math.abs(x - sx) <= 0) return hex('#3b5d24');
  const leafRow = (y + 1) % 4 === 0;
  if (leafRow && Math.abs(x - sx) <= 3 && hash(x, y, 99) < 0.85) return pick(['#4f8a2f', '#5e9c38', '#447a29'], hash(x, y, 100));
  if (Math.abs(x - sx) === 1 && hash(x, y, 101) < 0.5) return hex('#4a7a2c');
  return CLEAR;
};

// ---------------------------------------------------------------- items
/** Mapa Rasgado: a torn corner of the sentinels' map, a dotted trail and a little tower mark */
const tornMap: Painter = (x, y) => {
  const torn = x + y > 24 - Math.floor(hash(x, y, 110) * 3) || x < 2 || y < 2 || x > 14 || y > 14;
  if (torn) return CLEAR;
  let c = pick(['#d9c79a', '#e2d2a6', '#cdb98a'], hash(x, y, 111));
  if (x + y >= 21) c = hex('#a88d5c'); // the torn edge, browned
  if ((x === 4 && y >= 4 && y <= 6) || (y === 4 && x >= 3 && x <= 5)) c = hex('#6b3a22'); // the tower mark
  if (y === Math.round(6 + (x - 4) * 0.8) && x > 5 && x < 12 && x % 2 === 0) c = hex('#8a3a2e'); // the dotted trail
  if (x === 11 && y === 12) c = hex('#8a3a2e');
  if (hash(x, y, 112) < 0.05) c = hex('#b9a274');
  return c;
};

export const ART: Record<string, Painter> = {
  tower_post_side: postSide,
  tower_post_top: postTop,
  rail_wood: railWood,
  rack_wood: rackWood,
  rack_bow: bowWood,
  rack_linen: linen,
  rack_fletch: fletch,
  target_face: targetFace,
  target_straw: targetStraw,
  lantern_iron: iron,
  lantern_icon: lanternIcon,
  pillar_side: pillarSide,
  pillar_top: pillarTop,
  altar_side: altarSide,
  altar_top: altarTop,
  altar_bronze: bronze,
  altar_ember: ember,
  candle_wax: wax,
  candle_flame: flame,
  shrine_vine: vine,
  torn_map: tornMap,
};
