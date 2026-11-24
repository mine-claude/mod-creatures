// @ts-check
// The Lure Lantern's body, built in code (an original design and palette). Closed, it reads from afar as an OLD SWAMP
// LANTERN: a bulbous seed-pod housing made of stepped layers (a top-lit olive-teal, deep teal sides, a dusky underside),
// a near-black frame (the equator band, four corner ribs, the cap and the finial), warm AMBER PANES glowing between the
// ribs, a few mint bioluminescent spots that pulse slowly, a wet glint on the crown, and on top a bent stalk from which
// the LURE hangs like a lamp: a faceted amber bulb under a little cap, with a soft additive halo; a second, fainter halo
// wraps the whole body so it glows like a lantern from across the marsh. Open, the two halves (hinged at the back) part
// into a MAW: curved lips (three angled plates each), pyramid teeth of varied sizes with two long fangs, a dark gullet
// with a red-violet throat that glows, a tongue, and two eyes that light up as it opens. Two fan fins (slats + a
// translucent membrane), a tail fan, and five tendrils tapering to translucent glowing tips hang underneath.
// Every light is EMISSIVE ONLY: unlit materials and additive sprites, nothing lights the scene. Every joint is a Group;
// forward is -z (the game's convention).

export const PALETTE = Object.freeze({
  // the skin: top-lit (the light direction is painted in: crown light, sides mid, underside dark)
  skinTop: 0x6a8c66, skin: 0x3e6a5c, skinDark: 0x24403a, belly: 0x56664a, bellyDark: 0x394531, frame: 0x1a2a26,
  // the lights
  spot: 0x9fe8c8, pane: 0xffad42, lure: 0xffc35a, lureCore: 0xfff0b8, bodyHalo: 0xffb45a, mawHalo: 0xd0407a, eye: 0xd8ffe0, glint: 0xf4fff8,
  // the maw
  gullet: 0x4a1030, throat: 0xc23a7a, tongue: 0x9c2f58, tooth: 0xeae2c8, toothRoot: 0xc8bc9c,
  // fins, tendrils, the stalk
  fin: 0x47706a, finEdge: 0x2e4a44, finTip: 0x9fd9c4, tendril: 0x3b5f56, tendrilTip: 0xa4ecd0, stalk: 0x2e4a44,
});

export const BODY = Object.freeze({ center: 0.5, hinge: 0.3, w: 0.78, d: 0.70 }); // blocks: body centre above the feet, hinge z
export const TENDRILS = Object.freeze([[-0.2, -0.05], [0.2, -0.05], [-0.11, -0.4], [0.11, -0.4], [0, 0.18]]); // [x, z] under the body
export const SEG = 0.13; // a tendril segment's length

/** A soft radial glow for the halo sprites (browser only: a canvas). */
function haloTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,236,170,1)');
  r.addColorStop(0.25, 'rgba(255,196,90,0.55)');
  r.addColorStop(0.6, 'rgba(255,150,50,0.14)');
  r.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace ?? t.colorSpace;
  return t;
}

/** Builds the lantern. Returns the engine's { group, legs, arms } (empty: the renderer moves everything) plus the joints. */
export function buildLantern({ THREE }) {
  const mats = new Map();
  const mat = (c) => { let m = mats.get(c); if (!m) { m = new THREE.MeshLambertMaterial({ color: c }); mats.set(c, m); } return m; };
  // the glowing parts: unlit (they keep their colour in the dark), each its own material so its brightness can breathe
  const glowMat = (c, extra = {}) => new THREE.MeshBasicMaterial({ color: c, fog: false, ...extra });
  const base = (c) => new THREE.Color(c); // a material's full-brightness colour (the renderer dims copies of it)
  // a box, rotated about its own centre then placed (rx, ry, rz in rad)
  const box = (parent, w, h, d, m, ox = 0, oy = 0, oz = 0, rx = 0, ry = 0, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    if (rz) g.rotateZ(rz);
    g.translate(ox, oy, oz);
    const mesh = new THREE.Mesh(g, typeof m === 'number' ? mat(m) : m);
    parent.add(mesh);
    return mesh;
  };
  // a tooth: a four-sided pyramid (a box when the kit has no cones), its base at (x, y, z), pointing up or down, tilted
  const tooth = (parent, r, h, x, y, z, down = false, tiltX = 0, tiltZ = 0, m = P.tooth) => {
    const g = THREE.ConeGeometry ? new THREE.ConeGeometry(r, h, 4) : new THREE.BoxGeometry(r * 1.2, h, r * 1.2);
    g.rotateY(Math.PI / 4);
    g.translate(0, h / 2, 0); // the base at the origin
    if (down) g.rotateX(Math.PI);
    if (tiltX) g.rotateX(tiltX);
    if (tiltZ) g.rotateZ(tiltZ);
    g.translate(x, y, z);
    const mesh = new THREE.Mesh(g, mat(m));
    parent.add(mesh);
    return mesh;
  };
  const joint = (parent, x = 0, y = 0, z = 0) => { const j = new THREE.Group(); j.position.set(x, y, z); parent.add(j); return j; };
  const P = PALETTE;
  const H = BODY.hinge; // the hinge is at the back (z = +H); the halves reach forward from it

  const group = new THREE.Group();
  const rig = joint(group); // death roll and sink
  const float = joint(rig, 0, BODY.center, 0); // bob, tilt
  float.rotation.order = 'YXZ';

  // ---- the upper half (the lid): the pod's crown in stepped layers, the frame, the panes, the spots, the eyes, the stalk
  const lid = joint(float, 0, 0, H);
  const L = (w, h, d, m, y, zc = 0, x = 0) => box(lid, w, h, d, m, x, y, -H + zc);
  L(BODY.w, 0.16, BODY.d, P.skin, 0.085, -0.01); // A: the equator layer
  L(0.70, 0.13, 0.62, P.skin, 0.225, -0.02); // B
  L(0.58, 0.10, 0.50, P.skinTop, 0.34, -0.03); // C: the lit crown
  L(0.40, 0.07, 0.34, P.skinTop, 0.425, -0.04); // D
  L(0.22, 0.05, 0.18, P.frame, 0.485, -0.05); // the cap ring
  L(0.08, 0.05, 0.08, P.frame, 0.53, -0.05); // the knob the stalk grows from
  L(BODY.w + 0.03, 0.03, BODY.d + 0.03, P.frame, 0.02, -0.01); // the equator band (the frame where the halves meet)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) L(0.05, 0.30, 0.05, P.frame, 0.16, -0.01 + sz * (BODY.d / 2 - 0.02), sx * (BODY.w / 2 - 0.02)); // the ribs
  // the lip: three angled plates along the front edge (a curved upper jaw), the fangs grow from it
  L(0.34, 0.13, 0.06, P.skin, 0.075, -BODY.d / 2 - 0.04);
  for (const sx of [-1, 1]) box(lid, 0.22, 0.13, 0.06, P.skin, sx * 0.30, 0.075, -H - BODY.d / 2 + 0.03, 0, sx * -0.62, 0);
  L(0.66, 0.03, 0.60, P.gullet, 0.012, -0.01); // the roof of the mouth (seen open)
  // the upper teeth: hanging from the lip's underside — the front row varied, two long fangs at the corners, side rows
  const teeth = [];
  const upperFront = [[-0.24, 0.07], [-0.15, 0.10], [-0.06, 0.08], [0.03, 0.11], [0.12, 0.08], [0.21, 0.07]];
  for (const [x, h] of upperFront) teeth.push(tooth(lid, 0.028, h, x, -0.004, -H - BODY.d / 2 - 0.03, true, -0.12));
  for (const sx of [-1, 1]) teeth.push(tooth(lid, 0.034, 0.16, sx * 0.31, -0.004, -H - BODY.d / 2 + 0.05, true, -0.25, sx * 0.18)); // the fangs
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) teeth.push(tooth(lid, 0.024, k === 1 ? 0.085 : 0.06, sx * (BODY.w / 2 - 0.05), -0.004, -H - 0.17 + k * 0.14, true, 0, sx * 0.3));
  // the lantern's panes: warm windows between the ribs (two rows on each side, two on the front and the back)
  const paneMat = glowMat(P.pane);
  const panes = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      panes.push(box(lid, 0.012, 0.10, 0.14, paneMat, sx * (BODY.w / 2 + 0.004), 0.095, -H - 0.01 + sz * 0.15));
      panes.push(box(lid, 0.012, 0.08, 0.12, paneMat, sx * (0.35 + 0.004), 0.225, -H - 0.02 + sz * 0.14));
    }
    panes.push(box(lid, 0.07, 0.07, 0.012, paneMat, sx * 0.09, 0.08, -H - BODY.d / 2 - 0.07 - 0.006)); // two little windows on the lip
    panes.push(box(lid, 0.12, 0.10, 0.012, paneMat, sx * 0.17, 0.095, -H - 0.01 + BODY.d / 2 + 0.004)); // the back
  }
  // the bioluminescent spots: small mint beads on the crown's shelves (the rims each layer leaves bare), in two groups
  // that pulse out of step
  const spotMats = [glowMat(P.spot), glowMat(P.spot)];
  const spots = [];
  const SPOTS = [
    [0.32, 0.30, -0.10], [-0.32, 0.30, 0.08], [0.10, 0.30, 0.27], [-0.14, 0.30, 0.27], // on B's shelf
    [0.25, 0.40, -0.05], [-0.25, 0.40, 0.10], [0.05, 0.40, 0.18], [-0.10, 0.40, -0.25], // on C's
    [0.15, 0.47, -0.10], [-0.15, 0.47, 0.06], // on D's
  ];
  SPOTS.forEach(([x, y, z], i) => spots.push(box(lid, 0.05, 0.03, 0.05, spotMats[i % 2], x, y, -H + z)));
  // the wet glint on the crown (a tiny pale slab in front of the cap that flashes softly now and then)
  const glintMat = glowMat(P.glint, { transparent: true, opacity: 0, depthWrite: false });
  const glint = box(lid, 0.09, 0.016, 0.04, glintMat, 0, 0.47, -H - 0.185);
  // the eyes: shut (scaled flat) while it pretends; they light up as the maw opens; a brow ridge over each
  const eyeMat = glowMat(P.eye);
  const eyes = [];
  for (const sx of [-1, 1]) {
    const eye = joint(lid, sx * 0.17, 0.27, -H - 0.02 - 0.31 - 0.012);
    box(eye, 0.10, 0.08, 0.02, eyeMat);
    box(eye, 0.035, 0.06, 0.022, P.frame, sx * -0.012, 0, -0.002); // a slit pupil
    eye.scale.y = 0.05;
    eyes.push(eye);
    box(lid, 0.15, 0.03, 0.05, P.skinDark, sx * 0.17, 0.325, -H - 0.02 - 0.31, 0, 0, sx * -0.3); // the brow
  }

  // ---- the stalk: two segments from the crown, arching forward; the lure hangs from its hooked tip
  const stalkBase = joint(lid, 0, 0.555, -H - 0.05);
  box(stalkBase, 0.04, 0.22, 0.04, P.stalk, 0, 0.11, 0);
  const stalkTip = joint(stalkBase, 0, 0.22, 0);
  stalkTip.rotation.x = -1.05; // bent forward (-z)
  box(stalkTip, 0.035, 0.28, 0.035, P.stalk, 0, 0.14, 0);
  box(stalkTip, 0.03, 0.05, 0.03, P.stalk, 0, 0.27, 0.025); // the hook
  const lureHang = joint(stalkTip, 0, 0.28, 0); // the pendulum joint: its own rotation is set in world-ish terms each frame
  lureHang.rotation.order = 'ZXY';
  box(lureHang, 0.012, 0.14, 0.012, P.stalk, 0, -0.07, 0); // the thread
  const lureMat = glowMat(P.lure), coreMat = glowMat(P.lureCore);
  const bulb = joint(lureHang, 0, -0.19, 0);
  box(bulb, 0.15, 0.03, 0.15, P.frame, 0, 0.08, 0); // a little cap over it, like a lamp's
  box(bulb, 0.06, 0.02, 0.06, P.frame, 0, 0.10, 0);
  box(bulb, 0.12, 0.12, 0.12, lureMat); // the faceted bulb: two boxes, one turned 45 degrees
  box(bulb, 0.10, 0.13, 0.10, lureMat, 0, 0, 0, 0, Math.PI / 4, 0);
  box(bulb, 0.055, 0.055, 0.055, coreMat, 0, 0, 0, 0, Math.PI / 4, 0);
  box(bulb, 0.05, 0.02, 0.05, P.frame, 0, -0.07, 0); // the finial
  // the halos: additive sprites that always face the camera — the lure's, and a fainter one around the body (seen from
  // afar at night: a lantern's glow, not a speck)
  let halo = null, bodyHalo = null;
  try {
    const tex = haloTexture(THREE);
    const sm = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.85 });
    halo = new THREE.Sprite(sm);
    halo.scale.set(1.1, 1.1, 1);
    bulb.add(halo);
    const bm = new THREE.SpriteMaterial({ map: tex, color: P.bodyHalo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.3 });
    bodyHalo = new THREE.Sprite(bm);
    bodyHalo.scale.set(1.7, 1.7, 1);
    bodyHalo.position.set(0, 0.1, 0);
    float.add(bodyHalo);
  } catch { halo = null; bodyHalo = null; } // no DOM canvas (a test double): the bulbs alone

  // ---- the lower half (the jaw): the pod's belly in stepped layers, the frame, the gullet, the throat, the tongue, teeth
  const jaw = joint(float, 0, 0, H);
  const Jb = (w, h, d, m, y, zc = 0, x = 0) => box(jaw, w, h, d, m, x, y, -H + zc);
  Jb(BODY.w - 0.02, 0.14, BODY.d - 0.02, P.skin, -0.07, -0.01); // A
  Jb(0.66, 0.12, 0.58, P.belly, -0.20, -0.02); // B
  Jb(0.48, 0.09, 0.42, P.belly, -0.305, -0.03); // C
  Jb(0.28, 0.06, 0.24, P.bellyDark, -0.38, -0.04); // D
  Jb(0.10, 0.05, 0.10, P.frame, -0.43, -0.05); // the finial
  Jb(BODY.w + 0.01, 0.03, BODY.d + 0.01, P.frame, -0.02, -0.01); // the band
  Jb(0.68, 0.03, 0.60, P.gullet, -0.012, -0.01); // the floor of the mouth
  // the chin: three angled plates (a curved lower jaw)
  Jb(0.34, 0.12, 0.06, P.skin, -0.075, -BODY.d / 2 - 0.03);
  for (const sx of [-1, 1]) box(jaw, 0.22, 0.12, 0.06, P.skin, sx * 0.30, -0.075, -H - BODY.d / 2 + 0.04, 0, sx * -0.62, 0);
  // the throat: a red-violet glow at the back of the gullet (floor, roof and the back wall), bright only while the maw is
  // open. The back wall hangs from the float, not from a half: it fills the gap the halves leave at the hinge
  const throatMat = glowMat(P.throat);
  box(float, 0.60, 0.20, 0.10, P.gullet, 0, 0, H - 0.04); // the gullet's back wall
  const throat = [box(jaw, 0.42, 0.02, 0.22, throatMat, 0, 0.012, -H + 0.16), box(lid, 0.42, 0.02, 0.22, throatMat, 0, -0.012, -H + 0.16), box(float, 0.36, 0.12, 0.02, throatMat, 0, 0, H - 0.10)];
  box(jaw, 0.24, 0.045, 0.28, P.tongue, 0, 0.012, -H - 0.06);
  box(jaw, 0.16, 0.04, 0.10, P.tongue, 0, 0.012, -H - 0.24); // the tip
  // the lower teeth: rising from the chin — a varied front row, two canines, side rows
  const lowerFront = [[-0.19, 0.07], [-0.10, 0.095], [-0.01, 0.065], [0.08, 0.10], [0.17, 0.075]];
  for (const [x, h] of lowerFront) teeth.push(tooth(jaw, 0.026, h, x, 0.004, -H - BODY.d / 2 - 0.02, false, 0.12));
  for (const sx of [-1, 1]) teeth.push(tooth(jaw, 0.032, 0.14, sx * 0.27, 0.004, -H - BODY.d / 2 + 0.04, false, 0.2, sx * -0.2)); // the canines
  for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) teeth.push(tooth(jaw, 0.024, k ? 0.055 : 0.075, sx * (BODY.w / 2 - 0.06), 0.004, -H - 0.12 + k * 0.16, false, 0, sx * -0.3));
  for (const sx of [-1, 1]) panes.push(box(jaw, 0.012, 0.08, 0.14, paneMat, sx * (BODY.w / 2 - 0.01 + 0.004), -0.085, -H - 0.01));

  // ---- fins: fans of slats with a translucent membrane at the sides; a vertical fan at the tail
  const finTipMat = glowMat(P.finTip, { transparent: true, opacity: 0.42, depthWrite: false, fog: true });
  // a slat: a thin box that reaches out from the joint along `dir` ([x, y, z] unit), fanned by `a` rad about `axis`
  const slat = (parent, len, thick, wide, m, dir, axis, a) => {
    const g = new THREE.BoxGeometry(dir[0] ? len : wide, dir[1] ? len : thick, dir[2] ? len : (dir[0] ? wide : thick));
    g.translate(dir[0] * len / 2, dir[1] * len / 2, dir[2] * len / 2);
    if (axis === 'y') g.rotateY(a); else g.rotateX(a);
    const mesh = new THREE.Mesh(g, mat(m));
    parent.add(mesh);
    return mesh;
  };
  const fins = [];
  for (const side of [-1, 1]) {
    const fin = joint(float, side * (BODY.w / 2), 0.0, -0.04);
    box(fin, 0.26, 0.012, 0.30, finTipMat, side * 0.14, -0.004, 0); // the membrane
    for (const a of [-0.5, -0.17, 0.17, 0.5]) slat(fin, 0.30, 0.018, 0.04, Math.abs(a) > 0.3 ? P.finEdge : P.fin, [side, 0, 0], 'y', side * a);
    fins.push({ fin, side });
  }
  const tail = joint(float, 0, 0.02, BODY.d / 2 + 0.02);
  box(tail, 0.012, 0.22, 0.20, finTipMat, 0, 0, 0.11); // the membrane
  for (const a of [-0.42, 0, 0.42]) slat(tail, 0.26, 0.035, 0.018, a ? P.finEdge : P.fin, [0, 0, 1], 'x', a);

  // ---- tendrils: chains of thin tapering segments under the body, the last translucent, a glowing bead at the tip
  const tendrilTipMat = glowMat(P.tendrilTip, { transparent: true, opacity: 0.6, depthWrite: false, fog: true });
  const beadMat = glowMat(P.spot);
  const tendrils = [];
  for (const [tx, tz] of TENDRILS) {
    const chain = [];
    let parent = joint(float, tx, -0.38, tz);
    for (let j = 0; j < 4; j++) {
      const seg = j === 0 ? parent : joint(parent, 0, -SEG, 0);
      seg.rotation.order = 'XZY';
      const w = 0.046 - j * 0.009;
      box(seg, w, SEG, w, j === 3 ? tendrilTipMat : j === 2 ? P.tendril : P.skinDark, 0, -SEG / 2, 0);
      if (j === 3) box(seg, 0.032, 0.032, 0.032, beadMat, 0, -SEG - 0.01, 0);
      chain.push(seg);
      parent = seg;
    }
    tendrils.push(chain);
  }

  // the full-brightness colours of the lights (the renderer dims copies of these: never brighter than the palette)
  const colors = {
    lure: base(P.lure), core: base(P.lureCore), pane: base(P.pane), spot: base(P.spot), eye: base(P.eye), throat: base(P.throat),
    tendrilTip: base(P.tendrilTip), bodyHalo: base(P.bodyHalo), mawHalo: base(P.mawHalo),
  };

  return {
    group, legs: [], arms: [],
    joints: {
      rig, float, lid, jaw, eyes, eyeMat, teeth, panes, paneMat, spots, spotMats, glint, glintMat, throat, throatMat, stalkBase, stalkTip, lureHang, bulb,
      lureMat, coreMat, halo, bodyHalo, fins, tail, tendrils, tendrilTipMat, beadMat, colors,
    },
    parts: countMeshes(group),
  };
}

function countMeshes(g) { let n = 0; g.traverse((o) => { if (o.isMesh || o.isSprite) n++; }); return n; }
