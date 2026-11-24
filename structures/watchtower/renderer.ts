// @ts-check
// Browser only: the two showpieces, as block-entity renderers (docs/sdk-block-entity-render.md) — Three objects anchored in
// the cell, animated by the frame clock (nothing is sent by the server):
//   LanternRenderer  the Watchtower's lantern swinging gently under its hook: a short chain, a black iron cage with warm
//                    glowing glass and a soft halo (the block's own `light` lights the lookout around it)
//   RelicRenderer    over the Forgotten Shrine's altar, a relic floating, slowly bobbing and turning: a faceted green-gold
//                    core in a pale shell, a thin ring around it and three motes circling
// Every geometry and material is made once per instance and handed to e.track, so the engine disposes of it.
import { BlockEntityRenderer } from '../../mineclaude-sdk.js';

/** a phase per cell, so neighbouring lanterns do not swing in step */
const phaseOf = (pos: { x: number, y: number, z: number }) => ((pos.x * 73856093) ^ (pos.y * 19349663) ^ (pos.z * 83492791)) % 628 / 100;

export class LanternRenderer extends BlockEntityRenderer {
  maxDistance = 72;

  /** @param {any} e */
  create(e: any) {
    const T = e.THREE;
    const mat = (o: Record<string, any>) => e.track(new T.MeshBasicMaterial(o));
    const geo = (g: any) => e.track(g);
    const iron = mat({ color: 0x2a2b2f });
    const glass = mat({ color: 0xffc35a, transparent: true, opacity: 0.92 });
    const core = mat({ color: 0xfff0b8 });
    const halo = mat({ color: 0xffb347, transparent: true, opacity: 0.16, depthWrite: false, blending: T.AdditiveBlending });
    // the pivot is the hook under the beam; everything hangs from it
    const pivot = new T.Group();
    pivot.position.set(0.5, 13 / 16, 0.5);
    const add = (g: any, m: any, x: number, y: number, z: number) => { const mesh = new T.Mesh(g, m); mesh.position.set(x, y, z); pivot.add(mesh); return mesh; };
    add(geo(new T.BoxGeometry(0.05, 0.22, 0.05)), iron, 0, -0.11, 0); // the chain
    add(geo(new T.BoxGeometry(0.2, 0.04, 0.2)), iron, 0, -0.24, 0); // the cap
    add(geo(new T.BoxGeometry(0.1, 0.04, 0.1)), iron, 0, -0.205, 0);
    add(geo(new T.BoxGeometry(0.22, 0.03, 0.22)), iron, 0, -0.56, 0); // the base
    const bar = geo(new T.BoxGeometry(0.03, 0.3, 0.03));
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) add(bar, iron, sx * 0.095, -0.4, sz * 0.095); // the cage's corners
    add(geo(new T.BoxGeometry(0.17, 0.28, 0.17)), glass, 0, -0.4, 0);
    add(geo(new T.BoxGeometry(0.07, 0.12, 0.07)), core, 0, -0.42, 0); // the flame
    add(geo(new T.SphereGeometry(0.34, 12, 8)), halo, 0, -0.4, 0);
    e.group.add(pivot);
    e.store.pivot = pivot;
    e.store.phase = phaseOf(e.pos);
    e.store.flame = pivot.children[pivot.children.length - 2];
  }

  /** @param {any} e @param {any} frame */
  render(e: any, frame: any) {
    const p = e.store.pivot;
    if (!p) return;
    const t = frame.time + e.store.phase;
    // a slow swing on two axes (the wind on the lookout) and a faint flicker of the flame
    p.rotation.z = Math.sin(t * 1.1) * 0.11;
    p.rotation.x = Math.sin(t * 0.7 + 1.3) * 0.07;
    const f = e.store.flame;
    if (f) f.scale.setScalar(0.9 + Math.sin(t * 9.0) * 0.06 + Math.sin(t * 13.7) * 0.04);
  }
}

export class RelicRenderer extends BlockEntityRenderer {
  maxDistance = 64;

  /** @param {any} e */
  create(e: any) {
    const T = e.THREE;
    const mat = (o: Record<string, any>) => e.track(new T.MeshBasicMaterial(o));
    const relic = new T.Group();
    relic.position.set(0.5, 1.55, 0.5);
    const core = new T.Mesh(e.track(new T.IcosahedronGeometry(0.14, 0)), mat({ color: 0xc8ff9a }));
    const heart = new T.Mesh(e.track(new T.OctahedronGeometry(0.07, 0)), mat({ color: 0xfffbe0 }));
    const shell = new T.Mesh(e.track(new T.IcosahedronGeometry(0.22, 1)), mat({ color: 0x9fe8c0, transparent: true, opacity: 0.22, depthWrite: false, blending: T.AdditiveBlending }));
    const ring = new T.Mesh(e.track(new T.TorusGeometry(0.3, 0.012, 6, 32)), mat({ color: 0xe6d38a }));
    ring.rotation.x = Math.PI / 2.4;
    relic.add(core, heart, shell, ring);
    const moteGeo = e.track(new T.BoxGeometry(0.035, 0.035, 0.035)), moteMat = mat({ color: 0xf4ffd8 });
    const motes = [0, 1, 2].map(() => { const m = new T.Mesh(moteGeo, moteMat); relic.add(m); return m; });
    // a faint beam down to the bowl, so the relic reads as held by the altar
    const beam = new T.Mesh(e.track(new T.CylinderGeometry(0.035, 0.09, 0.55, 8, 1, true)), mat({ color: 0xbff2a8, transparent: true, opacity: 0.18, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
    beam.position.set(0.5, 1.2, 0.5);
    e.group.add(relic, beam);
    Object.assign(e.store, { relic, core, shell, ring, motes, phase: phaseOf(e.pos) });
  }

  /** @param {any} e @param {any} frame */
  render(e: any, frame: any) {
    const s = e.store;
    if (!s.relic) return;
    const t = frame.time + s.phase;
    s.relic.position.y = 1.55 + Math.sin(t * 1.2) * 0.07; // a slow bob
    s.core.rotation.y = t * 0.6; s.core.rotation.x = t * 0.25; // and a slow turn
    s.shell.rotation.y = -t * 0.3;
    s.ring.rotation.z = t * 0.4;
    s.shell.scale.setScalar(1 + Math.sin(t * 2.1) * 0.05); // the light breathing
    s.motes.forEach((m: any, i: number) => {
      const a = t * 0.9 + (i * Math.PI * 2) / 3;
      m.position.set(Math.cos(a) * 0.36, Math.sin(t * 1.7 + i) * 0.08, Math.sin(a) * 0.36);
    });
  }
}
