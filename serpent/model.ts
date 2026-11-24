// @ts-check
// The Root Serpent's body, built in code (an original design and palette): a long serpent made of TWISTED ROOTS and BARK.
//   - the head: a heavy carved-wood skull with a HOOD of two bark plates flaring back from behind the eyes, a crest of five
//     roots sweeping back from the crown, jowls, a narrower snout with two nostril knots, brow plates that overhang two big
//     RED EMBER EYES (a deep red core with a hotter red-orange slit, both unlit; an additive halo sprite behind each that
//     the renderer fades in as the daylight goes, so they GLOW AT NIGHT), carved grooves over the crown and down the cheeks
//     with cracks of faint sap glow in them, a frill of root ends at the cheeks, a moss cap with a leaf sprout; a lower jaw on a hinge that
//     opens WIDE, lined with pale thorn teeth and two pairs of long root FANGS, a dark throat with a faint sap glow, and a
//     forked twig of a tongue that flicks;
//   - the body: BODY.segments segments tapering to the tail; each one is wider than it is tall (a snake's belly on the
//     ground), an eight-sided bark core in two tones with lighter weathered RIDGES along the back and a dark groove between
//     them, furrows across, three root STRANDS that spiral along the whole body (each segment turns them a step further,
//     and each strand is two halves at slightly different angles so the spiral winds inside the segment too), gnarled KNOTS,
//     moss patches (some dripping down a flank), small leaf sprouts, dry twigs and cracks of amber sap down the flanks, all
//     at irregular intervals (hashed per segment);
//   - the tail: the last segments are bare root; the tip SPLITS into three tendrils, with a rattle of dry seed pods on the
//     middle one (it buzzes when alarmed).
// The glow is EMISSIVE ONLY (unlit materials whose colour the renderer dims and pulses, and the eyes' additive halo
// sprites): nothing lights the scene.
// The engine's group is the mob (position, yaw); the renderer poses the head and segments in WORLD space through
// `world`, a child whose rotation cancels the group's yaw. Every part's forward is -z.
import { BODY } from './tuning.ts';
import { segmentRadius } from './spine.ts';
import { hash01 } from '../goblin/procedural.ts';

export const PALETTE = Object.freeze({
  // dark walnut and umber bark, lighter weathered ridges, near-black grooves
  bark: 0x4a3424, barkDark: 0x33231a, barkLight: 0x66492f, ridge: 0x7d5f40, ridgeLight: 0x9a7a52, furrow: 0x1f140d,
  root: 0x5a4330, rootDark: 0x3d2b1d, rootPale: 0x8a6c4c,
  carve: 0x8c7050, carveLight: 0xae8d66, carveDark: 0x6a5238, // the head's carved, paler wood
  moss: 0x4f7a2e, mossDark: 0x3a5c21, mossLight: 0x6fa040, leaf: 0x5e8f34, leafDark: 0x416b25, leafDry: 0x8f7c3c,
  twig: 0x5c4630, thorn: 0xd9cba4, thornDark: 0xb09a70, mouth: 0x2a1510, tongue: 0x6e2a22, pupil: 0x2a1409,
  pod: 0x9a7a48, podDark: 0x6a5232,
  // the burrow mound: churned soil with grass bits
  soil: 0x5a3d26, soilDark: 0x43291a, soilLight: 0x75553a, grass: 0x5f9e36, grassDark: 0x4a8229,
  // the glow (unlit): amber sap in the cracks and the throat; the eyes a deep red with a hotter red-orange slit, and a red
  // halo behind each (additive, faded in by the renderer as the daylight goes)
  sap: 0xe8a53a, eye: 0xd8141a, eyeSlit: 0xff6a2e, eyeHalo: 0xff2a18, throat: 0xd98a2e,
});

/** The halo behind each eye: a soft red radial glow drawn on a canvas (the browser only: a test double has no canvas). */
function eyeHaloTexture(THREE: any) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,120,80,1)');
  r.addColorStop(0.22, 'rgba(255,50,30,0.6)');
  r.addColorStop(0.55, 'rgba(230,20,20,0.16)');
  r.addColorStop(1, 'rgba(200,10,10,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace ?? t.colorSpace;
  return t;
}

/** The joints the renderer moves, per serpent. */
export type SerpentJoints = {
  world: any, head: any, jaw: any, tongue: any, eyes: any[], halos: any[], segs: any[], rattle: any, mound: any,
  glow: { sap: any, eye: any, eyeSlit: any, throat: any, base: { sap: any, eye: any, eyeSlit: any, throat: any } },
};

/** The spiral's angle (radians about the body's axis) at segment `i`: it accumulates along the chain, a little faster
 * towards the thin tail (roots wind tighter as they thin). */
export const strandTwist = (i: number) => i * 0.5 + i * i * 0.006;

/** Builds the serpent. Returns the engine's { group, legs, arms } (empty: the renderer moves everything) plus the joints. */
export function buildSerpent({ THREE }: any) {
  const mats = new Map();
  const mat = (c: number) => { let m = mats.get(c); if (!m) { m = new THREE.MeshLambertMaterial({ color: c }); mats.set(c, m); } return m; };
  const glowMat = (c: number) => new THREE.MeshBasicMaterial({ color: c, fog: false });
  // Every box of a part that never moves on its own is MERGED with the others of the same material under the same moving
  // joint (one mesh per material per joint: a few draw calls per segment instead of twenty). A static sub-joint (`fixed`)
  // bakes its transform into the geometry. Without the real three (a fake kit in a test) it falls back to one mesh per box.
  const canMerge = !!(THREE.BufferGeometry && THREE.BufferAttribute && THREE.Matrix4 && THREE.Euler && THREE.Quaternion && THREE.Vector3);
  const pending = new Map(); // real joint -> Map(material -> geometries)
  // a box rotated about its own centre (rx, ry, rz) then placed at (ox, oy, oz) in its parent (a joint or a `fixed` frame)
  const box = (parent: any, w: number, h: number, d: number, m: any, ox = 0, oy = 0, oz = 0, rx = 0, ry = 0, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    if (rz) g.rotateZ(rz);
    g.translate(ox, oy, oz);
    const material = typeof m === 'number' ? mat(m) : m;
    const real = parent.bake ? parent.real : parent;
    if (parent.bake) g.applyMatrix4(parent.bake);
    if (!canMerge) { const mesh = new THREE.Mesh(g, material); real.add(mesh); return mesh; }
    let byMat = pending.get(real);
    if (!byMat) pending.set(real, byMat = new Map());
    let list = byMat.get(material);
    if (!list) byMat.set(material, list = []);
    list.push(g);
    return null;
  };
  // a box that stays a mesh of its own (the eyes: the joints list them)
  const solo = (parent: any, w: number, h: number, d: number, m: any, ox = 0, oy = 0, oz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(ox, oy, oz);
    const mesh = new THREE.Mesh(g, typeof m === 'number' ? mat(m) : m);
    parent.add(mesh);
    return mesh;
  };
  const joint = (parent: any, x = 0, y = 0, z = 0) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };
  // a static frame under a joint (or under another frame): its boxes are baked into the joint's merged meshes
  const fixed = (parent: any, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    if (!canMerge) { const j = joint(parent, x, y, z); j.rotation.set(rx, ry, rz); return j; }
    const local = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ')), new THREE.Vector3(1, 1, 1));
    return { real: parent.bake ? parent.real : parent, bake: parent.bake ? parent.bake.clone().multiply(local) : local };
  };
  const flush = () => {
    for (const [real, byMat] of pending) for (const [material, list] of byMat) real.add(new THREE.Mesh(list.length === 1 ? list[0] : mergeBoxes(THREE, list), material));
    pending.clear();
  };
  const P = PALETTE;
  const sap = glowMat(P.sap), eye = glowMat(P.eye), eyeSlit = glowMat(P.eyeSlit), throat = glowMat(P.throat);

  const group = new THREE.Group();
  const world = joint(group); // world-aligned: the renderer cancels the group's yaw on it

  // ------------------------------------------------------------------ the head (origin: the neck; the snout is at -z)
  const head = joint(world);
  head.rotation.order = 'YXZ'; // yaw, then pitch, then roll
  const skull = head; // the skull's parts merge under the head
  // the cranium: a heavy block in stepped layers (wider at the back, top-lit), a weathered ridge down the crown
  box(skull, 0.36, 0.17, 0.28, P.carve, 0, 0.0, -0.08);
  box(skull, 0.30, 0.05, 0.26, P.carveLight, 0, 0.105, -0.08);
  box(skull, 0.07, 0.025, 0.30, P.ridgeLight, 0, 0.14, -0.1);
  box(skull, 0.38, 0.13, 0.14, P.bark, 0, -0.03, 0.05); // the back of the skull: rough bark where it meets the neck
  box(skull, 0.40, 0.04, 0.06, P.ridge, 0, 0.05, 0.06); // a collar of lighter bark
  for (const sx of [-1, 1]) box(skull, 0.07, 0.07, 0.07, P.barkDark, sx * 0.17, -0.06, 0.06); // knots at the neck
  // jowls: the skull is widest just behind the eyes
  for (const sx of [-1, 1]) box(skull, 0.07, 0.13, 0.2, P.carveDark, sx * 0.19, -0.02, -0.1);
  // the snout: narrower and lower, a lighter top plate, a nose block with two nostril knots
  box(skull, 0.24, 0.13, 0.26, P.carve, 0, -0.01, -0.32);
  box(skull, 0.20, 0.04, 0.24, P.carveLight, 0, 0.065, -0.31);
  box(skull, 0.16, 0.10, 0.07, P.carve, 0, -0.02, -0.465);
  box(skull, 0.12, 0.03, 0.05, P.carveLight, 0, 0.04, -0.47);
  for (const sx of [-1, 1]) box(skull, 0.04, 0.035, 0.035, P.barkDark, sx * 0.045, 0.02, -0.49);
  // carved grooves: two long ones over the crown, one between the eyes, and down each cheek
  for (const sx of [-1, 1]) {
    box(skull, 0.014, 0.014, 0.30, P.furrow, sx * 0.075, 0.128, -0.1);
    box(skull, 0.014, 0.10, 0.014, P.furrow, sx * 0.182, -0.03, -0.14, 0, 0, sx * 0.28);
    box(skull, 0.014, 0.014, 0.14, P.furrow, sx * 0.182, -0.07, -0.02);
    box(skull, 0.014, 0.014, 0.1, P.furrow, sx * 0.12, 0.085, -0.3);
  }
  box(skull, 0.014, 0.014, 0.14, P.furrow, 0, 0.088, -0.31);
  // cracks of sap glow lying in some of the grooves (thin, subtle: the renderer dims them)
  for (const sx of [-1, 1]) {
    box(skull, 0.008, 0.06, 0.008, sap, sx * 0.186, -0.02, -0.14, 0, 0, sx * 0.28);
    box(skull, 0.008, 0.008, 0.12, sap, sx * 0.075, 0.131, -0.02);
  }
  box(skull, 0.008, 0.008, 0.08, sap, 0, 0.091, -0.33);
  // brow plates overhanging the eyes; the eyes: deep red embers set in dark sockets, a hotter red-orange slit in each
  // (both unlit), and behind each a soft additive HALO sprite that the renderer fades in as the daylight goes (it sits a
  // hair outside the eye, so it is the first thing seen when the head breaks out of the soil)
  const eyes: any[] = [], halos: any[] = [];
  let haloTex: any = null;
  try { haloTex = eyeHaloTexture(THREE); } catch { haloTex = null; } // no DOM canvas (a test double): the eyes alone
  for (const sx of [-1, 1]) {
    box(skull, 0.12, 0.045, 0.13, P.barkLight, sx * 0.135, 0.095, -0.2, 0.12, 0, sx * -0.2);
    box(skull, 0.03, 0.03, 0.08, P.barkDark, sx * 0.19, 0.08, -0.22);
    box(skull, 0.04, 0.065, 0.1, P.furrow, sx * 0.175, 0.03, -0.21); // the socket
    const e = solo(skull, 0.03, 0.055, 0.08, eye, sx * 0.185, 0.03, -0.21);
    eyes.push(e);
    box(skull, 0.012, 0.045, 0.013, eyeSlit, sx * 0.202, 0.03, -0.21); // the slit, a vertical ember
    if (haloTex && THREE.Sprite && THREE.SpriteMaterial) {
      const hm = new THREE.SpriteMaterial({ map: haloTex, color: P.eyeHalo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 });
      const halo = new THREE.Sprite(hm);
      halo.scale.set(0.62, 0.62, 1); // player feedback: the eyes must read at night from afar
      halo.position.set(sx * 0.215, 0.03, -0.21);
      halo.visible = false;
      skull.add(halo);
      halos.push(halo);
    }
    // cheek knots
    box(skull, 0.06, 0.07, 0.07, P.ridge, sx * 0.19, -0.04, -0.06);
    box(skull, 0.035, 0.035, 0.035, P.barkDark, sx * 0.21, -0.035, -0.06);
  }
  // upper teeth: pale thorns along the snout's lower edge, and two long root fangs (bent back at the tip)
  for (const sx of [-1, 1]) for (const z of [-0.43, -0.37, -0.31, -0.25, -0.19]) box(skull, 0.018, 0.045, 0.018, P.thorn, sx * (0.09 - (z + 0.43) * 0.1), -0.085, z);
  for (const sx of [-1, 1]) {
    const fang = fixed(skull, sx * 0.075, -0.07, -0.4, 0, 0, sx * 0.12);
    box(fang, 0.026, 0.08, 0.026, P.thorn, 0, -0.04, 0);
    box(fang, 0.02, 0.05, 0.02, P.thornDark, 0, -0.095, 0.012, -0.35, 0, 0);
    const fang2 = fixed(skull, sx * 0.1, -0.075, -0.24);
    box(fang2, 0.022, 0.065, 0.022, P.thorn, 0, -0.03, 0);
  }
  // the HOOD: two bark plates flaring back and out from behind the eyes, a lighter ridge on their edge, a notch in each
  for (const sx of [-1, 1]) {
    const hood = fixed(skull, sx * 0.17, 0.09, -0.08, 0, sx * 0.75, sx * -0.55);
    box(hood, 0.05, 0.2, 0.32, P.bark, 0, 0.02, 0.12);
    box(hood, 0.03, 0.22, 0.3, P.ridge, sx * 0.025, 0.02, 0.13);
    box(hood, 0.02, 0.06, 0.12, P.ridgeLight, sx * 0.04, 0.08, 0.16);
    box(hood, 0.06, 0.02, 0.06, P.furrow, 0, -0.02, 0.18);
    box(hood, 0.05, 0.05, 0.07, P.barkDark, 0, -0.06, 0.25); // a knot at the hood's trailing corner
  }
  // the root crest: five roots sweeping back from the crown, each two bent pieces, and a frill of root ends at the cheeks
  for (const [x, len, lift] of [[0, 0.28, 0.55], [-0.06, 0.22, 0.4], [0.06, 0.22, 0.4], [-0.11, 0.16, 0.25], [0.11, 0.16, 0.25]]) {
    const r1 = fixed(skull, x, 0.13, -0.1, lift, x * 2.2, 0);
    box(r1, 0.04, 0.04, len, P.root, 0, 0, len / 2);
    box(r1, 0.022, 0.022, len * 0.55, P.rootPale, 0, 0.02, len * 0.4);
    const r2 = fixed(r1, 0, 0, len, -0.65, 0, 0);
    box(r2, 0.028, 0.028, len * 0.6, P.rootDark, 0, 0, len * 0.3);
  }
  for (const sx of [-1, 1]) for (const [y, a, l] of [[-0.02, 0.5, 0.14], [-0.08, 0.85, 0.12], [0.03, 0.25, 0.1], [-0.05, 0.65, 0.16]]) {
    const f = fixed(skull, sx * 0.19, y, -0.02, -0.2 + y, sx * a, 0);
    box(f, 0.024, 0.024, l, P.root, 0, 0, l / 2);
  }
  // the moss cap and its sprout
  box(skull, 0.18, 0.025, 0.14, P.moss, 0.01, 0.14, -0.0);
  box(skull, 0.09, 0.02, 0.07, P.mossLight, 0.04, 0.153, 0.02);
  box(skull, 0.06, 0.02, 0.05, P.mossDark, -0.07, 0.15, -0.03);
  const sprout = fixed(skull, -0.03, 0.15, 0.01);
  box(sprout, 0.012, 0.08, 0.012, P.twig, 0, 0.04, 0);
  box(sprout, 0.07, 0.008, 0.04, P.leaf, 0.035, 0.08, 0, 0, 0, -0.5);
  box(sprout, 0.055, 0.008, 0.032, P.leafDark, -0.028, 0.065, 0, 0, 0, 0.6);
  box(sprout, 0.04, 0.008, 0.03, P.leaf, 0.01, 0.1, 0.02, 0.6, 0.3, 0);
  // the lower jaw on its hinge (at the back, low): the renderer opens it by rotation.x
  const jaw = joint(head, 0, -0.07, 0.02);
  box(jaw, 0.28, 0.06, 0.18, P.carve, 0, -0.03, -0.1);
  box(jaw, 0.2, 0.055, 0.24, P.carve, 0, -0.025, -0.3);
  box(jaw, 0.14, 0.03, 0.05, P.carveDark, 0, -0.03, -0.43); // the chin
  box(jaw, 0.08, 0.02, 0.2, P.ridgeLight, 0, -0.058, -0.3); // a weathered ridge under the jaw
  box(jaw, 0.24, 0.012, 0.4, P.mouth, 0, 0.003, -0.22); // the dark inside
  box(jaw, 0.1, 0.008, 0.14, throat, 0, 0.011, -0.07); // a faint sap glow down the throat
  for (const sx of [-1, 1]) for (const z of [-0.4, -0.34, -0.28, -0.22, -0.16]) box(jaw, 0.016, 0.04, 0.016, P.thorn, sx * (0.08 - (z + 0.4) * 0.08), 0.025, z);
  for (const sx of [-1, 1]) box(jaw, 0.022, 0.06, 0.022, P.thorn, sx * 0.075, 0.03, -0.37, 0.15, 0, 0); // two lower fangs
  box(jaw, 0.1, 0.035, 0.07, P.barkDark, 0, -0.055, -0.08); // a knot under the chin
  for (const sx of [-1, 1]) box(jaw, 0.012, 0.012, 0.16, P.furrow, sx * 0.1, -0.06, -0.26); // grooves under the jaw
  // the tongue: a forked twig that flicks out of the front of the mouth
  const tongue = joint(jaw, 0, 0.012, -0.4);
  box(tongue, 0.016, 0.01, 0.16, P.tongue, 0, 0, -0.08);
  box(tongue, 0.012, 0.01, 0.07, P.tongue, -0.014, 0, -0.18, 0, 0.35, 0);
  box(tongue, 0.012, 0.01, 0.07, P.tongue, 0.014, 0, -0.18, 0, -0.35, 0);
  tongue.scale.z = 0.01;

  // ------------------------------------------------------------------ the segments
  const segs: any[] = [];
  const n = BODY.segments, len = BODY.spacing * 1.35;
  const strandColours = [P.root, P.rootDark, P.barkLight];
  for (let i = 0; i < n; i++) {
    const r = segmentRadius(i, n), h = hash01(i * 31 + 7), h2 = hash01(i * 53 + 3), h3 = hash01(i * 71 + 11), h4 = hash01(i * 97 + 5);
    const seg = joint(world);
    seg.rotation.order = 'YXZ';
    const body = joint(seg); // the renderer rolls this (the death) and banks it into turns
    const tail = i >= n - 3, tip = i === n - 1;
    // the bark core: wider than tall (its belly on the ground), eight-sided from two boxes, two tones
    const W = 2 * r * 1.3, H = 2 * r;
    const tone = h < 0.5 ? P.bark : P.barkDark;
    box(body, W, H * 0.72, len, tone);
    box(body, W * 0.72, H, len, h2 < 0.5 ? P.bark : P.barkDark);
    if (!tip) {
      // the belly: a paler worn strip; the back: two weathered ridges with a dark groove between them
      box(body, W * 0.6, H * 0.1, len * 0.9, P.barkLight, 0, -H * 0.48, 0);
      box(body, W * 0.14, H * 0.1, len * 0.96, P.furrow, 0, H * 0.49, 0);
      for (const sx of [-1, 1]) box(body, W * 0.2, H * 0.1, len * (0.9 + 0.1 * h3), h3 < 0.5 ? P.ridge : P.ridgeLight, sx * W * 0.24, H * 0.5, 0);
      // flank grooves and a furrow across (at a hashed offset along the segment)
      for (const sx of [-1, 1]) box(body, W * 0.06, H * 0.1, len * 0.7, P.furrow, sx * W * 0.5, H * (0.1 - 0.2 * h2), (h - 0.5) * len * 0.2);
      if (!tail) box(body, W * 1.03, H * 0.12, len * 0.08, P.furrow, 0, H * 0.3, (h2 - 0.5) * len * 0.6);
    }
    // three root strands spiralling along the body: each lies along the segment at an angle about the axis that the whole
    // chain turns a step further per segment; each is two halves at slightly different angles, so the spiral winds inside
    // the segment as well; the strands sit on the body's ellipse; a thin pale fibre rides the first
    const tw = strandTwist(i), step = (strandTwist(i + 1) - tw) / 4;
    const w = Math.max(0.018, r * 0.42);
    const ex = W * 0.5 * 0.88, ey = H * 0.5 * 0.88;
    for (let k = 0; k < 3; k++) {
      if (tip && k === 2) break;
      const base = (k / 3) * Math.PI * 2 + tw;
      for (const [zc, da] of [[len * 0.25, step], [-len * 0.25, -step]]) {
        const a = base + da;
        const x = -Math.sin(a) * ex, y = Math.cos(a) * ey;
        box(body, w * 1.1, w, len * 0.54, strandColours[k], x, y, zc, 0, 0, a);
        if (k === 0 && r > 0.07) box(body, w * 0.35, w * 0.3, len * 0.5, P.rootPale, x - Math.cos(a) * w * 0.2 - Math.sin(a) * w * 0.5, y - Math.sin(a) * w * 0.2 + Math.cos(a) * w * 0.5, zc, 0, 0, a);
      }
    }
    if (!tail) {
      // a gnarled knot on a flank now and then: a bulge, a darker eye in it, a pale rim
      if (h2 > 0.6) {
        const ka = h3 * Math.PI * 2;
        const kx = -Math.sin(ka) * ex * 0.95, ky = Math.cos(ka) * ey * 0.95;
        box(body, r * 0.55, r * 0.5, len * 0.5, P.barkLight, kx, ky, (h - 0.5) * len * 0.3, 0, 0, ka);
        box(body, r * 0.62, r * 0.2, len * 0.56, P.ridge, kx, ky, (h - 0.5) * len * 0.3, 0, 0, ka);
        box(body, r * 0.28, r * 0.6, len * 0.26, P.furrow, kx * 1.05, ky * 1.05, (h - 0.5) * len * 0.3, 0, 0, ka);
      }
      // moss on the back (not on every segment): a low cushion with a lighter top, shifted to a side; some drip down a flank
      if (h > 0.35) {
        const mw = W * (0.35 + 0.3 * h), ml = len * (0.4 + 0.4 * h), mx = (h - 0.5) * W * 0.5;
        box(body, mw, H * 0.1, ml, h > 0.62 ? P.moss : P.mossDark, mx, H * 0.5, 0);
        box(body, mw * 0.6, H * 0.07, ml * 0.6, P.mossLight, mx + (h3 - 0.5) * mw * 0.3, H * 0.55, 0.01);
        if (h3 > 0.55) {
          const sx = h4 < 0.5 ? -1 : 1;
          box(body, H * 0.12, H * 0.45, ml * 0.4, h > 0.62 ? P.moss : P.mossDark, sx * W * 0.5, H * 0.25, (h - 0.5) * len * 0.3, 0, 0, sx * -0.3);
        }
      }
      // the sap: thin cracks down the flanks, glowing faintly (unlit, dimmed by the renderer)
      if (i % 2 === 0) {
        const side = h < 0.5 ? -1 : 1;
        box(body, r * 0.05, r * 0.45, len * 0.1, sap, side * W * 0.5, 0.0, -len * 0.12, 0.5 * side, 0, 0);
        box(body, r * 0.05, r * 0.3, len * 0.08, sap, side * W * 0.5, -r * 0.1, len * 0.14, -0.6 * side, 0, 0);
        if (r > 0.1) box(body, r * 0.05, r * 0.25, len * 0.08, sap, -side * W * 0.5, r * 0.2, 0.02, -0.4 * side, 0, 0);
      }
      // a tuft of leaves and a twig along the spine, at irregular intervals; dry twigs sticking out of a flank elsewhere
      if (h4 > 0.5) {
        const tuft = fixed(body, (h3 - 0.5) * W * 0.4, H * 0.5, (h2 - 0.5) * len * 0.5);
        const s = 0.6 + r * 2.6;
        box(tuft, 0.013, 0.1 * s, 0.013, P.twig, 0, 0.05 * s, 0.01, -0.4 + (h3 - 0.5) * 0.4, 0, (h2 - 0.5) * 0.5);
        box(tuft, 0.075 * s, 0.008, 0.045 * s, P.leaf, 0.035 * s, 0.055 * s, 0.02, 0, 0.3, -0.55);
        box(tuft, 0.065 * s, 0.008, 0.038 * s, h > 0.5 ? P.leafDark : P.leafDry, -0.03 * s, 0.045 * s, -0.01, 0, -0.4, 0.6);
        box(tuft, 0.05 * s, 0.008, 0.03 * s, P.leaf, 0, 0.085 * s, 0.03, 0.5, 0, 0);
        if (h3 > 0.5) box(tuft, 0.04 * s, 0.008, 0.025 * s, P.leafDark, 0.01 * s, 0.1 * s, -0.02, -0.4, 0.6, 0);
      } else if (h4 < 0.22) {
        const sx = h3 < 0.5 ? -1 : 1;
        const twig = fixed(body, sx * W * 0.45, H * 0.2, (h2 - 0.5) * len * 0.4, (h - 0.5) * 0.8, 0, sx * -0.9);
        box(twig, 0.014, 0.1 + r * 0.5, 0.014, P.twig, 0, 0.05 + r * 0.25, 0);
        box(twig, 0.012, 0.05, 0.012, P.rootDark, 0.012, 0.09 + r * 0.5, 0, 0, 0, -0.5);
        if (h4 < 0.1) box(twig, 0.04, 0.008, 0.025, P.leafDry, 0.02, 0.11 + r * 0.5, 0, 0, 0, -0.3);
      }
    }
    if (tip) {
      // the root tip splits into three tendrils trailing behind (z+), a pale fibre on the middle one
      for (const [ry, rx, l, c] of [[0, 0.1, 0.34, P.root], [0.5, -0.15, 0.26, P.rootPale], [-0.45, 0.2, 0.24, P.rootDark]] as Array<[number, number, number, number]>) {
        const t = fixed(body, 0, 0, len * 0.4, rx, ry, 0);
        box(t, 0.024, 0.022, l, c, 0, 0, l / 2);
        box(t, 0.014, 0.014, l * 0.4, P.rootDark, 0.01, 0.005, l * 0.95, 0, ry * 0.6, 0);
      }
    }
    segs.push({ seg, body, r });
  }
  // the rattle: dry seed pods strung on the middle tendril of the tail's tip
  const tip = segs[n - 1];
  const rattle = joint(tip.body, 0, 0, len * 0.4);
  rattle.rotation.x = 0.1;
  for (let k = 0; k < 3; k++) {
    const pod = fixed(rattle, 0, 0.012, 0.1 + k * 0.07);
    box(pod, 0.045 - k * 0.006, 0.04 - k * 0.006, 0.05, k % 2 ? P.podDark : P.pod, 0, 0, 0.02);
    box(pod, 0.05 - k * 0.006, 0.012, 0.012, P.podDark, 0, 0, 0.0);
  }

  // ------------------------------------------------------------------ the mound (only while it travels under the soil)
  const mound = joint(world);
  // churned soil: a heave of clods in three browns, tilted every way, grass bits torn up with it on top, root ends breaking
  // through, loose clods thrown around
  for (const [x, z, w, h, c, rx, rz] of [
    [0, 0, 0.56, 0.16, P.soil, 0.1, 0.08], [0.06, -0.05, 0.3, 0.3, P.soilDark, 0.25, -0.2], [-0.08, 0.04, 0.26, 0.26, P.soil, -0.2, 0.3],
    [0.13, -0.2, 0.26, 0.2, P.soilLight, -0.3, 0.2], [-0.16, 0.13, 0.26, 0.17, P.soil, 0.2, 0.35], [0.2, 0.17, 0.2, 0.14, P.soilLight, 0.35, -0.2],
    [-0.22, -0.13, 0.22, 0.18, P.soilDark, -0.25, -0.3], [0.0, 0.26, 0.22, 0.12, P.soil, 0.3, 0.1], [-0.07, -0.26, 0.18, 0.15, P.soilLight, 0.3, 0.3],
    [0.22, -0.02, 0.16, 0.12, P.soilDark, 0.2, -0.4], [0.02, 0.1, 0.14, 0.22, P.soilLight, 0.4, 0.3],
  ] as Array<[number, number, number, number, number, number, number]>) {
    box(mound, w, h, w * 0.9, c, x, h / 2 - 0.03, z, rx, 0, rz);
  }
  // torn grass bits riding on top of the clods, tilted with them
  for (const [x, y, z, w, c, ry, rz] of [
    [0.06, 0.29, -0.05, 0.12, P.grass, 0.3, -0.2], [-0.08, 0.24, 0.04, 0.1, P.grassDark, -0.4, 0.3], [0.13, 0.2, -0.2, 0.09, P.grass, 0.5, 0.2],
    [-0.16, 0.16, 0.13, 0.08, P.grassDark, 0.2, 0.35], [0.2, 0.13, 0.17, 0.07, P.grass, -0.3, -0.2], [-0.22, 0.17, -0.13, 0.08, P.grass, 0.6, -0.3],
    [0.0, 0.11, 0.26, 0.07, P.grassDark, 0.1, 0.1], [0.02, 0.22, 0.1, 0.08, P.grass, -0.5, 0.3],
  ] as Array<[number, number, number, number, number, number, number]>) {
    box(mound, w, 0.035, w * 0.8, c, x, y, z, 0, ry, rz);
  }
  for (const [x, z, a] of [[0.12, -0.05, 0.5], [-0.08, 0.05, -0.6], [0.04, 0.14, 0.2]] as Array<[number, number, number]>) box(mound, 0.04, 0.22, 0.04, P.rootPale, x, 0.22, z, a, 0, 0.3);
  for (const [x, z, s] of [[0.4, 0.1, 0.08], [-0.38, -0.2, 0.07], [0.22, -0.4, 0.06], [-0.26, 0.36, 0.07], [0.36, -0.3, 0.05]] as Array<[number, number, number]>) box(mound, s, s * 0.8, s, s > 0.06 ? P.soil : P.soilLight, x, s * 0.3, z, 0, x * 2, 0);
  mound.visible = false;

  flush();
  const joints: SerpentJoints = {
    world, head, jaw, tongue, eyes, halos, segs, rattle, mound,
    glow: { sap, eye, eyeSlit, throat, base: { sap: new THREE.Color(P.sap), eye: new THREE.Color(P.eye), eyeSlit: new THREE.Color(P.eyeSlit), throat: new THREE.Color(P.throat) } },
  };
  return { group, legs: [], arms: [], joints, parts: countMeshes(group) };
}

function countMeshes(g: any) { let n = 0; g.traverse((o: any) => { if (o.isMesh) n++; }); return n; }

/** One indexed geometry out of several boxes (position, normal, uv and the index, offset per box). */
function mergeBoxes(THREE: any, list: any[]) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const g of list) {
    const p = g.attributes.position, ix = g.index;
    pos.set(p.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3); uv.set(g.attributes.uv.array, vo * 2);
    for (let k = 0; k < ix.count; k++) idx[io + k] = ix.array[k] + vo;
    vo += p.count; io += ix.count;
    g.dispose?.();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
