// @ts-check
// The Tide Hermit's body, built in code (original design and palette): a big beach hermit crab whose SHELL IS A BLOCK OF
// THE WORLD. The shell is a SPIRAL GASTROPOD SHELL made of block-textured voxels: a coiled whorl of cubes stepping
// around and up a helix (each one turned to follow the coil, shrinking towards a pointed apex), every cube textured with
// the atlas cells of the block the hermit took over (stone, gravel, clay, a crate from a wreck...), so it reads at a
// glance as "a snail shell built out of a piece of the beach". The body whorl has a real APERTURE at the front-bottom —
// a dark hollow with a flared, textured lip and a pale nacre rim — out of which the animal comes. Barnacles (little
// volcanoes), limpets and a strand of kelp cling to the coil.
//
// Out of the aperture comes the animal: a segmented soft abdomen (pale coral, banded) curling up and back into the dark
// of the whorl; a chunky armoured cephalothorax — coral-red shield with a lighter raised dorsal plate, darker grooves and
// side plates, cream speckles, lateral spines, a two-step rostrum and a pale underside; two eye stalks banded in blue
// with glossy black eyes (a gold ring under, a white glint and a smaller one); two long whip antennae in dark / light
// bands and two short feathery antennules; working mouthparts; one BIG right claw (a heavy sculpted palm with a rounded
// outer bulge, a pale underside, rows of cream tubercles, serrated fingers with dark hooked tips) and one SMALL slender
// left one; eight walking legs with a dark coxa, cream bands, a pale underside strip, spines and pointed dark dactyls.
//
// Performance: every static box of a joint is merged into ONE mesh (vertex colours, one shared material for the whole
// animal; the shell's textured cubes into one mesh with the atlas); only joints that move are separate objects.
//
// Joint tree (forward is -z, the game's convention; the legs' IK and every pose write only joint transforms):
//   group -> rig (height, pitch, roll from the feet)
//              -> shell (rocks; the textured helix, the aperture, barnacles, limpets, kelp)
//              -> abdomen (soft segments, inside the aperture)
//              -> front (the cephalothorax: pulls back into the shell on retreat)
//                   -> carapace, mouthparts, eyes[2] (yaw -> pitch -> stalk -> eye), antennae[4], claws[2]
//              -> legs[8]: hip frame (a fixed basis: its -y points out along the leg, its -z up) -> thigh (IK, 'ZXY')
//                          -> knee -> tip
// The legs' frame is the goblin's IK convention turned on its side: goblin/locomotion.ts solveLeg hangs a leg along -y
// with the knee towards -z; here -y points OUTWARDS and -z UP, so the same solver gives a crab's arched leg.
import { HERMIT_RIG } from './gait.ts';
import { SHELLS } from './tuning.ts';

export const PALETTE = Object.freeze({
  carapace: 0xd2502c, carapaceLight: 0xea7442, carapaceDark: 0x8e2e1a, groove: 0x5c1c10, speckle: 0xf6dfb4,
  belly: 0xf1d3a8, bellyDark: 0xd9b088, spine: 0x3a1a10,
  soft: 0xeaa697, softLight: 0xf8cdbe, softBand: 0xcc7b6c, softDark: 0xb86558,
  leg: 0xd65c32, legLight: 0xee8e58, legBand: 0xf4dcae, legDark: 0x7a2a16, tip: 0x22110b,
  claw: 0xd8542c, clawLight: 0xee7e4a, clawUnder: 0xf0c9a0, clawDark: 0x8c3018, tubercle: 0xf7e2bc, fingertip: 0x2c150d,
  stalk: 0xe28c4e, stalkBand: 0x3a6ea8, eye: 0x0c0f13, eyeRing: 0xe4b44c, glint: 0xffffff, glintSoft: 0x9fb8d8,
  antenna: 0xc44c2c, antennaLight: 0xe8a070, antennule: 0x6a5aa2, antennuleLight: 0xa294d8, mouth: 0xa8432a,
  limpet: 0xe9e2cf, limpetDark: 0x9a927f, barnacle: 0xdcd5c0, barnacleHole: 0x3a3328, kelp: 0x3f7a3a, kelpDark: 0x2c5a2a, kelpRib: 0x6a9a4a,
  nacre: 0xf3eadb, cavity: 0x1a110d, cavityFloor: 0x2b1a13,
  shellFallback: 0x9a9286,
});

// The helix of the shell, in the shell's frame (x right, y up, z back): the aperture tube's centre, which way the tube
// runs INTO the coil there (the opening faces the other way: forward and a little down), the coil's axis (the columella:
// apex up and to the right, a hint back), the tube's radius at the aperture and at the apex, how many turns, the helix's
// radius as a share of the tube's, how many tube radii it climbs per turn, how the taper is spread (an exponent on the
// way along: below 1 it thins quickly past the body whorl), and the cube spacing along the tube (as a share of the
// cube's size: at the aperture, at the apex); `turned`: how many cubes from the aperture follow the tube's direction
// (the rest are axis-aligned voxels).
export const HELIX = Object.freeze({
  start: [0.02, 0.3, 0.08], tangent: [-0.08, 0.3, 0.95], axis: [0.42, 0.84, 0.32],
  r0: 0.23, rEnd: 0.04, turns: 2.5, coil: 1.25, rise: 2.2, taper: 0.65, spacing: [0.5, 0.6], turned: 99,
});

// BoxGeometry's face order: +x, -x, +y, -y, +z, -z. Which of the block's tiles each face shows (the crate's front looks
// out of the whorl's outer side, like a lid that came off).
const FACE_TILES = ['front', 'side', 'top', 'bottom', 'side', 'side'];
const APERTURE_FACE = 5; // the first cube's -z face: the tube's open end

/** Pure vector helpers (no THREE: the helix is also computed by the tests). */
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/**
 * The coil's cubes: [{ p: [x, y, z], size, x: [..], y: [..], z: [..] }] (centre, edge, the cube's own axes: z along the
 * tube, y the world's up squared to it, x across; `radial` points out from the coil's axis) — the body whorl first, the apex last — plus the frame of the aperture
 * and a `surface(theta, phi)` sampler for things stuck on the shell.
 */
export function helixCubes(H = HELIX) {
  const A = norm(H.axis);
  const V = norm(add(H.tangent, A, -dot(H.tangent, A))); // the tube's direction at the aperture, square to the axis
  const U = norm(cross(A, V)); // from the axis to the aperture tube (down and forward)
  const R0 = H.coil * H.r0;
  const C = add(H.start, U, -R0); // the axis at height 0
  const total = H.turns * Math.PI * 2;
  const rAt = (th) => H.r0 * Math.pow(H.rEnd / H.r0, Math.pow(th / total, H.taper)); // taper < 1: quick off the body whorl
  const dth = 0.01;
  const cubes = [];
  let last = null, h = 0;
  for (let th = 0; th <= total + 1e-9; th += dth) {
    const r = rAt(th), R = H.coil * r;
    const p = add(add(C, A, h), [Math.cos(th) * U[0] + Math.sin(th) * V[0], Math.cos(th) * U[1] + Math.sin(th) * V[1], Math.cos(th) * U[2] + Math.sin(th) * V[2]], R);
    const size = 2 * r;
    const spacing = H.spacing[0] + (H.spacing[1] - H.spacing[0]) * th / total; // the body whorl dense and round, the spire stepped
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) >= spacing * size) {
      const tangent = norm([-Math.sin(th) * U[0] + Math.cos(th) * V[0] + A[0] * H.rise * r / (Math.PI * 2 * R), -Math.sin(th) * U[1] + Math.cos(th) * V[1] + A[1] * H.rise * r / (Math.PI * 2 * R), -Math.sin(th) * U[2] + Math.cos(th) * V[2] + A[2] * H.rise * r / (Math.PI * 2 * R)]);
      const radial = norm(add([Math.cos(th) * U[0] + Math.sin(th) * V[0], Math.cos(th) * U[1] + Math.sin(th) * V[1], Math.cos(th) * U[2] + Math.sin(th) * V[2]], tangent, -dot([Math.cos(th) * U[0] + Math.sin(th) * V[0], Math.cos(th) * U[1] + Math.sin(th) * V[1], Math.cos(th) * U[2] + Math.sin(th) * V[2]], tangent)));
      // the cubes stay upright (y is the world's up) and, past the aperture, axis-aligned: a voxel staircase around the
      // columella reads as blocks; only the aperture cube turns to the tube so the opening faces where the tube goes
      const turned = cubes.length < H.turned;
      const up = turned ? norm(add([0, 1, 0], tangent, -tangent[1])) : [0, 1, 0];
      const fwd = turned ? tangent : [0, 0, 1];
      cubes.push({ p, size, theta: th, x: cross(up, fwd), y: up, z: fwd, radial, h, tangent });
      last = p;
    }
    h += H.rise * r * dth / (Math.PI * 2);
  }
  // a point ON the coil's surface at angle phi around the centre line (0 = radially out, PI/2 = along the axis): the
  // outward direction is cast against the nearest cube's own faces, so things stuck on hug the voxels
  const surface = (th, phi) => {
    const radial = [Math.cos(th) * U[0] + Math.sin(th) * V[0], Math.cos(th) * U[1] + Math.sin(th) * V[1], Math.cos(th) * U[2] + Math.sin(th) * V[2]];
    const n = norm(add(radial.map((v) => v * Math.cos(phi)), A, Math.sin(phi)));
    const c = cubes.reduce((best, k) => (Math.abs(k.theta - th) < Math.abs(best.theta - th) ? k : best), cubes[0]);
    const d = c.size / 2 / Math.max(Math.abs(dot(n, c.x)), Math.abs(dot(n, c.y)), Math.abs(dot(n, c.z)), 1e-6);
    return { p: add(c.p, n, d + 0.004), n, tangent: c.tangent, r: rAt(th) };
  };
  const apex = add(cubes[cubes.length - 1].p, cubes[cubes.length - 1].z, cubes[cubes.length - 1].size * 0.7);
  return { cubes, surface, apex, axis: A, aperture: cubes[0] };
}

/** The whorl's cubes as plain numbers ([x, y, z, size] each), for the docs and the tests. */
export const WHORL = Object.freeze(helixCubes().cubes.map((c) => Object.freeze([+c.p[0].toFixed(3), +c.p[1].toFixed(3), +c.p[2].toFixed(3), +c.size.toFixed(3)])));
export const SHELL_TOP = +Math.max(...helixCubes().cubes.map((c) => c.p[1] + c.size * 0.87)).toFixed(2); // the apex's top, in the shell's frame

/**
 * The block texture of a shell: kit.blockTexture(name) when the engine offers it ({ texture, top, side, bottom, front }
 * as [u0, v0, u1, v1] atlas rects), else null (a plain colour).
 */
export function shellTexture(kit, index) {
  const name = SHELLS[index] ?? SHELLS[0];
  try { return kit?.blockTexture?.(name) ?? null; } catch { return null; }
}

/**
 * Writes the block's atlas cells into the shell geometry's UVs: each vertex carries which tile it shows
 * (userData.cellFace: an index into FACE_TILES) and its base UV inside that cell (userData.baseUV), so one whole cell
 * per cube face, like a block. Works on a single cube and on the merged coil alike.
 */
export function applyCellUV(geo, tex) {
  const uv = geo.attributes.uv, base = geo.userData.baseUV, faces = geo.userData.cellFace;
  for (let i = 0; i < uv.count; i++) {
    const key = FACE_TILES[faces ? faces[i] : ((i >> 2) % 6)];
    const [u0, v0, u1, v1] = tex[key] ?? tex.side;
    uv.setXY(i, u0 + base[i * 2] * (u1 - u0), v0 + base[i * 2 + 1] * (v1 - v0));
  }
  uv.needsUpdate = true;
}

/**
 * Merges indexed geometries (boxes, cones) into one: positions / normals transformed by each item's placement, a
 * colour per vertex, UVs kept (the shell's are remapped per cell later), indices offset. `skipFace` drops one 4-vertex
 * face's triangles of an item (the aperture's open end); the vertex order of the first item is BoxGeometry's own.
 */
function mergeGeometries(THREE, items) {
  let nv = 0, ni = 0;
  for (const it of items) { nv += it.geo.attributes.position.count; ni += it.geo.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3), faces = new Uint8Array(nv);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
  let v0 = 0, i0 = 0;
  for (const it of items) {
    const g = it.geo;
    m.compose(p.set(it.x, it.y, it.z), it.q, s);
    g.applyMatrix4(m);
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, v0 * 3);
    nor.set(g.attributes.normal.array, v0 * 3);
    uv.set(g.attributes.uv.array, v0 * 2);
    c.setHex(it.color ?? 0xffffff);
    for (let k = 0; k < n; k++) { col[(v0 + k) * 3] = c.r; col[(v0 + k) * 3 + 1] = c.g; col[(v0 + k) * 3 + 2] = c.b; faces[v0 + k] = it.box ? (k >> 2) % 6 : 1; }
    const ix = g.index.array;
    let w = i0;
    for (let k = 0; k < ix.length; k++) {
      if (it.skipFace !== undefined && k >= it.skipFace * 6 && k < it.skipFace * 6 + 6) continue;
      idx[w++] = ix[k] + v0;
    }
    i0 = w; v0 += n;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(i0 < ni ? idx.subarray(0, i0) : idx, 1));
  geo.userData.baseUV = Float32Array.from(uv);
  geo.userData.cellFace = faces;
  return geo;
}

/** Builds the hermit. Returns the engine's { group, legs, arms } (empty: the renderer moves every limb) plus the joints. */
export function buildHermit(kit) {
  const { THREE } = kit;
  const P = PALETTE;
  const solidMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, flatShading: true });
  const shellMat = new THREE.MeshLambertMaterial({ color: 0xffffff, alphaTest: 0.5 });
  const joint = (parent, x = 0, y = 0, z = 0) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };
  const ID = new THREE.Quaternion();
  const eulerQ = (rx, ry, rz) => new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  const basisQ = (x, y, z) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z)));
  // A batch: the static boxes of one joint, merged into one mesh on flush
  const batches = [];
  const batch = (parent, mat = solidMat) => { const b = { parent, mat, items: [], mesh: null }; batches.push(b); return b; };
  const box = (b, w, h, d, color, x = 0, y = 0, z = 0, q = ID) => { b.items.push({ geo: new THREE.BoxGeometry(w, h, d), x, y, z, q, color, box: true }); return b.items[b.items.length - 1]; };
  const cone = (b, r, h, n, color, x, y, z, q = ID) => b.items.push({ geo: new THREE.ConeGeometry(r, h, n), x, y, z, q, color });
  const cyl = (b, rt, rb, h, n, color, x, y, z, q = ID) => b.items.push({ geo: new THREE.CylinderGeometry(rt, rb, h, n), x, y, z, q, color });
  const flush = () => { for (const b of batches) { if (!b.items.length) continue; b.mesh = new THREE.Mesh(mergeGeometries(THREE, b.items), b.mat); b.parent.add(b.mesh); } };

  const group = new THREE.Group();
  const rig = joint(group, 0, HERMIT_RIG.hipHeight, 0);

  // ---------------------------------------------------------------- the shell (a block of the world, coiled)
  const shell = joint(rig, 0, -0.06, 0.04);
  const helix = helixCubes();
  const coil = batch(shell, shellMat);
  helix.cubes.forEach((cb, i) => {
    const it = box(coil, cb.size, cb.size, cb.size, 0xffffff, cb.p[0], cb.p[1], cb.p[2], basisQ(cb.x, cb.y, cb.z));
    if (i === 0) it.skipFace = APERTURE_FACE;
  });
  // the apex: a four-sided point on the last cube
  const tipC = helix.cubes[helix.cubes.length - 1];
  const tipQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...tipC.z));
  const tipAt = add(tipC.p, tipC.z, tipC.size * 0.5 + tipC.size * 0.45);
  coil.items.push({ geo: new THREE.ConeGeometry(tipC.size * 0.62, tipC.size * 0.9, 4), x: tipAt[0], y: tipAt[1], z: tipAt[2], q: tipQ, color: 0xffffff });

  // the aperture: in the first cube's own frame (z along the tube, the open end at -z)
  const ap = helix.aperture, S = ap.size;
  const mouth = joint(shell, ap.p[0], ap.p[1], ap.p[2]);
  mouth.quaternion.copy(basisQ(ap.x, ap.y, ap.z));
  const lipB = batch(mouth, shellMat);
  const deco = batch(mouth);
  // a flared lip: an octagon of textured bars framing the opening, proud of the cube — heavier on the outer (lower,
  // right) side, as a shell's outer lip is; a pale nacre rim just inside it
  const L = 0.07, flare = 0.028, lipZ = -S / 2 + 0.01, R8 = S / 2 + flare + L / 2, side8 = (S + 2 * flare) * 0.46;
  const nz = lipZ - 0.058, N8 = S / 2 + flare - L * 0.45, nside = N8 * 0.84;
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, straight = i % 2 === 0, q = eulerQ(0, 0, a);
    const outer = i >= 4 && i <= 6 ? 0.02 : 0; // the outer lip (down and to the right) flares a little more
    const len = straight ? side8 : side8 * 0.86, Rb = R8 + outer / 2; // a bar turned by `a` sits out along (-sin a, cos a)
    box(lipB, len, L + outer, 0.11 + outer, 0xffffff, -Math.sin(a) * Rb, Math.cos(a) * Rb, lipZ, q);
    box(deco, straight ? nside : nside * 0.9, 0.026, 0.02, P.nacre, -Math.sin(a) * N8, Math.cos(a) * N8, nz, q);
  }
  // the hollow: a dark back wall deep in the tube and dark walls lining the entrance (the cube's own walls face out)
  const depth = 0.2, wall = 0.02, inner = S - 0.012;
  box(deco, inner, inner, 0.06, P.cavity, 0, 0, -S / 2 + depth + 0.03);
  box(deco, inner, wall, depth, P.cavity, 0, inner / 2 - wall / 2, -S / 2 + depth / 2);
  box(deco, inner, wall, depth, P.cavityFloor, 0, -inner / 2 + wall / 2, -S / 2 + depth / 2);
  box(deco, wall, inner, depth, P.cavity, inner / 2 - wall / 2, 0, -S / 2 + depth / 2);
  box(deco, wall, inner, depth, P.cavity, -inner / 2 + wall / 2, 0, -S / 2 + depth / 2);

  // barnacles (little volcanoes with a dark hole) and limpets (flat cones) stuck on the coil
  const stuck = batch(shell);
  const Y = new THREE.Vector3(0, 1, 0);
  const onShell = (th, phi) => { const s = helix.surface(th, phi); return { p: s.p, q: new THREE.Quaternion().setFromUnitVectors(Y, new THREE.Vector3(...s.n)), n: s.n }; };
  for (const [th, phi, r] of [[0.9, 0.3, 0.042], [2.4, -0.4, 0.038], [4.3, 0.5, 0.034], [7.2, 0.2, 0.03]]) {
    const o = onShell(th, phi);
    cyl(stuck, r * 0.55, r, r * 1.1, 6, P.barnacle, o.p[0], o.p[1], o.p[2], o.q);
    const top = add(o.p, o.n, r * 0.56);
    cyl(stuck, r * 0.3, r * 0.3, 0.012, 6, P.barnacleHole, top[0], top[1], top[2], o.q);
  }
  for (const [th, phi, r] of [[3.4, -1.0, 0.05], [5.6, 0.9, 0.04], [0.4, 1.3, 0.045]]) {
    const o = onShell(th, phi);
    cone(stuck, r, r * 0.7, 7, P.limpet, o.p[0], o.p[1], o.p[2], o.q);
    const foot = add(o.p, o.n, -r * 0.3);
    cyl(stuck, r * 1.05, r * 1.05, 0.012, 7, P.limpetDark, foot[0], foot[1], foot[2], o.q);
  }
  // a strand of kelp hanging off the body whorl's side (three links that sway: the renderer drives them)
  const kelp = [];
  const kAt = helix.surface(2.6, 0.2).p;
  let kParent = joint(shell, kAt[0], kAt[1] + 0.03, kAt[2]);
  for (let k = 0; k < 3; k++) {
    const link = joint(kParent, 0, 0, 0);
    const kb = batch(link);
    box(kb, 0.022, 0.15, 0.075 - k * 0.015, k % 2 ? P.kelpDark : P.kelp, 0.012, -0.075, 0);
    box(kb, 0.026, 0.13, 0.014, P.kelpRib, 0.012, -0.07, 0);
    kelp.push(link);
    kParent = joint(link, 0, -0.15, 0);
  }

  // ---------------------------------------------------------------- the soft abdomen (curls up and back into the whorl)
  // Five segments stepping INTO the aperture along the tube's own direction, drifting in towards the columella; each
  // sits on a mount turned to the tube (the renderer wiggles the inner joint).
  const abdomen = joint(rig, 0, 0, 0);
  const segs = [];
  const segQ = basisQ(ap.x, ap.y, ap.z);
  for (let k = 0; k < 5; k++) {
    const sp = add(add(ap.p, ap.z, -S / 2 + 0.07 + 0.085 * k), ap.radial, -0.012 * k * k);
    const mount = joint(abdomen, sp[0] + shell.position.x, sp[1] + shell.position.y, sp[2] + shell.position.z);
    mount.quaternion.copy(segQ);
    const seg = joint(mount, 0, 0, 0);
    const sb = batch(seg);
    const w = 0.3 - 0.035 * k, h = 0.15 - 0.014 * k;
    box(sb, w, h, 0.085, k % 2 ? P.soft : P.softLight);
    box(sb, w * 0.7, 0.03, 0.087, P.softLight, 0, h / 2, 0); // the dorsal bump
    box(sb, w + 0.01, 0.024, 0.03, P.softBand, 0, 0.0, -0.035); // the band between segments
    box(sb, w * 0.9, 0.02, 0.087, P.softDark, 0, -h / 2, 0); // the shaded underside
    segs.push(seg);
  }

  // ---------------------------------------------------------------- the cephalothorax
  const LIFT = 0.07; // the body sits up in the aperture (the hips stay at the rig's floor)
  const front = joint(rig, 0, 0.02, -0.14);
  const carapace = joint(front, 0, LIFT, 0);
  const cb = batch(carapace);
  box(cb, 0.36, 0.12, 0.3, P.carapace, 0, 0.05, -0.12); // the shield
  box(cb, 0.3, 0.045, 0.26, P.carapaceLight, 0, 0.13, -0.13); // its raised dorsal plate
  box(cb, 0.22, 0.03, 0.2, P.carapaceLight, 0, 0.165, -0.14);
  box(cb, 0.14, 0.02, 0.1, P.speckle, 0, 0.19, -0.15); // the crest
  for (const s of [1, -1]) {
    box(cb, 0.055, 0.11, 0.28, P.carapaceDark, s * 0.185, 0.045, -0.11); // the side plates
    box(cb, 0.05, 0.03, 0.05, P.spine, s * 0.21, 0.07, -0.25, eulerQ(0, s * 0.5, 0)); // the lateral spines
    box(cb, 0.04, 0.025, 0.04, P.spine, s * 0.2, 0.06, -0.06, eulerQ(0, -s * 0.4, 0));
  }
  box(cb, 0.1, 0.05, 0.07, P.carapaceDark, 0, 0.1, -0.29); // the rostrum, in two steps
  box(cb, 0.06, 0.035, 0.05, P.spine, 0, 0.1, -0.33);
  box(cb, 0.3, 0.012, 0.014, P.groove, 0, 0.1525, -0.06); // the cervical groove
  box(cb, 0.012, 0.012, 0.19, P.groove, 0.085, 0.1525, -0.14); // the branchial grooves
  box(cb, 0.012, 0.012, 0.19, P.groove, -0.085, 0.1525, -0.14);
  box(cb, 0.24, 0.012, 0.012, P.groove, 0, 0.1525, -0.22);
  for (const [x, z] of [[0.05, -0.2], [-0.09, -0.1], [0.1, -0.04], [-0.03, -0.24], [0.12, -0.18], [-0.13, -0.2], [0.03, -0.09], [-0.06, -0.17]]) box(cb, 0.025, 0.012, 0.025, P.speckle, x, 0.153, z);
  box(cb, 0.32, 0.05, 0.28, P.belly, 0, -0.035, -0.12); // the pale underside
  box(cb, 0.34, 0.03, 0.08, P.bellyDark, 0, -0.03, 0.03); // the dark collar where the abdomen joins
  box(cb, 0.26, 0.07, 0.16, P.belly, 0, -LIFT - 0.02, -0.1); // the sternum, down to the coxae
  // mouthparts: two pairs of small flaps that work (the renderer flutters them)
  const mouthparts = [];
  for (const s of [1, -1]) {
    const mp = joint(carapace, s * 0.035, 0.03, -0.31);
    const mb = batch(mp);
    box(mb, 0.03, 0.06, 0.02, P.mouth, 0, -0.03, 0);
    box(mb, 0.025, 0.015, 0.025, P.speckle, 0, -0.065, -0.005);
    mouthparts.push({ j: mp, side: s });
  }

  // eye stalks: yaw -> pitch -> stalk (fold for retreat) -> eye
  const eyes = [];
  for (const s of [-1, 1]) {
    const yaw = joint(front, s * 0.06, 0.13 + LIFT, -0.29);
    const pitch = joint(yaw, 0, 0, 0);
    const stalk = joint(pitch, 0, 0, 0);
    const sb = batch(stalk);
    box(sb, 0.044, 0.04, 0.044, P.stalk, 0, 0.02, 0);
    box(sb, 0.048, 0.022, 0.048, P.stalkBand, 0, 0.051, 0);
    box(sb, 0.042, 0.036, 0.042, P.stalk, 0, 0.08, 0);
    box(sb, 0.046, 0.022, 0.046, P.stalkBand, 0, 0.109, 0);
    box(sb, 0.038, 0.05, 0.038, P.stalk, 0, 0.145, 0);
    const eye = joint(stalk, 0, 0.19, 0);
    const eb = batch(eye);
    box(eb, 0.074, 0.07, 0.074, P.eye);
    box(eb, 0.08, 0.018, 0.08, P.eyeRing, 0, -0.032, 0);
    box(eb, 0.022, 0.022, 0.012, P.glint, s * 0.014, 0.016, -0.036);
    box(eb, 0.012, 0.012, 0.012, P.glintSoft, -s * 0.018, -0.012, -0.036);
    box(eb, 0.012, 0.022, 0.012, P.glint, s * 0.037, 0.012, -0.012); // a glint on the outer side too
    eyes.push({ side: s, yaw, pitch, stalk, eye });
  }

  // antennae: two long whips (4 links, banded) and two short feathery antennules (2 links + a fork with barbs)
  const antennae = [];
  for (const [s, long] of [[-1, 1], [1, 1], [-1, 0], [1, 0]]) {
    const base = joint(front, s * (long ? 0.095 : 0.035), (long ? 0.09 : 0.1) + LIFT, -0.31);
    base.rotation.set(0.5, s * (long ? 0.55 : 0.25), 0);
    const links = [];
    let parent = base;
    const n = long ? 4 : 2, len = long ? 0.13 : 0.07;
    for (let k = 0; k < n; k++) {
      const link = joint(parent, 0, 0, 0);
      const lb = batch(link);
      const w = long ? 0.019 - 0.003 * k : 0.024;
      box(lb, w, w, len, long ? P.antenna : P.antennule, 0, 0, -len / 2);
      box(lb, w + 0.004, w + 0.004, len * 0.3, long ? P.antennaLight : P.antennuleLight, 0, 0, -len * 0.2);
      links.push(link);
      parent = joint(link, 0, 0, -len);
    }
    if (!long) {
      const fb = batch(parent);
      for (const f of [1, -1]) {
        const q = eulerQ(0, f * 0.45, 0);
        box(fb, 0.014, 0.014, 0.06, P.antennule, f * 0.016, 0, -0.03, q);
        for (let t = 0; t < 3; t++) box(fb, 0.03, 0.008, 0.008, P.antennuleLight, f * (0.016 + 0.012), 0.0, -0.015 - 0.016 * t, q); // the barbs
      }
    }
    antennae.push({ side: s, long: !!long, base, links });
  }

  // the claws: shoulder -> (merus) -> wrist -> (carpus) -> palm -> fixed finger + hinged finger. `k` scales the length,
  // `kw` the girth: the right one is BIG and heavy, the left one small and slender.
  const claws = [];
  for (const [s, k, kw] of [[1, 1, 1], [-1, 0.62, 0.55]]) {
    const shoulder = joint(front, s * 0.15, 0.03 + LIFT, -0.27);
    const shb = batch(shoulder);
    box(shb, 0.095 * kw, 0.085 * kw, 0.17 * k, P.claw, 0, 0, -0.08 * k); // merus
    box(shb, 0.08 * kw, 0.02 * kw, 0.14 * k, P.clawUnder, 0, -0.045 * kw, -0.08 * k);
    box(shb, 0.1 * kw, 0.014, 0.13 * k, P.clawDark, 0, 0.046 * kw, -0.08 * k);
    for (let t = 0; t < 2; t++) box(shb, 0.028 * kw, 0.022 * kw, 0.028 * kw, P.tubercle, 0, 0.055 * kw, -(0.04 + 0.07 * t) * k);
    const wrist = joint(shoulder, 0, 0, -0.16 * k);
    const wb = batch(wrist);
    box(wb, 0.12 * kw, 0.11 * kw, 0.12 * k, P.clawLight, 0, 0, -0.05 * k); // carpus
    box(wb, 0.1 * kw, 0.02 * kw, 0.1 * k, P.clawUnder, 0, -0.056 * kw, -0.05 * k);
    for (const [tx, tz] of [[0.03, -0.03], [-0.03, -0.05], [0.0, -0.08]]) box(wb, 0.03 * kw, 0.026 * kw, 0.03 * kw, P.tubercle, tx * kw, 0.06 * kw, tz * k);
    box(wb, 0.03 * kw, 0.03 * kw, 0.03 * kw, P.clawDark, s * 0.06 * kw, 0.02 * kw, -0.03 * k); // the outer knob
    const palm = joint(wrist, 0, 0, -0.1 * k);
    const pb = batch(palm);
    box(pb, 0.19 * kw, 0.16 * kw, 0.22 * k, P.claw, 0, 0, -0.1 * k); // the propodus, heavy
    box(pb, 0.07 * kw, 0.12 * kw, 0.17 * k, P.clawLight, s * 0.09 * kw, 0.0, -0.1 * k); // the rounded outer bulge
    box(pb, 0.15 * kw, 0.035 * kw, 0.18 * k, P.clawLight, 0, 0.08 * kw, -0.1 * k); // the lighter top
    box(pb, 0.17 * kw, 0.03 * kw, 0.2 * k, P.clawUnder, 0, -0.08 * kw, -0.1 * k); // the pale underside
    box(pb, 0.21 * kw, 0.012, 0.012, P.clawDark, 0, 0.03 * kw, -0.02 * k); // the groove at the wrist
    for (const [tx, ty, tz] of [[0.05, 0.095, -0.03], [-0.03, 0.095, -0.08], [0.04, 0.095, -0.14], [-0.01, 0.095, -0.18], [0.1, 0.045, -0.06], [0.11, 0.0, -0.12], [0.1, -0.03, -0.17], [-0.08, 0.06, -0.16]]) {
      box(pb, 0.03 * kw, 0.026 * kw, 0.03 * kw, P.tubercle, tx * kw * s, ty * kw, tz * k);
    }
    // the fixed finger (below, inner side): two steps tapering to a dark hooked tip, serrated along the inside
    box(pb, 0.075 * kw, 0.06 * kw, 0.12 * k, P.claw, -s * 0.03 * kw, -0.045 * kw, -0.26 * k);
    box(pb, 0.055 * kw, 0.045 * kw, 0.1 * k, P.claw, -s * 0.03 * kw, -0.04 * kw, -0.35 * k);
    box(pb, 0.045 * kw, 0.035 * kw, 0.05 * k, P.fingertip, -s * 0.03 * kw, -0.03 * kw, -0.415 * k, eulerQ(0.25, 0, 0));
    for (let t = 0; t < 4; t++) box(pb, (0.02 + (t % 2) * 0.008) * kw, 0.022 * kw, 0.022 * kw, P.tubercle, -s * 0.03 * kw, -0.006 * kw, -(0.22 + 0.045 * t) * k); // the teeth
    const finger = joint(palm, s * 0.03 * kw, 0.035 * kw, -0.2 * k);
    const fb = batch(finger);
    box(fb, 0.065 * kw, 0.055 * kw, 0.12 * k, P.clawLight, 0, 0, -0.06 * k);
    box(fb, 0.05 * kw, 0.045 * kw, 0.09 * k, P.clawLight, 0, 0, -0.15 * k);
    box(fb, 0.04 * kw, 0.035 * kw, 0.05 * k, P.fingertip, 0, -0.012 * kw, -0.21 * k, eulerQ(-0.3, 0, 0));
    box(fb, 0.06 * kw, 0.012, 0.1 * k, P.clawDark, 0, 0.03 * kw, -0.06 * k); // the ridge on top
    for (let t = 0; t < 4; t++) box(fb, (0.02 + ((t + 1) % 2) * 0.008) * kw, 0.022 * kw, 0.022 * kw, P.tubercle, 0, -0.03 * kw, -(0.03 + 0.045 * t) * k);
    claws.push({ side: s, big: k === 1, k, shoulder, wrist, palm, finger });
  }

  // ---------------------------------------------------------------- legs
  const legs = [];
  const v = new THREE.Vector3(), xH = new THREE.Vector3(), yH = new THREE.Vector3(), zH = new THREE.Vector3(), basis = new THREE.Matrix4();
  for (const leg of HERMIT_RIG.legs) {
    const hip = joint(rig, leg.side * HERMIT_RIG.hipX, 0, leg.hipZ);
    // the frame: -y along the leg's rest direction (outwards, a little fore/aft), -z straight up
    v.set(leg.side * (leg.footOut - HERMIT_RIG.hipX), 0, leg.footZ - leg.hipZ).normalize();
    yH.copy(v).negate();
    zH.set(0, -1, 0);
    xH.crossVectors(yH, zH);
    basis.makeBasis(xH, yH, zH);
    hip.quaternion.setFromRotationMatrix(basis);
    const hb = batch(hip);
    box(hb, 0.08, 0.07, 0.08, P.legDark, 0, -0.01, 0); // the coxa
    box(hb, 0.06, 0.03, 0.06, P.leg, 0, -0.04, 0);
    const thigh = joint(hip, 0, 0, 0);
    thigh.rotation.order = 'ZXY';
    const L1 = HERMIT_RIG.femur, L2 = HERMIT_RIG.tibia;
    const tb = batch(thigh);
    box(tb, 0.06, L1, 0.064, P.leg, 0, -L1 / 2, 0); // the femur
    box(tb, 0.05, L1 * 0.8, 0.012, P.legLight, 0, -L1 / 2, 0.034); // the pale underside strip (+z is down in this frame)
    box(tb, 0.066, 0.03, 0.07, P.legBand, 0, -L1 * 0.3, 0);
    box(tb, 0.066, 0.03, 0.07, P.legBand, 0, -L1 * 0.62, 0);
    box(tb, 0.064, 0.035, 0.068, P.legDark, 0, -L1 * 0.88, 0); // the dark band at the knee
    box(tb, 0.014, 0.035, 0.014, P.spine, 0, -L1 * 0.22, -0.038, eulerQ(0, 0, 0.3)); // spines on top
    box(tb, 0.014, 0.035, 0.014, P.spine, 0, -L1 * 0.5, -0.038, eulerQ(0, 0, 0.3));
    const knee = joint(thigh, 0, -L1, 0);
    const kb = batch(knee);
    box(kb, 0.066, 0.055, 0.066, P.legDark, 0, 0, 0); // the joint
    box(kb, 0.048, L2 * 0.5, 0.052, P.leg, 0, -L2 * 0.27, 0); // the tibia
    box(kb, 0.04, L2 * 0.4, 0.008, P.legLight, 0, -L2 * 0.27, 0.028);
    box(kb, 0.054, 0.03, 0.058, P.legBand, 0, -L2 * 0.44, 0);
    box(kb, 0.04, L2 * 0.28, 0.042, P.leg, 0, -L2 * 0.66, 0); // the propodus
    box(kb, 0.044, 0.025, 0.046, P.legDark, 0, -L2 * 0.78, 0);
    box(kb, 0.03, L2 * 0.1, 0.032, P.leg, 0, -L2 * 0.85, 0); // the dactyl
    box(kb, 0.012, 0.03, 0.012, P.spine, 0, -L2 * 0.3, -0.03, eulerQ(0, 0, 0.3));
    const tipMesh = new THREE.Mesh(new THREE.BoxGeometry(0.022, L2 * 0.16, 0.024), new THREE.MeshLambertMaterial({ color: P.tip, flatShading: true }));
    tipMesh.position.set(0, -L2 * 0.92, 0); // the dactyl's dark point (the tests read its place: 92% of the tibia)
    knee.add(tipMesh);
    legs.push({ ...leg, hip, thigh, knee, tip: tipMesh });
  }

  flush();
  const whorl = [coil.mesh]; // the coil (its first 24 vertices are the body whorl cube, BoxGeometry's order)
  const model = {
    group, legs: [], arms: [],
    joints: { rig, shell, whorl, lip: lipB.mesh, kelp, abdomen, segs, front, carapace, mouth: mouthparts, eyes, antennae, claws, legs },
    shellMat, shellIndex: -1, kit,
    parts: 0,
  };
  setShell(model, 0);
  let n = 0; group.traverse((o) => { if (o.isMesh) n++; });
  model.parts = n;
  return model;
}

/** Dresses the coil in block `index` of SHELLS: its atlas cells when the engine gives them, else a stone-ish colour. */
export function setShell(model, index) {
  if (model.shellIndex === index) return;
  model.shellIndex = index;
  const tex = shellTexture(model.kit, index);
  const mat = model.shellMat;
  if (tex?.texture) {
    for (const m of model.joints.whorl) applyCellUV(m.geometry, tex);
    if (model.joints.lip) applyCellUV(model.joints.lip.geometry, tex);
    mat.map = tex.texture;
    mat.color.setHex(0xffffff);
    model.shellCells = tex; // read by the browser check
  } else {
    mat.map = null;
    mat.color.setHex(PALETTE.shellFallback);
    model.shellCells = null;
  }
  mat.needsUpdate = true;
}
