// @ts-check
// The Sting Swarm's insect, built in code (an original design and palette): a small wasp-like flier, drawn MANY times by
// instancing (one draw call per part for the whole swarm, so 36 insects cost six draws, not six hundred):
//   - body (one mesh): the THORAX — a rounded block (three overlapping boxes, one turned 45° for an octagonal profile) in
//     dark rust with two saffron shoulder flashes and a pale scutellum bar; the HEAD — a cream-yellow face plate under a
//     dark crown, big kidney-shaped compound eyes (deep garnet with a lighter rim and a glint), three ocelli, short amber
//     mandibles, elbowed ANTENNAE (scape + a long curving flagellum); a thin dark WAIST; six legs dangling in flight (dark
//     femurs, amber tibiae and feet), the hind pair longest; and an OUTLINE: an inverted hull (its faces turned inward) a
//     hair bigger than the thorax and the head, in near-black — back-face culling hides its near side and shows its far
//     side only around the rim, so the silhouette reads crisp against the bright sky and grass at gameplay distance;
//   - abdomen (its own mesh, hinged at the waist so it PUMPS and curls to sting): six tapering segments, each a saffron
//     band (a lighter ridge along its back) with a dark rust trailing band, a pair of dark spots on the 2nd and 3rd (the
//     swarm's mark), a pointed tip and a glossy black STINGER; its own inverted outline hull;
//   - four wings (four meshes: fore and hind, left and right): swept-back translucent membranes with an IRIDESCENT sheen
//     (the design's single cool accent: a pale smoky root, a cyan middle, a lavender tip, amber only along the leading
//     edge) and darker veins; each wing also carries two fainter GHOST copies fanned above and below it (vertex alpha), so
//     the beating wing reads as a fast blurred flutter rather than a flipping plate; drawn without depth writes so they
//     never punch holes in each other.
// Every colour lives in the vertices (with a baked ambient-occlusion darkening of the undersides); the per-insect
// variation is the instance colour (a slightly warmer or cooler, lighter or darker copy; the renderer sets it).
// Materials are made per swarm (the engine's red hurt flash writes material.emissive: one swarm's hit never tints another).
// Forward is -z (the game's convention), up is +y; sizes in blocks (an insect is ~0.26 long).

export const PALETTE = Object.freeze({
  rust: 0x3a160a, rustLight: 0x5a2a12, saffron: 0xf0ac2a, saffronLight: 0xffd25c, ochre: 0xc47c12,
  face: 0xf4dc8c, eye: 0x4e1420, eyeRim: 0x8a3a30, glint: 0xd8a8a0, ocellus: 0xffe9a0, mandible: 0xb06a18,
  leg: 0x2e1a10, tibia: 0xd8962a, stinger: 0x120a06, spot: 0x2a1008, outline: 0x160a04,
  wingRoot: 0xe6ecf2, wingMid: 0xa6dcea, wingTip: 0xc4b2ee, wingEdge: 0xd8a650, vein: 0x5a4636,
});

export const INSECT = Object.freeze({
  length: 0.26,
  waist: Object.freeze([0, -0.004, 0.052]), // the abdomen's hinge (body space)
  foreRoot: Object.freeze([0.024, 0.03, -0.012]), // the right forewing's root (the left is mirrored)
  hindRoot: Object.freeze([0.022, 0.028, 0.008]),
});

const AO_UNDER = 0.3; // how much darker a face that looks down gets (a baked shadow under the body)
const AO_SIDE = 0.06;
const GHOST_FAN = 0.5; // rad: how far the ghost wing copies fan above and below the wing
const GHOST_ALPHA = 0.36; // of the membrane's alpha

type Part = { geo: any, color: number, inside?: boolean, ao?: boolean };

/**
 * Merges coloured parts into one non-indexed geometry with a `color` attribute (vertex colours). A part marked `inside`
 * has its winding flipped (an inverted hull: an outline). Faces that look down are darkened a little (baked occlusion).
 */
export function mergeColored(THREE: any, parts: Part[]) {
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  const c = new THREE.Color();
  for (const { geo, color, inside, ao } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    c.setHex(color);
    const shade = ao !== false && !inside;
    for (let v = 0; v < p.length / 3; v++) {
      const i = inside ? (v - (v % 3)) + ((3 - (v % 3)) % 3) : v; // inside: swap the 2nd and 3rd vertex of each triangle
      const k = i * 3;
      pos.push(p[k], p[k + 1], p[k + 2]);
      const s = inside ? -1 : 1;
      nor.push(n[k] * s, n[k + 1] * s, n[k + 2] * s);
      const f = shade ? (1 - AO_UNDER * Math.max(0, -n[k + 1])) * (1 - AO_SIDE * Math.abs(n[k])) : 1;
      col.push(c.r * f, c.g * f, c.b * f);
    }
    if (g !== geo) g.dispose?.();
    geo.dispose?.();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

/** A box rotated about its own centre (rx, ry, rz) then placed at (x, y, z). */
function box(THREE: any, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

const OUTLINE = 0.009; // blocks: the hull sits this far outside the surface it outlines

/** The body: head, thorax, waist, antennae, legs and the outline hull (one geometry, vertex coloured). */
export function bodyGeometry(THREE: any) {
  const P = PALETTE, parts: Part[] = [];
  const add = (geo: any, color: number) => parts.push({ geo, color });
  // the thorax: a rounded block (three overlapping boxes, one turned 45°), the shoulder flashes, the scutellum, the collar
  add(box(THREE, 0.058, 0.054, 0.074, 0, 0.004, -0.004), P.rust);
  add(box(THREE, 0.048, 0.064, 0.058, 0, 0.004, -0.004), P.rustLight);
  add(box(THREE, 0.046, 0.046, 0.07, 0, 0.004, -0.004, 0, 0, Math.PI / 4), P.rust);
  for (const s of [-1, 1]) add(box(THREE, 0.016, 0.007, 0.034, s * 0.021, 0.037, -0.016), P.saffron);
  add(box(THREE, 0.034, 0.007, 0.012, 0, 0.037, 0.024), P.saffronLight);
  add(box(THREE, 0.042, 0.008, 0.02, 0, -0.025, -0.03), P.ochre); // the collar under the head
  // the head: a wide capsule with a crown, the face plate, the eyes (with a glint), three ocelli, mandibles
  add(box(THREE, 0.056, 0.048, 0.04, 0, 0.008, -0.062), P.rust);
  add(box(THREE, 0.04, 0.036, 0.008, 0, 0.0, -0.084), P.face);
  add(box(THREE, 0.018, 0.012, 0.006, 0, -0.018, -0.087), P.ochre); // the clypeus
  add(box(THREE, 0.05, 0.012, 0.034, 0, 0.03, -0.062), P.rustLight);
  for (const s of [-1, 1]) {
    add(box(THREE, 0.014, 0.038, 0.032, s * 0.029, 0.008, -0.064, 0, s * 0.18, 0), P.eye);
    add(box(THREE, 0.006, 0.042, 0.036, s * 0.025, 0.008, -0.064, 0, s * 0.18, 0), P.eyeRim);
    add(box(THREE, 0.004, 0.008, 0.008, s * 0.035, 0.02, -0.074, 0, s * 0.18, 0), P.glint);
    add(box(THREE, 0.012, 0.008, 0.016, s * 0.009, -0.026, -0.086, 0.4, -s * 0.5, 0), P.mandible);
  }
  for (const [x, z] of [[0, -0.07], [-0.008, -0.062], [0.008, -0.062]]) add(box(THREE, 0.005, 0.004, 0.005, x, 0.037, z), P.ocellus);
  // the antennae: a scape up and forward, then the flagellum curving out and forward
  for (const s of [-1, 1]) {
    add(box(THREE, 0.006, 0.006, 0.03, s * 0.011, 0.034, -0.088, -0.9, s * 0.2, 0), P.rust);
    add(box(THREE, 0.005, 0.005, 0.034, s * 0.02, 0.054, -0.108, -0.25, s * 0.45, 0), P.rust);
    add(box(THREE, 0.004, 0.004, 0.026, s * 0.033, 0.054, -0.134, 0.25, s * 0.65, 0), P.rustLight);
  }
  // the waist
  add(box(THREE, 0.014, 0.014, 0.024, 0, -0.004, 0.042), P.rust);
  // six legs dangling in flight: femur out and down, tibia down and back, a small foot
  const legs = [[-0.024, 0.32, 0.03], [-0.002, 0.42, 0.036], [0.02, 0.55, 0.046]]; // [z, back-swing, tibia length]
  for (const s of [-1, 1]) for (const [z, back, len] of legs) {
    add(box(THREE, 0.034, 0.008, 0.008, s * 0.042, -0.026, z, 0, 0, s * -0.55), P.leg);
    add(box(THREE, 0.006, len, 0.006, s * 0.058, -0.04 - len / 2, z + back * len * 0.5, back, 0, s * 0.12), P.tibia);
    add(box(THREE, 0.008, 0.005, 0.01, s * 0.06, -0.042 - len, z + back * len, 0, 0, 0), P.leg);
  }
  // the outline: inverted hulls around the thorax and the head
  parts.push({ geo: box(THREE, 0.058 + 2 * OUTLINE, 0.06 + 2 * OUTLINE, 0.074 + 2 * OUTLINE, 0, 0.004, -0.004), color: P.outline, inside: true });
  parts.push({ geo: box(THREE, 0.062 + 2 * OUTLINE, 0.05 + 2 * OUTLINE, 0.046 + 2 * OUTLINE, 0, 0.008, -0.064), color: P.outline, inside: true });
  return mergeColored(THREE, parts);
}

/** The abdomen, built from its hinge at the waist (origin) back along +z: six bands, the spots, the stinger, the hull. */
export function abdomenGeometry(THREE: any) {
  const P = PALETTE, parts: Part[] = [];
  const add = (geo: any, color: number) => parts.push({ geo, color });
  const segs = [[0.062, 0.058, 0.028], [0.078, 0.072, 0.032], [0.076, 0.07, 0.03], [0.064, 0.058, 0.028], [0.048, 0.044, 0.024], [0.03, 0.028, 0.02]];
  let z = 0.004, y = 0;
  const hull: Array<[number, number, number, number, number]> = [];
  segs.forEach(([w, h, d], i) => {
    const cz = z + d / 2;
    add(box(THREE, w, h, d * 0.64, 0, y, cz - d * 0.18), i === 0 ? P.ochre : P.saffron); // the saffron band
    add(box(THREE, w * 1.04, h * 1.04, d * 0.4, 0, y, cz + d * 0.3), P.rust); // the dark rust trailing band
    if (i > 0 && i < 5) add(box(THREE, w * 0.5, 0.005, d * 0.5, 0, y + h / 2 + 0.001, cz - d * 0.22), P.saffronLight); // the lit ridge
    if (i === 1 || i === 2) for (const s of [-1, 1]) add(box(THREE, 0.012, 0.006, 0.01, s * w * 0.24, y + h / 2 + 0.001, cz - d * 0.12), P.spot);
    if (i % 2 === 1 || i === 4) hull.push([w, h, d, y, cz]);
    z += d * 0.92;
    y -= 0.004 + i * 0.002; // the abdomen droops a little toward the tip
  });
  // the stinger: a dark sheath then a slim glossy cone pointing back and slightly down
  add(box(THREE, 0.014, 0.012, 0.012, 0, y - 0.002, z + 0.002), P.rust);
  const g = THREE.ConeGeometry ? new THREE.ConeGeometry(0.0075, 0.05, 5) : new THREE.BoxGeometry(0.01, 0.05, 0.01);
  g.rotateX(Math.PI / 2 + 0.22);
  g.translate(0, y - 0.006, z + 0.026);
  add(g, P.stinger);
  // the outline: inverted hulls following the taper (one around every other band pair)
  for (const [w, h, d, yy, cz] of hull) {
    const dd = d * 1.95; // covers this band and the one before it
    parts.push({ geo: box(THREE, w * 1.04 + 2 * OUTLINE, h * 1.04 + 2 * OUTLINE, dd + 2 * OUTLINE, 0, yy + 0.002, cz - d * 0.48), color: P.outline, inside: true });
  }
  return mergeColored(THREE, parts);
}

/**
 * One wing (the right one; the left is mirrored by x -> -x): a swept membrane polygon (triangle fan) with the iridescent
 * tint, its veins, and two ghost copies fanned about the root (the blur). The colour attribute carries ALPHA (4 floats).
 */
export function wingGeometry(THREE: any, hind: boolean, side: 1 | -1) {
  const P = PALETTE;
  // the outline in the wing's own plane (x out from the root, z back), root at the origin, swept back toward the tip
  const outline = hind
    ? [[0, -0.003], [0.03, -0.011], [0.058, -0.002], [0.07, 0.012], [0.05, 0.03], [0.014, 0.024]]
    : [[0, -0.006], [0.04, -0.02], [0.084, -0.016], [0.112, 0.0], [0.108, 0.02], [0.082, 0.036], [0.042, 0.032], [0.008, 0.016]];
  const span = hind ? 0.07 : 0.112;
  const pos: number[] = [], col: number[] = [];
  const c = new THREE.Color(), cEdge = new THREE.Color(P.wingEdge), cRoot = new THREE.Color(P.wingRoot), cMid = new THREE.Color(P.wingMid), cTip = new THREE.Color(P.wingTip), cVein = new THREE.Color(P.vein);
  // the sheen: pale at the root, cyan in the middle, lavender at the tip; amber along the leading edge (small z)
  const tint = (x: number, z: number) => {
    const u = Math.max(0, Math.min(1, x / span));
    if (u < 0.5) c.copy(cRoot).lerp(cMid, u * 2); else c.copy(cMid).lerp(cTip, (u - 0.5) * 2);
    return c.lerp(cEdge, Math.max(0, Math.min(1, (0.004 - z) / 0.024)) * 0.85);
  };
  const push = (x: number, y: number, z: number, cc: any, a: number) => { pos.push(x * side, y, z); col.push(cc.r, cc.g, cc.b, a); };
  const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length, cz = outline.reduce((s, p) => s + p[1], 0) / outline.length;
  // the membrane (and its ghosts): a fan about the centroid, rotated `ang` about the wing's z axis (the lift's axis)
  const membrane = (ang: number, alpha: number, dy: number) => {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length];
      const tri = side > 0 ? [[cx, cz], a, b] : [[cx, cz], b, a];
      for (const [x, z] of tri) push(x * ca, x * sa + dy, z, tint(x, z).clone(), alpha);
    }
  };
  membrane(0, 1, 0);
  membrane(GHOST_FAN, GHOST_ALPHA, 0.0004);
  membrane(-GHOST_FAN, GHOST_ALPHA, -0.0004);
  // veins: thin strips just above the membrane — along the leading edge, through the middle, a cross vein near the tip
  const strip = (x0: number, z0: number, x1: number, z1: number, w: number) => {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1, nx = -dz / L * w, nz = dx / L * w;
    const q = [[x0 - nx, z0 - nz], [x1 - nx, z1 - nz], [x1 + nx, z1 + nz], [x0 + nx, z0 + nz]];
    const tris = side > 0 ? [q[0], q[1], q[2], q[0], q[2], q[3]] : [q[0], q[2], q[1], q[0], q[3], q[2]];
    for (const [x, z] of tris) push(x, 0.0008, z, cVein, 1);
  };
  if (hind) { strip(0.002, -0.002, 0.056, -0.002, 0.0015); strip(0.01, 0.006, 0.046, 0.022, 0.0012); }
  else { strip(0.002, -0.008, 0.096, -0.01, 0.002); strip(0.006, 0.004, 0.078, 0.016, 0.0015); strip(0.05, 0.0, 0.07, 0.03, 0.0012); strip(0.078, 0.014, 0.1, 0.006, 0.0012); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * Builds the swarm's drawing: an empty mob group (the server's box is the whole cloud) with a `swarm` container whose
 * children are the instanced parts, `max` instances each. Returns the engine's { group, legs, arms } plus the joints.
 */
export function buildSwarm({ THREE }: { THREE: any }, max = 36) {
  const group = new THREE.Group();
  const swarm = new THREE.Group(); // world-axis aligned: the renderer cancels the group's yaw
  group.add(swarm);
  const solid = new THREE.MeshLambertMaterial({ vertexColors: true });
  const wingMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const inst = (geo: any, mat: any, name: string) => {
    const m = new THREE.InstancedMesh(geo, mat, max);
    m.name = name;
    m.count = 0;
    m.frustumCulled = false; // the cloud spreads far beyond the tiny geometry's bounds
    if (m.instanceMatrix?.setUsage && THREE.DynamicDrawUsage) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    swarm.add(m);
    return m;
  };
  const body = inst(bodyGeometry(THREE), solid, 'body');
  const abdomen = inst(abdomenGeometry(THREE), solid, 'abdomen');
  const wings = {
    foreR: inst(wingGeometry(THREE, false, 1), wingMat, 'foreR'), foreL: inst(wingGeometry(THREE, false, -1), wingMat, 'foreL'),
    hindR: inst(wingGeometry(THREE, true, 1), wingMat, 'hindR'), hindL: inst(wingGeometry(THREE, true, -1), wingMat, 'hindL'),
  };
  // the per-insect tint: the instance colour (white = the palette as is)
  const white = new THREE.Color(1, 1, 1);
  for (const m of [body, abdomen]) for (let i = 0; i < max; i++) m.setColorAt(i, white);
  return { group, legs: [], arms: [], parts: 6, joints: { swarm, body, abdomen, wings, solid, wingMat, max } };
}
