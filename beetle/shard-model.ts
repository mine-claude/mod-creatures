// @ts-check
// The Crystal Shard as a hand-made 3D model (ctx.render.itemModel): a faceted crystal (a six-sided prism with a pointed
// tip, every facet shaded by its own normal, since the item materials are unlit) with two smaller crystals at its foot and
// a pale core that pulses slowly (it "still glows in the dark", says its lore). The palette is the icon's (items.ts).
// Sculpted (src/sculpt.ts): the three crystals are ONE shared translucent geometry; the core is a small shared mesh of
// its own, so animate can scale it.
import { sharedModel } from '../src/sculpt.ts';

/** A faceted crystal of radius r and height h, base at y = 0, leaning by `lean`, pushed into the sculpt `s`. */
function crystal(s, r, h, color, x, y, z, lean) {
  s.lathe([[0, 0], [r * 0.8, 0.02], [r, h * 0.2], [r * 0.9, h * 0.72], [0, h]], 6, color, x, y, z, { rot: [0, 0, lean], gloss: 0.35 });
}

export class CrystalShardModel {
  /** @param {any} kit */
  build({ THREE }) {
    const shell = sharedModel(THREE, 'creatures:crystal_shard', (s, glass) => {
      crystal(glass, 0.15, 0.95, 0x7fe8ff, 0, -0.48, 0, -0.28);
      crystal(glass, 0.08, 0.45, 0xb48cff, -0.14, -0.46, 0.03, 0.55);
      crystal(glass, 0.07, 0.36, 0x3f7fc7, 0.12, -0.47, -0.02, -0.9);
      s.lathe([[0.1, -0.5], [0.2, -0.47], [0.16, -0.44]], 6, 0x141a33, 0, 0, 0); // the dark rock it broke from
    });
    const core = sharedModel(THREE, 'creatures:crystal_shard:core', (s) => s.box(0.06, 0.5, 0.06, 0xd8faff, 0, 0, 0, { shade: 1.2 }));
    core.position.set(0.08, -0.18, 0); // inside the main crystal (which leans -0.28 about z)
    core.rotation.z = -0.28;
    const g = new THREE.Group();
    g.add(shell, core);
    g.userData.core = core;
    return g;
  }

  /** The pale core pulses slowly. */
  animate(object, frame) {
    const core = object.userData.core;
    if (core) core.scale.setScalar(0.85 + 0.25 * (0.5 + 0.5 * Math.sin(frame.now * 2.4)));
  }
}
