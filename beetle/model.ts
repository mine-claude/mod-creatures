// @ts-check
// The Crystal Beetle's body, built in code (original design and palette): a squat, heavy cave beetle of violet-black
// chitin with iridescent edge highlights. Its back is a ROUNDED, SEGMENTED carapace made of stepped voxel slabs — a domed
// pronotum over the shoulders and two wing cases (elytra) split by a centre seam — out of which clusters of six-sided
// crystals GROW (varied sizes, leaning outwards, a bright core inside each big one). A broad, distinct head with lit eyes,
// hooked mandibles and jointed antennae ending in glowing beads; a lighter, plated belly that shows when it is on its
// back; six legs with coxa, femur, tibia and spiky tarsi. When it curls, a faceted armoured hull with crystal spikes and
// a glowing core closes around the folded body: the ball it rolls as.
//
// Joint tree (forward is -z, the game's convention; every joint is a Group, so the renderer only writes rotations):
//   group -> rig (the body's centre: flip turns it about z, height set per frame)
//              -> roller (the ball's roll turns it about x)
//                   -> body: thorax + belly, pronotum, head (eyes, mandibles, antennae), elytra L/R, abdomen, hull, legs x6
// The glowing parts use unlit materials (MeshBasicMaterial): they shine in a dark cave whatever the light, and the
// engine's red hurt flash (which tints every `emissive`) leaves them alone. The crystals carry per-facet vertex colours
// (lighter facets towards the tip and the light, darker ones below) so they still read as cut stones without lighting.
// Every material is this beetle's own.
import { LEG, LEGS } from './procedural.ts';

export const PALETTE = Object.freeze({
  chitin: 0x332852, chitinMid: 0x45386e, chitinDark: 0x1b1428, chitinLight: 0x6a5a9c, sheen: 0x4f7fa3, // the iridescent edge
  belly: 0x6e5f8e, bellyLine: 0x3b3052, claw: 0x0d0a14,
  hull: 0x332852,
  glow: 0x7fe8ff, glowViolet: 0xb48cff, eye: 0xc4f6ff, core: 0x9ff2ff,
});

// the crystal cluster on each wing case: [x across (0..1 from the midline), z along, size, lean (rad, outwards),
// forward lean (rad), violet?, core?]
const STUDS = [
  [0.3, -0.26, 0.085, 0.2, -0.15, 0, 1], [0.7, -0.16, 0.065, 0.55, 0.1, 1, 0], [0.45, -0.02, 0.125, 0.3, 0, 0, 1],
  [0.82, 0.1, 0.06, 0.75, 0.2, 0, 0], [0.25, 0.18, 0.1, 0.15, 0.1, 1, 1], [0.62, 0.26, 0.08, 0.45, 0.25, 0, 0],
  [0.4, 0.35, 0.055, 0.3, 0.45, 1, 0],
];
// where the hull's spikes grow: directions over the ball (unit vectors), none straight down
const HULL_SPIKES = [
  [0, 1, 0], [0.7, 0.6, 0.4], [-0.7, 0.6, -0.4], [0.5, 0.2, -0.85], [-0.5, 0.2, 0.85], [0.9, -0.2, 0.3], [-0.9, -0.2, -0.3], [0, 0.35, -0.95],
];

/** Builds the beetle. Returns the engine's { group, legs, arms } (both empty: the renderer moves the limbs) plus the joints. */
export function buildBeetle({ THREE }) {
  const P = PALETTE;
  const lambert = new Map();
  const solid = (c) => { let m = lambert.get(c); if (!m) { m = new THREE.MeshLambertMaterial({ color: c, flatShading: true }); lambert.set(c, m); } return m; };
  const hullMat = new THREE.MeshLambertMaterial({ color: P.hull, transparent: true, opacity: 0.95, flatShading: true });
  // the glowing ones (their colour is driven every frame by the renderer: base colour * glow level); the crystal
  // materials multiply by the per-facet vertex colours
  const glowMat = new THREE.MeshBasicMaterial({ color: P.glow, transparent: true, opacity: 0.94, vertexColors: true });
  const violetMat = new THREE.MeshBasicMaterial({ color: P.glowViolet, transparent: true, opacity: 0.94, vertexColors: true });
  const eyeMat = new THREE.MeshBasicMaterial({ color: P.eye });
  const coreMat = new THREE.MeshBasicMaterial({ color: P.core, transparent: true, opacity: 0.5, depthWrite: false });
  const glows = [{ mat: glowMat, base: P.glow }, { mat: violetMat, base: P.glowViolet }, { mat: eyeMat, base: P.eye }, { mat: coreMat, base: P.core }];
  // the hull's plate edges: a glowing wire over the faceted ball (dimmed with the glow too)
  const edgeMat = new THREE.MeshBasicMaterial({ color: P.glow, wireframe: true, transparent: true, opacity: 0.25, depthWrite: false });
  const trims = [{ mat: edgeMat, base: P.glow }];

  const mesh = (parent, geo, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); parent.add(o); return o; };
  const box = (parent, w, h, d, mat, ox = 0, oy = 0, oz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(ox, oy, oz);
    if (typeof mat !== 'number' && mat.vertexColors) paintFlat(THREE, g, 1);
    return mesh(parent, g, typeof mat === 'number' ? solid(mat) : mat);
  };
  // a six-sided crystal standing on the surface at (x, y, z): an octahedron stretched along y, its base buried a
  // little, leaning by (tiltX, tiltZ); per-facet shades; `core` puts a brighter, smaller stone inside it
  const studs = []; // the crystals on the open body (the renderer draws them in under the hull when it curls)
  const crystal = (parent, r, mat, x, y, z, tiltX = 0, tiltZ = 0, stretch = 1.7, core = false) => {
    const j = new THREE.Group();
    j.position.set(x, y, z);
    j.rotation.set(tiltX, 0.4, tiltZ);
    parent.add(j);
    studs.push(j);
    const g = new THREE.OctahedronGeometry(r, 0);
    g.scale(0.78, stretch, 0.78);
    g.translate(0, r * stretch * 0.55, 0);
    paintFacets(THREE, g);
    mesh(j, g, mat);
    if (core) {
      const c = new THREE.OctahedronGeometry(r * 0.5, 0);
      c.scale(0.78, stretch, 0.78);
      c.translate(0, r * stretch * 0.6, 0);
      mesh(j, c, eyeMat);
    }
    return j;
  };
  // a tapered limb segment of square section, from the origin along s*x, `len` long, thick `a` at the start, `b` at the end
  const segment = (parent, s, len, a, b, mat, spin = Math.PI / 4) => {
    const g = new THREE.CylinderGeometry(b, a, len, 4, 1);
    g.rotateY(spin);
    g.rotateZ(-s * Math.PI / 2);
    g.translate(s * len / 2, 0, 0);
    return mesh(parent, g, solid(mat));
  };
  // a spike (a four-sided cone) from the origin along s*x
  const spike = (parent, s, len, r, mat) => {
    const g = new THREE.ConeGeometry(r, len, 4, 1);
    g.rotateY(Math.PI / 4);
    g.rotateZ(-s * Math.PI / 2);
    g.translate(s * len / 2, 0, 0);
    return mesh(parent, g, solid(mat));
  };
  const joint = (parent, x = 0, y = 0, z = 0) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };

  const group = new THREE.Group();
  const rig = joint(group, 0, 0.42, 0);
  const roller = joint(rig);
  const body = joint(roller);

  // ---- the underside: the thorax block and the lighter, plated belly (seen when it is on its back); its own joint so
  // the renderer can draw it in under the hull
  const torso = joint(body);
  box(torso, 0.58, 0.18, 0.84, P.chitin, 0, -0.1, 0.02);
  for (const z of [-0.22, -0.04, 0.14, 0.32]) box(torso, 0.44, 0.035, 0.13, P.belly, 0, -0.2, z);
  box(torso, 0.05, 0.04, 0.72, P.bellyLine, 0, -0.2, 0.05); // the groove down the middle

  // ---- the pronotum: a stepped dome over the shoulders, iridescent rims, a crown of three crystals
  const pronotum = joint(body, 0, 0.02, -0.3);
  box(pronotum, 0.62, 0.1, 0.32, P.chitin, 0, 0.03, 0);
  box(pronotum, 0.5, 0.08, 0.27, P.chitin, 0, 0.11, 0.0);
  box(pronotum, 0.36, 0.06, 0.2, P.chitinLight, 0, 0.17, 0.0);
  for (const s of [-1, 1]) box(pronotum, 0.025, 0.05, 0.3, P.sheen, s * 0.305, 0.07, 0);
  box(pronotum, 0.62, 0.03, 0.025, P.sheen, 0, 0.085, -0.155); // the front rim
  crystal(pronotum, 0.07, violetMat, 0, 0.19, -0.02, -0.2, 0, 1.8, true);
  crystal(pronotum, 0.05, glowMat, 0.17, 0.14, 0.05, -0.15, -0.55, 1.6);
  crystal(pronotum, 0.05, glowMat, -0.17, 0.14, 0.05, -0.15, 0.55, 1.6);

  // ---- the head: broad and low, a brow ridge, cheeks, eyes in sockets, hooked mandibles, jointed antennae with beads
  const head = joint(body, 0, -0.04, -0.46);
  box(head, 0.36, 0.2, 0.22, P.chitin, 0, 0, -0.08);
  box(head, 0.34, 0.06, 0.14, P.chitinLight, 0, 0.11, -0.1); // the brow
  box(head, 0.3, 0.025, 0.02, P.sheen, 0, 0.1, -0.185); // the brow's edge catching the light
  for (const s of [-1, 1]) box(head, 0.05, 0.11, 0.14, P.chitinDark, s * 0.2, -0.03, -0.09); // the cheeks
  for (const s of [-1, 1]) {
    box(head, 0.1, 0.09, 0.03, P.chitinDark, s * 0.13, 0.03, -0.2); // the socket
    box(head, 0.07, 0.06, 0.03, eyeMat, s * 0.13, 0.03, -0.215); // the eye, proud of it
  }
  const mandibles = [];
  for (const s of [-1, 1]) {
    const j = joint(head, s * 0.1, -0.06, -0.17);
    box(j, 0.06, 0.055, 0.16, P.chitinDark, 0, 0, -0.08);
    box(j, 0.09, 0.05, 0.05, P.claw, -s * 0.035, 0, -0.17); // the hook, turned in
    mandibles.push({ j, side: s });
  }
  const antennae = [];
  for (const s of [-1, 1]) {
    const base = joint(head, s * 0.1, 0.1, -0.15);
    box(base, 0.032, 0.032, 0.2, P.chitinLight, 0, 0, -0.1);
    box(base, 0.034, 0.034, 0.034, glowMat, 0, 0, -0.2); // the glowing elbow bead
    const tip = joint(base, 0, 0, -0.2);
    box(tip, 0.024, 0.024, 0.18, P.chitinLight, 0, 0, -0.09);
    box(tip, 0.042, 0.042, 0.042, glowMat, 0, 0, -0.19); // the glowing tip bead
    antennae.push({ base, tip, side: s });
  }

  // ---- the wing cases: hinged on the midline, each a stepped dome of three slabs with a dark skirt, an iridescent rim,
  // the centre seam (dark groove with a glowing hairline) and a cluster of crystals growing out of it
  const elytra = [];
  const surfaceY = (ax) => (ax < 0.4 ? 0.255 : ax < 0.65 ? 0.205 : ax < 0.85 ? 0.145 : 0.08); // the top of the dome at that distance from the midline
  for (const s of [-1, 1]) {
    const j = joint(body, s * 0.01, 0.02, 0.1);
    box(j, 0.36, 0.08, 0.8, P.chitin, s * 0.18, 0.04, 0);
    box(j, 0.3, 0.07, 0.76, P.chitin, s * 0.16, 0.11, 0);
    box(j, 0.23, 0.06, 0.68, P.chitinMid, s * 0.135, 0.175, -0.01);
    box(j, 0.15, 0.05, 0.56, P.chitinLight, s * 0.1, 0.23, -0.02);
    box(j, 0.05, 0.2, 0.76, P.chitinDark, s * 0.365, -0.04, 0); // the skirt
    box(j, 0.02, 0.03, 0.76, P.sheen, s * 0.355, 0.085, 0); // the iridescent rim
    box(j, 0.03, 0.08, 0.72, P.chitinDark, s * 0.025, 0.23, 0); // the seam's groove
    if (s === 1) box(j, 0.012, 0.025, 0.66, glowMat, 0, 0.24, 0); // the hairline of light in the seam
    for (const [ax, az, r, lean, fwd, violet, core] of STUDS) crystal(j, r, violet ? violetMat : glowMat, s * (0.04 + ax * 0.28), surfaceY(ax) - 0.02, az, fwd, -s * lean, 1.7, !!core);
    elytra.push({ j, side: s });
  }

  // ---- the abdomen's tip, which tucks under when it curls: two plates and a crystal spur
  const abdomen = joint(body, 0, -0.04, 0.44);
  box(abdomen, 0.5, 0.16, 0.2, P.chitin, 0, 0, 0.07);
  box(abdomen, 0.4, 0.1, 0.1, P.chitinDark, 0, -0.02, 0.2);
  box(abdomen, 0.5, 0.025, 0.02, P.sheen, 0, 0.085, 0.12);
  crystal(abdomen, 0.035, violetMat, 0, 0.0, 0.24, -Math.PI / 2 + 0.3, 0, 1.6);

  // ---- the hull: a faceted armoured ball around the folded body (scaled 0 when it is not curled): dark plates with
  // glowing edges, crystal spikes growing out of it and a glowing core showing through
  const hull = joint(body);
  // (drawn in this order, whatever the camera: the core, the edges, the plates over everything folded inside, the spikes)
  mesh(hull, new THREE.IcosahedronGeometry(0.3, 0), coreMat).renderOrder = 0;
  mesh(hull, new THREE.IcosahedronGeometry(0.47, 1), hullMat).renderOrder = 3; // 80 facets: round enough to hold the folded body
  mesh(hull, new THREE.IcosahedronGeometry(0.485, 1), edgeMat).renderOrder = 4; // the plates' glowing edges, just proud of them
  const up = new THREE.Vector3(0, 1, 0);
  HULL_SPIKES.forEach(([x, y, z], i) => {
    const d = new THREE.Vector3(x, y, z).normalize();
    const sp = crystal(hull, 0.07, i % 3 === 1 ? violetMat : glowMat, d.x * 0.4, d.y * 0.4, d.z * 0.4, 0, 0, 1.5, i % 4 === 0);
    studs.pop(); // the hull's own spikes stay
    sp.quaternion.setFromUnitVectors(up, d);
    sp.traverse((o) => { o.renderOrder = 4; });
  });
  hull.scale.setScalar(1e-3);
  hull.visible = false;

  // ---- the six legs: hip (swing about y, lift about z) -> coxa and the femur up and out -> knee -> the tibia down to the
  // ground -> the tarsus: a flat foot spike and a claw
  const legs = [];
  for (const [s, hz, splay] of LEGS) {
    const hip = joint(body, s * LEG.hipX, LEG.hipY, hz);
    hip.rotation.order = 'YZX';
    hip.rotation.y = s * splay;
    box(hip, 0.12, 0.12, 0.12, P.chitin, s * 0.05, 0, 0); // the coxa
    segment(hip, s, LEG.femur, 0.07, 0.048, P.chitinMid);
    const knee = joint(hip, s * LEG.femur, 0, 0);
    segment(knee, s, LEG.tibia, 0.05, 0.026, P.chitin);
    const foot = joint(knee, s * LEG.tibia, 0, 0);
    foot.rotation.z = s * 0.9; // the tarsus bends back towards flat
    spike(foot, s, 0.12, 0.03, P.claw);
    const claw = joint(foot, s * 0.02, 0, 0);
    claw.rotation.z = -s * 1.1;
    spike(claw, s, 0.05, 0.018, P.claw);
    legs.push({ hip, knee, side: s, splay });
  }

  return {
    group, legs: [], arms: [],
    joints: { rig, roller, body, torso, pronotum, head, mandibles, antennae, elytra, abdomen, hull, legs, studs },
    glows, trims, parts: countMeshes(group),
  };
}

// Per-facet shades for a non-indexed geometry (an octahedron): faces that look up and towards +x (the light) are
// brighter, the ones that look down darker, with a small deterministic variation so no two facets match.
function paintFacets(THREE, g) {
  const pos = g.getAttribute('position');
  const n = pos.count;
  const col = new Float32Array(n * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nm = new THREE.Vector3();
  for (let f = 0; f < n / 3; f++) {
    a.fromBufferAttribute(pos, f * 3); b.fromBufferAttribute(pos, f * 3 + 1); c.fromBufferAttribute(pos, f * 3 + 2);
    nm.subVectors(b, a).cross(c.clone().sub(a)).normalize();
    const jitter = (((f * 7919) % 13) / 13 - 0.5) * 0.18;
    const tip = (a.y + b.y + c.y) / 3 > 0 ? 0.08 : 0; // the upper half catches more light
    const k = Math.min(1, Math.max(0.3, 0.55 + 0.38 * nm.y + 0.16 * nm.x + jitter + tip));
    for (let v = 0; v < 3; v++) { const i = (f * 3 + v) * 3; col[i] = col[i + 1] = col[i + 2] = k; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// One flat shade for every vertex (boxes drawn with a vertex-coloured material).
function paintFlat(THREE, g, k) {
  const n = g.getAttribute('position').count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(k), 3));
}

function countMeshes(g) { let n = 0; g.traverse((o) => { if (o.isMesh) n++; }); return n; }
