// @ts-check
// Browser only: the goblin campfire's living look (a block entity renderer on creatures:goblin_campfire). Gentle on purpose:
// three crossed flame sheets that flicker in height and sway, a soft glow sprite, and a few puffs of smoke that rise, drift
// with a slow wind, grow and fade, in a loop. Unlit materials (the flames are the light), shared geometry, a per-fire phase
// from the position so neighbouring fires never flicker together. The light itself is the block's `light` (14).
import { BlockEntityRenderer } from '../mineclaude-sdk.js';
import { STRUCTURE_BLOCKS as SB } from './blocks.ts';

const PUFFS = 5;
const SMOKE_LIFE = 3.2; // seconds a puff lives
const SMOKE_RISE = 2.4; // blocks it climbs in that time

let shared: any = null; // the geometries, made once per page
function geometries(THREE: any) {
  if (shared) return shared;
  const flame = new THREE.PlaneGeometry(0.5, 0.7);
  flame.translate(0, 0.35, 0); // grows from the base
  shared = { flame, puff: new THREE.PlaneGeometry(0.34, 0.34) };
  return shared;
}

// a soft blob texture for the smoke and the glow (drawn on a canvas once; no image files)
let blobTex: any = null;
function softBlob(THREE: any) {
  if (blobTex) return blobTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const g = cv.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.6, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
  blobTex = new THREE.CanvasTexture(cv);
  return blobTex;
}
// a flame sheet: a pointed tongue, yellow core to red edge (drawn once)
let flameTex: any = null;
function flameTexture(THREE: any) {
  if (flameTex) return flameTex;
  const cv = document.createElement('canvas');
  cv.width = 16; cv.height = 24;
  const g = cv.getContext('2d') as CanvasRenderingContext2D;
  for (let y = 0; y < 24; y++) for (let x = 0; x < 16; x++) {
    const t = y / 23, half = (1 - t) * 7.5 * (0.7 + 0.3 * Math.sin(t * 9)), d = Math.abs(x - 7.5) / Math.max(0.5, half);
    if (d > 1) continue;
    const core = (1 - d) * (1 - t * 0.6);
    const r = 255, gg = Math.round(90 + 150 * core), b = Math.round(30 + 60 * core * core), a = Math.min(1, 0.35 + core * 1.1);
    g.fillStyle = `rgba(${r},${gg},${b},${a})`;
    g.fillRect(x, 23 - y, 1, 1);
  }
  flameTex = new THREE.CanvasTexture(cv);
  flameTex.magFilter = THREE.NearestFilter;
  return flameTex;
}

export class CampfireRenderer extends BlockEntityRenderer {
  maxDistance = 64;

  create(e: any) {
    const { THREE } = e, geo = geometries(THREE);
    const flameMat = new THREE.MeshBasicMaterial({ map: flameTexture(THREE), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const smokeMat = new THREE.MeshBasicMaterial({ map: softBlob(THREE), color: 0x6c6660, transparent: true, depthWrite: false, opacity: 0.4 });
    e.track(flameMat); e.track(smokeMat);
    const flames = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(geo.flame, flameMat);
      m.position.set(0.5, 0.28, 0.5);
      m.rotation.y = (i * Math.PI) / 3;
      e.group.add(m);
      flames.push(m);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softBlob(THREE), color: 0xff9a3a, transparent: true, depthWrite: false, opacity: 0.35, blending: THREE.AdditiveBlending }));
    e.track(glow.material);
    glow.position.set(0.5, 0.6, 0.5); glow.scale.set(1.6, 1.6, 1);
    e.group.add(glow);
    const puffs = [];
    for (let i = 0; i < PUFFS; i++) {
      const m = new THREE.Mesh(geo.puff, smokeMat.clone());
      e.track(m.material);
      e.group.add(m);
      puffs.push(m);
    }
    // a phase per fire, from its position (deterministic, no two neighbours alike)
    const p = e.pos, phase = ((p.x * 73856093) ^ (p.y * 19349663) ^ (p.z * 83492791)) >>> 0;
    Object.assign(e.store, { flames, glow, puffs, phase: (phase % 1000) / 1000 * Math.PI * 2 });
  }

  render(e: any, frame: any) {
    const s = e.store;
    if (!s.flames) return;
    const t = frame.time + s.phase;
    s.flames.forEach((m: any, i: number) => {
      const k = 0.85 + 0.12 * Math.sin(t * 7.3 + i * 2.1) + 0.06 * Math.sin(t * 13.1 + i);
      m.scale.set(0.9 + 0.08 * Math.sin(t * 5 + i), k, 1);
      m.rotation.z = 0.06 * Math.sin(t * 3.7 + i * 1.7);
    });
    s.glow.material.opacity = 0.28 + 0.07 * Math.sin(t * 6.1) + 0.04 * Math.sin(t * 11.3);
    const cam = frame.camera;
    s.puffs.forEach((m: any, i: number) => {
      const age = ((t / SMOKE_LIFE + i / PUFFS) % 1 + 1) % 1; // 0..1 through the puff's life
      m.position.set(0.5 + Math.sin(t * 0.4 + i) * 0.12 + age * 0.35, 0.9 + age * SMOKE_RISE, 0.5 + Math.cos(t * 0.3 + i * 1.3) * 0.12);
      const size = 0.6 + age * 1.8;
      m.scale.set(size, size, 1);
      m.material.opacity = 0.32 * Math.sin(age * Math.PI); // fades in, then out
      if (cam) m.quaternion.copy(cam.quaternion); // always faces the camera
    });
  }
}

/** @param {any} ctx */
export function registerStructuresClient(ctx: any) {
  ctx.render.blockEntity(SB.campfire.split(':')[1], new CampfireRenderer());
}
