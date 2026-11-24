// @ts-check
// The Ruin Colossus's body, built in code from boxes (original design and palette): a monumental stone guardian about
// 2.8 blocks tall — massive shoulders and gauntlet forearms, a small heavy head sunk between the shoulders, short thick
// legs. Carved MASONRY plates (stepped bevels, a chipped corner, cracks, engraved glyph bands that line up across the
// plates of one bone, lichen) are fitted over a dark basalt CORE threaded with rune CHANNELS (amber seams running like a
// circuit with teal sigil nodes at the junctions, on unlit materials) seen in the gaps and laid bare as plates fall. ONE
// rune eye (amber in a teal ring) burns in a deep socket under a heavy brow. Moss blankets the shoulders, the crown and
// the back, with ferns, small flowers and vines hanging off it. Warm sandstone weathered toward grey-green.
//
// DRAW CALLS: every static piece is MERGED — one geometry (vertex colours, one lit material) per cluster, plus one
// geometry per glow kind per cluster — so a plate of a dozen carved boxes is ONE mesh, and a bone's stone is one mesh
// over one or two rune meshes. Each detachable plate / pauldron / moss pad stays its own cluster (a Group tagged
// `chunk`), so the renderer still breaks them off whole as tumbling debris (debris.ts) and the crumble takes them piece
// by piece. Every joint is a Group whose bone hangs along -y, so the renderer only writes rotations; forward is -z (the
// game's convention). Materials are per colossus (the hurt flash tints only this one; the runes pulse per mob).
import { COLOSSUS_RIG, ARM, NECK, TORSO_Y } from './procedural.ts';
import { hash01 } from '../goblin/procedural.ts';

export const PALETTE: Record<string, number> = Object.freeze({
  // the stone: warm sandstone, weathering toward a cool grey-green; the deep crevices nearly black
  stone: 0xa89b7d, stoneLight: 0xc7bb9c, stoneDark: 0x7a7260, stoneDeep: 0x58534a, stoneWarm: 0xb3966d, weather: 0x7f8c76,
  bed: 0x4f4b42, crack: 0x27241f, groove: 0x3a372f, lichenA: 0xb9b36a, lichenB: 0xd3cd8f, lichenC: 0x8fa36b,
  core: 0x2a2d31, coreDark: 0x191b1e, coreEdge: 0x3a3e44,
  moss: 0x4a7a30, mossLight: 0x6f9c3e, mossDark: 0x32571f, fern: 0x5c8f3a, stem: 0x3b5a27,
  petalA: 0xe8d96a, petalB: 0xdc7fa3, petalC: 0xf3f0e4, pollen: 0xffd27a,
  amber: 0xf59a2e, amberHot: 0xffd27a, teal: 0x3fd9c4, eye: 0xffc14f,
});
const STONE_SET = new Set([PALETTE.stone, PALETTE.stoneLight, PALETTE.stoneDark, PALETTE.stoneDeep, PALETTE.stoneWarm]);

/** Builds the colossus. Returns the engine's { group, legs, arms } (both empty: the renderer moves the limbs itself),
 * the joints, the plates by tier, the glowing materials and the mesh count. */
export function buildColossus({ THREE }) {
  const P = PALETTE;
  // ONE lit material for every stone/moss piece (the vertex colours carry the palette; the hurt flash tints its emissive)
  const litMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
  const glows = []; // { mat, base, kind } — unlit, so the light does not dim them and the hurt flash does not tint them
  const glowMats = new Map();
  const glowMat = (c, kind) => {
    const key = `${c}:${kind}`;
    let m = glowMats.get(key);
    if (!m) { m = new THREE.MeshBasicMaterial({ color: c }); glowMats.set(key, m); glows.push({ mat: m, base: c, kind }); }
    return m;
  };
  let seq = 0;
  const rnd = () => hash01(9001 + seq++ * 13); // the same carving on every colossus (it is one design)
  const joint = (parent, x = 0, y = 0, z = 0) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };
  const chunk = (g) => { g.userData.chunk = true; return g; };
  const mix = (a, b, t) => {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
  };
  const scaleC = (c, k) => {
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
  };
  let meshes = 0;

  // ---- a cluster: boxes drawn into `parent` and merged on end() into one lit mesh (+ one mesh per glow material)
  const cluster = (parent) => {
    const lit = [], glowSpecs = new Map();
    const C = {
      group: parent,
      /** A lit box (w, h, d at x, y, z, turned by rx, ry, rz). `frame`: a Matrix4 the box sits inside (ferns' fronds). */
      box(w, h, d, c, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, frame = null) {
        let col = c;
        if (STONE_SET.has(c)) col = mix(c, P.weather, rnd() * 0.3); // every stone block weathered its own way
        col = scaleC(col, 1 + (rnd() - 0.5) * 0.08);
        lit.push({ w, h, d, c: col, x, y, z, rx, ry, rz, frame });
        return C;
      },
      /** A glowing rune box: kind 'seam' (amber channels), 'sigil' (teal nodes), 'eye'. */
      rune(w, h, d, c, x, y, z, kind = 'seam', rz = 0, rx = 0, ry = 0) {
        const key = `${c}:${kind}`;
        let list = glowSpecs.get(key);
        if (!list) { list = { c, kind, specs: [] }; glowSpecs.set(key, list); }
        list.specs.push({ w, h, d, c, x, y, z, rx, ry, rz, frame: null });
        return C;
      },
      end() {
        if (lit.length) { parent.add(new THREE.Mesh(mergeBoxes(THREE, lit, true), litMat)); meshes++; }
        for (const { c, kind, specs } of glowSpecs.values()) { parent.add(new THREE.Mesh(mergeBoxes(THREE, specs, false), glowMat(c, kind))); meshes++; }
        return parent;
      },
    };
    return C;
  };
  /** A detachable cluster: its own chunk Group at (x, y, z) turned by (rx, ry, rz). */
  const chunkCluster = (parent, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const g = chunk(joint(parent, x, y, z));
    g.rotation.set(rx, ry, rz);
    return cluster(g);
  };

  // ---- moss, ferns, flowers, vines
  const ferns = []; // small swaying fronds (the renderer nods them)
  const flowerIn = (C, x, y, z, petal) => {
    C.box(0.014, 0.1, 0.014, P.stem, x, y + 0.05, z);
    for (const [px, pz] of [[-0.02, 0], [0.02, 0], [0, -0.02], [0, 0.02]]) C.box(0.024, 0.014, 0.024, petal, x + px, y + 0.1, z + pz);
    C.box(0.02, 0.022, 0.02, P.pollen, x, y + 0.106, z);
  };
  // a moss pad: a thin carpet that leaves the stone's rim showing, rounded clumps (stacked boxes) on it, lips of moss
  // hanging over the edges, lichen and the flowers
  const mossPad = (parent, w, d, x, y, z, { flowers = [] } = {}) => {
    const C = chunkCluster(parent, x, y, z);
    C.box(w * 0.86, 0.04, d * 0.86, P.moss, (rnd() - 0.5) * w * 0.08, 0, (rnd() - 0.5) * d * 0.08);
    for (let i = 0; i < 3; i++) { // the clumps: a wide base, a smaller top, offset so they read as rounded
      const cw = w * (0.28 + 0.14 * rnd()), cd = d * (0.28 + 0.14 * rnd());
      const cx = (rnd() - 0.5) * w * 0.55, cz = (rnd() - 0.5) * d * 0.55;
      C.box(cw, 0.06, cd, i === 1 ? P.mossDark : P.moss, cx, 0.03, cz);
      C.box(cw * 0.6, 0.05, cd * 0.6, P.mossLight, cx + cw * 0.1, 0.075, cz - cd * 0.1);
    }
    // lips of moss hanging over the edges (the front one longest: it drips)
    C.box(w * 0.5, 0.11, 0.035, P.mossDark, (rnd() - 0.5) * w * 0.3, -0.05, -d / 2 - 0.005);
    C.box(w * 0.2, 0.17, 0.03, P.moss, (rnd() - 0.5) * w * 0.5, -0.08, -d / 2 - 0.008);
    C.box(w * 0.35, 0.07, 0.03, P.moss, (rnd() - 0.5) * w * 0.4, -0.035, d / 2 + 0.005);
    C.box(0.035, 0.09, d * 0.4, P.moss, w / 2 + 0.005, -0.045, (rnd() - 0.5) * d * 0.3);
    C.box(0.03, 0.06, d * 0.3, P.mossDark, -w / 2 - 0.005, -0.03, (rnd() - 0.5) * d * 0.3);
    if (rnd() < 0.8) C.box(0.07, 0.016, 0.06, P.lichenA, (rnd() - 0.5) * w * 0.6, 0.05, (rnd() - 0.5) * d * 0.6);
    for (const [fx, fz, petal] of flowers) flowerIn(C, fx, 0.05, fz, petal);
    return C.end();
  };
  const fern = (parent, x, y, z, s = 1) => {
    const f = joint(parent, x, y, z);
    f.rotation.y = rnd() * Math.PI;
    const C = cluster(f);
    const e = new THREE.Euler(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    for (let k = 0; k < 3; k++) {
      e.set(-0.5 - 0.25 * rnd(), (k / 3) * Math.PI * 2 + 0.3 * rnd(), 0);
      const frame = new THREE.Matrix4().compose(v.set(0, 0, 0), q.setFromEuler(e), one);
      C.box(0.012 * s, 0.24 * s, 0.012 * s, P.stem, 0, 0.12 * s, 0, 0, 0, 0, frame);
      for (let i = 0; i < 5; i++) C.box(0.1 * s * (1 - i * 0.16), 0.016 * s, 0.03 * s, i % 2 ? P.fern : P.mossLight, 0, (0.06 + i * 0.042) * s, 0, 0, 0, 0, frame);
    }
    C.end();
    ferns.push(f);
    return f;
  };
  const vines = []; // hanging strands: two-segment chains the renderer swings on springs
  const vine = (parent, x, y, z, len) => {
    const a = joint(parent, x, y, z);
    cluster(a).box(0.03, len, 0.03, P.mossDark, 0, -len / 2, 0).box(0.05, 0.04, 0.04, P.moss, 0.01, -len * 0.35, 0).box(0.04, 0.03, 0.05, P.mossLight, -0.01, -len * 0.7, 0.01).end();
    const b = joint(a, 0, -len, 0);
    cluster(b).box(0.025, len * 0.8, 0.025, P.moss, 0, -len * 0.4, 0).box(0.05, 0.03, 0.05, P.mossLight, 0, -len * 0.8, 0).box(0.03, 0.04, 0.02, P.petalC, 0.02, -len * 0.55, 0).end();
    vines.push({ a, b, phase: rnd() * 6 });
  };

  // ---- the engraved glyphs: geometric, in the groove colour, cut into the plate's raised face (not lit: only stone)
  const LINE = 0.024, CUT = 0.006;
  const GLYPHS = {
    ring: (C, gw, gh, z, y0 = 0) => { // a square ring round a square: the sun-stone
      const r = Math.min(gw, gh) * 0.55;
      C.box(r, LINE, CUT, P.groove, 0, y0 + r / 2, z).box(r, LINE, CUT, P.groove, 0, y0 - r / 2, z);
      C.box(LINE, r, CUT, P.groove, -r / 2, y0, z).box(LINE, r, CUT, P.groove, r / 2, y0, z);
      C.box(r * 0.34, r * 0.34, CUT, P.groove, 0, y0, z);
    },
    band: (C, gw, gh, z, y0 = 0) => { // a double line with square teeth between: the band that runs across the plates of one bone
      C.box(gw, LINE, CUT, P.groove, 0, y0 + 0.045, z).box(gw, LINE, CUT, P.groove, 0, y0 - 0.045, z);
      const n = Math.max(2, Math.round(gw / 0.13));
      for (let i = 0; i < n; i++) C.box(0.04, 0.04, CUT, P.groove, -gw / 2 + (i + 0.5) * (gw / n), y0, z);
    },
    chevron: (C, gw, gh, z, y0 = 0) => { // two chevrons, one over the other
      const l = Math.min(gw, gh) * 0.5;
      for (const dy of [0.04, -0.07]) C.box(l, LINE, CUT, P.groove, -l * 0.33, y0 + dy, z, 0, 0, 0.75).box(l, LINE, CUT, P.groove, l * 0.33, y0 + dy, z, 0, 0, -0.75);
    },
    diamond: (C, gw, gh, z, y0 = 0) => { // a diamond with a dot
      const l = Math.min(gw, gh) * 0.6;
      for (const [dx, dy, a] of [[-0.25, 0.25, -0.785], [0.25, 0.25, 0.785], [-0.25, -0.25, 0.785], [0.25, -0.25, -0.785]]) C.box(l * 0.72, LINE, CUT, P.groove, l * dx, y0 + l * dy, z, 0, 0, a);
      C.box(l * 0.2, l * 0.2, CUT, P.groove, 0, y0, z);
    },
    bars: (C, gw, gh, z, y0 = 0) => { // three bars under a lintel: the gate
      const h = gh * 0.6;
      for (let i = -1; i <= 1; i++) C.box(LINE, h, CUT, P.groove, i * gw * 0.28, y0 - 0.02, z);
      C.box(gw * 0.7, LINE, CUT, P.groove, 0, y0 + h / 2, z);
    },
  };

  // ---- a carved masonry plate: a bed slab, a raised face in two stepped bevels (missing one chipped corner, where
  // the darker bed shows), a lit top rim, cracks, an engraved glyph, lichen. Faces -z (out of the body) in its own
  // frame; the caller turns it to face where it sits. `glyphY`: the glyph's centre in the plate's frame (so a band can
  // line up across the plates of one bone).
  const plates = []; // { obj, tier }
  const plate = (parent, { w, h, d = 0.1, x, y, z, rx = 0, ry = 0, rz = 0, tier = 0, c = P.stone, moss = false, glyph = 'ring', glyphY = 0, flowers = [] }) => {
    const C = chunkCluster(parent, x, y, z, rx, ry, rz);
    const g = C.group;
    const face = -d / 2;
    C.box(w, h, d, P.bed); // the bed: darker stone, seen in the chip and around the bevel
    // step 1: the raised face, minus the chipped corner
    const fw = w - 0.05, fh = h - 0.05;
    const sx = rnd() < 0.5 ? -1 : 1, sy = rnd() < 0.5 ? -1 : 1;
    const cw = Math.min(0.11, fw * 0.3), ch = Math.min(0.09, fh * 0.3);
    C.box(fw, fh - ch, 0.05, c, 0, -sy * ch / 2, face);
    C.box(fw - cw, fh, 0.05, c, -sx * cw / 2, 0, face);
    C.box(cw - 0.015, ch - 0.015, 0.012, P.crack, sx * (fw / 2 - cw / 2), sy * (fh / 2 - ch / 2), face + 0.02); // the break's shadow
    C.box(fw, 0.022, 0.05, scaleC(c, 1.18), 0, fh / 2 - 0.011, face - 0.002); // the top rim catching the light
    C.box(0.022, fh - ch, 0.05, scaleC(c, 0.82), -sx * (fw / 2 - 0.011), -sy * ch / 2, face - 0.002); // the shadowed side
    // step 2: a second bevel
    const w2 = fw - 0.12, h2 = fh - 0.12;
    const z2 = face - 0.04;
    if (w2 > 0.08 && h2 > 0.08) {
      C.box(w2, h2, 0.03, scaleC(c, 1.06), 0, 0, z2);
      C.box(w2, 0.016, 0.03, scaleC(c, 1.2), 0, h2 / 2 - 0.008, z2 - 0.001);
      if (glyph && GLYPHS[glyph] && w2 > 0.16 && h2 > 0.16) GLYPHS[glyph](C, w2 * 0.8, h2 * 0.8, z2 - 0.018, Math.max(-h2 * 0.3, Math.min(h2 * 0.3, glyphY)));
    }
    // cracks: a main one with a branch, running off the chipped corner
    const ca = Math.atan2(-sy, -sx) + (rnd() - 0.5) * 0.8, cl = Math.min(w, h) * (0.4 + 0.3 * rnd());
    const cx = sx * (fw / 2 - cw) , cy = sy * (fh / 2 - ch);
    C.box(cl, 0.012, CUT, P.crack, cx + Math.cos(ca) * cl * 0.5, cy + Math.sin(ca) * cl * 0.5, z2 - 0.018, 0, 0, ca);
    C.box(cl * 0.4, 0.01, CUT, P.crack, cx + Math.cos(ca) * cl * 0.7 + Math.cos(ca + 1) * cl * 0.2, cy + Math.sin(ca) * cl * 0.7 + Math.sin(ca + 1) * cl * 0.2, z2 - 0.018, 0, 0, ca + 1);
    // lichen: pale patches, mostly up high and in the corner
    if (rnd() < 0.7) C.box(0.07, 0.05, CUT, rnd() < 0.5 ? P.lichenA : P.lichenB, (rnd() - 0.5) * fw * 0.7, (rnd() - 0.5) * fh * 0.7, z2 - 0.019);
    if (rnd() < 0.4) C.box(0.04, 0.035, CUT, P.lichenC, -sx * (fw / 2 - 0.05), sy * (fh / 2 - 0.05), z2 - 0.019);
    C.end();
    if (moss) mossPad(g, w * 0.82, d + 0.08, 0, h / 2 + 0.025, 0.01, { flowers });
    plates.push({ obj: g, tier });
    return g;
  };
  /** A rune channel: axis-aligned segments between successive points [x, y] on the plane z (in a cluster). */
  const channel = (C, pts, z, w = 0.035, c = P.amber) => {
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      C.rune(Math.abs(x1 - x0) + w, Math.abs(y1 - y0) + w, 0.02, c, (x0 + x1) / 2, (y0 + y1) / 2, z, 'seam');
    }
  };
  /** A teal node: a small square (sigil) where channels meet or end. */
  const node = (C, x, y, z, s = 0.08) => C.rune(s, s, 0.022, P.teal, x, y, z, 'sigil');

  const group = new THREE.Group();
  const rig = joint(group); // the whole body (the crumble sinks this)
  const R = COLOSSUS_RIG;

  // ================================================================ pelvis: a thick waist block of basalt in a belt
  const pelvis = joint(rig, 0, R.hipHeight, 0);
  {
    const C = cluster(pelvis);
    C.box(0.84, 0.4, 0.56, P.core, 0, -0.02, 0);
    C.box(0.72, 0.2, 0.5, P.coreDark, 0, -0.26, 0);
    C.box(0.9, 0.06, 0.6, P.coreEdge, 0, 0.17, 0);
    C.rune(0.86, 0.035, 0.58, P.amber, 0, 0.1, 0); // the belt channel, all round
    C.rune(0.035, 0.26, 0.58, P.amber, -0.22, -0.04, 0).rune(0.035, 0.26, 0.58, P.amber, 0.22, -0.04, 0);
    node(C, 0, 0.1, -0.29, 0.07); node(C, 0, 0.1, 0.29, 0.07);
    C.end();
  }
  plate(pelvis, { w: 0.5, h: 0.44, x: 0, y: -0.12, z: -0.3, rx: 0.14, tier: 0, c: P.stoneWarm, glyph: 'band', glyphY: 0.06 });
  plate(pelvis, { w: 0.46, h: 0.36, x: -0.44, y: -0.06, z: 0, ry: Math.PI / 2, rz: 0.08, tier: 2, glyph: 'bars' });
  plate(pelvis, { w: 0.46, h: 0.36, x: 0.44, y: -0.06, z: 0, ry: -Math.PI / 2, rz: -0.08, tier: 0, glyph: 'bars' });
  plate(pelvis, { w: 0.64, h: 0.38, x: 0, y: -0.04, z: 0.3, ry: Math.PI, rx: -0.1, tier: 0, c: P.stoneDark, glyph: 'diamond' });

  // ================================================================ torso: a wedge, narrow at the waist, wide at the yoke
  const torso = joint(pelvis, 0, TORSO_Y, 0);
  const chest = joint(torso); // the breathing scales this
  {
    const C = cluster(chest);
    C.box(0.96, 0.52, 0.6, P.core, 0, 0.34, 0);
    C.box(1.22, 0.52, 0.7, P.core, 0, 0.82, 0);
    C.box(1.1, 0.1, 0.66, P.coreEdge, 0, 0.58, 0); // the ledge between the two blocks
    C.box(0.5, 0.18, 0.44, P.coreDark, 0, 1.0, -0.1); // the collar the neck rises from
    // the rune CIRCUIT of the core: a spine, branches with right-angle turns, nodes at the junctions
    const fu = -0.36, fl = -0.31; // the upper and lower front planes
    channel(C, [[0, 0.22], [0, 1.0]], fu, 0.045); // the spine
    channel(C, [[-0.46, 0.92], [-0.46, 0.68], [0.46, 0.68], [0.46, 0.92]], fu); // the upper branch
    channel(C, [[-0.3, 0.14], [-0.3, 0.3], [0.3, 0.3], [0.3, 0.14]], fl); // the lower branch
    channel(C, [[-0.2, 0.46], [-0.2, 0.52], [0.2, 0.52], [0.2, 0.46]], fl - 0.03);
    for (const x of [-0.46, 0.46]) node(C, x, 0.96, fu); for (const x of [-0.3, 0.3]) node(C, x, 0.11, fl, 0.07);
    // the heart sigil (teal): a ring with a cross, at the centre of the chest, in the gap under the plates
    for (const [w, h, x, y] of [[0.26, 0.035, 0, 0.78], [0.26, 0.035, 0, 0.56], [0.035, 0.26, -0.13, 0.67], [0.035, 0.26, 0.13, 0.67], [0.1, 0.1, 0, 0.67]]) C.rune(w, h, 0.02, P.teal, x, y, fu - 0.005, 'sigil');
    for (const sd of [-1, 1]) { // the sides and the back
      C.rune(0.02, 0.64, 0.04, P.amber, sd * 0.615, 0.62, 0.05);
      C.rune(0.02, 0.035, 0.52, P.amber, sd * 0.615, 0.42, 0);
      node(C, sd * 0.615, 0.42, 0.26, 0.06);
    }
    channel(C, [[0, 0.2], [0, 1.0]], 0.36, 0.045);
    channel(C, [[-0.35, 0.9], [-0.35, 0.5], [0.35, 0.5], [0.35, 0.9]], 0.355);
    C.rune(0.6, 0.035, 0.02, P.teal, 0, 0.84, 0.36, 'sigil');
    C.end();
    // the YOKE: the masonry lintel the pauldrons sit on (its own piece: it falls whole in the crumble)
    const Y = chunkCluster(chest, 0, 1.1, 0);
    Y.box(1.46, 0.2, 0.64, P.stoneDark, 0, 0, 0).box(1.4, 0.03, 0.6, P.stoneLight, 0, 0.11, 0).box(1.48, 0.03, 0.66, P.stoneDeep, 0, -0.085, 0);
    Y.box(0.3, 0.014, CUT, P.crack, -0.4, 0.02, -0.323, 0, 0, 0.3).box(0.07, 0.04, CUT, P.lichenB, 0.5, 0.03, -0.323);
    GLYPHS.band(Y, 0.5, 0.14, -0.323, 0.0);
    Y.end();
  }
  // chest plates (front): the band engraved across both upper plates at the same chest height; the sternum ring last
  plate(chest, { w: 0.54, h: 0.46, x: -0.3, y: 0.81, z: -0.41, rz: 0.04, tier: 1, glyph: 'band', glyphY: -0.06 });
  plate(chest, { w: 0.54, h: 0.46, x: 0.3, y: 0.81, z: -0.41, rz: -0.05, tier: 0, c: P.stoneWarm, glyph: 'band', glyphY: -0.06 });
  plate(chest, { w: 0.6, h: 0.32, x: 0, y: 0.4, z: -0.37, rx: -0.08, tier: 3, glyph: 'ring' });
  plate(chest, { w: 0.32, h: 0.3, x: -0.42, y: 0.22, z: -0.34, ry: 0.3, tier: 2, glyph: 'bars' });
  plate(chest, { w: 0.32, h: 0.3, x: 0.42, y: 0.22, z: -0.34, ry: -0.3, tier: 0, c: P.stoneDark, glyph: 'bars' });
  // side plates: the band continues round at the same height
  plate(chest, { w: 0.54, h: 0.62, x: -0.65, y: 0.56, z: 0.02, ry: Math.PI / 2, tier: 0, c: P.stoneDark, glyph: 'band', glyphY: 0.19 });
  plate(chest, { w: 0.54, h: 0.62, x: 0.65, y: 0.56, z: 0.02, ry: -Math.PI / 2, tier: 3, c: P.stoneDark, glyph: 'band', glyphY: 0.19 });
  // the back: a great slab with moss and a fern (it breaks at the second tier) over two smaller ones, and the boulders
  // along the spine it tears its throwing rocks from
  const back = plate(chest, { w: 1.02, h: 0.7, d: 0.14, x: 0, y: 0.66, z: 0.43, ry: Math.PI, rx: 0.08, tier: 2, moss: true, glyph: 'ring', flowers: [[-0.2, 0.02, P.petalC], [0.28, -0.03, P.petalA]] });
  fern(back, 0.25, 0.42, 0, 0.9);
  plate(chest, { w: 0.44, h: 0.32, x: -0.26, y: 0.2, z: 0.37, ry: Math.PI, tier: 0, glyph: 'diamond' });
  plate(chest, { w: 0.44, h: 0.32, x: 0.26, y: 0.2, z: 0.37, ry: Math.PI, tier: 0, c: P.stoneDark, glyph: 'diamond' });
  for (const [x, y, s] of [[-0.2, 1.16, 0.22], [0.16, 0.98, 0.26], [0.0, 1.12, 0.18]]) {
    const C = chunkCluster(chest, x, y, 0.3);
    C.box(s, s * 0.8, s, P.stoneDark, 0, 0, 0, 0.2, 0.5, 0.1).box(s * 0.8, s * 0.5, s * 0.7, P.stone, 0.02, s * 0.2, 0, 0.1, 0.9, 0.3);
    C.box(s * 0.7, s * 0.3, s * 0.7, P.moss, 0, s * 0.5, 0, 0, 0.5, 0).box(s * 0.3, s * 0.15, s * 0.3, P.mossLight, s * 0.1, s * 0.62, 0, 0, 0.5, 0);
    C.end();
  }

  // ---- shoulders: massive boulders of fitted masonry crowned with moss, ferns and flowers (the left one breaks off first)
  const pauldrons = [];
  for (const sd of [-1, 1]) {
    const pd = chunk(joint(torso, sd * 0.7, 1.0, 0.0));
    const C = cluster(pd);
    C.box(0.72, 0.28, 0.76, P.stoneDark, 0, -0.1, 0); // the base course
    C.box(0.68, 0.24, 0.7, P.stone, 0, 0.14, 0); // the second course
    C.box(0.52, 0.14, 0.54, P.stoneLight, sd * 0.02, 0.32, 0); // the cap
    C.box(0.26, 0.44, 0.66, P.stoneWarm, sd * 0.3, 0.02, 0, 0, 0, sd * 0.12); // the outer shoulder, leaning out
    C.box(0.74, 0.03, 0.78, P.stoneLight, 0, 0.045, 0); // the lit seam between the courses
    C.box(0.74, 0.02, 0.78, P.crack, 0, 0.02, 0); // the crevice under it
    C.box(0.78, 0.05, 0.3, P.stoneDeep, 0, -0.26, -0.2); // the undercut
    // the boulder's rounding: chamfers (boxes turned 45°) along the top-front, top-outer and bottom-front edges
    C.box(0.6, 0.15, 0.15, P.stone, 0, 0.3, -0.32, Math.PI / 4, 0, 0);
    C.box(0.15, 0.15, 0.6, P.stoneWarm, sd * 0.36, 0.28, 0, 0, 0, Math.PI / 4);
    C.box(0.66, 0.13, 0.13, P.stoneDark, 0, -0.22, -0.36, Math.PI / 4, 0, 0);
    C.box(0.13, 0.13, 0.66, P.stoneDark, sd * 0.38, -0.2, 0, 0, 0, Math.PI / 4);
    // carved: a chevron on the front face, a crack, lichen
    GLYPHS.chevron(C, 0.5, 0.3, -0.385, 0.1);
    C.box(0.3, 0.014, CUT, P.crack, sd * 0.1, -0.08, -0.385, 0, 0, 0.5 * sd);
    C.box(0.16, 0.012, CUT, P.crack, sd * 0.18, -0.02, -0.385, 0, 0, -0.4 * sd);
    C.box(0.08, 0.06, CUT, P.lichenB, -sd * 0.2, 0.12, -0.385);
    C.box(0.06, 0.04, CUT, P.lichenC, sd * 0.3, -0.14, -0.385);
    C.box(CUT, 0.05, 0.07, P.lichenA, sd * 0.44, 0.1, 0.05);
    C.rune(0.76, 0.03, 0.8, P.amber, 0, -0.22, 0); // the channel round the base course
    node(C, 0, -0.22, -0.4, 0.06);
    C.end();
    mossPad(pd, 0.54, 0.58, 0, 0.415, 0, { flowers: [[sd * -0.08, 0.14, sd < 0 ? P.petalA : P.petalB], [sd * 0.18, -0.12, P.petalC]] });
    fern(pd, sd * 0.14, 0.44, 0.12, 1);
    fern(pd, -sd * 0.12, 0.44, -0.14, 0.7);
    vine(pd, sd * 0.3, -0.2, -0.26, 0.26);
    vine(pd, sd * 0.33, -0.18, 0.14, 0.34);
    vine(pd, -sd * 0.05, -0.1, 0.38, 0.22);
    plates.push({ obj: pd, tier: sd < 0 ? 1 : 0 });
    pauldrons.push(pd);
  }

  // ================================================================ head: small and heavy, sunk between the shoulders
  const neck = joint(torso, 0, NECK.y, NECK.z);
  cluster(neck).box(0.34, 0.2, 0.32, P.core, 0, 0.04, 0.02).rune(0.36, 0.03, 0.34, P.amber, 0, 0.06, 0.02).end();
  const head = joint(neck, 0, 0.08, 0);
  let eye;
  {
    const C = cluster(head);
    C.box(0.48, 0.36, 0.46, P.stone, 0, 0.14, -0.1);
    C.box(0.52, 0.24, 0.4, P.stone, 0, 0.13, -0.1); // the rounded sides
    C.box(0.42, 0.28, 0.54, P.stone, 0, 0.14, -0.1); // the rounded front/back
    C.box(0.4, 0.07, 0.4, P.stoneLight, 0, 0.345, -0.1); // the crown
    C.box(0.16, 0.08, 0.42, P.stoneDark, 0, 0.4, -0.12); // the crest ridge
    C.box(0.6, 0.13, 0.18, P.stoneDark, 0, 0.275, -0.36, -0.15); // the heavy brow
    C.box(0.58, 0.03, 0.16, P.stoneLight, 0, 0.345, -0.36, -0.15);
    C.box(0.3, 0.17, 0.06, P.crack, 0, 0.15, -0.35); // the deep socket
    C.box(0.1, 0.12, 0.08, P.stoneDark, 0, 0.06, -0.37); // the nose ridge under the eye
    C.box(0.34, 0.014, CUT, P.crack, 0.1, 0.3, -0.433, 0, 0, -0.5); // a crack across the brow
    C.box(0.06, 0.04, CUT, P.lichenB, -0.18, 0.22, -0.38);
    GLYPHS.diamond(C, 0.3, 0.2, 0.18, 0.12); // carved on the back of the skull
    // the teal ring round the eye, the forehead mark
    for (const [w, h, x, y] of [[0.22, 0.02, 0, 0.215], [0.22, 0.02, 0, 0.085], [0.02, 0.15, -0.11, 0.15], [0.02, 0.15, 0.11, 0.15]]) C.rune(w, h, 0.02, P.teal, x, y, -0.37, 'sigil');
    C.rune(0.03, 0.07, 0.02, P.teal, 0, 0.395, -0.335, 'sigil').rune(0.09, 0.022, 0.02, P.teal, 0, 0.425, -0.33, 'sigil');
    C.end();
    eye = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.03), glowMat(P.eye, 'eye'));
    eye.position.set(0, 0.15, -0.375); head.add(eye); meshes++;
  }
  const jaw = joint(head, 0, 0.04, 0.03);
  cluster(jaw).box(0.44, 0.15, 0.4, P.stoneDark, 0, -0.05, -0.17).box(0.36, 0.04, 0.04, P.crack, 0, 0.0, -0.37).box(0.3, 0.05, 0.02, P.stoneDeep, 0, -0.1, -0.375)
    .rune(0.26, 0.018, 0.02, P.amber, 0, 0.0, -0.38, 'seam').end();
  plate(head, { w: 0.15, h: 0.26, d: 0.06, x: -0.3, y: 0.13, z: -0.2, ry: -0.45, tier: 3, glyph: null });
  plate(head, { w: 0.15, h: 0.26, d: 0.06, x: 0.3, y: 0.13, z: -0.2, ry: 0.45, tier: 0, c: P.stoneWarm, glyph: null });
  const crown = mossPad(head, 0.32, 0.3, 0.02, 0.4, -0.04, { flowers: [[0.09, -0.06, P.petalA]] });
  fern(crown, -0.08, 0.02, 0.05, 0.6);

  // ================================================================ arms (huge gauntlet forearms, knuckled fists)
  const arms = [];
  for (const sd of [-1, 1]) {
    const shoulder = joint(torso, sd * ARM.shoulderX, ARM.shoulderY, 0);
    cluster(shoulder).box(0.36, ARM.upper, 0.38, P.core, 0, -ARM.upper / 2, 0).box(0.4, 0.1, 0.42, P.coreEdge, 0, -0.1, 0)
      .rune(0.38, 0.035, 0.4, P.amber, 0, -ARM.upper * 0.72, 0).rune(0.035, 0.3, 0.4, P.amber, sd * 0.1, -0.32, 0).end();
    plate(shoulder, { w: 0.34, h: 0.42, d: 0.08, x: sd * 0.14, y: -0.3, z: -0.14, ry: sd * 0.7, tier: 0, glyph: 'bars' });
    plate(shoulder, { w: 0.3, h: 0.36, d: 0.07, x: sd * 0.12, y: -0.32, z: 0.15, ry: Math.PI - sd * 0.6, tier: 0, c: P.stoneDark, glyph: null });
    const elbow = joint(shoulder, 0, -ARM.upper, 0);
    {
      const C = cluster(elbow);
      C.box(0.44, 0.24, 0.44, P.stoneDark, 0, -0.04, 0); // the elbow cap
      C.box(0.58, 0.5, 0.58, P.stone, 0, -0.4, 0); // the gauntlet
      C.box(0.68, 0.22, 0.68, P.stone, 0, -0.63, 0); // the flare at the wrist
      C.box(0.7, 0.03, 0.7, P.stoneLight, 0, -0.53, 0); // the lit step onto the flare
      C.box(0.62, 0.04, 0.62, P.stoneDeep, 0, -0.17, 0); // the crevice under the cap
      C.box(0.6, 0.03, 0.6, P.stoneLight, 0, -0.145, 0);
      C.box(0.56, 0.06, 0.56, P.stoneDeep, 0, -0.73, 0); // the underside of the flare
      C.box(0.3, 0.014, CUT, P.crack, sd * 0.08, -0.6, -0.345, 0, 0, 0.6 * sd);
      C.box(0.07, 0.05, CUT, P.lichenA, -sd * 0.2, -0.66, -0.345);
      C.box(0.06, 0.04, CUT, P.lichenC, sd * 0.1, -0.3, sd * 0.295, 0, 0, 0);
      C.rune(0.46, 0.03, 0.46, P.amber, 0, -0.16, 0); // the channel round the elbow
      C.rune(0.04, 0.3, 0.02, P.teal, 0, -0.38, -0.3, 'sigil'); // the sigil down the front, under the plate
      C.rune(0.02, 0.3, 0.04, P.amber, sd * 0.3, -0.36, 0);
      node(C, sd * 0.3, -0.2, 0, 0.06);
      C.end();
    }
    plate(elbow, { w: 0.5, h: 0.46, d: 0.09, x: 0, y: -0.36, z: -0.32, tier: sd > 0 ? 2 : 0, c: sd > 0 ? P.stone : P.stoneWarm, glyph: 'chevron', glyphY: 0.04 });
    plate(elbow, { w: 0.44, h: 0.4, d: 0.08, x: sd * 0.32, y: -0.38, z: 0, ry: -sd * Math.PI / 2, tier: 0, c: P.stoneDark, glyph: 'diamond' });
    const fist = joint(elbow, 0, -ARM.fore, 0);
    {
      const C = cluster(fist);
      C.box(0.56, 0.4, 0.56, P.stoneDark, 0, -0.21, 0);
      C.box(0.5, 0.08, 0.5, P.stone, 0, -0.03, 0);
      C.box(0.52, 0.03, 0.52, P.stoneLight, 0, -0.065, 0);
      for (let k = 0; k < 4; k++) C.box(0.11, 0.12, 0.14, P.stone, -0.2 + k * 0.133, -0.34, -0.24); // the knuckles
      for (let k = 0; k < 4; k++) C.box(0.11, 0.02, 0.145, P.stoneLight, -0.2 + k * 0.133, -0.275, -0.24);
      C.box(0.13, 0.22, 0.15, P.stone, -sd * 0.29, -0.2, -0.14, 0, 0, sd * 0.2); // the thumb
      C.box(0.56, 0.02, 0.02, P.crack, 0, -0.41, -0.28);
      C.box(0.014, 0.2, CUT, P.crack, sd * 0.12, -0.2, -0.285, 0, 0, 0.2);
      C.rune(0.58, 0.025, 0.58, P.amber, 0, -0.11, 0); // the channel at the wrist
      C.end();
    }
    arms.push({ shoulder, elbow, fist, side: sd });
  }
  // the rock in the right fist (tearing one from its back, the throw)
  const rock = joint(arms[1].fist, 0, -0.32, -0.12);
  cluster(rock).box(0.44, 0.36, 0.42, P.stoneDark, 0, 0, 0, 0.3, 0.4, 0.2).box(0.32, 0.28, 0.36, P.stone, 0.08, 0.1, -0.04, 0.1, 0.9, 0.4)
    .box(0.18, 0.08, 0.2, P.moss, -0.05, 0.19, 0.02, 0.2, 0.3, 0.1).end();
  rock.visible = false;

  // ================================================================ legs (hung from the rig: the IK places them)
  const legs = [];
  for (const sd of [-1, 1]) {
    const hip = joint(rig, sd * R.hipWidth, R.hipHeight, 0);
    hip.rotation.order = 'ZXY'; // the IK's order (goblin/locomotion.ts solveLeg)
    cluster(hip).box(0.42, R.thigh, 0.46, P.core, 0, -R.thigh / 2, 0).box(0.46, 0.08, 0.5, P.coreEdge, 0, -0.08, 0)
      .rune(0.44, 0.035, 0.48, P.amber, 0, -R.thigh * 0.4, 0).rune(0.035, 0.2, 0.48, P.amber, sd * 0.12, -R.thigh * 0.62, 0).end();
    plate(hip, { w: 0.46, h: 0.42, d: 0.09, x: 0, y: -R.thigh * 0.5, z: -0.28, tier: sd > 0 ? 2 : 0, glyph: 'ring' });
    plate(hip, { w: 0.42, h: 0.36, d: 0.08, x: sd * 0.26, y: -R.thigh * 0.5, z: 0, ry: -sd * Math.PI / 2, tier: 0, c: P.stoneDark, glyph: 'bars' });
    const knee = joint(hip, 0, -R.thigh, 0);
    {
      const C = cluster(knee);
      C.box(0.36, 0.28, 0.18, P.stone, 0, 0.0, -0.22); // the knee cap
      C.box(0.28, 0.03, 0.19, P.stoneLight, 0, 0.13, -0.22);
      C.box(0.4, R.shin, 0.44, P.stone, 0, -R.shin / 2, 0);
      C.box(0.44, 0.04, 0.48, P.stoneDeep, 0, -R.shin * 0.3, 0); // a crevice course round the shin
      C.box(0.42, 0.025, 0.46, P.stoneLight, 0, -R.shin * 0.3 + 0.03, 0);
      C.box(0.014, 0.2, CUT, P.crack, sd * 0.1, -0.4, -0.225, 0, 0, 0.3);
      C.box(0.06, 0.045, CUT, P.lichenA, -sd * 0.12, -0.46, -0.225);
      C.rune(0.03, R.shin * 0.6, 0.02, P.teal, 0, -R.shin * 0.55, -0.225, 'sigil');
      node(C, 0, -R.shin * 0.2, -0.225, 0.07);
      C.end();
    }
    plate(knee, { w: 0.42, h: 0.38, d: 0.08, x: 0, y: -R.shin * 0.52, z: -0.26, tier: sd < 0 ? 3 : 0, c: P.stoneWarm, glyph: 'bars' });
    const ankle = joint(knee, 0, -R.shin, 0);
    {
      const C = cluster(ankle);
      C.box(0.5, 0.18, 0.7, P.stoneDark, 0, -R.ankle + 0.09, -0.1); // the slab foot, sole at -ankle
      C.box(0.44, 0.07, 0.56, P.stone, 0, -R.ankle + 0.2, -0.06);
      C.box(0.46, 0.025, 0.6, P.stoneLight, 0, -R.ankle + 0.18, -0.08);
      for (let k = 0; k < 3; k++) C.box(0.14, 0.12, 0.14, P.stone, -0.15 + k * 0.15, -R.ankle + 0.06, -0.49); // toes
      for (let k = 0; k < 3; k++) C.box(0.14, 0.02, 0.145, P.stoneLight, -0.15 + k * 0.15, -R.ankle + 0.12, -0.49);
      C.box(0.34, 0.14, 0.14, P.stoneDeep, 0, -R.ankle + 0.07, 0.27); // the heel
      C.box(0.4, 0.012, CUT, P.crack, sd * 0.02, -R.ankle + 0.09, -0.455, 0, 0, 0.15);
      C.box(0.06, 0.04, CUT, P.lichenC, sd * 0.15, -R.ankle + 0.12, -0.455);
      C.end();
    }
    legs.push({ hip, knee, ankle, side: sd });
  }

  return {
    group, legs: [], arms: [], glows, plates,
    joints: { rig, pelvis, torso, chest, neck, head, jaw, eye, arms, legs, rock, pauldrons, ferns, vines, back },
    parts: countMeshes(group),
  };
}

/**
 * Merges boxes into ONE indexed geometry: each spec { w, h, d, c, x, y, z, rx, ry, rz, frame } becomes 24 vertices and
 * 36 indices placed by its own transform (and `frame`, a Matrix4, if given). With `colours`, a vertex colour attribute
 * carries each box's colour, shaded a little by its face's normal (tops lighter, undersides darker: cut stone).
 */
function mergeBoxes(THREE, specs, colours) {
  const n = specs.length;
  const pos = new Float32Array(n * 72), nor = new Float32Array(n * 72), col = colours ? new Float32Array(n * 72) : null;
  const idx = new Uint32Array(n * 36);
  const m = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  specs.forEach((b, i) => {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d);
    e.set(b.rx || 0, b.ry || 0, b.rz || 0);
    m.compose(p.set(b.x, b.y, b.z), q.setFromEuler(e), one);
    if (b.frame) m.premultiply(b.frame);
    g.applyMatrix4(m);
    pos.set(g.attributes.position.array, i * 72);
    nor.set(g.attributes.normal.array, i * 72);
    const ia = g.index.array;
    for (let k = 0; k < 36; k++) idx[i * 36 + k] = ia[k] + i * 24;
    if (col) {
      const r = ((b.c >> 16) & 255) / 255, gg = ((b.c >> 8) & 255) / 255, bl = (b.c & 255) / 255;
      const na = g.attributes.normal.array;
      for (let v = 0; v < 24; v++) {
        const ny = na[v * 3 + 1], nx = na[v * 3];
        const shade = 1 + 0.09 * ny - 0.03 * Math.abs(nx);
        col[(i * 24 + v) * 3] = Math.min(1, r * shade); col[(i * 24 + v) * 3 + 1] = Math.min(1, gg * shade); col[(i * 24 + v) * 3 + 2] = Math.min(1, bl * shade);
      }
    }
    g.dispose();
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

function countMeshes(g) { let n = 0; g.traverse((o) => { if (o.isMesh) n++; }); return n; }

/** The pieces the crumble breaks the body into: every chunk group (plates, pauldrons, moss pads, boulders) whole, and every
 * other mesh on its own. */
export function crumblePieces(group) {
  const out = [];
  const walk = (o) => {
    for (const c of o.children) {
      if (c.userData?.chunk) { out.push(c); continue; }
      if (c.isMesh) out.push(c);
      walk(c);
    }
  };
  walk(group);
  return out;
}
