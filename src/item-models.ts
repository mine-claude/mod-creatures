// @ts-check
// The creatures' items as sculpted 3D models (ctx.render.itemModel, src/sculpt.ts — the same builder the base game's
// models use): the Torn Map as a folded, torn sheet; the Old Tome as a thick clasped book; the hides, pebble and pouch,
// the stingers, the chitin plate, the glow gland, the feather, the honeycomb, the living bark, the rune core and the
// hermit's claw. Each in the colours of the icon it replaces (the mobs' items.ts), original designs. Browser only.
import { sharedModel, tone, hex } from './sculpt.ts';

type Opts = { transform?: (g: any) => void, handScale?: number };
/** A model definition over a sculpted, cached, shared geometry (what ctx.render.itemModel takes). */
const sculpted = (key: string, build: (solid: any, glass: any) => void, opts: Opts = {}) => ({
  /** @param {any} kit */
  build({ THREE, context }) {
    const group = sharedModel(THREE, `creatures:${key}`, build, { transform: opts.transform });
    if (context !== 'hand' || !opts.handScale) return group;
    group.scale.setScalar(opts.handScale); // on an inner group: the hand sets the scale of the object it gets
    const root = new THREE.Group();
    root.add(group);
    return root;
  },
});

/** The Torn Map: a parchment folded in three, a corner torn off, the tower mark and the dotted trail on its face. */
const tornMap = sculpted('torn_map', (s) => {
  const paper = hex('#d9c79a'), paperDark = hex('#cdb98a'), torn = hex('#a88d5c'), tower = hex('#6b3a22'), trail = hex('#8a3a2e');
  const panels = [[-0.3, 0.02, 0.35], [0, -0.02, -0.35], [0.3, 0.02, 0.35]]; // the three folds, zig-zag
  panels.forEach(([x, y, rz], i) => s.box(0.3, 0.025, 0.56, i === 1 ? paperDark : paper, x, y, 0, { rot: [0, 0, rz], faces: { bottom: tone(paper, 0.8) } }));
  s.box(0.14, 0.03, 0.2, torn, 0.33, 0.04, 0.2, { rot: [0.2, 0.3, 0.35] }); // the browned, torn corner (a ragged flap)
  s.box(0.06, 0.03, 0.06, tower, -0.3, 0.05, -0.14, { rot: [0, 0, 0.35] }); // the tower mark
  s.box(0.09, 0.03, 0.025, tower, -0.3, 0.05, -0.1, { rot: [0, 0, 0.35] });
  for (let i = 0; i < 5; i++) s.box(0.03, 0.025, 0.03, trail, -0.16 + i * 0.09, 0.03 + (i === 0 || i === 4 ? 0.02 : -0.0), -0.08 + i * 0.07); // the dotted trail
  s.box(0.04, 0.03, 0.04, trail, 0.2, 0.05, 0.22, { rot: [0, 0, 0.35] }); // where it ends at the rip
}, { transform: (g) => g.rotateX(0.75).rotateZ(-0.15) });

/** The Old Tome: thick leather covers, a block of yellowed pages, a dark spine, gilt lines and a brass clasp. */
const oldTome = sculpted('old_tome', (s) => {
  const cover = hex('#6e3a22'), coverDark = hex('#5a2a18'), pages = hex('#e8dcb5'), pagesDark = hex('#d6c89c'), spine = hex('#3b1f10'), gilt = hex('#c9a23a');
  s.box(0.56, 0.05, 0.7, cover, 0, 0.14, 0); // the front cover
  s.box(0.56, 0.05, 0.7, coverDark, 0, -0.14, 0); // the back cover
  s.box(0.5, 0.23, 0.64, pages, 0.03, 0, -0.02, { faces: { right: pagesDark, front: pagesDark, back: pagesDark } }); // the page block
  s.box(0.08, 0.34, 0.72, spine, -0.28, 0, 0); // the spine
  for (const y of [-0.1, 0, 0.1]) s.box(0.09, 0.03, 0.6, tone(spine, 1.5), -0.28, y, 0); // the raised bands of the spine
  s.box(0.03, 0.012, 0.52, gilt, -0.16, 0.167, 0); // the gilt frame on the cover
  s.box(0.03, 0.012, 0.52, gilt, 0.2, 0.167, 0);
  s.box(0.4, 0.012, 0.03, gilt, 0.02, 0.167, 0.26);
  s.box(0.4, 0.012, 0.03, gilt, 0.02, 0.167, -0.26);
  s.box(0.1, 0.012, 0.1, gilt, 0.02, 0.167, 0, { rot: [0, 0.785, 0] }); // the rune on the cover
  s.box(0.12, 0.33, 0.07, tone(cover, 0.85), 0.26, 0, 0.14); // the clasp's strap over the fore-edge
  s.box(0.08, 0.1, 0.09, gilt, 0.3, 0.1, 0.14, { gloss: 0.5 }); // its brass buckle
}, { transform: (g) => g.rotateY(-0.5).rotateX(0.35), handScale: 0.75 });

/** Moss Hide: a hide like leather, but matted with moss on its outer side. */
const mossHide = sculpted('moss_hide', (s) => {
  const hide = hex('#7a5a32'), moss = hex('#4f7a2e'), mossLight = hex('#6fa040'), mossDark = hex('#3a5c21');
  s.box(0.56, 0.05, 0.46, hide, 0, 0, 0, { faces: { top: moss } });
  for (const [x, z, r] of [[-0.3, -0.18, 0.4], [0.3, -0.18, -0.4], [-0.3, 0.18, -0.4], [0.3, 0.18, 0.4]]) s.box(0.16, 0.045, 0.14, hide, x, 0, z, { rot: [0, r, 0], faces: { top: moss } });
  for (let i = 0; i < 7; i++) s.box(0.09, 0.05, 0.08, i % 2 ? mossLight : mossDark, -0.22 + (i % 4) * 0.14, 0.04, -0.1 + Math.floor(i / 4) * 0.2 + (i % 2) * 0.05, { rot: [0, i * 0.5, 0] }); // tufts of moss
}, { transform: (g) => g.rotateX(1.0).rotateZ(-0.2), handScale: 0.8 });

/** The goblin's pebble: a rounded, flattened river stone, lighter on top. */
const goblinPebble = sculpted('goblin_pebble', (s) => {
  s.lathe([[0.08, -0.14], [0.26, -0.08], [0.3, 0.0], [0.26, 0.1], [0.12, 0.16], [0, 0.17]], 7, hex('#8a8a84'), 0, 0, 0, { twist: 0.4 });
  s.box(0.1, 0.02, 0.07, hex('#c4c4bc'), -0.08, 0.15, -0.02, { rot: [0, 0.4, 0] }); // the pale glint on top
  s.box(0.05, 0.03, 0.05, hex('#6a6a64'), 0.12, 0.06, 0.2, { rot: [0.3, 0.2, 0.1] }); // a dark fleck
});

/** The goblin's pouch: a patched leather bag gathered with a cord, a pebble peeking out of its mouth. */
const goblinPouch = sculpted('goblin_pouch', (s) => {
  const leather = hex('#7d5a32'), dark = hex('#4e361c'), cord = hex('#c9b07a'), patch = hex('#8c3b2e');
  s.lathe([[0.12, -0.4], [0.3, -0.3], [0.32, -0.05], [0.2, 0.14], [0.12, 0.2], [0.16, 0.3], [0.1, 0.36]], 8, leather, 0, 0, 0, { twist: 0.2 });
  s.lathe([[0.14, 0.14], [0.15, 0.2], [0.13, 0.2]], 8, cord, 0, 0, 0); // the cord around the neck
  s.rod([0.13, 0.17, 0], [0.3, 0.02, 0.12], 0.015, cord); // its loose ends
  s.rod([-0.13, 0.17, 0.05], [-0.26, 0.0, 0.14], 0.015, cord);
  s.box(0.14, 0.12, 0.03, patch, 0.14, -0.14, 0.27, { rot: [0.2, 0.3, 0] }); // the red patch
  s.box(0.04, 0.03, 0.03, hex('#d9c9a0'), 0.15, -0.13, 0.29, { rot: [0.2, 0.3, 0] }); // its stitch
  s.lathe([[0.03, 0.3], [0.07, 0.36], [0.05, 0.42], [0, 0.44]], 6, hex('#8a8a84'), 0.02, 0, 0.02); // the pebble at the mouth
  s.box(0.34, 0.03, 0.32, dark, 0, -0.4, 0); // the worn bottom
}, { handScale: 0.8 });

/** The chitin plate: a hexagonal shell plate, ridged, pale at the edges and dark in the furrows. */
const chitin = sculpted('chitin', (s) => {
  const plate = hex('#dcbf7e'), ridge = hex('#f0dcaa'), furrow = hex('#a07f4c'), dark = hex('#3f2d14');
  s.lathe([[0.3, -0.08], [0.36, 0.0], [0.3, 0.1], [0.16, 0.17], [0, 0.2]], 6, plate, 0, 0, 0, { gloss: 0.25 });
  s.lathe([[0.34, -0.1], [0.38, -0.06], [0.37, -0.03]], 6, dark, 0, 0, 0); // the dark rim underneath
  for (let i = 0; i < 6; i++) { // the ridges radiating from the crown
    const a = i * Math.PI / 3 + 0.52;
    s.rod([0, 0.19, 0], [Math.cos(a) * 0.33, 0.0, Math.sin(a) * 0.33], 0.02, i % 2 ? ridge : furrow, { depth: 0.015 });
  }
  s.box(0.06, 0.03, 0.06, hex('#fbf2d2'), 0, 0.2, 0, { gloss: 0.3 }); // the pale crown
}, { transform: (g) => g.rotateX(0.5).rotateY(0.3) });

/** A stinger: a curved spike tapering to a dark point, on a swollen base; `bands` paints the swarm's yellow and black. */
const stinger = (key, base, spike, tip, bands) => sculpted(key, (s) => {
  s.lathe([[0.06, -0.46], [0.14, -0.36], [0.13, -0.22], [0.08, -0.12]], 7, base, 0, 0, 0);
  if (bands) for (let i = 0; i < 3; i++) s.lathe([[0.135, -0.36 + i * 0.07], [0.14, -0.33 + i * 0.07], [0.13, -0.33 + i * 0.07]], 7, hex('#1c120a'), 0, 0, 0); // black bands
  s.rod([0, -0.14, 0], [0.06, 0.16, 0], 0.07, spike, { r1: 0.045, depth: 0.06, depth1: 0.04 });
  s.rod([0.06, 0.16, 0], [0.2, 0.42, 0], 0.045, spike, { r1: 0.012, depth: 0.04, depth1: 0.01 });
  s.rod([0.2, 0.42, 0], [0.26, 0.52, 0], 0.012, tip, { r1: 0.003, depth: 0.01, depth1: 0.003 }); // the point
  for (let i = 0; i < 3; i++) s.box(0.05, 0.03, 0.03, tip, 0.03 + i * 0.05, 0.08 + i * 0.1, 0.03, { rot: [0, 0, 0.5] }); // the barbs
  s.box(0.03, 0.2, 0.012, tone(spike, 1.35), 0.04, 0.1, 0.04, { rot: [0, 0, -0.25] }); // the glint along the spike
}, { transform: (g) => g.rotateZ(-0.4) });

/** The Lure Lantern's glow gland: a teardrop of amber light in a translucent green-black skin, a bright core. */
const glowGland = sculpted('glow_gland', (s, glass) => {
  glass.lathe([[0, -0.44], [0.18, -0.3], [0.3, -0.08], [0.26, 0.14], [0.12, 0.34], [0, 0.42]], 8, hex('#ffc65a'), 0, 0, 0, { shade: 1.15 });
  s.lathe([[0, -0.3], [0.12, -0.18], [0.18, 0.0], [0.12, 0.16], [0, 0.26]], 6, hex('#fff2c0'), 0, 0, 0, { shade: 1.25 }); // the core
  s.lathe([[0.03, 0.4], [0.05, 0.5], [0.02, 0.56]], 5, hex('#3e6a5c'), 0, 0, 0); // the stalk it hung from
  for (const [x, z] of [[-0.18, 0.1], [0.12, -0.2], [0.06, 0.22]]) s.box(0.04, 0.04, 0.04, hex('#1a2a26'), x, -0.1, z, { rot: [0.3, 0.5, 0.2] }); // the dark flecks of the skin
});

/** The Sentinel's feather: a pale quill, dark green vanes in overlapping barbs, a split near the tip. */
const feather = sculpted('feather', (s) => {
  const quill = hex('#d8cfa8'), vanes = [hex('#3c4f3a'), hex('#46603f'), hex('#56704f')], lit = hex('#6a8560'), tip = hex('#c9ad74');
  s.rod([0, -0.5, 0], [0, 0.46, 0], 0.018, quill, { depth: 0.014, r1: 0.01, depth1: 0.01 });
  for (let i = 0; i < 9; i++) { // the barbs, a little longer in the middle, swept toward the tip
    const y = -0.22 + i * 0.075, len = 0.09 + 0.06 * Math.sin((i / 8) * Math.PI);
    for (const sign of [1, -1]) s.box(len, 0.06, 0.012, vanes[i % 3], sign * (len / 2 + 0.01), y, 0, { rot: [0, 0, sign * 0.45] });
  }
  s.box(0.08, 0.05, 0.014, lit, -0.05, 0.3, 0.002, { rot: [0, 0, 0.45] }); // a lit barb near the tip
  s.box(0.03, 0.14, 0.014, tip, 0, 0.44, 0); // the tip
}, { transform: (g) => g.rotateZ(-Math.PI / 4) });

/** Wild honey: a slab of comb with its hexagonal cells, honey running off the lower edge. */
const wildHoney = sculpted('wild_honey', (s) => {
  const wax = hex('#e3cf9a'), waxDark = hex('#c4a468'), honey = hex('#f59a2e'), honeyLight = hex('#ffd27a');
  s.box(0.6, 0.12, 0.5, wax, 0, 0, 0, { faces: { bottom: honey } });
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) { // the cells: open six-sided rings on the face
    const x = -0.21 + k * 0.14 + (r % 2) * 0.07, z = -0.15 + r * 0.15;
    if (Math.abs(x) > 0.26) continue;
    s.lathe([[0.06, 0.06], [0.06, 0.09], [0.045, 0.09], [0.045, 0.06]], 6, r === 1 && k === 2 ? honeyLight : waxDark, x, 0, z);
  }
  s.rod([-0.22, -0.06, 0.2], [-0.2, -0.3, 0.22], 0.03, honey, { r1: 0.018 }); // the drips
  s.rod([0.1, -0.06, 0.24], [0.12, -0.24, 0.25], 0.025, honey, { r1: 0.015 });
  s.box(0.4, 0.04, 0.06, honey, 0.02, -0.07, 0.25); // honey welling at the lower edge
  s.box(0.05, 0.03, 0.05, honeyLight, -0.2, -0.3, 0.22); // the drop about to fall
}, { transform: (g) => g.rotateX(0.9).rotateZ(-0.1) });

/** Living Bark: a curled strip of bark, dark outside, pale inside, beads of sap and a little moss. */
const livingBark = sculpted('living_bark', (s) => {
  const out = hex('#563c28'), ridge = hex('#7d5f40'), inner = hex('#c9a878'), sap = hex('#e8a53a'), moss = hex('#6fa040');
  const n = 6;
  for (let i = 0; i < n; i++) { // an arc of plates curling about the y axis
    const a0 = -0.9 + i * 0.42, a1 = a0 + 0.42, r = 0.3;
    const x0 = Math.sin(a0) * r, z0 = Math.cos(a0) * r, x1 = Math.sin(a1) * r, z1 = Math.cos(a1) * r;
    const am = (a0 + a1) / 2;
    s.box(Math.hypot(x1 - x0, z1 - z0) + 0.01, 0.56, 0.06, i % 2 ? out : tone(out, 0.85), (x0 + x1) / 2, 0, (z0 + z1) / 2, { rot: [0, -am, 0], faces: { front: ridge, back: inner } });
  }
  for (const [a, y] of [[-0.6, 0.12], [0.1, -0.18], [0.7, 0.04]]) s.box(0.06, 0.06, 0.05, sap, Math.sin(a) * 0.34, y, Math.cos(a) * 0.34, { rot: [0, -a, 0], shade: 1.15 }); // sap beads
  s.box(0.08, 0.05, 0.06, moss, Math.sin(-1.0) * 0.33, 0.24, Math.cos(-1.0) * 0.33, { rot: [0, 1.0, 0] }); // moss
  s.box(0.06, 0.04, 0.05, moss, Math.sin(0.9) * 0.33, -0.2, Math.cos(0.9) * 0.33, { rot: [0, -0.9, 0] });
}, { transform: (g) => g.rotateX(0.3).rotateZ(-0.4) });

/** The Rune Core: a dark basalt heart banded in old gold, its rune lines glowing teal. */
const runeCore = sculpted('rune_core', (s, glass) => {
  const stone = hex('#2f353a'), stoneDark = hex('#1f2427'), gold = hex('#ffd27a'), rune = hex('#3fd9c4'), runeLight = hex('#9ff7e8');
  s.frustum(0.44, 0.44, 0.34, 0.34, 0.2, stone, 0, 0.18, 0, { faces: { top: stoneDark } });
  s.box(0.46, 0.18, 0.46, stone, 0, 0, 0);
  s.frustum(0.34, 0.34, 0.44, 0.44, 0.2, stone, 0, -0.18, 0, { faces: { bottom: stoneDark } });
  s.box(0.5, 0.05, 0.5, gold, 0, 0.1, 0, { gloss: 0.6 }); // the gold bands
  s.box(0.5, 0.05, 0.5, gold, 0, -0.1, 0, { gloss: 0.6 });
  for (const [rx, ry] of [[0, 0], [0, Math.PI / 2], [0, Math.PI], [0, -Math.PI / 2]]) { // the rune on each face
    s.box(0.03, 0.12, 0.02, rune, 0, 0.0, 0.235, { rot: [rx, ry, 0], shade: 1.3 });
    s.box(0.1, 0.03, 0.02, rune, 0.02, 0.04, 0.235, { rot: [rx, ry, 0], shade: 1.3 });
  }
  glass.box(0.14, 0.14, 0.14, runeLight, 0, 0.0, 0, { rot: [0.6, 0.8, 0.3], shade: 1.4 }); // the glow at the heart, seen through the seams
  s.box(0.1, 0.1, 0.1, runeLight, 0, 0.3, 0, { rot: [0.5, 0.78, 0.5], shade: 1.35 }); // the crystal on top
}, { transform: (g) => g.rotateY(0.5).rotateX(0.2), handScale: 0.8 });

/** The hermit's claw: the big pincer — a swollen hand, the fixed finger and the moving one, dark at their tips. */
const hermitClaw = sculpted('hermit_claw', (s) => {
  const shell = hex('#d8542c'), light = hex('#f08a56'), dark = hex('#8c3018'), tip = hex('#3a1a10'), pale = hex('#f7e2bc');
  s.lathe([[0.1, -0.5], [0.14, -0.36], [0.12, -0.26]], 6, dark, 0, 0, 0); // the joint
  s.lathe([[0.1, -0.28], [0.26, -0.1], [0.24, 0.1], [0.12, 0.2]], 7, shell, 0, 0, 0, { twist: 0.3 }); // the hand
  s.rod([-0.1, 0.12, 0], [-0.16, 0.5, 0], 0.08, shell, { r1: 0.02, depth: 0.06, depth1: 0.02 }); // the fixed finger
  s.rod([0.12, 0.14, 0], [0.22, 0.46, 0], 0.07, light, { r1: 0.02, depth: 0.05, depth1: 0.02 }); // the moving finger
  s.box(0.05, 0.08, 0.04, tip, -0.165, 0.5, 0); // the dark tips
  s.box(0.05, 0.08, 0.04, tip, 0.225, 0.46, 0);
  for (let i = 0; i < 3; i++) s.box(0.04, 0.03, 0.05, pale, -0.1 + i * 0.03, 0.22 + i * 0.09, 0.03); // the teeth of the pincer
  s.box(0.08, 0.1, 0.03, pale, -0.02, -0.02, 0.24, { rot: [0.2, 0, 0.3] }); // a pale patch on the shell
}, { transform: (g) => g.rotateZ(-0.5).rotateY(0.2) });

/** @param {any} ctx */
export function registerCreatureItemModels(ctx) {
  const models = {
    torn_map: tornMap, old_tome: oldTome, moss_hide: mossHide, goblin_pebble: goblinPebble, goblin_pouch: goblinPouch, chitin,
    widow_stinger: stinger('widow_stinger', hex('#a07f4c'), hex('#c25a40'), hex('#1c120a'), false),
    swarm_stinger: stinger('swarm_stinger', hex('#e0a020'), hex('#3a2a12'), hex('#1c120a'), true),
    glow_gland: glowGland, feather, wild_honey: wildHoney, living_bark: livingBark, rune_core: runeCore, hermit_claw: hermitClaw,
  };
  for (const [item, def] of Object.entries(models)) ctx.render.itemModel(item, def);
}
