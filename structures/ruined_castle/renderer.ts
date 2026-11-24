// @ts-check
// The castle's showpiece: the fire of a brazier (creatures:castle_brazier), a block-entity renderer. Three tongues of flame
// over the coals (cones in additive, unlit materials: the fire lights itself), each breathing at its own pace, swaying a
// little as if in a draught, with a white-hot core and a few embers that rise, fade and start again. Gentle: no sound, no
// particles, nothing sent by the server — every brazier flickers on the page's clock, offset by its position so two
// braziers side by side never move together.
import { BlockEntityRenderer } from '../../mineclaude-sdk.js';

const TONGUES = [
  { x: 0.5, z: 0.5, r: 0.2, h: 0.55, color: 0xff8a1f, speed: 7.1, lean: 0.04 },
  { x: 0.4, z: 0.58, r: 0.13, h: 0.38, color: 0xffb13b, speed: 9.3, lean: 0.06 },
  { x: 0.6, z: 0.42, r: 0.12, h: 0.34, color: 0xff6a18, speed: 8.2, lean: 0.05 },
];
const EMBERS = 4;
const BASE_Y = 0.68; // the top of the coals in the bowl

/** The flicker of one tongue at time t: [height scale, width scale, sway x, sway z]. Pure (tests read it). */
export function flicker(t: number, speed: number, phase: number) {
  const a = Math.sin(t * speed + phase), b = Math.sin(t * speed * 2.3 + phase * 1.7), c = Math.sin(t * speed * 0.37 + phase * 0.5);
  return [1 + 0.18 * a + 0.08 * b, 1 - 0.07 * a, 0.5 * (0.6 * c + 0.4 * b), 0.5 * (0.6 * Math.cos(t * speed * 0.41 + phase) + 0.4 * a)];
}
const phaseOf = (pos: any) => ((Math.imul(pos.x | 0, 73856093) ^ Math.imul(pos.y | 0, 19349663) ^ Math.imul(pos.z | 0, 83492791)) >>> 0) / 4294967296 * Math.PI * 2;

let shared: any = null; // one geometry per shape for every brazier (not tracked: shared)
function sharedOf(THREE: any) {
  if (!shared) {
    const cone = new THREE.ConeGeometry(1, 1, 7, 1, true);
    cone.translate(0, 0.5, 0); // the base at the origin: it grows upwards
    shared = { cone, ember: new THREE.BoxGeometry(0.035, 0.035, 0.035) };
  }
  return shared;
}

export class BrazierRenderer extends BlockEntityRenderer {
  maxDistance = 48;

  create(e: any) {
    const THREE = e.THREE, g = sharedOf(THREE);
    const material = (color: number, opacity: number) => {
      const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      e.track(m);
      return m;
    };
    const tongues = TONGUES.map((d) => {
      const mesh = new THREE.Mesh(g.cone, material(d.color, 0.85));
      mesh.position.set(d.x, BASE_Y, d.z);
      e.group.add(mesh);
      return { mesh, d };
    });
    const core = new THREE.Mesh(g.cone, material(0xfff2b0, 0.9));
    core.position.set(0.5, BASE_Y, 0.5);
    e.group.add(core);
    const embers = [];
    for (let i = 0; i < EMBERS; i++) {
      const m = new THREE.Mesh(g.ember, material(0xffc45a, 1));
      e.group.add(m);
      embers.push(m);
    }
    e.store.fire = { tongues, core, embers, phase: phaseOf(e.pos) };
  }

  render(e: any, frame: any) {
    const f = e.store.fire;
    if (!f) return;
    const t = frame.time;
    for (const { mesh, d } of f.tongues) {
      const [sh, sw, sx, sz] = flicker(t, d.speed, f.phase + d.speed);
      mesh.scale.set(d.r * sw, d.h * sh, d.r * sw);
      mesh.rotation.set(sz * d.lean * 4, 0, -sx * d.lean * 4);
    }
    const [ch, cw] = flicker(t, 11.7, f.phase + 3);
    f.core.scale.set(0.08 * cw, 0.22 * ch, 0.08 * cw);
    f.embers.forEach((m: any, i: number) => {
      const life = 1.6 + i * 0.35, k = ((t + f.phase + i * 0.71) % life) / life; // 0..1 along its rise
      const a = f.phase * 3 + i * 2.1;
      m.position.set(0.5 + Math.sin(a + k * 3) * 0.16 * (0.4 + k), BASE_Y + 0.1 + k * 0.9, 0.5 + Math.cos(a + k * 2.4) * 0.16 * (0.4 + k));
      m.material.opacity = 1 - k;
      m.visible = k < 0.95;
    });
  }
}
