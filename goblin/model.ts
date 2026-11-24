// @ts-check
// The goblin's body, built in code from boxes (original design and palette): small and hunched, a big head with long
// two-segment ears, a hooked nose, a jaw that opens, eyes with pupils that move, long two-segment arms, short bent
// legs with big flat feet, a patchwork vest over a rope belt, cloth flaps front and back, a sling strap across the chest
// and a pouch of pebbles at the hip. Every joint is a Group whose bone hangs along -y (or along -x/+x for the ears), so
// the renderer only writes rotations; forward is -z (the game's convention).
import { RIG } from './locomotion.ts';

export const PALETTE = Object.freeze({
  skin: 0x7a9a3c, skinDark: 0x5c7a2a, skinLight: 0x98b552, earInner: 0xc98a7a,
  eye: 0xf2e6a0, pupil: 0x1c1208, brow: 0x3d4a1a, tooth: 0xefe8d0, mouth: 0x3a1a14,
  vest: 0x6b4a2b, patch1: 0x8c3b2e, patch2: 0x3e5a6b, patch3: 0xb08a3e, stitch: 0xd9c9a0,
  belt: 0x9c7b4a, cloth: 0x5a3e5e, clothDark: 0x46304a, pouch: 0x7d5a32, pouchFlap: 0x5e4224,
  pebble: 0x8a8a84, pebbleDark: 0x6a6a64, strap: 0x4a3a28, nail: 0x2e2a1e,
});

/** Builds the goblin. Returns the engine's { group, legs, arms } (both empty: the renderer moves the limbs itself) plus the joints. */
export function buildGoblin({ THREE }) {
  const mats = new Map(); // one material per colour, per goblin (the hurt flash tints this goblin's materials only)
  const mat = (c) => { let m = mats.get(c); if (!m) { m = new THREE.MeshLambertMaterial({ color: c }); mats.set(c, m); } return m; };
  // a box whose geometry is shifted by (ox, oy, oz) from the joint it hangs on
  const box = (parent, w, h, d, c, ox = 0, oy = 0, oz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(ox, oy, oz);
    const m = new THREE.Mesh(g, mat(c));
    parent.add(m);
    return m;
  };
  const joint = (parent, x = 0, y = 0, z = 0) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };
  const P = PALETTE;

  const group = new THREE.Group();
  const rig = joint(group); // the whole body: the death fall rolls this
  const pelvis = joint(rig, 0, RIG.hipHeight, 0);
  // belt, flaps and the pouch hang on the pelvis
  box(pelvis, 0.34, 0.06, 0.25, P.belt, 0, 0.02, 0);
  box(pelvis, 0.06, 0.05, 0.02, P.patch3, 0.05, 0.02, -0.13); // buckle
  const flapFront = joint(pelvis, 0, 0.0, -0.12);
  box(flapFront, 0.2, 0.2, 0.02, P.cloth, 0, -0.1, 0);
  box(flapFront, 0.08, 0.06, 0.021, P.clothDark, -0.04, -0.17, 0); // a darned corner
  const flapBack = joint(pelvis, 0, 0.0, 0.12);
  box(flapBack, 0.24, 0.24, 0.02, P.clothDark, 0, -0.12, 0);
  const pouch = joint(pelvis, 0.2, 0.0, -0.02);
  box(pouch, 0.1, 0.12, 0.12, P.pouch, 0.02, -0.07, 0);
  box(pouch, 0.105, 0.04, 0.125, P.pouchFlap, 0.02, -0.02, 0);
  box(pouch, 0.04, 0.04, 0.04, P.pebble, 0.03, 0.01, -0.03); // pebbles peeking out
  box(pouch, 0.035, 0.03, 0.035, P.pebbleDark, 0.0, 0.015, 0.03);

  // torso (hunched forward by the renderer), with the patchwork vest
  const torso = joint(pelvis, 0, 0.04, 0);
  const chest = joint(torso); // breathing scales this
  box(chest, 0.32, 0.34, 0.22, P.skin, 0, 0.17, 0);
  box(chest, 0.34, 0.26, 0.24, P.vest, 0, 0.15, 0.002);
  box(chest, 0.1, 0.09, 0.005, P.patch1, -0.08, 0.2, -0.122);
  box(chest, 0.08, 0.1, 0.005, P.patch2, 0.09, 0.09, -0.122);
  box(chest, 0.12, 0.08, 0.005, P.patch3, 0.02, 0.1, 0.122);
  box(chest, 0.01, 0.09, 0.006, P.stitch, -0.03, 0.2, -0.123);
  for (const z of [-0.124, 0.124]) { // the sling's strap, shoulder to hip, front and back
    const strap = box(chest, 0.4, 0.03, 0.012, P.strap);
    strap.position.set(0, 0.17, z); strap.rotation.z = 0.6;
  }

  // neck and head
  const neck = joint(torso, 0, 0.33, -0.03);
  const head = joint(neck);
  box(head, 0.34, 0.27, 0.3, P.skin, 0, 0.13, -0.04);
  box(head, 0.36, 0.05, 0.08, P.brow, 0, 0.22, -0.17); // heavy brow
  box(head, 0.07, 0.07, 0.15, P.skinDark, 0, 0.12, -0.25); // the hooked nose
  box(head, 0.05, 0.05, 0.05, P.skinDark, 0, 0.08, -0.33);
  box(head, 0.3, 0.06, 0.06, P.mouth, 0, 0.03, -0.18); // the mouth's dark line, seen when the jaw drops
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = joint(head, side * 0.085, 0.16, -0.195);
    box(eye, 0.085, 0.07, 0.02, P.eye);
    const pupil = joint(eye, 0, 0, -0.012);
    box(pupil, 0.035, 0.045, 0.012, P.pupil);
    eyes.push({ eye, pupil, side });
  }
  const jaw = joint(head, 0, 0.04, 0.04);
  box(jaw, 0.3, 0.07, 0.22, P.skinLight, 0, -0.03, -0.1);
  box(jaw, 0.03, 0.04, 0.02, P.tooth, -0.07, 0.02, -0.2); // two crooked teeth poking up
  box(jaw, 0.03, 0.05, 0.02, P.tooth, 0.06, 0.025, -0.2);
  // the ears: two segments each, sticking out sideways (left ear along -x, right along +x)
  const ears = [];
  for (const side of [-1, 1]) {
    const base = joint(head, side * 0.17, 0.15, 0.0);
    box(base, 0.17, 0.11, 0.035, P.skin, side * 0.085, 0, 0);
    box(base, 0.12, 0.06, 0.01, P.earInner, side * 0.08, 0, -0.02);
    const tip = joint(base, side * 0.17, 0.0, 0);
    box(tip, 0.16, 0.07, 0.03, P.skin, side * 0.08, 0.005, 0);
    box(tip, 0.06, 0.04, 0.032, P.skinDark, side * 0.15, 0.01, 0); // the drooping point
    ears.push({ base, tip, side });
  }

  // the long arms: shoulder -> elbow -> hand
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = joint(torso, side * 0.2, 0.29, 0);
    box(shoulder, 0.09, 0.24, 0.09, P.skin, 0, -0.12, 0);
    box(shoulder, 0.1, 0.08, 0.1, side < 0 ? P.patch2 : P.vest, 0, -0.03, 0); // a sleeve stub
    const elbow = joint(shoulder, 0, -0.24, 0);
    box(elbow, 0.075, 0.23, 0.075, P.skin, 0, -0.115, 0);
    const hand = joint(elbow, 0, -0.23, 0);
    box(hand, 0.1, 0.09, 0.09, P.skinDark, 0, -0.045, 0);
    for (const f of [-1, 0, 1]) box(hand, 0.022, 0.06, 0.022, P.nail, f * 0.03, -0.11, -0.02); // claws
    arms.push({ shoulder, elbow, hand, side });
  }
  const pebble = joint(arms[1].hand, 0, -0.1, -0.04); // the pebble in the throwing (right) hand
  box(pebble, 0.06, 0.055, 0.06, P.pebble);
  pebble.visible = false;

  // the legs hang from the rig (not the pelvis): the IK places them in the rig's frame
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = joint(rig, side * RIG.hipWidth, RIG.hipHeight, 0);
    hip.rotation.order = 'ZXY'; // the IK's order: pitch, then roll (locomotion.ts solveLeg)
    box(hip, 0.11, RIG.thigh, 0.11, P.skin, 0, -RIG.thigh / 2, 0);
    box(hip, 0.12, 0.1, 0.12, side < 0 ? P.cloth : P.patch1, 0, -0.04, 0); // ragged short leg
    const knee = joint(hip, 0, -RIG.thigh, 0);
    box(knee, 0.085, RIG.shin, 0.085, P.skin, 0, -RIG.shin / 2, 0);
    const ankle = joint(knee, 0, -RIG.shin, 0);
    box(ankle, 0.12, 0.06, 0.22, P.skinDark, 0, -RIG.ankle + 0.03, -0.05); // the big flat foot (sole at -ankle)
    for (const t of [-1, 1]) box(ankle, 0.03, 0.03, 0.04, P.nail, t * 0.035, -RIG.ankle + 0.02, -0.175);
    legs.push({ hip, knee, ankle, side });
  }

  return { group, legs: [], arms: [], joints: { rig, pelvis, torso, chest, neck, head, jaw, eyes, ears, arms, pebble, legs, flapFront, flapBack, pouch }, parts: countMeshes(group) };
}

function countMeshes(g) { let n = 0; g.traverse((o) => { if (o.isMesh) n++; }); return n; }
