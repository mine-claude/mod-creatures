// @ts-check
// The Musgarrete's body, built in code from boxes — original: no human, no villager of any other game. A squat walking
// BOULDER of layered grey-green stone, a mantle of moss pads over its back and shoulders, a beard of hanging moss strands, a
// stone brow over two deep-set glowing eyes, a crack of a mouth (its lower lip moves when it talks), long ROOT arms ending in
// knobby stone fists with root fingers, short root legs with splayed root toes, and on its crown something growing — a fern,
// a little mushroom or a flower (seeded). Every joint is a Group whose bone hangs along -y; forward is -z.
// The look varies per individual (applyLook): stone tint, moss hue, eye colour, the crown's plant, the size.
import { MUSG_RIG as R, ARM, TORSO_Y, TOOL_LEN } from './motion.ts';

export const PALETTE = Object.freeze({
  stone: 0x7b8175, stoneDark: 0x5d6359, stoneLight: 0x979c8e, moss: 0x5a8a33, mossDark: 0x3f6a24, mossLight: 0x7fb04a,
  root: 0x6b4a2e, rootDark: 0x4e3520, eye: 0xffc04a, mouth: 0x23251f, fern: 0x6fb83a, capRed: 0xc8452f, capDot: 0xf2e7cf,
  petal: 0xe9d24a, toolWood: 0x8a6a44, toolHead: 0x9da29a, hoeHead: 0x7a7f78,
});
export const LOOKS = Object.freeze({
  stone: [0x7b8175, 0x837a6c, 0x6f7a72, 0x8a8a7e, 0x6c6f66],
  moss: [0x5a8a33, 0x4f7f3a, 0x6b8f2a, 0x4a7a45, 0x7a8e34],
  eye: [0xffc04a, 0x8ff0d8, 0xc8ff6a, 0xffe7a0, 0xff9a5a],
  crown: ['fern', 'cap', 'flower', 'fern', 'cap'],
});

/** Builds the Musgarrete. Returns the engine's { group, legs, arms } (empty: the renderer moves the limbs) plus the joints. */
export function buildMusgarrete({ THREE }: any) {
  const mats = new Map<string, any>();
  const mat = (c: number, key = String(c), basic = false) => {
    let m = mats.get(key);
    if (!m) { m = basic ? new THREE.MeshBasicMaterial({ color: c }) : new THREE.MeshLambertMaterial({ color: c }); mats.set(key, m); }
    return m;
  };
  const box = (parent: any, w: number, h: number, d: number, c: number, ox = 0, oy = 0, oz = 0, key?: string, basic = false) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(ox, oy, oz);
    const m = new THREE.Mesh(g, mat(c, key, basic));
    parent.add(m);
    return m;
  };
  const joint = (parent: any, x = 0, y = 0, z = 0) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };
  const P = PALETTE;
  const S = 'stone', SD = 'stoneDark', SL = 'stoneLight', M = 'moss', MD = 'mossDark', ML = 'mossLight';

  const group = new THREE.Group();
  const rig = joint(group);
  const pelvis = joint(rig, 0, R.hipHeight, 0);
  box(pelvis, 0.42, 0.12, 0.34, P.root, 0, 0.02, 0); // the root knot the legs grow from
  const torso = joint(pelvis, 0, TORSO_Y, 0);
  const body = joint(torso); // breathing scales this
  // the boulder: a core and layered slabs (a rounded silhouette from boxes)
  box(body, 0.64, 0.5, 0.5, P.stone, 0, 0.3, 0, S);
  box(body, 0.7, 0.34, 0.42, P.stone, 0, 0.3, 0, S);
  box(body, 0.54, 0.62, 0.42, P.stone, 0, 0.32, 0, S);
  box(body, 0.5, 0.1, 0.38, P.stoneDark, 0, 0.06, 0, SD); // the darker underside
  box(body, 0.12, 0.08, 0.02, P.stoneLight, -0.16, 0.42, -0.256, SL); // chips of light stone
  box(body, 0.08, 0.06, 0.02, P.stoneLight, 0.2, 0.22, -0.256, SL);
  box(body, 0.05, 0.16, 0.02, P.stoneDark, 0.08, 0.3, -0.256, SD); // a crack
  // the brow and the face, set into the front top of the boulder
  const head = joint(torso, 0, 0.5, -0.12);
  box(head, 0.46, 0.1, 0.18, P.stoneDark, 0, 0.12, -0.08, SD); // the heavy brow
  box(head, 0.42, 0.2, 0.2, P.stone, 0, 0.0, -0.06, S);
  const eyes: any[] = [];
  for (const side of [-1, 1]) {
    const socket = joint(head, side * 0.11, 0.04, -0.161);
    box(socket, 0.1, 0.07, 0.01, P.mouth, 0, 0, 0.003); // the deep socket
    const glow = box(socket, 0.06, 0.045, 0.012, P.eye, 0, 0, -0.004, 'eye', true);
    eyes.push({ socket, glow, side });
  }
  const jaw = joint(head, 0, -0.08, -0.06);
  box(jaw, 0.3, 0.025, 0.2, P.mouth, 0, 0.0, 0); // the crack of the mouth
  box(jaw, 0.36, 0.06, 0.2, P.stone, 0, -0.04, 0.0, S); // the lower lip of stone
  // the beard: moss strands hanging from the lip, each on its own joint (they sway)
  const beard: any[] = [];
  for (let i = 0; i < 5; i++) {
    const j = joint(jaw, (i - 2) * 0.07, -0.07, -0.08);
    box(j, 0.045, 0.12 + (i % 2) * 0.05, 0.03, i % 2 ? P.mossDark : P.moss, 0, -0.07, 0, i % 2 ? MD : M);
    beard.push(j);
  }
  // the crown: three plants, one shown (seeded)
  const crown = joint(torso, 0.06, 0.63, 0.02);
  const fern = joint(crown);
  for (const [a, l] of [[-0.5, 0.22], [0.1, 0.27], [0.6, 0.2]] as [number, number][]) {
    const leaf = joint(fern); leaf.rotation.z = a;
    box(leaf, 0.04, l, 0.02, P.fern, 0, l / 2, 0, 'fern');
    box(leaf, 0.09, 0.03, 0.02, P.fern, 0, l * 0.7, 0, 'fern');
  }
  const cap = joint(crown);
  box(cap, 0.05, 0.12, 0.05, P.capDot, 0, 0.06, 0, 'capStem');
  box(cap, 0.2, 0.07, 0.2, P.capRed, 0, 0.15, 0, 'cap');
  box(cap, 0.04, 0.02, 0.04, P.capDot, 0.05, 0.19, 0.03, 'capStem');
  const flower = joint(crown);
  box(flower, 0.03, 0.2, 0.03, P.fern, 0, 0.1, 0, 'fern');
  for (const [dx, dz] of [[0.05, 0], [-0.05, 0], [0, 0.05], [0, -0.05]]) box(flower, 0.05, 0.03, 0.05, P.petal, dx, 0.21, dz, 'petal');
  // the moss mantle: three pads over the back and two over the shoulders, each on a spring joint
  const mantle: any[] = [];
  for (const [x, y, z, w, h] of [[-0.16, 0.6, 0.18, 0.26, 0.3], [0.14, 0.62, 0.2, 0.3, 0.34], [0, 0.42, 0.26, 0.44, 0.28], [-0.33, 0.56, -0.02, 0.12, 0.2], [0.33, 0.56, -0.02, 0.12, 0.2]] as number[][]) {
    const j = joint(torso, x, y, z);
    box(j, w, 0.05, 0.22, P.moss, 0, 0, 0, M);
    box(j, w * 0.9, h, 0.05, P.mossDark, 0, -h / 2, 0.08, MD);
    box(j, w * 0.5, 0.04, 0.1, P.mossLight, 0.03, 0.03, -0.02, ML);
    mantle.push(j);
  }
  // the arms: long roots from the boulder's shoulders, stone fists with root fingers
  const arms: any[] = [];
  for (const side of [-1, 1]) {
    const shoulder = joint(torso, side * ARM.shoulderX, ARM.shoulderY - TORSO_Y, 0);
    shoulder.rotation.order = 'YXZ';
    box(shoulder, 0.16, 0.14, 0.16, P.stone, 0, -0.02, 0, S); // the shoulder stone
    box(shoulder, 0.08, ARM.upper, 0.08, P.root, 0, -ARM.upper / 2, 0);
    const elbow = joint(shoulder, 0, -ARM.upper, 0);
    box(elbow, 0.07, ARM.fore, 0.07, P.root, 0, -ARM.fore / 2, 0);
    box(elbow, 0.03, 0.08, 0.03, P.rootDark, 0.04, -0.1, 0); // a side root
    const hand = joint(elbow, 0, -ARM.fore, 0);
    box(hand, 0.12, 0.1, 0.12, P.stoneDark, 0, -0.04, 0, SD);
    for (const f of [-1, 0, 1]) box(hand, 0.025, 0.07, 0.025, P.rootDark, f * 0.035, -0.12, -0.03);
    arms.push({ shoulder, elbow, hand, side });
  }
  // the tools in the right fist: a stone pick and a hoe (one shown, by the NPC's held item)
  const pick = joint(arms[1].hand, 0, -0.06, 0);
  box(pick, 0.035, TOOL_LEN, 0.035, P.toolWood, 0, 0, -TOOL_LEN / 2 + 0.06);
  pick.rotation.x = Math.PI / 2;
  box(pick, 0.04, 0.05, 0.32, P.toolHead, 0, 0, -TOOL_LEN + 0.06, 'tool');
  const hoe = joint(arms[1].hand, 0, -0.06, 0);
  box(hoe, 0.035, TOOL_LEN, 0.035, P.toolWood, 0, 0, -TOOL_LEN / 2 + 0.06);
  hoe.rotation.x = Math.PI / 2;
  box(hoe, 0.04, 0.16, 0.12, P.hoeHead, 0, -0.06, -TOOL_LEN + 0.06, 'hoe');
  pick.visible = false; hoe.visible = false;
  // what it carries in both arms (a block: the renderer textures it with kit.blockTexture)
  const carry = joint(torso, 0, 0.32, -0.42);
  carry.visible = false;
  // the legs: short roots, from the rig (the IK places them), toes splayed
  const legs: any[] = [];
  for (const side of [-1, 1]) {
    const hip = joint(rig, side * R.hipWidth, R.hipHeight, 0);
    hip.rotation.order = 'ZXY';
    box(hip, 0.13, R.thigh, 0.13, P.root, 0, -R.thigh / 2, 0);
    const knee = joint(hip, 0, -R.thigh, 0);
    box(knee, 0.11, R.shin, 0.11, P.root, 0, -R.shin / 2, 0);
    box(knee, 0.03, 0.1, 0.03, P.rootDark, side * 0.06, -0.06, 0.02);
    const ankle = joint(knee, 0, -R.shin, 0);
    box(ankle, 0.14, 0.05, 0.16, P.rootDark, 0, -R.ankle + 0.025, -0.03);
    for (const t of [-1, 0, 1]) { const toe = box(ankle, 0.03, 0.03, 0.09, P.root, t * 0.05, -R.ankle + 0.015, -0.13); toe.rotation.y = t * 0.35; }
    legs.push({ hip, knee, ankle, side });
  }
  return { group, legs: [], arms: [], joints: { rig, pelvis, torso, body, head, jaw, eyes, beard, crown, fern, cap, flower, mantle, arms, pick, hoe, carry, legs }, mats };
}

/** The individual's look from its seed: tints, eyes, the crown's plant, the size. */
export function lookOf(seed: number) {
  const r = (k: number) => (((seed >>> 0) * 2654435761 + k * 40503) >>> 0) % 997 / 997;
  const pick = <T>(a: readonly T[], k: number) => a[Math.floor(r(k) * a.length) % a.length];
  return { stone: pick(LOOKS.stone, 1), moss: pick(LOOKS.moss, 2), eye: pick(LOOKS.eye, 3), crown: pick(LOOKS.crown, 4), scale: 0.9 + 0.2 * r(5), lean: (r(6) - 0.5) * 0.1 };
}

/** Applies a look to a built model (materials are this model's own). */
export function applyLook(model: any, look: ReturnType<typeof lookOf>) {
  const { mats, joints: J } = model;
  const shade = (c: number, k: number) => { const r = Math.min(255, ((c >> 16) & 255) * k), g = Math.min(255, ((c >> 8) & 255) * k), b = Math.min(255, (c & 255) * k); return (r << 16) | (g << 8) | b; };
  mats.get('stone')?.color.setHex(look.stone);
  mats.get('stoneDark')?.color.setHex(shade(look.stone, 0.76));
  mats.get('stoneLight')?.color.setHex(shade(look.stone, 1.22));
  mats.get('moss')?.color.setHex(look.moss);
  mats.get('mossDark')?.color.setHex(shade(look.moss, 0.72));
  mats.get('mossLight')?.color.setHex(shade(look.moss, 1.3));
  mats.get('eye')?.color.setHex(look.eye);
  J.fern.visible = look.crown === 'fern'; J.cap.visible = look.crown === 'cap'; J.flower.visible = look.crown === 'flower';
  J.rig.scale.setScalar(look.scale);
}
