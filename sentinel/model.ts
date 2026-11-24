// @ts-check
// The Canopy Sentinel's body, built in code from boxes (original design and palette): a tall, lean forest hunter in a
// deep hood whose long point trails up and back, a CARVED WOODEN MASK (two tapered plates, a brow ridge, a beak nose,
// grain lines, painted bone-white and red-ochre markings, eye slits with a faint glow behind them, red cords tying it
// to the hood, a leaf crest), a FEATHERED mantle over the shoulders (three overlapping rows of feathers of varied length
// and colour, each with a pale quill and a tapered tip, plus two long primaries on each shoulder; each feather its own
// joint so it can flutter), a long cloak down the back in three columns of four chained segments (secondary motion on
// springs), a cloth tunic under a leather jerkin with a quiver strap, a quiver bound with red cord and full of arrows
// fletched in different colours, leather bracers laced with cord, gloves whose fingers wrap the bow's grip (left) and
// hook the string (right), wrapped trousers and soft boots — and a tall RECURVE LONGBOW: a two-tone stave (dark yew
// back, pale sapwood belly), a leather grip wrapped in red cord, horn tips with nock grooves, limbs that are chains of
// joints that bend, a string in two halves that follows the nock point, and a nocked arrow with a crested shaft.
// Materials: three kinds read differently under the same light — cloth (desaturated greens), leather (warm browns
// with lighter edges) and wood (reddish stave, pale aged mask) — with one accent: the muted red cord.
// Every limb joint is a Group whose bone hangs along -y; the renderer aims the arms with IK (it writes quaternions) and
// the legs with the goblin's solver; forward is -z (the game's convention).
import { BOW } from './archery.ts';

// The legs, in blocks (the goblin's locomotion.ts solver walks these: createLocomotion(SENTINEL_RIG)). `gaitScale`
// stretches the gait's step time (longer, slower strides for a human-sized body; the goblin's default is 1).
export const SENTINEL_RIG = Object.freeze({
  hipWidth: 0.12, hipHeight: 0.86, thigh: 0.43, shin: 0.41, ankle: 0.07, stepUpMax: 1.25, stepDownMax: 2.6, gaitScale: 1.3,
});
// Standing still at a ledge (its favourite place: high ground) the engine's box may hang half over the edge, and a foot
// would find the ground a block down: the drawn foot is kept within LEDGE_DROP of the body's height instead (it stands
// on the edge). Walking, the feet step down for real.
export const LEDGE_DROP = 0.45;
export const ARM = Object.freeze({ upper: 0.3, fore: 0.28, shoulderX: 0.25, shoulderY: 0.47 });
export const NECK_Y = 0.55;
export const CLOAK = Object.freeze({ cols: 3, rows: 4, segH: 0.2, colW: 0.16 });

export const PALETTE = Object.freeze({
  skin: 0x6b5140,
  // cloth: desaturated forest greens
  hood: 0x2f4a33, hoodDark: 0x1f3324, hoodLight: 0x3e5c42, hoodRim: 0x4b6a4a,
  tunic: 0x4f5f3c, tunicDark: 0x3a482d, tunicLight: 0x5f7047,
  cloak: 0x2b3f2e, cloakDark: 0x1f2f22, cloakEdge: 0x45603f, cloakLine: 0x3a5238,
  wrap: 0x8a7a58, wrapDark: 0x6e6046, trousers: 0x3e3a2c, trousersDark: 0x302d22,
  // leather: warm browns with lighter worn edges
  jerkin: 0x7a5230, jerkinDark: 0x553718, jerkinLight: 0x906640, stitch: 0xb89a62,
  strap: 0x3a2a1a, buckle: 0xc2a56a, bracer: 0x6a4526, bracerStrap: 0x2e1f12, glove: 0x4a3420, gloveLight: 0x5e4530,
  boot: 0x3a2a1c, bootSole: 0x201610, quiver: 0x6e4e2e, quiverLight: 0x86603a, quiverRim: 0x3e2c1a,
  // the accent: red-ochre cord (mask ties, quiver bands, bracer laces, the bow's grip wrap, cresting)
  cord: 0x8a3a2e, cordDark: 0x5e2820,
  // wood: the aged pale mask and the reddish stave
  mask: 0xcdb48a, maskDark: 0x9a7d55, maskGrain: 0xb59c72, maskCarve: 0x5a4630, maskPaint: 0xe8dcc3, slit: 0x0e0c08, glow: 0x8fd070,
  bowWood: 0x6e381c, bowBelly: 0xa8703a, bowDark: 0x4a2212, bowTip: 0xd9cbab, hornDark: 0x8c7a5a, grip: 0x4a3220, string: 0xe8dfc4,
  // feathers: four vanes, two tips, a pale quill
  feather: 0x3c4f3a, featherMoss: 0x56704f, featherRusset: 0x6b5236, featherDark: 0x27352a, featherTip: 0xc9ad74, featherTipPale: 0xe6dcc2, featherVane: 0xd8cfa8,
  // arrows: shaft, head and four fletching colours (the smoke arrow's grey vane)
  shaft: 0xb8935a, head: 0x9a9aa2, headDark: 0x6e6e78, nockC: 0x2a1e12,
  fletchA: 0xe6dcc2, fletchB: 0x4c7a46, fletchC: 0x9a4a32, fletchD: 0x6b7d8a, smokeFletch: 0x8a8a8a,
});

// A small deterministic 0..1 hash, so the mantle's variety is the same on every client.
const h01 = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

/** Builds the sentinel. Returns the engine's { group, legs, arms } (empty: the renderer moves everything) plus the joints. */
export function buildSentinel({ THREE }) {
  const mats = new Map();
  const mat = (c, basic = false) => {
    const key = basic ? `b${c}` : c;
    let m = mats.get(key);
    if (!m) { m = basic ? new THREE.MeshBasicMaterial({ color: c }) : new THREE.MeshLambertMaterial({ color: c }); mats.set(key, m); }
    return m;
  };
  const box = (parent, w, h, d, c, ox = 0, oy = 0, oz = 0, basic = false) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(ox, oy, oz);
    const m = new THREE.Mesh(g, mat(c, basic));
    parent.add(m);
    return m;
  };
  const joint = (parent, x = 0, y = 0, z = 0) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };
  const P = PALETTE, R = SENTINEL_RIG;

  const group = new THREE.Group();
  const rig = joint(group);
  const pelvis = joint(rig, 0, R.hipHeight, 0);
  // belt (two layers of leather), a brass buckle, a pouch, the knife and the leather tassets (front and back, on springs)
  box(pelvis, 0.39, 0.075, 0.24, P.strap, 0, 0.03, 0);
  box(pelvis, 0.4, 0.03, 0.25, P.jerkinLight, 0, 0.055, 0);
  box(pelvis, 0.07, 0.06, 0.02, P.buckle, 0, 0.03, -0.125);
  box(pelvis, 0.09, 0.1, 0.07, P.jerkin, -0.2, -0.04, -0.04); // a pouch on the left hip
  box(pelvis, 0.095, 0.03, 0.075, P.jerkinDark, -0.2, 0.01, -0.04);
  box(pelvis, 0.035, 0.2, 0.05, P.strap, 0.21, -0.07, 0.03); // the knife's sheath on the right
  box(pelvis, 0.03, 0.06, 0.03, P.maskDark, 0.21, 0.06, 0.03); // its antler handle
  box(pelvis, 0.04, 0.012, 0.055, P.cord, 0.21, -0.02, 0.03); // the cord that keeps it in
  const tassetF = joint(pelvis, 0, 0, -0.12);
  box(tassetF, 0.3, 0.24, 0.025, P.jerkin, 0, -0.12, 0);
  box(tassetF, 0.31, 0.02, 0.028, P.jerkinDark, 0, -0.23, 0);
  box(tassetF, 0.3, 0.012, 0.028, P.stitch, 0, -0.03, 0); // a stitched top edge
  const tassetB = joint(pelvis, 0, 0, 0.12);
  box(tassetB, 0.32, 0.26, 0.025, P.jerkinDark, 0, -0.13, 0);

  // ---- torso: a lean tunic with a darker hem, the leather jerkin with a worn light edge, the quiver strap
  const torso = joint(pelvis, 0, 0.05, 0);
  const chest = joint(torso);
  box(chest, 0.36, 0.5, 0.2, P.tunic, 0, 0.25, 0);
  box(chest, 0.37, 0.08, 0.21, P.tunicDark, 0, 0.04, 0); // the hem, in shadow under the jerkin
  box(chest, 0.38, 0.32, 0.22, P.jerkin, 0, 0.2, 0.0); // the jerkin over the belly and chest
  box(chest, 0.385, 0.02, 0.225, P.jerkinLight, 0, 0.355, 0); // its worn top edge
  box(chest, 0.385, 0.015, 0.225, P.jerkinDark, 0, 0.045, 0); // its lower edge
  box(chest, 0.12, 0.3, 0.005, P.jerkinDark, 0, 0.21, -0.112); // its laced front
  for (let i = 0; i < 4; i++) box(chest, 0.1, 0.012, 0.007, P.cord, 0, 0.1 + i * 0.07, -0.114); // the laces
  for (const z of [-0.115, 0.115]) { // the quiver strap, right shoulder to left hip, front and back
    const s = box(chest, 0.05, 0.62, 0.014, P.strap);
    s.position.set(0.0, 0.26, z); s.rotation.z = -0.62;
    const e = box(chest, 0.052, 0.62, 0.004, P.jerkinLight); // its lighter edge
    e.position.set(0.02, 0.27, z); e.rotation.z = -0.62;
  }
  box(chest, 0.05, 0.05, 0.02, P.buckle, 0.06, 0.3, -0.123);

  // ---- the quiver on the back, tilted so the arrows rise over the right shoulder; bound with two bands of red cord
  const quiver = joint(chest, 0.08, 0.3, 0.15);
  quiver.rotation.z = -0.38; quiver.rotation.x = 0.12;
  box(quiver, 0.13, 0.48, 0.12, P.quiver, 0, 0, 0);
  box(quiver, 0.04, 0.46, 0.125, P.quiverLight, -0.04, 0, 0); // a lighter, worn face
  box(quiver, 0.145, 0.04, 0.135, P.quiverRim, 0, 0.23, 0);
  box(quiver, 0.145, 0.04, 0.135, P.quiverRim, 0, -0.2, 0);
  for (const y of [0.1, -0.08]) box(quiver, 0.14, 0.025, 0.13, P.cord, 0, y, 0); // the cord bands
  box(quiver, 0.006, 0.36, 0.125, P.stitch, -0.068, 0.0, 0); // a stitched seam
  const quiverArrows = [];
  const QUIVER_FLETCH = [[P.fletchA, P.fletchB], [P.fletchA, P.fletchC], [P.fletchD, P.fletchA], [P.fletchC, P.fletchA], [P.fletchB, P.fletchA], [P.fletchA, P.fletchD], [P.fletchC, P.fletchB]];
  [[-0.03, -0.03, 0.1], [0.03, -0.02, 0.13], [0.0, 0.03, 0.08], [-0.035, 0.03, 0.12], [0.035, 0.035, 0.09], [0.0, -0.005, 0.15], [-0.01, 0.0, 0.11]].forEach(([ax, az, h], i) => {
    const a = joint(quiver, ax, 0.25 + h, az);
    box(a, 0.016, 0.22, 0.016, P.shaft, 0, -0.06, 0);
    box(a, 0.05, 0.09, 0.004, QUIVER_FLETCH[i][0], 0, 0.02, 0);
    box(a, 0.004, 0.09, 0.05, QUIVER_FLETCH[i][1], 0, 0.02, 0);
    box(a, 0.02, 0.02, 0.02, P.nockC, 0, 0.075, 0);
    quiverArrows.push(a);
  });

  // ---- the cloak: three columns of four chained segments hanging from the shoulders' back
  const cloak = [];
  for (let c = 0; c < CLOAK.cols; c++) {
    const col = [];
    let parent = joint(chest, (c - 1) * CLOAK.colW, 0.5, 0.125);
    for (let r = 0; r < CLOAK.rows; r++) {
      const seg = r === 0 ? parent : joint(parent, 0, -CLOAK.segH, 0);
      const w = CLOAK.colW + 0.012 + r * 0.012;
      box(seg, w, CLOAK.segH + 0.01, 0.022, r % 2 ? P.cloakDark : P.cloak, 0, -CLOAK.segH / 2, 0);
      if (c !== 1) box(seg, 0.014, CLOAK.segH + 0.01, 0.024, P.cloakLine, (c - 1) * (w / 2 - 0.007), -CLOAK.segH / 2, 0); // a lighter outer edge
      if (r === CLOAK.rows - 1) { // a ragged, feather-cut hem
        for (let k = -1; k <= 1; k++) box(seg, 0.045, 0.06 + 0.03 * ((c + k + 3) % 2), 0.02, P.cloakEdge, k * 0.055, -CLOAK.segH - 0.03, 0);
      }
      col.push(seg);
      parent = seg;
    }
    cloak.push(col);
  }

  // ---- the feathered mantle: three overlapping rows over the shoulders and the collar, two long primaries per shoulder
  const feathers = [];
  const VANES = [P.feather, P.featherMoss, P.featherDark, P.featherRusset];
  // `rest` is the flap's tilt (rad) about the feather's x: NEGATIVE splays the tip outward, away from the body (the base's
  // +z points outward), so the mantle reads as a cone over the shoulders instead of lying tucked against the tunic
  const feather = (base, len, vane, tip, row, phase, rest) => {
    const fl = joint(base);
    fl.rotation.x = rest; // splayed out and down
    box(fl, 0.07, len, 0.014, vane, 0, -len / 2, 0);
    box(fl, 0.012, len * 0.95, 0.016, P.featherVane, 0, -len / 2, -0.002); // the quill
    box(fl, 0.046, 0.04, 0.015, tip, 0, -len + 0.012, 0); // the tip, tapering
    box(fl, 0.024, 0.03, 0.015, tip, 0, -len - 0.012, 0);
    feathers.push({ base, flap: fl, row, phase, rest });
  };
  const FEATHER_ROWS = [
    { y: 0.57, rx: 0.2, rz: 0.13, n: 11, len: 0.14 },
    { y: 0.5, rx: 0.25, rz: 0.15, n: 13, len: 0.17 },
    { y: 0.43, rx: 0.29, rz: 0.165, n: 15, len: 0.2 },
  ];
  FEATHER_ROWS.forEach((row, ri) => {
    for (let i = 0; i < row.n; i++) {
      // around the shoulders: an arc from the left front, over the back, to the right front (not across the chest)
      const t = -1.15 + (2.3 * i) / (row.n - 1);
      const ang = Math.PI / 2 + t * (Math.PI / 2);
      const x = Math.cos(ang) * -row.rx, z = Math.sin(ang) * row.rz;
      const f = joint(chest, x, row.y, z);
      f.rotation.y = Math.atan2(x, z);
      const k = h01(i * 7 + ri * 31);
      const vane = i % 5 === 2 ? P.featherRusset : VANES[(i + ri) % 3];
      const tip = (i + ri) % 4 === 1 ? P.featherTipPale : P.featherTip;
      feather(f, row.len * (0.85 + 0.3 * k), vane, tip, ri, (i * 1.7 + ri * 0.9) % (Math.PI * 2), -(0.3 + 0.1 * ri + 0.08 * (k - 0.5)));
    }
  });
  for (const side of [-1, 1]) { // the primaries: long, splayed outward over the point of each shoulder, trailing back
    [[0.28, 0.5, P.featherDark, P.featherTip], [0.24, 0.75, P.featherRusset, P.featherTipPale]].forEach(([len, out, vane, tip], i) => {
      const f = joint(chest, side * 0.3, 0.5 - 0.03 * i, 0.02 + 0.05 * i);
      f.rotation.z = side * out; // the bone (-y) swings toward +-x: outward on either side
      feather(f, len, vane, tip, 2, (side + 2) * 1.3 + i, -(0.25 + 0.1 * i));
    });
  }

  // ---- neck, head, hood and the carved mask
  const neck = joint(torso, 0, NECK_Y, -0.01);
  box(neck, 0.13, 0.08, 0.13, P.skin, 0, 0.03, 0);
  box(neck, 0.26, 0.07, 0.26, P.hood, 0, 0.055, 0); // the cowl's collar around the throat
  const head = joint(neck, 0, 0.06, 0);
  box(head, 0.22, 0.26, 0.22, P.skin, 0, 0.13, 0);
  // the hood: crown, sides and back, a deep cowl whose rim overhangs the mask, and the long point trailing up and back
  box(head, 0.3, 0.07, 0.3, P.hood, 0, 0.29, 0.0);
  box(head, 0.045, 0.3, 0.3, P.hood, -0.15, 0.13, 0.01);
  box(head, 0.045, 0.3, 0.3, P.hood, 0.15, 0.13, 0.01);
  box(head, 0.3, 0.32, 0.045, P.hoodDark, 0, 0.12, 0.15);
  box(head, 0.05, 0.3, 0.012, P.hood, 0, 0.12, 0.172); // the seam down the back of the hood
  box(head, 0.31, 0.035, 0.05, P.hoodRim, 0, -0.03, 0.15); // its lower rim, over the mantle
  box(head, 0.33, 0.055, 0.13, P.hoodLight, 0, 0.3, -0.135); // the cowl's rim, overhanging the brow
  box(head, 0.33, 0.015, 0.135, P.hoodRim, 0, 0.33, -0.135);
  box(head, 0.05, 0.24, 0.07, P.hoodLight, -0.15, 0.15, -0.155);
  box(head, 0.05, 0.24, 0.07, P.hoodLight, 0.15, 0.15, -0.155);
  box(head, 0.3, 0.05, 0.06, P.hoodDark, 0, 0.005, -0.12); // the cowl's lower lip, under the mask's chin
  const peak = joint(head, 0, 0.31, 0.08);
  peak.rotation.x = 0.55; // the point rises up and back
  box(peak, 0.22, 0.1, 0.2, P.hood, 0, 0.04, 0);
  box(peak, 0.16, 0.1, 0.15, P.hoodDark, 0, 0.13, 0);
  const peakTip = joint(peak, 0, 0.19, 0); // the renderer sways this joint; the static tilt lives in the bone below
  const peakBone = joint(peakTip);
  peakBone.rotation.x = 0.3;
  box(peakBone, 0.1, 0.12, 0.1, P.hood, 0, 0.05, 0);
  box(peakBone, 0.05, 0.1, 0.05, P.hoodDark, 0, 0.15, 0);
  box(peakBone, 0.03, 0.045, 0.03, P.featherTip, 0, 0.215, 0); // a tassel at the very point
  // the mask: two tapered plates of pale aged wood, carved and painted
  const mask = joint(head, 0, 0.13, -0.12);
  box(mask, 0.22, 0.15, 0.03, P.mask, 0, 0.05, 0); // the upper plate (brow and eyes)
  box(mask, 0.17, 0.13, 0.03, P.mask, 0, -0.075, 0.004); // the lower plate (cheeks and mouth), narrower
  box(mask, 0.1, 0.04, 0.03, P.maskDark, 0, -0.15, 0.006); // the chin
  box(mask, 0.23, 0.03, 0.045, P.maskDark, 0, 0.075, -0.008); // the brow ridge
  box(mask, 0.035, 0.11, 0.045, P.maskDark, 0, -0.02, -0.012); // the nose, a beak
  box(mask, 0.03, 0.03, 0.03, P.maskCarve, 0, -0.078, -0.02); // its hooked tip
  for (const [w, y] of [[0.2, 0.02], [0.15, -0.035], [0.14, -0.115]]) box(mask, w, 0.004, 0.032, P.maskGrain, 0, y, -0.001); // the grain
  for (const s of [-1, 1]) {
    box(mask, 0.065, 0.014, 0.034, P.slit, s * 0.055, 0.03, -0.001); // the eye slits
    box(mask, 0.03, 0.005, 0.034, P.glow, s * 0.055, 0.03, -0.0015, true); // the faint glow behind them
    box(mask, 0.05, 0.01, 0.034, P.cord, s * 0.06, 0.004, -0.002); // painted red-ochre bars under the eyes
    box(mask, 0.012, 0.05, 0.034, P.cord, s * 0.07, -0.045, -0.002); // and the tear lines down the cheeks
    box(mask, 0.012, 0.045, 0.034, P.maskCarve, s * 0.045, -0.085, -0.001); // carved cheek lines
    const chev = box(mask, 0.045, 0.01, 0.034, P.maskPaint, 0, 0, -0.003); // the bone-white chevron on the forehead
    chev.position.set(s * 0.028, 0.1, 0); chev.rotation.z = -s * 0.6;
    box(mask, 0.03, 0.012, 0.12, P.cordDark, s * 0.115, 0.03, 0.06); // the cords that tie it to the hood
  }
  box(mask, 0.05, 0.01, 0.034, P.maskCarve, 0, -0.115, -0.002); // the mouth's carved line
  const crest = joint(mask, 0, 0.105, -0.01); // a leaf crest on the forehead
  box(crest, 0.05, 0.09, 0.02, P.featherMoss, 0, 0.04, 0);
  box(crest, 0.006, 0.09, 0.024, P.maskCarve, 0, 0.04, 0);
  box(crest, 0.03, 0.04, 0.022, P.fletchB, 0, 0.1, 0);
  for (const s of [-1, 1]) { const leaf = box(crest, 0.035, 0.07, 0.02, P.featherMoss, 0, 0.035, 0); leaf.position.set(s * 0.03, 0.0, 0.002); leaf.rotation.z = -s * 0.55; }
  const glow = [];
  mask.traverse((o) => { if (o.isMesh && o.material === mat(P.glow, true)) glow.push(o); });

  // ---- the arms: shoulder -> elbow -> wrist -> hand (palm, four two-segment fingers, a thumb)
  // The hands differ: the LEFT palm sits behind the bow's grip, its fingers wrapping the riser; the RIGHT palm sits back
  // over the wrist (the wrist is the point the IK puts on the string), its fingers hooking the string at the wrist.
  // The renderer orients each palm from the bow's frame (riser along the left palm's x, string along the right's).
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = joint(torso, side * ARM.shoulderX, ARM.shoulderY, 0);
    box(shoulder, 0.1, ARM.upper, 0.1, P.tunic, 0, -ARM.upper / 2, 0);
    box(shoulder, 0.14, 0.1, 0.14, P.jerkin, 0, -0.02, 0); // a leather pauldron
    box(shoulder, 0.145, 0.02, 0.145, P.jerkinLight, 0, 0.02, 0); // its worn upper edge
    box(shoulder, 0.145, 0.02, 0.145, P.jerkinDark, 0, -0.07, 0);
    const elbow = joint(shoulder, 0, -ARM.upper, 0);
    box(elbow, 0.09, ARM.fore, 0.09, P.tunic, 0, -ARM.fore / 2, 0);
    box(elbow, 0.105, 0.17, 0.105, P.bracer, 0, -0.165, 0); // the bracer
    for (const y of [-0.1, -0.23]) box(elbow, 0.11, 0.018, 0.11, P.bracerStrap, 0, y, 0);
    box(elbow, 0.112, 0.014, 0.112, P.cord, 0, -0.165, 0); // the lace of red cord
    if (side < 0) box(elbow, 0.02, 0.14, 0.11, P.bracerStrap, -0.055, -0.165, 0); // the bow arm's guard plate (inside)
    const wrist = joint(elbow, 0, -ARM.fore, 0);
    const palm = joint(wrist);
    const fingers = [];
    let thumb1;
    if (side < 0) { // the bow hand: the riser crosses the palm at y -0.045 and the fingers wrap around it from below
      box(palm, 0.085, 0.07, 0.045, P.glove, 0, -0.035, 0.03);
      box(palm, 0.087, 0.02, 0.03, P.gloveLight, 0, -0.068, 0.02); // the knuckles
      for (let i = 0; i < 4; i++) {
        const f1 = joint(palm, (i - 1.5) * 0.021, -0.078, 0.025);
        box(f1, 0.018, 0.045, 0.02, P.glove, 0, -0.022, 0);
        const f2 = joint(f1, 0, -0.045, 0);
        box(f2, 0.016, 0.035, 0.018, P.glove, 0, -0.017, 0);
        fingers.push({ f1, f2 });
      }
      thumb1 = joint(palm, 0.045, -0.02, 0.02);
    } else { // the draw hand: a cuff at the bracer's end, the palm back over the wrist, the fingers hooking at the wrist
      box(palm, 0.11, 0.05, 0.11, P.glove, 0, 0.03, 0); // the cuff
      box(palm, 0.085, 0.08, 0.045, P.glove, 0, 0.035, 0.02);
      box(palm, 0.087, 0.02, 0.03, P.gloveLight, 0, 0.0, 0.025); // the knuckles
      for (let i = 0; i < 4; i++) {
        const f1 = joint(palm, (i - 1.5) * 0.021, -0.005, 0.03);
        box(f1, 0.018, 0.045, 0.02, P.glove, 0, -0.022, 0);
        const f2 = joint(f1, 0, -0.045, 0);
        box(f2, 0.016, 0.035, 0.018, P.glove, 0, -0.017, 0);
        fingers.push({ f1, f2 });
      }
      thumb1 = joint(palm, -0.045, 0.02, 0.02);
    }
    box(thumb1, 0.02, 0.04, 0.022, P.glove, 0, -0.02, 0);
    const thumb2 = joint(thumb1, 0, -0.04, 0);
    box(thumb2, 0.018, 0.03, 0.02, P.glove, 0, -0.015, 0);
    arms.push({ side, shoulder, elbow, wrist, palm, fingers, thumb: [thumb1, thumb2] });
  }
  // the arrow drawn from the quiver, carried in the right hand while reloading
  const handArrow = joint(arms[1].palm, 0, -0.02, 0.01);
  const handArrowBody = buildArrow(handArrow, box, joint, P, false);
  handArrow.visible = false;

  // ---- the legs hang from the rig: the IK places them in the rig's frame
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = joint(rig, side * R.hipWidth, R.hipHeight, 0);
    hip.rotation.order = 'ZXY';
    box(hip, 0.125, R.thigh, 0.125, P.trousers, 0, -R.thigh / 2, 0);
    box(hip, 0.13, 0.03, 0.13, P.wrapDark, 0, -0.3, 0); // a thigh wrap
    const knee = joint(hip, 0, -R.thigh, 0);
    box(knee, 0.11, R.shin, 0.11, P.trousersDark, 0, -R.shin / 2, 0);
    box(knee, 0.125, 0.06, 0.125, P.wrap, 0, -0.02, 0); // knee wrap
    for (const y of [-0.12, -0.18]) box(knee, 0.122, 0.025, 0.122, P.wrap, 0, y, 0); // leg wraps
    box(knee, 0.13, 0.16, 0.13, P.boot, 0, -R.shin + 0.08, 0); // the soft boot's shaft
    box(knee, 0.135, 0.02, 0.135, P.bootSole, 0, -R.shin + 0.15, 0); // its folded top
    const ankle = joint(knee, 0, -R.shin, 0);
    box(ankle, 0.13, 0.07, 0.26, P.boot, 0, -R.ankle + 0.035, -0.05);
    box(ankle, 0.135, 0.015, 0.265, P.bootSole, 0, -R.ankle + 0.0075, -0.05);
    box(ankle, 0.1, 0.05, 0.06, P.boot, 0, -R.ankle + 0.03, -0.2); // the toe
    legs.push({ hip, knee, ankle, side });
  }

  // ---- the recurve longbow: a carved riser with a cord-wrapped grip, two-tone limbs of chained segments ending in
  // horn tips, a string in two halves and the nocked arrow
  const bow = joint(group); // posed by the renderer in the model's frame: grip at the bow hand, -z along the aim
  const riser = joint(bow);
  box(riser, 0.045, BOW.riser * 2, 0.055, P.bowWood, 0, 0, 0);
  box(riser, 0.03, BOW.riser * 2, 0.012, P.bowBelly, 0, 0, 0.025); // the pale belly, string side
  for (const y of [1, -1]) box(riser, 0.06, 0.03, 0.065, P.bowDark, 0, y * 0.11, 0); // the carved shoulders where the limbs meet
  box(riser, 0.052, 0.11, 0.062, P.grip, 0, -0.005, 0); // the leather grip
  for (const y of [-0.05, -0.025, 0.0, 0.025]) box(riser, 0.056, 0.011, 0.066, P.cord, 0, y, 0); // the cord wrap
  box(riser, 0.03, 0.02, 0.03, P.bowDark, -0.03, 0.06, -0.005); // the arrow rest
  const limbs = [];
  for (const dir of [1, -1]) {
    const root = joint(bow, 0, 0, 0);
    root.scale.y = dir; // the lower limb is the upper one mirrored
    let parent = joint(root, 0, BOW.riser, 0);
    const segs = [];
    const last = BOW.segs.length - 1;
    BOW.segs.forEach((L, i) => {
      const seg = i === 0 ? parent : joint(parent, 0, BOW.segs[i - 1], 0);
      const w = 0.04 - i * 0.006, d = 0.035 - i * 0.004;
      if (i === last) { // the horn tip, with the string's nock groove
        box(seg, w, L + 0.005, d, P.bowTip, 0, L / 2, 0);
        box(seg, w + 0.004, 0.012, d + 0.004, P.hornDark, 0, L - 0.025, 0);
      } else {
        box(seg, w, L + 0.005, d * 0.55, P.bowWood, 0, L / 2, -d * 0.2); // the dark back, toward the target
        box(seg, w * 0.8, L + 0.005, d * 0.5, P.bowBelly, 0, L / 2, d * 0.22); // the pale belly, toward the string
      }
      segs.push(seg);
      parent = seg;
    });
    limbs.push({ dir, segs });
  }
  const stringTop = joint(bow);
  box(stringTop, 0.009, 1, 0.009, P.string, 0, 0.5, 0); // a unit length along +y: the renderer scales it
  const stringBot = joint(bow);
  box(stringBot, 0.009, 1, 0.009, P.string, 0, 0.5, 0);
  const nockServing = joint(bow); // the dark serving around the nock point (the renderer slides it with the string)
  box(nockServing, 0.013, 0.04, 0.013, P.nockC, 0, 0, 0);
  const nocked = joint(bow); // the arrow on the string, pointing -z from the nock point
  const nockedBody = buildArrow(nocked, box, joint, P, true);

  return {
    group, legs: [], arms: [],
    joints: { rig, pelvis, torso, chest, neck, head, mask, peak, peakTip, quiver, quiverArrows, cloak, feathers, arms, legs, tassetF, tassetB, bow, limbs, stringTop, stringBot, nockServing, nocked, nockedBody, handArrow, handArrowBody, glow },
    parts: countMeshes(group),
  };
}

// An arrow along -z from its nock (at the joint): a crested shaft, a socketed point, two vanes (pale and russet) with
// switchable fletching for the smoke arrow (a grey vane and a clay bulb).
function buildArrow(parent, box, joint, P, alongZ) {
  const a = joint(parent);
  if (!alongZ) a.rotation.x = Math.PI / 2; // in the hand: along the fingers
  const L = BOW.arrow;
  box(a, 0.018, 0.018, L, P.shaft, 0, 0, -L / 2);
  box(a, 0.02, 0.02, 0.025, P.cord, 0, 0, -0.17); // the cresting band
  box(a, 0.022, 0.022, 0.03, P.headDark, 0, 0, -L + 0.005); // the point's socket
  box(a, 0.035, 0.035, 0.07, P.head, 0, 0, -L - 0.02);
  const fA = box(a, 0.06, 0.004, 0.13, P.fletchA, 0, 0, -0.1);
  const fB = box(a, 0.004, 0.06, 0.13, P.fletchC, 0, 0, -0.1);
  const fS = box(a, 0.0045, 0.062, 0.132, P.smokeFletch, 0, 0, -0.1); // the smoke arrow's grey vane
  box(a, 0.024, 0.024, 0.02, P.nockC, 0, 0, -0.005);
  const bulb = box(a, 0.05, 0.05, 0.06, P.smokeFletch, 0, 0, -L + 0.02); // the smoke arrow's clay bulb
  bulb.visible = false; fS.visible = false;
  const setSmoke = (on) => { bulb.visible = on; fS.visible = on; fB.visible = !on; };
  return { root: a, fA, fB, fS, bulb, setSmoke };
}

function countMeshes(g) { let n = 0; g.traverse((o) => { if (o.isMesh) n++; }); return n; }
