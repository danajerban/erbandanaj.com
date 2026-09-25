import { useScroll } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useMobile } from "../contexts/MobileContext";
import { layoutOf } from "../lib/coast";
import { TriangleSink, createRandom } from "../lib/lowPoly";

// Beach dressing on Home: a band of golden sand along the shore, from past
// the bottom right of the screen up the water's edge to the palms' sand point
// and a little past it, fallen coconuts under the palms and a few clusters of
// dune grass, in the palms' low-poly, flat-shaded, vertex-colored style. Two
// draw calls (sand; coconuts + grass), built from a fixed seed whenever the
// palm layout changes. A lazy chunk loaded after the first visible frame
// (HomeSection), so none of it is on the path to the scene appearing: it
// compiles its shaders off the main thread, then fades in.
//
// Coordinates are Home-local (y = 0 floor, +z toward the camera), taken
// from the same palm layout PalmTree builds. The band runs inland from the
// dry line (lib/coast dryX: where the waves stop washing up the beach), so
// the sea draws the wet sand and the swash beyond it; it widens over the sand
// point so the palms stand on it, and melts into the floor on its land side.
// Every fade runs across the shore: seen this low, a fade along it (in depth)
// is squeezed into a few pixels and reads as a hard edge. Along the dry line
// runs ShoreLife's strip (shells, crabs): the grass and the coconuts keep
// landward of it, except under the palms.
// Everything sits on its own layer, which the camera
// renders and the contact-shadow pass does not: sand lying on the floor
// would otherwise print as one big dark blob. The coconuts' shadows are baked
// into the sand instead, and the floor shadow plane (drawn after the sand,
// being nearer the camera) still darkens the sand under the palms.

const SEED = 5;
const LAYER = 1;
const FADE_SECONDS = 1.2;
// Leaving Home the sea dissolves over this span of the scroll toward Skills
// (in sections; Sea LEAVE_START, LEAVE_END): the sand goes with the water it
// borders, gone LEAVE_SAND of the way in
const LEAVE_START = 0.06;
const LEAVE_END = 0.48;
const LEAVE_SAND = 0.35;
// Camera: SceneCanvas (position [0, 0.5, 5], fov 42), 1.5 above the Home
// floor
const CAMERA_Z = 5;
const HALF_FOV_TAN = Math.tan(THREE.MathUtils.degToRad(21));
// How far apart two spots on the floor look on screen, in Home units across
// at the first one's depth: across, the second one's x shrinks with its
// distance; in depth, seen this low, a step shows 1.5 / distance as long as
// a step across
const onScreen = (x1, z1, x2, z2) => {
  const [d1, d2] = [CAMERA_Z - z1, CAMERA_Z - z2];
  return Math.hypot(x1 - (x2 * d1) / d2, (1.5 * (z1 - z2)) / d2);
};

// The band, in Home units at prop size 1 (smaller on mobile): its width
// along the shore, but never more than BAND_SCREEN of the screen's width
// (portrait is narrow); how far inland of each palm's foot it reaches over
// the sand point; how far past the farthest palm it tapers away; the share
// of its width over which its land side fades out; a low berm along it
const BAND_WIDTH = 0.65;
const BAND_SCREEN = 0.2;
const BAND_BEHIND = 0.95;
const BAND_TAPER = 2;
const LAND_FADE = 0.45;
const BERM = 0.02;
// Rows along the shore: from where the sea holds its shore line straight
// toward the camera (Sea D_NEAR, just below the bottom of the screen) up the
// screen in even steps (in 1 / distance), but never further apart than
// ROW_STEP, so the outline follows the sand point. Desktop: Home slides away
// along z as the visitor leaves, so the band runs on toward (and behind) the
// camera, straight like the sea's shore there, and fades out at its end.
const NEAR_Z = CAMERA_Z - 2.2;
const ROW_SCREEN = 0.012;
const ROW_STEP = 0.4;
const SLIDE_ROWS = [4.2, 5.6, 7, 8.4];
// Across the band, as shares of its width from the dry line
const COLUMNS = [0, 0.24, 0.48, 0.66, 0.83, 1];

// ShoreLife's strip along the dry line: grass and coconuts keep landward of
// it, except under the palms, within UNDER_PALMS of a palm's foot or of the
// spot under its crown (at palm scale 1)
const SHORE_STRIP = 0.5;
const UNDER_PALMS = 1.1;
// A trunk's foot, flare included (PalmTree, at palm scale 1)
const TRUNK_RADIUS = { desktop: 0.145, mobile: 0.13 };
// The avatar (Experience: x 0, at depth z) reaches right to x / distance ≈
// 0.054 on desktop, 0.03 on mobile (`reach` adds a margin): grass and
// coconuts in front of it stay entirely right of that on screen, at any
// aspect; behind it (it hides them) their centers do
const AVATAR = { desktop: { z: 0, reach: 0.061 }, mobile: { z: -5, reach: 0.031 } };

// Fallen coconuts by layout: [palm, dx, dz], a spot from that palm's foot
// (HomeSection's palms, in order) in prop units, dx + toward the water, dz +
// toward the camera. Seen this low the clump's trunks stand shoulder to
// shoulder on screen, so the spots lie where a coconut shows: a pair and one
// more on the land side, one in the gap by the water under the back palm's
// crown, a pair in front rolled toward the water. Portrait has barely any
// sand free between the avatar, the two trunks and the swash.
const COCONUTS = {
  desktop: [[0, -0.58, -0.84], [0, -0.5, -0.2], [1, -0.08, -0.77], [1, 0.49, -0.14], [2, -0.5, 0.38], [2, -0.36, 0.59]],
  landscape: [[0, -0.83, -1.43], [0, -0.65, -0.7], [1, 0.42, -0.41], [2, -0.52, 0.4], [2, -0.38, 0.74]],
  portrait: [[0, 0.1, 0.75], [1, 0.22, -0.55], [0, 0.18, -0.3], [1, 0.15, 0.25]],
};
// Grass clusters by layout: depth z, distance v inland of the dry line (in
// prop units), how many tufts and their size. At the clump's foot, behind
// it, then along the shore in front of it (on desktop low on the screen, its
// tips below ShoreLife's crab).
const GRASS = {
  desktop: [
    { z: -3.85, v: 0.75, tufts: 3, size: 1 },
    { z: -5.5, v: 1.05, tufts: 3, size: 0.85 },
    { z: 1.3, v: 0.66, tufts: 3, size: 0.6 },
  ],
  landscape: [
    { z: -5.4, v: 0.8, tufts: 3, size: 1 },
    { z: -7.2, v: 0.7, tufts: 2, size: 0.85 },
    { z: 0.6, v: 0.55, tufts: 3, size: 0.8 },
  ],
  portrait: [
    { z: -5.85, v: 0.17, tufts: 3, size: 0.9 },
    { z: -6.5, v: 0.16, tufts: 2, size: 0.8 },
    { z: 0.8, v: 0.55, tufts: 3, size: 0.8 },
  ],
};
// Crown center over the foot at scale 1, bend 1 (PalmTree's trunk top,
// local): the sand under it is under the palm
const CROWN = new THREE.Vector3(-0.27, 0, -0.08);

const SAND = new THREE.Color("#f0b27c");
const SAND_LIGHT = new THREE.Color("#fac99a");
const SAND_DARK = new THREE.Color("#dc9a6c");
const SHADOW = new THREE.Color("#a0624c");
const COCONUT = new THREE.Color("#5e3b25");
const GRASS_BASE = new THREE.Color("#5c742c");
const GRASS_TIP = new THREE.Color("#b9c262");
// The sand is unlit (a lit surface seen this edge-on turns grey with the
// sky's reflection), so its light is baked: facets tilted toward the sunset,
// behind and to the right, are lighter.
const SUN_DIR = new THREE.Vector3(0.5, 0.6, -0.8).normalize();

const UP = new THREE.Vector3(0, 1, 0);

// palms: PalmTree's layout; dry(z): the x of the dry line at depth z (the
// sand ends there, the water side is +x); aspect: the canvas's
const buildDecor = (palms, dry, isMobile, aspect, materials) => {
  const random = createRandom(SEED);
  const layout = layoutOf(isMobile, aspect);
  // Mobile: smaller props (coconuts, grass, margins), as the palms are
  const unit = isMobile ? 0.7 : 1;
  // Nearer than NEAR_Z the sea holds its shore line straight: so does the band
  const shore = (z) => dry(Math.min(z, NEAR_Z));

  // The band's width at depth z: BAND_WIDTH along the shore, widening over
  // the sand point to reach BAND_BEHIND inland of each palm's foot (easing
  // off in front of the nearest palm), tapering away past the farthest one;
  // its land side wobbles a little
  const reach = [...palms].sort((a, b) => b.z - a.z).map((p) => [p.z, shore(p.z) - p.x + BAND_BEHIND * p.scale]);
  const [zFront, frontReach] = reach[0];
  const [zBack, backReach] = reach.at(-1);
  const zTip = zBack - BAND_TAPER * unit;
  const point = (z) => {
    if (z >= zFront) return frontReach * Math.exp(-(((z - zFront) / (1.2 * unit)) ** 2));
    const i = reach.findIndex(([pz]) => pz <= z);
    if (i < 0) return backReach;
    const [z0, r0] = reach[i - 1];
    const [z1, r1] = reach[i];
    return r1 + ((r0 - r1) * (z - z1)) / (z0 - z1);
  };
  const phases = [random(), random(), random(), random()].map((p) => p * Math.PI * 2);
  const taper = (z) => THREE.MathUtils.smoothstep(z, zTip, zBack - 0.4 * unit);
  const width = (z) => {
    const d = CAMERA_Z - Math.min(z, NEAR_Z);
    // The shore's width wobbles (evenly down the screen: in 1 / distance);
    // a soft max eases it onto the point's, a soft min keeps it under
    // BAND_SCREEN
    const wobble = 1 + 0.1 * Math.sin(60 / d + phases[0]) + 0.05 * Math.sin(150 / d + phases[1]);
    const w = Math.pow((BAND_WIDTH * unit * wobble) ** 4 + point(z) ** 4, 0.25);
    const cap = BAND_SCREEN * 2 * HALF_FOV_TAN * aspect * d;
    return Math.pow(w ** -4 + cap ** -4, -0.25) * taper(z);
  };
  const berm = (f) => 0.003 + BERM * unit * Math.sin(Math.PI * f) ** 2;
  const sandHeight = (x, z) => {
    const f = (shore(z) - x) / width(z);
    return f > 0 && f < 1 ? berm(f) : 0;
  };

  // Sand: a grid of rows along the shore and columns across it, each cell
  // split along a random diagonal. Alpha fades over the land side, over the
  // tip past the point and, on desktop, over the far end of the slide rows.
  // RGBA colors, so not a TriangleSink.
  const rows = [zTip];
  while (rows.at(-1) < NEAR_Z) {
    const d = CAMERA_Z - rows.at(-1);
    rows.push(Math.min(NEAR_Z, rows.at(-1) + Math.min(ROW_STEP, d * d * ROW_SCREEN)));
  }
  if (!isMobile) rows.push(...SLIDE_ROWS);
  const along = (z) => Math.sqrt(taper(z)) * (1 - THREE.MathUtils.smoothstep(z, SLIDE_ROWS[1], SLIDE_ROWS.at(-1)));
  const grid = rows.map((z0, i) => {
    const inner = i > 0 && i < rows.length - 1;
    const gap = inner ? Math.min(rows[i + 1] - z0, z0 - rows[i - 1]) : 0;
    return COLUMNS.map((c, j) => {
      // Inner vertices jitter a little, for uneven facets; the dry-line edge
      // stays on the dry line
      const jitter = j > 0 && j < COLUMNS.length - 1;
      const z = jitter && inner ? z0 + (random() - 0.5) * 0.5 * gap : z0;
      const f = jitter ? c + (random() - 0.5) * 0.08 : c;
      return {
        p: new THREE.Vector3(shore(z) - f * width(z), berm(f), z),
        alpha: (1 - THREE.MathUtils.smoothstep(f, 1 - LAND_FADE, 1)) * along(z),
      };
    });
  });
  const sandPosition = [];
  const sandColor = [];
  const sandVertex = (v, c) => {
    sandPosition.push(v.p.x, v.p.y, v.p.z);
    sandColor.push(c.r, c.g, c.b, v.alpha);
  };
  const normal = new THREE.Vector3();
  const facet = (a, b, c) => {
    // Wind every facet to face up, and give it one sand tone: broad patches,
    // a little per-facet variation, lighter tilted toward the sunset
    normal.subVectors(b.p, a.p).cross(new THREE.Vector3().subVectors(c.p, a.p));
    if (normal.y < 0) {
      [b, c] = [c, b];
      normal.negate();
    }
    const x = (a.p.x + b.p.x + c.p.x) / 3;
    const z = (a.p.z + b.p.z + c.p.z) / 3;
    const patch = 0.25 * Math.sin(x * 2.1 + z * 0.9 + phases[2]) * Math.sin(x * 0.8 - z * 1.7 + phases[3]);
    const t = patch + (random() * 2 - 1) * 0.2 + (normal.normalize().dot(SUN_DIR) - SUN_DIR.y) * 4;
    const color = SAND.clone().lerp(t > 0 ? SAND_LIGHT : SAND_DARK, Math.min(1, Math.abs(t)));
    for (const v of [a, b, c]) sandVertex(v, color);
  };
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < COLUMNS.length - 1; j++) {
      const [a, b, c, d] = [grid[i][j], grid[i][j + 1], grid[i + 1][j], grid[i + 1][j + 1]];
      if (random() < 0.5) {
        facet(a, b, d);
        facet(a, d, c);
      } else {
        facet(a, b, c);
        facet(b, d, c);
      }
    }
  }

  // Room for a prop of radius r at (x, z): inland of the dry line, within
  // `band` of the band's width, landward of ShoreLife's strip unless under
  // the palms, right of the avatar on screen, its root outside the trunks
  const avatar = AVATAR[isMobile ? "mobile" : "desktop"];
  const trunk = TRUNK_RADIUS[isMobile ? "mobile" : "desktop"];
  const crowns = palms.map((p) =>
    CROWN.clone()
      .multiplyScalar(p.bend * p.scale)
      .applyAxisAngle(UP, p.yaw),
  );
  const underPalms = (x, z) =>
    palms.some((p, i) => Math.min(Math.hypot(x - p.x, z - p.z), Math.hypot(x - p.x - crowns[i].x, z - p.z - crowns[i].z)) < UNDER_PALMS * p.scale);
  const free = (x, z, r, band) => {
    const v = shore(z) - x;
    return (
      v > r + 0.03 * unit &&
      v < width(z) * band &&
      (v - r > SHORE_STRIP * unit || underPalms(x, z)) &&
      (x - (z > avatar.z ? r : 0)) / (CAMERA_Z - z) > avatar.reach &&
      palms.every((p) => Math.hypot(x - p.x, z - p.z) > r + trunk * p.scale)
    );
  };
  // Apart on screen from every spot in the list
  const apart = (x, z, list, distance) => list.every(([a, b]) => onScreen(x, z, a, b) > distance);
  // Clear of the trunks on screen: behind one (the trunk rises up the
  // screen) at least half of a prop shows; in front of one a coconut lies to
  // one side of its foot or far enough in front that all of it (1.7 r tall)
  // shows below the foot's flare, while grass may grow against it
  const clearOfTrunks = (x, z, r, coconut) =>
    palms.every((p) => {
      const foot = trunk * p.scale;
      const side = Math.abs(x - (p.x * (CAMERA_Z - z)) / (CAMERA_Z - p.z));
      if (z <= p.z) return side > foot;
      return !coconut || side > r + foot || onScreen(p.x, z, p.x, p.z + foot) > 1.8 * r;
    });
  // The spot nearest (x, z) on screen, within `span` across (and half as far
  // on screen in depth), where `fits` holds
  const nearest = (x, z, span, fits) => {
    let best = null;
    let bestGap = Infinity;
    const deep = (span * (CAMERA_Z - z)) / 3;
    for (let i = -24; i <= 24; i++) {
      for (let j = -24; j <= 24; j++) {
        const [cx, cz] = [x + (i / 24) * span, z + (j / 24) * deep];
        const gap = onScreen(cx, cz, x, z);
        if (gap < bestGap && fits(cx, cz)) {
          best = [cx, cz];
          bestGap = gap;
        }
      }
    }
    return best;
  };

  // Fallen coconuts at their spots, or the nearest spot where they show: on
  // the band's sand, clear of the trunks, touching another at most
  const coconuts = [];
  for (const [i, dx, dz] of COCONUTS[layout]) {
    const p = palms[i];
    if (!p) continue;
    // Sized like the palm's own coconuts (a palm nearer the camera is
    // smaller: HomeSection)
    const size = unit * Math.min(1, p.scale);
    const z = p.z + dz * unit;
    const spot = nearest(
      Math.min(p.x + dx * unit, shore(z) - 0.2 * size),
      z,
      0.35 * size,
      (x, z) => free(x, z, 0.1 * size, 0.85) && clearOfTrunks(x, z, 0.1 * size, true) && apart(x, z, coconuts, 0.19 * size),
    );
    if (spot) coconuts.push([...spot, size]);
  }

  // Grass tufts in clusters: the first near the cluster's center, the others
  // a third of a turn apart around it, spread further in depth the further
  // out (on screen depth is squeezed), so a cluster keeps its shape and never
  // lines up in a row; each at the nearest spot with room, clear of the
  // coconuts. Dune grass may root out to the band's fading land edge.
  const tufts = [];
  // MOBILE_PERF: five grass tufts instead of nine (two clusters, not three) — revert by removing the ternary
  const clusters = isMobile ? GRASS[layout].slice(0, 2) : GRASS[layout];
  for (const cluster of clusters) {
    const cx = shore(cluster.z) - cluster.v * unit;
    const turn = random() * Math.PI * 2;
    for (let k = 0; k < cluster.tufts; k++) {
      const angle = turn + (k * Math.PI * 2) / 3 + (random() - 0.5) * 0.8;
      const d = (k === 0 ? random() * 0.3 : 0.7 + random() * 0.5) * unit;
      const size = cluster.size * (k === 0 ? 1 + random() * 0.15 : 0.55 + random() * 0.3) * unit;
      const spot = nearest(
        cx + Math.cos(angle) * 0.17 * d,
        cluster.z + Math.sin(angle) * 0.06 * d * (CAMERA_Z - cluster.z),
        0.3 * unit,
        (x, z) => free(x, z, 0.12 * size, 1.05) && clearOfTrunks(x, z, 0.12 * size, false) && apart(x, z, coconuts, 0.12 * unit) && apart(x, z, tufts, 0.08 * unit),
      );
      if (spot) tufts.push([...spot, size]);
    }
  }

  // Props: coconuts and grass in one geometry, grass swaying by aSway
  const props = new TriangleSink(true);
  const ico = new THREE.IcosahedronGeometry(0.095, 1);
  const pos = ico.attributes.position;
  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler();
  for (const [x, z, size] of coconuts) {
    const scale = (0.9 + random() * 0.2) * size;
    const center = new THREE.Vector3(x, sandHeight(x, z) + 0.095 * 0.85 * scale * 0.9, z);
    matrix.compose(
      center,
      new THREE.Quaternion().setFromEuler(euler.set(random() * 3, random() * 3, random() * 3)),
      new THREE.Vector3(scale, scale * 0.85, scale),
    );
    const base = COCONUT.clone().offsetHSL(0, 0, (random() - 0.5) * 0.08);
    for (let i = 0; i < pos.count; i += 3) {
      const color = base.clone().offsetHSL(0, 0, (random() - 0.5) * 0.06);
      for (let j = 0; j < 3; j++) props.vertex(new THREE.Vector3().fromBufferAttribute(pos, i + j).applyMatrix4(matrix), color);
    }

    // Its shadow, baked into the sand: a soft dark fan just above the surface,
    // cast forward and left, away from the sunset
    const rim = [];
    for (let s = 0; s <= 10; s++) {
      const a = (s / 10) * Math.PI * 2;
      const rx = x + Math.cos(a) * 0.15 * scale - 0.03 * size;
      const rz = z + Math.sin(a) * 0.1 * scale + 0.03 * size;
      rim.push({ p: new THREE.Vector3(rx, sandHeight(rx, rz) + 0.004, rz), alpha: 0 });
    }
    const [mx, mz] = [x - 0.02 * size, z + 0.02 * size];
    const middle = { p: new THREE.Vector3(mx, sandHeight(mx, mz) + 0.004, mz), alpha: 0.5 };
    for (let s = 0; s < 10; s++) {
      const [a, b] = [rim[s], rim[s + 1]];
      normal.subVectors(a.p, middle.p).cross(new THREE.Vector3().subVectors(b.p, middle.p));
      const [p, q] = normal.y < 0 ? [b, a] : [a, b];
      for (const v of [middle, p, q]) sandVertex(v, SHADOW);
    }
  }
  ico.dispose();

  // Dune-grass tufts: slim two-segment blades curving outward from a point
  for (const [x, z, size] of tufts) {
    const phase = random() * Math.PI * 2;
    const foot = new THREE.Vector3(x, sandHeight(x, z) - 0.005, z);
    const blades = 9 + Math.floor(random() * 4);
    for (let b = 0; b < blades; b++) {
      const angle = random() * Math.PI * 2;
      const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const side = new THREE.Vector3().crossVectors(out, UP);
      const lean = 0.3 + random() * 0.5;
      const height = (0.16 + random() * 0.16) * size;
      const width = (0.014 + random() * 0.006) * size;
      const root = foot.clone().addScaledVector(out, random() * 0.035 * size);
      const at = (u) =>
        root
          .clone()
          .addScaledVector(out, height * Math.sin(lean) * u * u)
          .addScaledVector(UP, height * u * Math.cos(lean * u));
      const mid = at(0.55);
      const tip = at(1);
      const hue = (random() - 0.5) * 0.04;
      const c0 = GRASS_BASE.clone().offsetHSL(hue, 0, 0);
      const c1 = GRASS_BASE.clone().lerp(GRASS_TIP, 0.55).offsetHSL(hue, 0, 0);
      const c2 = GRASS_TIP.clone().offsetHSL(hue, 0, 0);
      const r0 = root.clone().addScaledVector(side, -width);
      const r1 = root.clone().addScaledVector(side, width);
      const m0 = mid.clone().addScaledVector(side, -width * 0.7);
      const m1 = mid.clone().addScaledVector(side, width * 0.7);
      const wm = 0.3;
      props.tri(r0, r1, m1, c0, c0, c1, [0, 0, wm], phase);
      props.tri(r0, m1, m0, c0, c1, c1, [0, wm, wm], phase);
      props.tri(m0, m1, tip, c1, c1, c2, [wm, wm, 1], phase);
    }
  }

  const sand = new THREE.BufferGeometry();
  sand.setAttribute("position", new THREE.Float32BufferAttribute(sandPosition, 3));
  sand.setAttribute("color", new THREE.Float32BufferAttribute(sandColor, 4));
  sand.computeBoundingSphere();

  const group = new THREE.Group();
  for (const [geometry, material] of [
    [sand, materials.sandMaterial],
    [props.build(), materials.propsMaterial],
  ]) {
    // Same origin, so the transparent sort keeps submission order: sand
    // first, then the props on top of it
    const mesh = new THREE.Mesh(geometry, material);
    mesh.layers.set(LAYER);
    group.add(mesh);
  }
  group.visible = false;
  return group;
};

// Kept across layout changes (a resize rebuilds only the geometry), so the
// programs stay compiled and the fade carries on
const buildMaterials = () => {
  const uniforms = { uTime: { value: 0 } };
  // Both start fully transparent; the fade raises their opacity together
  const sandMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    opacity: 0,
  });
  const propsMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.85,
    side: THREE.DoubleSide,
    // Transparent double-sided materials otherwise draw twice
    forceSinglePass: true,
    transparent: true,
    opacity: 0,
  });
  propsMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aSway;\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float swayT = uTime * 1.3 + aSway.y;
        transformed.xz += aSway.x * 0.03 * vec2(sin(swayT), cos(swayT * 0.7));`,
      );
  };
  propsMaterial.customProgramCacheKey = () => "beach-props-sway";
  return { sandMaterial, propsMaterial, uniforms };
};

// palms: PalmTree's layout; dry(z): the dry line's x at depth z
export default function BeachDecor({ palms, dry }) {
  const { isMobile, prefersReducedMotion } = useMobile();
  const get = useThree((state) => state.get);
  // Rounded like HomeSection's, so it rebuilds with the palms
  const aspect = useThree((state) => Math.round(state.viewport.aspect * 100) / 100);
  const materials = useMemo(buildMaterials, []);
  const group = useMemo(() => buildDecor(palms, dry, isMobile, aspect, materials), [palms, dry, isMobile, aspect, materials]);
  const ready = useRef(false);
  const fade = useRef(0);
  const scroll = useScroll();

  useEffect(() => {
    const { camera } = get();
    camera.layers.enable(LAYER);
    // New materials start transparent: hidden until compiled, then faded in.
    // (A hot update of this file builds new ones while the refs survive.)
    ready.current = false;
    fade.current = 0;
    return () => {
      camera.layers.disable(LAYER);
      materials.sandMaterial.dispose();
      materials.propsMaterial.dispose();
    };
  }, [materials, get]);

  useEffect(() => {
    let live = true;
    const { gl, camera, scene } = get();
    // Shaders compile off the main thread (KHR_parallel_shader_compile)
    // while the group is hidden (at once after a rebuild: the programs
    // exist). Not lib/prewarm: importing it from this chunk makes the
    // bundler split it into a chunk of its own, one more request on the path
    // to the first frame.
    gl.compileAsync(group, camera, scene)
      .catch(() => {})
      .then(() => {
        if (live) ready.current = true;
      });
    return () => {
      live = false;
      for (const mesh of group.children) mesh.geometry.dispose();
    };
  }, [group, get]);

  // Reduced motion: no fade (it appears at once) and the grass holds still;
  // leaving Home follows the scroll, so it plays either way
  useFrame((state, delta) => {
    if (!ready.current) return;
    group.visible = true;
    if (fade.current < 1) {
      fade.current = prefersReducedMotion ? 1 : Math.min(1, fade.current + delta / FADE_SECONDS);
      materials.propsMaterial.opacity = THREE.MathUtils.smoothstep(fade.current, 0, 1);
    }
    const leave = THREE.MathUtils.smoothstep(scroll.offset * (scroll.pages - 1), LEAVE_START, LEAVE_END);
    const sand = materials.propsMaterial.opacity * (1 - THREE.MathUtils.smoothstep(leave, 0, LEAVE_SAND));
    materials.sandMaterial.opacity = sand;
    group.children[0].visible = sand > 0;
    if (!prefersReducedMotion) materials.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return <primitive object={group} />;
}
