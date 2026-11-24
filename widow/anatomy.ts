// @ts-check
// Numbers of the Dune Widow's body that more than one file needs: the asset generator (tools/gen-widow-assets.ts) builds
// the model and the keyframes from them, and the code gait (widow/model.ts) swings the same eight legs.
// Units are the model editor's: pixels, 16 per block, x mirrored relative to the game (the engine flips it when drawing);
// forward is -z (the head), the tail grows towards +z.

export const MOB_PATH = 'dune_widow';
export const MOB = `creatures:${MOB_PATH}`;
// where its files live (each asset kind in a folder of its own named after it)
export const GEO_FILE = `models/widow/${MOB_PATH}.geo.json`;
export const ANIM_FILE = `models/widow/${MOB_PATH}.animation.json`;
export const SKIN_FILE = `textures/mob/widow/${MOB_PATH}.png`;
export const SOUND_DIR = 'sounds/widow';

// The eight walking legs: [bone suffix, hip x (editor space; + = left), hip z, splay (deg, + = turned towards the head),
// which group of the alternating-tetrapod gait it walks with]. The arachnid's two front limbs are not legs: they are
// the long grasping palps (palp_l / palp_r), folded like a jackknife under the head.
export const LEGS: ReadonlyArray<readonly [string, number, number, number, number]> = Object.freeze([
  ['1l', 6, -9.5, 34, 0], ['1r', -6, -9.5, 34, 1],
  ['2l', 6.5, -6.5, 12, 1], ['2r', -6.5, -6.5, 12, 0],
  ['3l', 6.5, -3.5, -14, 0], ['3r', -6.5, -3.5, -14, 1],
  ['4l', 6, -0.5, -38, 1], ['4r', -6, -0.5, -38, 0],
]);

// The tail: five segments, each one turned up (editor x rotation, + lifts the far end) over the previous one, so at rest it
// arcs over the back and the stinger points forward over the head.
export const TAIL_CURL: readonly number[] = Object.freeze([28, 34, 36, 38, 40]);

// How deep the body sits in the sand while it waits (editor pixels): only the two eye stalks and the antennae stay out.
export const SINK = -15.5;
