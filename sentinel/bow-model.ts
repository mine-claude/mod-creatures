// @ts-check
// The Sentinel's longbow as a hand-made 3D model (ctx.render.itemModel): a recurve stave of segments that follow the
// curve (dark yew back, pale belly), horn tips hooking back, the red-corded grip and a taut string from tip to tip. The
// palette is the icon's (items.ts). Built along +y with the bulge toward -x, then turned onto the icon's diagonal, so the
// bow sits in the hand, on the ground and on a display exactly where its icon would. Sculpted (src/sculpt.ts): the stave
// is ONE shared geometry and material; the string is a second small shared mesh of its own, so it can breathe.

import { sharedModel } from '../src/sculpt.ts';

const BACK = 0x6e381c, BELLY = 0xa8703a, HORN = 0xd9cbab, GRIP = 0x4a3220, CORD = 0x8a3a2e, STRING = 0xe8dfc4;
const HALF = 0.6; // half the stave's length along y
const BULGE = 0.2; // how far the middle bows out toward -x
const SEGMENTS = 7; // per limb
const DIAGONAL = (g) => g.rotateZ(-Math.PI / 4); // +y onto the icon's (1, 1) diagonal: the bulge goes to the upper left, like the icon

/** The stave's centre line: x at height y, bulging at the middle and recurving (hooking back toward +x) at the tips. */
const curve = (y) => {
  const t = Math.abs(y) / HALF;
  return -BULGE * (1 - t * t) + 0.07 * Math.max(0, t - 0.78) / 0.22;
};

export class SentinelBowModel {
  /** @param {any} kit */
  build({ THREE }) {
    const stave = sharedModel(THREE, 'creatures:sentinel_bow', (s) => {
      for (const sign of [1, -1]) {
        for (let i = 0; i < SEGMENTS; i++) {
          const y0 = sign * (0.07 + (HALF - 0.07) * i / SEGMENTS), y1 = sign * (0.07 + (HALF - 0.07) * (i + 1) / SEGMENTS);
          const width = 0.075 - 0.03 * i / SEGMENTS; // limbs taper toward the tips
          const tip = i === SEGMENTS - 1;
          s.rod([curve(y0) - 0.012, y0, 0], [curve(y1) - 0.012, y1, 0], width / 2, tip ? HORN : BACK, { depth: 0.03 });
          if (!tip) s.rod([curve(y0) + width * 0.4, y0, 0.001], [curve(y1) + width * 0.4, y1, 0.001], width * 0.225, BELLY, { depth: 0.03 });
        }
      }
      // the grip at the middle of the arc: leather, two turns of red cord
      const gx = curve(0);
      s.box(0.09, 0.16, 0.075, GRIP, gx, 0, 0);
      s.box(0.095, 0.025, 0.08, CORD, gx, 0.055, 0);
      s.box(0.095, 0.025, 0.08, CORD, gx, -0.055, 0);
    }, { transform: DIAGONAL });
    // the string: tip to tip, straight, on the belly side (a mesh of its own: animate scales it)
    const sx = curve(HALF) + 0.005;
    const str = sharedModel(THREE, 'creatures:sentinel_bow:string', (s) => s.box(0.014, HALF * 2 - 0.02, 0.014, STRING, sx, 0, 0), { transform: DIAGONAL });
    str.name = 'string';
    const root = new THREE.Group();
    root.add(stave, str);
    root.userData.string = str;
    return root;
  }

  /** A faint shimmer of the taut string while it is shown (the string's width breathes a little). */
  animate(object, frame) {
    const s = object.userData.string;
    if (s) { const k = 1 + 0.15 * Math.sin(frame.now * 9); s.scale.set(k, 1, k); }
  }
}
