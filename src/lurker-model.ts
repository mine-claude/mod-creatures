// @ts-check
import { MobModel } from '../mineclaude-sdk.js';
import { LEGS, MOB_PATH } from './anatomy.ts';

// The Moss Lurker's look: shape, skin and keyframe animations come from the model files (tools/gen-assets.ts writes
// them); this class adds what depends on how fast it moves: a six-legged tripod gait (three legs swing forward while
// the other three push), a small bob of the body and the tail swaying behind. While it lies disguised, rises, hides or
// dies, the keyframes own the body and the gait stays out of the way.
const STILL = new Set(['reveal', 'hide', 'death', 'leap']);

export default class MossLurkerModel extends MobModel {
  static geometry = `models/${MOB_PATH}.geo.json`;
  static texture = `textures/mob/${MOB_PATH}.png`;

  /** @param {{ time: number, speed: number, pose?: string | null, playing?: string | null }} state */
  animate({ time, speed, pose, playing }) {
    if (pose === 'disguised' || (playing && STILL.has(playing))) return;
    const k = Math.min(1, speed / 3);
    if (k < 0.05) { // standing: the mandibles taste the air
      this.part('mandible_l').rotation.y += Math.sin(time * 5.3) * 0.06;
      this.part('mandible_r').rotation.y -= Math.sin(time * 5.3) * 0.06;
      return;
    }
    const phase = time * (9 + 5 * k);
    for (const [id, hx, , tripod] of LEGS) {
      const s = Math.sign(hx), p = phase + (tripod ? Math.PI : 0);
      // forward/back swing around the hip (the engine's y is the editor's mirrored) and the knee lifted on the way forward
      this.part(`leg_${id}`).rotation.y += -Math.sin(p) * 0.42 * k * s;
      this.part(`leg_${id}`).rotation.z += -Math.max(0, Math.cos(p)) * 0.38 * k * s;
      this.part(`shin_${id}`).rotation.z += Math.max(0, Math.cos(p)) * 0.22 * k * s;
    }
    this.part('body').position.y += Math.abs(Math.sin(phase)) * 0.02 * k;
    this.part('tail').rotation.y += Math.sin(phase * 0.5) * 0.2 * k;
    this.part('head').rotation.y += Math.sin(phase * 0.5 + 1) * 0.06 * k;
  }
}
