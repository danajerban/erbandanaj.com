import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useMobile } from "../contexts/MobileContext";
import { dryX, layoutOf } from "../lib/coast";
import { createRandom } from "../lib/lowPoly";

// Beach props around the laptop on Home, in the sunset palette: a striped
// towel under it, sunglasses and wired earbuds tossed on the towel, an
// open cooler beside it (the lid hinged at the back, standing up, so the
// camera looks in at frosted cola bottles in cold ice), and a coral-and-cream
// beach umbrella beside it, its pole leaning to the right toward the sun,
// the cooler in its shade, which is cast away from the sun. Low-poly and flat, their light baked into the vertex colors (a
// key from the sunset behind and to the right, a faint fill from the camera
// side). Two draw calls: the flat things (towel, baked shadows) that lie on
// the sand, then the solid props. On phones also a sandcastle and a
// surfboard (TOYS), in the same two draw calls. A lazy chunk mounted
// after the first visible frame, compiled while hidden, then faded in, like
// BeachDecor.
//
// Home-local coordinates (y = 0 floor, +z toward the camera). Everything is
// laid out around the laptop (HomeSection's `laptop`: x, z, yaw, scale), in
// its units (its base is 2.72 wide and 1.95 deep): +x to the right of its
// keyboard, +z in front of it. Everything sits on its own layer, which the
// camera renders and the contact-shadow pass does not (their shadows are
// baked into the flat mesh instead); the flat mesh draws after that pass's
// floor shadow, so the laptop's shadow is baked on the towel too.

const SEED = 9;
const LAYER = 7;
const FADE_SECONDS = 1.2;
// Camera: SceneCanvas (position [0, 0.5, 5]), 1.5 above the Home floor
const CAMERA = new THREE.Vector3(0, 1.5, 5);

// By layout (lib/coast layoutOf), in laptop units from the laptop's middle:
// towel [x, z, turn]; sunglasses and earbuds [x, z, turn]; cooler
// [x, z, size]; the umbrella's pole foot [x, z] and canopy [radius, rise,
// height of its middle]. The umbrella keeps its size on screen when the
// laptop's changes (HomeSection LAPTOP). Everywhere the cooler sits in the
// umbrella's shade beside the laptop, the pole's foot behind it and to its
// left, clear of its lid, the canopy leaning over it. The canopy never hides
// the laptop, the title or the avatar: on wide screens and upright ones past
// the breakpoint (an iPad Pro held upright, `tall`: the big avatar to the
// laptop's right) they stand on the laptop's left, the canopy under the
// title; on phones held upright (the laptop at the left edge) behind its
// right side, the cooler short of the shore strip where the crab walks.
const SPOTS = {
  wide: {
    towel: [0, 0.3, 0.1],
    glasses: [1.05, 1.7, 0.35],
    earbuds: [-1.5, 1.3, -0.2],
    cooler: [-2.62, -2.05, 0.72],
    umbrella: { foot: [-1.98, -4.1], canopy: [3.33, 0.67, 4.67] },
  },
  portrait: {
    towel: [0, 0.3, 0.1],
    glasses: [1.05, 1.7, 0.35],
    earbuds: [-1.5, 1.3, -0.2],
    cooler: [3.02, -1.21, 0.665],
    umbrella: { foot: [3.99, -3.75], canopy: [2.89, 0.67, 5] },
  },
  tall: {
    towel: [0, 0.3, 0.1],
    glasses: [1.05, 1.7, 0.35],
    earbuds: [-1.5, 1.3, -0.2],
    cooler: [-1.41, -2.98, 0.65],
    umbrella: { foot: [-0.42, -5.03], canopy: [2.89, 0.74, 5] },
  },
};
const TOWEL = [3.8, 5];
// Height of the towel over the floor (Home units): under the laptop's keyboard
const TOWEL_Y = 0.004;
// The earbuds' cord radius, in laptop units
const CORD = 0.03;
// The cooler, in laptop units: about the laptop's width, its walls' thickness
const COOLER_SIZE = [2.9, 1.7, 1.9, 0.16];
const BEVEL = 0.22;
// The shade falls away from the sun, which its baked light sets behind and
// to the right (SUN below), but steeper than that key so the shade stays
// near the umbrella: this elevation
const SHADE_ELEVATION = THREE.MathUtils.degToRad(75);
// The umbrella's pole leans this far off upright, to the right across the
// view, toward the sun, turned TURN of the way toward the camera so the
// canopy's top still shows: about 75° to the ground on screen
const LEAN = THREE.MathUtils.degToRad(20);
const TURN = THREE.MathUtils.degToRad(40);
// Phones only, where the beach is emptier round the avatar: a little
// sandcastle with a terracotta flag beside him and a surfboard standing in
// the sand. By layout (portrait or landscape), each where it touches the
// sand as a screen fraction [x from the left, y from the top], with its size
// (Home units: the castle's keep, the board's length) and the board's turn
// from facing the camera. All clear of the avatar, the title, the palms, the
// props round the laptop, the grass and ShoreLife's shells, crabs and turtle.
const TOYS = {
  portrait: {
    castle: [[0.375, 0.583], 0.12],
    board: [[0.36, 0.535], 0.55, -0.5],
  },
  landscape: {
    castle: [[0.57, 0.625], 0.2],
    board: [[0.24, 0.585], 0.75, 0.5],
  },
};
// The camera's tilt down toward (0, 1, 0) and half its vertical field
// (SceneCanvas: fov 42)
const PITCH = Math.atan(0.1);
const HALF_FOV_TAN = Math.tan(THREE.MathUtils.degToRad(21));

const hex = (c) => new THREE.Color(c);
const TOWEL_STRIPES = ["#f6e6c8", "#ee6f57", "#f4a950", "#ee6f57", "#f6e6c8", "#6e3a5e"].map(hex);
const SHADOW = hex("#8c4f40");
const COOLER = hex("#3b8e96");
const COOLER_DARK = hex("#2c6d74");
const COOLER_LID = hex("#f4efe6");
const COOLER_LINING = hex("#e3eae8");
const ICE = ["#e3f4fb", "#cdeaf6", "#b8def0", "#eef9fd"].map(hex);
const ICE_GLINT = hex("#fbfeff");
const WATER = hex("#a9d6e8");
const WATER_LABEL = hex("#3f86c6");
const CAP = hex("#eef4f7");
const GLASS = hex("#3b1410");
const FROST = hex("#e2ecf0");
const LABEL = hex("#d2262c");
const LABEL_STRIPE = hex("#f5ede0");
const FRAME = hex("#2b1a22");
const LENS = hex("#35202e");
const LENS_REFLECTION = hex("#f39a72");
const EARBUD = hex("#f5f2ee");
const STEEL = hex("#cfcbc8");
const CORAL = hex("#ef6a55");
const CREAM = hex("#f7e8cc");
const POLE = hex("#efe4d4");
// Damp packed sand for the castle, a terracotta flag on a driftwood stick;
// the board cream with coral and teal stripes
const CASTLE = hex("#e6aa72");
const CASTLE_TOP = hex("#f2c08c");
const FLAG = hex("#c4573a");
const STICK = hex("#8a6448");
const TEAL = hex("#3b8e96");

// Baked light: the sunset key behind and to the right (BeachDecor's
// SUN_DIR), a faint fill from the camera side, the sky from above
const SUN = new THREE.Vector3(0.5, 0.6, -0.8).normalize();
const FILL = new THREE.Vector3(-0.3, 0.4, 1).normalize();
const SUN_FLAT = new THREE.Vector3(SUN.x, 0, SUN.z).normalize();
const TO_SHADE = SUN_FLAT.clone().multiplyScalar(Math.cos(SHADE_ELEVATION)).setY(Math.sin(SHADE_ELEVATION));
const UP = new THREE.Vector3(0, 1, 0);
const lit = (color, n, dim = 1) => {
  const light = dim * (0.62 + 0.2 * n.y + 0.32 * Math.max(0, n.dot(SUN)) + 0.16 * Math.max(0, n.dot(FILL)));
  return new THREE.Color(Math.min(1, color.r * light), Math.min(1, color.g * light), Math.min(1, color.b * light));
};

const matrixOf = (x, y, z, yaw = 0, scale = 1) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(UP, yaw),
    new THREE.Vector3(scale, scale, scale),
  );
const part = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
// A box's outline with bevelled corners, w × d, bevel c: eight points (four
// without a bevel)
const outline = (w, d, c) =>
  [
    [w / 2 - c, d / 2],
    [w / 2, d / 2 - c],
    [w / 2, c - d / 2],
    [w / 2 - c, -d / 2],
    [c - w / 2, -d / 2],
    [-w / 2, c - d / 2],
    [-w / 2, d / 2 - c],
    [c - w / 2, d / 2],
  ]
    .filter((_, k) => c || k % 2 === 0)
    .map(([x, z]) => new THREE.Vector3(x, 0, z));
// n points round a circle of radius r, at height y
const circle = (r, n, y) =>
  Array.from({ length: n }, (_, k) => new THREE.Vector3(r * Math.sin((k / n) * Math.PI * 2), y, r * Math.cos((k / n) * Math.PI * 2)));
// Triangles into a geometry, each wound to face away from `inside` (a point,
// or the outward direction when `inside` is null), or toward it when `flip`
const soup = (triangles, inside, flip) => {
  const position = [];
  const normal = new THREE.Vector3();
  for (let [a, b, c] of triangles) {
    normal.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const middle = a.clone().add(b).add(c).divideScalar(3);
    if ((normal.dot(middle.sub(inside)) < 0) !== flip) [b, c] = [c, b];
    position.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  return geometry;
};
// The convex solid between two outlines (as many points, the low one below
// the high one, around the origin); `open`: no top or bottom; `flip`:
// facing inward (an inner wall). Built here rather than from three's
// geometries: importing more of three from this chunk grows the shared
// three chunk on the path to the first frame.
const prism = (low, high, open = false, flip = false) => {
  const n = low.length;
  const triangles = [];
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    triangles.push([low[k], low[j], high[j]], [low[k], high[j], high[k]]);
    if (!open && k > 0 && k < n - 1) triangles.push([low[0], low[k], low[k + 1]], [high[0], high[k], high[k + 1]]);
  }
  return soup(triangles, new THREE.Vector3(), flip);
};
// A box with bevelled vertical edges (bevel c), w × h × d, centered
const rounded = (w, h, d, c, open, flip) =>
  prism(
    outline(w, d, c).map((p) => p.setY(-h / 2)),
    outline(w, d, c).map((p) => p.setY(h / 2)),
    open,
    flip,
  );
const box = (w, h, d) => rounded(w, h, d, 0);
// A cylinder (a cone when rt is 0), h tall, n sides, centered
const cylinder = (rt, rb, h, n, open) => prism(circle(rb, n, -h / 2), circle(rt, n, h / 2), open);
// The flat ring between two such outlines, facing up: w × d outside, w2 × d2
// inside
const ring = (w, d, w2, d2, c) => {
  const [outer, inner] = [outline(w, d, c), outline(w2, d2, c)];
  const triangles = [];
  for (let k = 0; k < 8; k++) {
    const j = (k + 1) % 8;
    triangles.push([outer[k], outer[j], inner[j]], [outer[k], inner[j], inner[k]]);
  }
  return soup(triangles, new THREE.Vector3(0, -1, 0), false);
};

// RGBA triangle soup for one mesh
const createSink = () => {
  const position = [];
  const color = [];
  return {
    vertex(p, c, alpha = 1) {
      position.push(p.x, p.y, p.z);
      color.push(c.r, c.g, c.b, alpha);
    },
    build() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(color, 4));
      geometry.computeBoundingSphere();
      return geometry;
    },
  };
};

const buildProps = (laptop, isMobile, aspect, materials) => {
  const random = createRandom(SEED);
  const layout = layoutOf(isMobile, aspect);
  const spots = SPOTS[layout !== "portrait" ? "wide" : isMobile ? "portrait" : "tall"];
  const flat = createSink();
  const solid = createSink();
  const [a, b, c, n, centroid] = [0, 0, 0, 0, 0].map(() => new THREE.Vector3());
  // The umbrella's shade (set below): its middle on the ground, its radius,
  // and the height of the canopy's lowest edge (only what is under it is shaded)
  let shade = null;
  const inShade = (p) => shade && p.y < shade.under && p.clone().addScaledVector(TO_SHADE, -p.y / TO_SHADE.y).setY(0).distanceTo(shade.middle) < shade.radius;

  // A three geometry into `sink`, placed by `local` in its object's frame
  // and by `frame` from there: colorOf(normal, centroid) in the object frame
  // gives each triangle its color, lit by its normal in Home space (and
  // darker in the umbrella's shade)
  const add = (sink, geometry, local, frame, colorOf) => {
    const geo = geometry.index ? geometry.toNonIndexed() : geometry;
    geo.applyMatrix4(local);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      centroid.copy(a).add(b).add(c).divideScalar(3);
      n.subVectors(b, a).cross(c.clone().sub(a)).normalize();
      const color = colorOf(n, centroid);
      for (const p of [a, b, c]) p.applyMatrix4(frame);
      n.subVectors(b, a).cross(c.clone().sub(a)).normalize();
      centroid.copy(a).add(b).add(c).divideScalar(3);
      const shaded = lit(color, n, inShade(centroid) ? 0.72 : 1);
      for (const p of [a, b, c]) sink.vertex(p, shaded);
    }
    geometry.dispose();
    geo.dispose();
  };
  // A soft baked shadow on the ground, `y` up: a fan, `alpha` dark in its
  // middle and out to `core` of its rim, fading out at the rim. rim(t): the
  // rim point at angle t, in Home space
  const fan = (middle, rim, alpha, core, y) => {
    const ring = (t, k) => rim(t).lerp(middle, 1 - k).setY(y);
    const m = middle.clone().setY(y);
    for (let s = 0; s < 16; s++) {
      const [t0, t1] = [s, s + 1].map((i) => (i / 16) * Math.PI * 2);
      const [i0, i1, o0, o1] = [ring(t0, core), ring(t1, core), ring(t0, 1), ring(t1, 1)];
      for (const [p, alpha0] of [[m, alpha], [i1, alpha], [i0, alpha], [i0, alpha], [i1, alpha], [o1, 0], [i0, alpha], [o1, 0], [o0, 0]]) {
        flat.vertex(p, SHADOW, alpha0);
      }
    }
  };
  // A shadow under a prop: an ellipse rx × rz about (x, z) in `frame`,
  // shifted forward and to the left, away from the sunset
  const shadow = (frame, x, z, rx, rz, alpha, y = TOWEL_Y + 0.002) => {
    const at = (px, pz) => new THREE.Vector3(px, 0, pz).applyMatrix4(frame);
    const [cx, cz] = [x - 0.15 * rx, z + 0.15 * rz];
    fan(at(cx, cz), (t) => at(cx + Math.cos(t) * rx, cz + Math.sin(t) * rz), alpha, 0.2, y);
  };

  // The laptop's frame, in its units
  const home = matrixOf(laptop.x, 0, laptop.z, laptop.yaw, laptop.scale);
  const unit = laptop.scale;
  const inHome = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(home);

  // Umbrella: the pole from its foot, leaning LEAN to the right (a "/" on
  // screen), the canopy square to it (seen a little from the front); twelve
  // panels, coral and cream
  const { foot: footAt, canopy } = spots.umbrella;
  const [radius, rise, height] = canopy;
  const foot = inHome(...footAt);
  const toCamera = new THREE.Vector3(CAMERA.x - foot.x, 0, CAMERA.z - foot.z).normalize();
  const across = new THREE.Vector3(toCamera.z, 0, -toCamera.x);
  const axis = across.multiplyScalar(Math.cos(TURN)).addScaledVector(toCamera, Math.sin(TURN)).multiplyScalar(Math.sin(LEAN)).setY(Math.cos(LEAN));
  const pole = height / Math.cos(LEAN);
  const top = foot.clone().addScaledVector(axis, pole * unit);
  const umbrella = new THREE.Matrix4().compose(foot, new THREE.Quaternion().setFromUnitVectors(UP, axis), new THREE.Vector3(unit, unit, unit));
  // Its shade, the canopy's rim cast down along the light
  const cast = (p) => p.clone().addScaledVector(TO_SHADE, -p.y / TO_SHADE.y);
  const rimAt = (t) => new THREE.Vector3(Math.cos(t) * radius, pole - rise / 2, Math.sin(t) * radius).applyMatrix4(umbrella);
  shade = { middle: cast(top).setY(0), radius: radius * unit * 0.85, under: top.y - (radius * Math.sin(LEAN) + rise) * unit };

  // Towel: stripes across its length, a little uneven in tone, lying flat;
  // the umbrella's shade and the laptop's shadow on it
  const [tx, tz, turn] = spots.towel;
  const towel = home.clone().multiply(part(tx, 0, tz, 0, turn));
  const stripes = new THREE.PlaneGeometry(TOWEL[0], TOWEL[1], 2, 12);
  add(flat, stripes, part(0, TOWEL_Y / unit, 0, -Math.PI / 2), towel, (_, p) => {
    const i = Math.floor(((p.z / TOWEL[1] + 0.5) * 12) % TOWEL_STRIPES.length);
    return TOWEL_STRIPES[i].clone().offsetHSL(0, 0, (random() - 0.5) * 0.04);
  });
  fan(shade.middle, (t) => cast(rimAt(t)), 0.4, 0.75, TOWEL_Y + 0.001);
  shadow(home, -0.2, 0.2, 1.7, 1.2, 0.4);

  add(solid, cylinder(0.1, 0.11, pole, 6), part(0, pole / 2, 0), umbrella, () => POLE);
  add(solid, cylinder(0, radius, rise, 12), part(0, pole, 0), umbrella, (_, p) =>
    Math.floor(((Math.atan2(p.z, p.x) + Math.PI) / (Math.PI * 2)) * 12) % 2 ? CORAL : CREAM,
  );
  add(solid, cylinder(0, 0.11, 0.33, 6), part(0, pole + rise / 2 + 0.11, 0), umbrella, () => CORAL);
  shadow(umbrella, 0, 0, 0.28, 0.28, 0.3, 0.003);

  // Sunglasses on the towel, folded: two tinted lenses facing up, catching
  // the sunset, in thin rims, the bridge between them, the arms folded
  // under them, so they rest tipped a little toward the camera
  const [gx, gz, gTurn] = spots.glasses;
  const glasses = home.clone().multiply(part(gx, TOWEL_Y / unit, gz, 0, gTurn));
  const tip = part(0, 0.07, 0, 0.16);
  const lensed = glasses.clone().multiply(tip);
  for (const side of [-1, 1]) {
    add(solid, cylinder(0.19, 0.17, 0.025, 8), part(side * 0.25, 0.02, 0, 0, 0, 0, 1.25, 1, 1), lensed, (normal, p) =>
      normal.y > 0.5 ? LENS.clone().lerp(LENS_REFLECTION, p.z < 0 ? 0.5 : 0.18) : FRAME,
    );
    add(solid, cylinder(0.2, 0.2, 0.04, 10, true), part(side * 0.25, 0.025, 0, 0, 0, 0, 1.25, 1, 1), lensed, () => FRAME);
    add(solid, box(0.42, 0.03, 0.035), part(side * 0.2, 0.02, -0.12 + side * 0.04, 0, side * 0.08), glasses, () => FRAME);
  }
  add(solid, box(0.1, 0.025, 0.03), part(0, 0.05, -0.08), lensed, () => FRAME);
  shadow(glasses, 0, 0, 0.6, 0.3, 0.3);

  // Wired earbuds tossed on the towel: two white buds with short stems,
  // their cords meeting at a small split (a remote on one), one cord on in
  // loose loops to the plug. The cord is a thin tube (thick enough to read
  // on a phone), lying on the towel.
  const [ex, ez, eTurn] = spots.earbuds;
  const earbuds = home.clone().multiply(part(ex, TOWEL_Y / unit, ez, 0, eTurn));
  const cord = (points) => {
    // Rounded off (two passes of corner cutting), then a chain of thin
    // three-sided tubes
    for (let pass = 0; pass < 2; pass++) {
      points = points.flatMap((p, k) => {
        const q = points[k + 1];
        if (!q) return [p];
        const cut = (t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
        return k === 0 ? [p, cut(0.75)] : [cut(0.25), cut(0.75)];
      });
    }
    for (let k = 0; k < points.length - 1; k++) {
      const [a, b] = [points[k], points[k + 1]].map(([x, z]) => new THREE.Vector3(x, CORD, z));
      const along = b.clone().sub(a);
      const place = new THREE.Matrix4().compose(
        a.clone().add(b).multiplyScalar(0.5),
        new THREE.Quaternion().setFromUnitVectors(UP, along.clone().normalize()),
        new THREE.Vector3(1, 1, 1),
      );
      add(solid, cylinder(CORD, CORD, along.length() + CORD, 3, true), place, earbuds, () => EARBUD);
    }
  };
  for (const [x, z, turn] of [
    [0, 0, 0.4],
    [0.42, -0.12, 2.3],
  ]) {
    add(solid, new THREE.IcosahedronGeometry(0.1, 0), part(x, 0.09, z, 0, turn, 0, 1, 0.9, 1), earbuds, () => EARBUD);
    add(solid, cylinder(0.035, 0.035, 0.28, 5), part(x + 0.12 * Math.cos(turn), 0.05, z - 0.12 * Math.sin(turn), 0, turn, Math.PI / 2), earbuds, () => EARBUD);
  }
  cord([[0.24, 0], [0.35, 0.3], [0.45, 0.6]]);
  cord([[0.55, -0.24], [0.55, 0.2], [0.45, 0.6]]);
  cord([[0.45, 0.6], [0.8, 1], [1.25, 0.75], [1.05, 0.35], [0.75, 0.6], [1, 1.15], [1.5, 1.2], [1.75, 0.95]]);
  add(solid, box(0.07, 0.06, 0.2), part(0.55, 0.035, 0.05), earbuds, () => EARBUD);
  add(solid, cylinder(0.05, 0.05, 0.22, 6), part(1.83, 0.05, 0.9, 0, 0, Math.PI / 2, 1), earbuds, () => EARBUD);

  // Cooler: an open bevelled box, turned to face the camera: teal walls
  // (thick, lined inside) on a darker base, a white lid hinged at the back
  // edge, standing up and leaning back, a handle on each end
  const [cx, cz, size] = spots.cooler;
  const coolerAt = inHome(cx, cz);
  const cooler = matrixOf(coolerAt.x, 0, coolerAt.z, Math.atan2(CAMERA.x - coolerAt.x, CAMERA.z - coolerAt.z) - 0.25, unit * size);
  const [W, H, D, T] = COOLER_SIZE;
  add(solid, rounded(W, H - 0.2, D, BEVEL, true), part(0, (H + 0.2) / 2, 0), cooler, () => COOLER);
  add(solid, rounded(W + 0.06, 0.2, D + 0.06, BEVEL), part(0, 0.1, 0), cooler, () => COOLER_DARK);
  // The inner wall (turned inside out) and the rim across the wall's top
  add(solid, rounded(W - 2 * T, H - 0.2, D - 2 * T, BEVEL * 0.6, true, true), part(0, (H + 0.2) / 2, 0), cooler, () => COOLER_LINING);
  add(solid, ring(W, D, W - 2 * T, D - 2 * T, BEVEL), part(0, H, 0), cooler, () => COOLER_LINING);
  for (const side of [-1, 1]) {
    add(solid, box(0.14, 0.12, 0.9), part(side * (W / 2 + 0.05), H - 0.35, 0), cooler, () => COOLER_DARK);
    add(solid, box(0.3, 0.1, 0.12), part(side * 0.8, H - 0.05, -D / 2 - 0.02), cooler, () => STEEL);
  }
  const lid = rounded(W + 0.08, 0.24, D + 0.08, BEVEL).translate(0, 0.12, D / 2 + 0.04);
  add(solid, lid, part(0, H, -D / 2 - 0.04, -1.95), cooler, (normal) => (normal.y < -0.5 ? COOLER_LINING : COOLER_LID));
  // Ice: a bed just under the rim, cubes heaped up to it and above it,
  // highest in the middle; pale blue, their tops catching a cold white
  add(solid, box(W - 2 * T, 0.1, D - 2 * T), part(0, H - 0.2, 0), cooler, () => ICE[1]);
  for (let i = 0; i < 40; i++) {
    const [u, v] = [random() * 2 - 1, random() * 2 - 1];
    const size = 0.22 + random() * 0.12;
    const tone = ICE[Math.floor(random() * ICE.length)];
    const [x, z] = [u * (W / 2 - T - 0.15), v * (D / 2 - T - 0.15)];
    const y = H - 0.1 + 0.2 * (1 - u * u) * (1 - v * v) + random() * 0.06;
    add(solid, box(size, size * 0.85, size), part(x, y, z, random() * 3, random() * 3, random() * 3), cooler, (normal) =>
      normal.y > 0.6 ? ICE_GLINT : tone,
    );
  }
  // Bottles standing in the ice, leaning, their labels and necks above it:
  // three colas (dark glass, frosted in patches, a red label with a cream
  // stripe) and a water bottle (clear blue, a blue label, a white cap)
  const frosted = () => GLASS.clone().lerp(FROST, 0.05 + random() * 0.25);
  const water = () => WATER.clone().lerp(FROST, random() * 0.3);
  const cola = [
    [0.36, 0.38, 0, 0.55, frosted],
    [0.39, 0.39, 0.55, 0.78, () => LABEL],
    [0.39, 0.39, 0.78, 0.9, () => LABEL_STRIPE],
    [0.39, 0.39, 0.9, 1.15, () => LABEL],
    [0.38, 0.36, 1.15, 1.45, frosted],
    [0.36, 0.15, 1.45, 2.05, frosted],
    [0.15, 0.15, 2.05, 2.5, frosted],
    [0.17, 0.17, 2.5, 2.65, () => LABEL],
  ];
  const bottled = [
    [0.36, 0.36, 0, 0.55, water],
    [0.37, 0.37, 0.55, 1, () => WATER_LABEL],
    [0.36, 0.36, 1, 1.55, water],
    [0.36, 0.14, 1.55, 1.9, water],
    [0.14, 0.14, 1.9, 2.05, water],
    [0.18, 0.18, 2.05, 2.25, () => CAP],
  ];
  for (const [x, z, lean, dir, profile] of [
    [-0.85, 0.1, 0.3, 1.2, cola],
    [-0.2, -0.25, 0.1, 2.6, cola],
    [0.4, 0.1, 0.26, -0.9, cola],
    [0.95, -0.2, 0.2, -2, bottled],
  ]) {
    const bottle = cooler.clone().multiply(part(x, H - 0.2, z, lean * Math.cos(dir), 0, lean * Math.sin(dir), 0.5));
    for (const [rb, rt, y0, y1, color] of profile) {
      add(solid, cylinder(rt, rb, y1 - y0, 7, true), part(0, (y0 + y1) / 2, 0), bottle, color);
    }
  }
  shadow(cooler, 0, 0, W * 0.72, D * 0.7, 0.45, 0.003);

  // Phones: the sandcastle and the surfboard (TOYS). Last,
  // so everything above keeps its seeded looks.
  const toys = isMobile && TOYS[layout];
  if (toys) {
    // The point on the sand at a screen fraction
    const onSand = ([fx, fy]) => {
      const up = (1 - 2 * fy) * HALF_FOV_TAN;
      const ray = new THREE.Vector3((2 * fx - 1) * HALF_FOV_TAN * aspect, up * Math.cos(PITCH) - Math.sin(PITCH), -Math.cos(PITCH) - up * Math.sin(PITCH));
      return CAMERA.clone().addScaledVector(ray, -CAMERA.y / ray.y).setY(0);
    };
    const facing = (p) => Math.atan2(CAMERA.x - p.x, CAMERA.z - p.z);

    // Sandcastle: a keep on a mound, a tower each side joined by a front
    // wall with a gate, battlements round the keep's top and a terracotta
    // pennant on a stick; turned a little off square to the camera
    const [castleAt, keep] = toys.castle;
    const c = onSand(castleAt);
    // Its mound clear of the wet sand
    c.setX(Math.min(c.x, dryX(c.z, isMobile, aspect) - 1.45 * keep));
    const castle = matrixOf(c.x, 0, c.z, facing(c) - 0.35, keep);
    const sand = (normal) => (normal.y > 0.6 ? CASTLE_TOP : CASTLE).clone().offsetHSL(0, 0, (random() - 0.5) * 0.04);
    add(solid, cylinder(1.05, 1.3, 0.25, 8), part(0, 0.125, 0), castle, sand);
    add(solid, cylinder(0.5, 0.56, 1, 6), part(0, 0.75, -0.15), castle, sand);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      add(solid, box(0.18, 0.18, 0.18), part(0.42 * Math.sin(a), 1.34, -0.15 + 0.42 * Math.cos(a), 0, a), castle, sand);
    }
    for (const x of [-0.72, 0.72]) {
      add(solid, cylinder(0.27, 0.32, 0.7, 6), part(x, 0.6, 0.3), castle, sand);
      add(solid, cylinder(0, 0.3, 0.32, 6), part(x, 1.11, 0.3), castle, sand);
    }
    add(solid, box(1.3, 0.42, 0.2), part(0, 0.46, 0.45), castle, sand);
    add(solid, box(0.3, 0.3, 0.04), part(0, 0.4, 0.56), castle, () => SHADOW);
    add(solid, cylinder(0.025, 0.03, 0.95, 4), part(0, 1.72, -0.15), castle, () => STICK);
    const pennant = [
      [0, 0],
      [0.55, 0.13],
      [0, 0.28],
    ];
    add(
      solid,
      prism(...[-0.02, 0.02].map((y) => pennant.map(([x, z]) => new THREE.Vector3(x, y, z)))),
      part(0.02, 2.17, -0.15, -Math.PI / 2),
      castle,
      () => FLAG,
    );
    shadow(castle, 0, 0, 1.4, 1.1, 0.35, 0.003);

    // Surfboard: standing on its tail, stuck in the sand, leaning back a
    // little; flat, rounded at the tail, pointed at the nose, cream with a
    // coral and a teal stripe across it. Its slices [from, to, radius at
    // each, color], in board lengths up from the tail.
    const [boardAt, length, turn] = toys.board;
    const b = onSand(boardAt);
    const upright = matrixOf(b.x, 0, b.z, facing(b) + turn, length);
    const board = upright.clone().multiply(part(0, -0.06, 0, -0.1));
    for (const [y0, y1, r0, r1, color] of [
      [0, 0.12, 0.1, 0.13, CREAM],
      [0.12, 0.4, 0.13, 0.15, CREAM],
      [0.4, 0.47, 0.15, 0.149, CORAL],
      [0.47, 0.51, 0.149, 0.147, CREAM],
      [0.51, 0.56, 0.147, 0.143, TEAL],
      [0.56, 0.76, 0.143, 0.12, CREAM],
      [0.76, 0.9, 0.12, 0.075, CREAM],
      [0.9, 1, 0.075, 0, CREAM],
    ]) {
      add(solid, cylinder(r1, r0, y1 - y0, 8, true), part(0, (y0 + y1) / 2, 0, 0, 0, 0, 1, 1, 0.16), board, () => color);
    }
    shadow(upright, 0, 0, 0.2, 0.07, 0.35, 0.003);
  }

  const group = new THREE.Group();
  for (const [sink, material, order] of [
    [flat, materials.flatMaterial, 0.7],
    [solid, materials.solidMaterial, 0.8],
  ]) {
    const mesh = new THREE.Mesh(sink.build(), material);
    mesh.layers.set(LAYER);
    // After the floor's contact shadow, BeachDecor's sand and ShoreLife
    // (renderOrder 0.5): the towel covers the sand, the props stand on it
    mesh.renderOrder = order;
    group.add(mesh);
  }
  group.visible = false;
  return group;
};

// Kept across layout changes (a resize rebuilds only the geometry), so the
// programs stay compiled and the fade carries on. Both start fully
// transparent; the fade raises their opacity together.
const buildMaterials = () => ({
  // Either side up, drawn once
  flatMaterial: new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    opacity: 0,
  }),
  solidMaterial: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0 }),
});

// laptop: HomeSection's { x, z, yaw, scale }
export default function BeachProps({ laptop }) {
  const { isMobile, prefersReducedMotion } = useMobile();
  const get = useThree((state) => state.get);
  // Rounded like HomeSection's, so it rebuilds with the layout
  const aspect = useThree((state) => Math.round(state.viewport.aspect * 100) / 100);
  const materials = useMemo(buildMaterials, []);
  const group = useMemo(() => buildProps(laptop, isMobile, aspect, materials), [laptop, isMobile, aspect, materials]);
  const ready = useRef(false);
  const fade = useRef(0);

  useEffect(() => {
    const { camera } = get();
    camera.layers.enable(LAYER);
    // New materials start transparent: hidden until compiled, then faded in
    ready.current = false;
    fade.current = 0;
    return () => {
      camera.layers.disable(LAYER);
      materials.flatMaterial.dispose();
      materials.solidMaterial.dispose();
    };
  }, [materials, get]);

  useEffect(() => {
    let live = true;
    const { gl, camera, scene } = get();
    // Compiled off the main thread while hidden (see BeachDecor for why not
    // lib/prewarm)
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

  // Reduced motion: no fade, it appears at once
  useFrame((_, delta) => {
    if (!ready.current) return;
    group.visible = true;
    if (fade.current >= 1) return;
    fade.current = prefersReducedMotion ? 1 : Math.min(1, fade.current + delta / FADE_SECONDS);
    const opacity = THREE.MathUtils.smoothstep(fade.current, 0, 1);
    materials.flatMaterial.opacity = opacity;
    materials.solidMaterial.opacity = opacity;
  });

  return <primitive object={group} />;
}
