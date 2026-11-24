// @ts-check
// SCULPT: the small builder behind the game's hand-made item models (ctx.render.itemModel). A model is a list of solids
// (boxes, tapered boxes, lathed facets, rods between two points) pushed into ONE non-indexed BufferGeometry with the
// light baked into the vertex colours: a fixed light shades every face by its normal (the item materials are unlit —
// the hand and the world dim them by the light of the place), `gloss` sharpens that shading into a metal-like glint.
// Every solid of a model shares ONE material (two when it has translucent parts), and the geometry is built once per
// key and shared by every copy on screen: 200 ingots on the ground are 200 meshes over the same buffers. The meshes
// are marked `sharedItemMesh`, so the engine never disposes them and the hand clones the material it tints.
//
// Conventions (docs/modding.md §32.8): one block wide, centred, the icon's top at +y, its front at +z. A tool is built
// along +y and turned onto the icon's diagonal with `rotateZ(-Math.PI / 4)` at the end (the hand grips it like the icon).
// Pure data: no DOM; it runs in Node with the real three (the suites) as it runs in the browser.
//
// The same file lives in mods/creatures/src/sculpt.ts and mods/biomes/src/sculpt.ts (a mod cannot import another mod's
// files: a packaged mod carries only its own folder). tests/suites/item-models-3d.js checks the copies are identical.

const LIGHT = [0.42, 0.78, 0.46]; // where the baked light comes from (upper right, in front)

/** rot: Euler xyz about the solid's centre; shade: a brightness multiplier; gloss: 0 matte .. 1 metal; faces: colour overrides per face. */
export type SolidOpts = { rot?: [number, number, number], shade?: number, gloss?: number, faces?: Record<string, number> };
export type RodOpts = SolidOpts & { depth?: number, r1?: number, depth1?: number };
export type LatheOpts = SolidOpts & { twist?: number };
export type ModelOpts = { transform?: (g: any) => void };

/** The RGB of a 0xrrggbb colour, 0..1. */
const rgb = (color) => [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255];

/**
 * A sculpt accumulates triangles; `geometry()` turns them into the shared BufferGeometry.
 * @param {any} THREE
 */
export function sculpt(THREE) {
  const pos = /** @type {number[]} */ ([]), col = /** @type {number[]} */ ([]), nor = /** @type {number[]} */ ([]);
  const L = new THREE.Vector3(...LIGHT).normalize();
  const n = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const tmp = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler();

  /** The brightness of a face with normal `nv`: lambert, or (gloss) a sharper metal-like falloff. */
  const brightness = (nv, gloss = 0) => {
    const d = Math.max(0, nv.dot(L));
    const lambert = 0.58 + 0.44 * d - 0.14 * Math.max(0, -nv.y);
    const metal = 0.42 + 0.9 * d * d + (nv.y > 0.9 ? 0.08 : 0) - 0.1 * Math.max(0, -nv.y);
    return lambert * (1 - gloss) + metal * gloss;
  };

  /** One triangle (a, b, c counter-clockwise seen from outside) in `color`, lit by its own normal times `shade`. */
  function tri(a, b, c, color, shade = 1, gloss = 0) {
    ab.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    ac.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    n.crossVectors(ab, ac);
    if (n.lengthSq() < 1e-14) return; // degenerate (a collapsed edge of a tapered box): nothing to draw
    n.normalize();
    const k = brightness(n, gloss) * shade;
    const [r, g, bl] = rgb(color);
    for (const p of [a, b, c]) { pos.push(p[0], p[1], p[2]); col.push(r * k, g * k, bl * k); nor.push(n.x, n.y, n.z); }
  }
  /** A quad a, b, c, d (counter-clockwise seen from outside) as two triangles. */
  function quad(a, b, c, d, color, shade = 1, gloss = 0) { tri(a, b, c, color, shade, gloss); tri(a, c, d, color, shade, gloss); }

  /** Applies `rot` (Euler xyz) about the origin and moves by (x, y, z). */
  const place = (points, rot, x, y, z) => {
    if (rot) { e.set(rot[0], rot[1], rot[2]); q.setFromEuler(e); }
    return points.map(([px, py, pz]) => {
      tmp.set(px, py, pz);
      if (rot) tmp.applyQuaternion(q);
      return [tmp.x + x, tmp.y + y, tmp.z + z];
    });
  };

  /**
   * A tapered box: the bottom rectangle wb × db, the top wt × dt, height h, centred at (x, y, z). A box when the two
   * rectangles are equal; an ingot or a blade when they are not. `faces` overrides the colour of a face ('top', 'bottom',
   * 'front' +z, 'back', 'right' +x, 'left').
   */
  function frustum(wb, db, wt, dt, h, color, x = 0, y = 0, z = 0, opts: SolidOpts = {}) {
    const { rot, shade = 1, gloss = 0, faces = {} } = opts;
    const hb = -h / 2, ht = h / 2;
    const b0 = [-wb / 2, hb, -db / 2], b1 = [wb / 2, hb, -db / 2], b2 = [wb / 2, hb, db / 2], b3 = [-wb / 2, hb, db / 2];
    const t0 = [-wt / 2, ht, -dt / 2], t1 = [wt / 2, ht, -dt / 2], t2 = [wt / 2, ht, dt / 2], t3 = [-wt / 2, ht, dt / 2];
    const [B0, B1, B2, B3, T0, T1, T2, T3] = place([b0, b1, b2, b3, t0, t1, t2, t3], rot, x, y, z);
    const c = (f) => faces[f] ?? color;
    quad(T3, T2, T1, T0, c('top'), shade, gloss);
    quad(B0, B1, B2, B3, c('bottom'), shade, gloss);
    quad(B3, B2, T2, T3, c('front'), shade, gloss);
    quad(B1, B0, T0, T1, c('back'), shade, gloss);
    quad(B2, B1, T1, T2, c('right'), shade, gloss);
    quad(B0, B3, T3, T0, c('left'), shade, gloss);
  }
  /** A box w × h × d centred at (x, y, z). */
  function box(w, h, d, color, x = 0, y = 0, z = 0, opts: SolidOpts = {}) { frustum(w, d, w, d, h, color, x, y, z, opts); }

  /**
   * A rod from point `a` to point `b`: `r` = half its width (in the plane of the rod and the x/y axes), `depth` = half its
   * thickness (default r); `r1` / `depth1` taper it toward `b` (a blade, a pick's arm). Handles, shafts, bent limbs.
   */
  function rod(a, b, r, color, opts: RodOpts = {}) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
    if (len < 1e-9) return;
    tmp.set(dx / len, dy / len, dz / len);
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tmp);
    e.setFromQuaternion(q);
    const d0 = opts.depth ?? r, r1 = opts.r1 ?? r, d1 = opts.depth1 ?? d0;
    frustum(r * 2, d0 * 2, r1 * 2, d1 * 2, len, color, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, { ...opts, rot: [e.x, e.y, e.z] });
  }

  /**
   * A lathed solid of flat facets: `profile` = [[radius, height], ...] from the bottom up (a radius of 0 closes it in a
   * point), `segments` around the +y axis, centred at (x, y, z). Gems, apples, lumps, cups. Open ends are capped.
   */
  function lathe(profile, segments, color, x = 0, y = 0, z = 0, opts: LatheOpts = {}) {
    const { rot, shade = 1, gloss = 0, twist = 0 } = opts;
    const ring = (i) => {
      const [r, h] = profile[i], out = [];
      for (let s = 0; s < segments; s++) {
        const a = ((s + twist * i) / segments) * Math.PI * 2;
        out.push([Math.cos(a) * r, h, Math.sin(a) * r]);
      }
      return place(out, rot, x, y, z);
    };
    const rings = profile.map((_, i) => ring(i));
    for (let i = 0; i < profile.length - 1; i++) {
      const lo = rings[i], hi = rings[i + 1];
      for (let s = 0; s < segments; s++) {
        const t = (s + 1) % segments;
        quad(lo[s], hi[s], hi[t], lo[t], color, shade, gloss); // outward: counter-clockwise seen from outside
      }
    }
    const cap = (ringPts, up) => {
      if (profile[up ? profile.length - 1 : 0][0] < 1e-9) return;
      const [cx, cy, cz] = place([[0, profile[up ? profile.length - 1 : 0][1], 0]], rot, x, y, z)[0];
      for (let s = 0; s < segments; s++) {
        const t = (s + 1) % segments;
        if (up) tri([cx, cy, cz], ringPts[t], ringPts[s], color, shade, gloss);
        else tri([cx, cy, cz], ringPts[s], ringPts[t], color, shade, gloss);
      }
    };
    cap(rings[0], false);
    cap(rings[rings.length - 1], true);
  }

  /** The accumulated triangles as one BufferGeometry (position, normal, color), with its bounding box computed. */
  function geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeBoundingBox();
    return g;
  }

  return { tri, quad, box, frustum, rod, lathe, geometry, count: () => pos.length / 9 };
}

// ---------------------------------------------------------------- the cache (one geometry per key, shared materials)

const caches = new WeakMap(); // THREE module -> { solid, glass, geometries: Map<key, BufferGeometry> }
function cacheOf(THREE) {
  let c = caches.get(THREE);
  if (!c) {
    c = {
      solid: new THREE.MeshBasicMaterial({ vertexColors: true }),
      glass: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.82, depthWrite: false }),
      geometries: new Map(),
    };
    caches.set(THREE, c);
  }
  return c;
}

/**
 * A model built once per `key` and shared: `build(solid, glass)` sculpts the opaque part and, optionally, a translucent
 * one (a gem's shell). Returns a Group of one or two meshes over the shared geometries and the two shared materials.
 * `transform(geometry)` runs once on each fresh geometry (e.g. `g.rotateZ(-Math.PI / 4)` onto the icon's diagonal).
 * @param {any} THREE
 * @param {string} key
 * @param {(solid: any, glass: any) => void} build
 */
export function sharedModel(THREE, key, build, opts: ModelOpts = {}) {
  const cache = cacheOf(THREE);
  let entry = cache.geometries.get(key);
  if (!entry) {
    const solid = sculpt(THREE), glass = sculpt(THREE);
    build(solid, glass);
    const finish = (s) => {
      if (!s.count()) return null;
      const g = s.geometry();
      opts.transform?.(g);
      g.computeBoundingBox();
      return g;
    };
    entry = { solid: finish(solid), glass: finish(glass) };
    cache.geometries.set(key, entry);
  }
  const group = new THREE.Group();
  group.name = key;
  for (const [kind, geo] of [['solid', entry.solid], ['glass', entry.glass]]) {
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, cache[kind]);
    mesh.userData.sharedItemMesh = true; // the engine keeps the geometry and the material; the hand clones the material it tints
    mesh.name = `${key}:${kind}`;
    group.add(mesh);
  }
  return group;
}

/** The materials every sculpted model shares (the tests: they must survive a dispose). */
export const sharedMaterials = (THREE) => { const c = cacheOf(THREE); return { solid: c.solid, glass: c.glass }; };
/** How many sculpted geometries are cached for this THREE (the tests and the debug view). */
export const sculptedCount = (THREE) => cacheOf(THREE).geometries.size;

/** Darkens (k < 1) or lightens (k > 1) a 0xrrggbb colour. */
export function tone(color, k) {
  const [r, g, b] = rgb(color).map((v) => Math.max(0, Math.min(1, v * k)));
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}
/** A #rrggbb string as 0xrrggbb. */
export const hex = (s) => parseInt(s.slice(1), 16);
