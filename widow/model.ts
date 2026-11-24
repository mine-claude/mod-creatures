// @ts-check
import { MobModel } from '../mineclaude-sdk.js';
import { GEO_FILE, LEGS, SKIN_FILE } from './anatomy.ts';

// The Dune Widow's look: shape, skin and keyframe animations come from the model files (tools/gen-widow-assets.ts writes
// them); this class adds what depends on how fast it moves and on time:
//   - an eight-legged ALTERNATING TETRAPOD gait: four legs (1L 2R 3L 4R) swing forward lifted while the other four push,
//     with a small front-to-back wave between the pairs so the legs do not move like two rigid blocks;
//   - the body bobs with each half-step, the curled tail sways and the palps tick;
//   - the antennae always feel the air, and while it waits buried the eye stalks turn this way and that.
// While it erupts, burrows, is under the sand or dies, the keyframes own the body and the gait stays out of the way.
const STILL = new Set(['erupt', 'burrow', 'death']);

export default class DuneWidowModel extends MobModel {
  static geometry = GEO_FILE;
  static texture = SKIN_FILE;

  /** @param {{ time: number, speed: number, pose?: string | null, playing?: string | null }} state */
  animate({ time, speed, pose, playing }) {
    if (pose === 'submerged') return;
    // the antennae: two slow, out-of-phase sweeps
    this.part('antenna_l').rotation.y += Math.sin(time * 1.7) * 0.12;
    this.part('antenna_r').rotation.y += Math.sin(time * 1.9 + 1.3) * 0.12;
    this.part('antenna_l').rotation.x += Math.sin(time * 2.3 + 0.4) * 0.06;
    this.part('antenna_r').rotation.x += Math.sin(time * 2.1 + 2.0) * 0.06;
    if (pose === 'buried') { // the stalks look around, in jerks (a hold, then a quick turn)
      const look = (k) => { const c = Math.floor(time / 1.3 + k), f = Math.min(1, ((time / 1.3 + k) % 1) * 5); const a = Math.sin(c * 2.7) * 0.5, b = Math.sin((c - 1) * 2.7) * 0.5; return b + (a - b) * f; };
      this.part('stalk_l').rotation.y += look(0);
      this.part('stalk_r').rotation.y += look(0.4);
      return;
    }
    if (playing && STILL.has(playing)) return;
    const k = Math.min(1, speed / 2.5);
    if (k < 0.05) { // standing: the palps tick, the tail tip trembles
      this.part('palp_fore_l').rotation.x += Math.max(0, Math.sin(time * 3.1)) * 0.08;
      this.part('palp_fore_r').rotation.x += Math.max(0, Math.sin(time * 3.1 + 1.1)) * 0.08;
      this.part('tail5').rotation.x += Math.sin(time * 7) * 0.03;
      return;
    }
    const phase = time * (8 + 6 * k);
    for (const [id, hx, , , group] of LEGS) {
      const s = Math.sign(hx), pair = Number(id[0]) - 1;
      const p = phase + (group ? Math.PI : 0) - pair * 0.35; // the wave: each pair a little after the one in front
      // forward/back swing around the hip and the leg lifted on the way forward (the engine's y is the editor's mirrored)
      this.part(`leg_${id}`).rotation.y += -Math.sin(p) * 0.34 * k * s;
      this.part(`leg_${id}`).rotation.z += -Math.max(0, Math.cos(p)) * 0.32 * k * s;
      this.part(`shin_${id}`).rotation.z += Math.max(0, Math.cos(p)) * 0.18 * k * s;
    }
    this.part('body').position.y += Math.abs(Math.sin(phase)) * 0.018 * k;
    this.part('body').rotation.z += Math.sin(phase) * 0.025 * k;
    this.part('tail1').rotation.y += Math.sin(phase * 0.5) * 0.12 * k;
    this.part('tail3').rotation.y += Math.sin(phase * 0.5 - 0.8) * 0.08 * k;
    this.part('palp_l').rotation.x += Math.sin(phase) * 0.05 * k;
    this.part('palp_r').rotation.x += Math.sin(phase + Math.PI) * 0.05 * k;
  }
}
