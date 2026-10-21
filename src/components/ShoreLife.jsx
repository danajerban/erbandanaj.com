import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useMobile } from "../contexts/MobileContext";
import { coastX, dryX, layoutOf } from "../lib/coast";
import { createRandom } from "../lib/lowPoly";

// Two seashells, a starfish, two crabs and a sea turtle on the Home beach, in
// the foreground along the near shore (lib/coast), in the palms' low-poly,
// flat-shaded, vertex-colored style. Two draw calls: the shells and the
// starfish (one merged geometry, rebuilt from a fixed seed when the layout
// changes) and the creatures (one instanced mesh whose geometry holds the
// crab and the turtle: each instance shows one of them and folds the other
// away; each is moved by a cheap
// transform per frame, and its legs, claws, flippers and head move in the
// vertex shader from per-instance attributes). A lazy chunk mounted after the
// first visible frame (HomeSection), like BeachDecor: it compiles its shaders
// off the main thread while hidden, then fades in.
//
// Home-local floor coordinates (y = 0 floor, +z toward the camera). A shell
// lies in the wet band the waves wash over (between coastX and dryX), another
// and the starfish on the dry sand near the water; the crabs and the turtle
// rest on the dry sand near the water, and no pose of theirs comes within
// CLEAR of the dry line. Shadows are baked (a soft dark fan under the
// dry-sand shell, the starfish and each creature; the waves never reach there, so the fans never block the swash),
// and everything sits on its own layer, which the contact-shadow pass does
// not render: at its resolution they would print nothing but cost a draw.
//
// Sizes are fractions of the screen's height at their depth, so every prop
// keeps its size on screen wherever the shore puts it. Mobile shows one shell,
// the starfish, one crab and the turtle, and a crab by the sandcastle
// (CASTLE_CRAB).

const SEED = 7;
const LAYER = 3;
const FADE_SECONDS = 1.2;
// Camera: SceneCanvas (position [0, 0.5, 5], fov 42): the screen's height in
// Home units at depth z
const CAMERA_Z = 5;
const screenHeightAt = (z) => 2 * Math.tan(THREE.MathUtils.degToRad(21)) * (CAMERA_Z - z);
// The camera in Home-local coordinates (the Home group rests 1 below the
// world origin), for turning the creatures toward the viewer
const CAMERA_HOME = new THREE.Vector3(0, 1.5, CAMERA_Z);
// Its tilt down toward (0, 1, 0) and half its vertical field
const PITCH = Math.atan(0.1);
const HALF_FOV_TAN = Math.tan(THREE.MathUtils.degToRad(21));
// The point on the sand at a screen fraction
const onSand = ([fx, fy], aspect) => {
  const up = (1 - 2 * fy) * HALF_FOV_TAN;
  const ray = V((2 * fx - 1) * HALF_FOV_TAN * aspect, up * Math.cos(PITCH) - Math.sin(PITCH), -Math.cos(PITCH) - up * Math.sin(PITCH));
  return CAMERA_HOME.clone().addScaledVector(ray, -CAMERA_HOME.y / ray.y).setY(0);
};
// How far short of the dry line the creatures (in every pose, shadows
// included) and the dry-sand shell stay: a hundredth of the screen's width
// or height at their depth, whichever is longer
const CLEAR = 0.01;
const clearAt = (z, aspect) => CLEAR * screenHeightAt(z) * Math.max(aspect, 1);

// Where the shells go, by depth z. wet: in the band the waves wash over, as
// a fraction of it from the dry line (0) to the water line (1); dry: on the
// dry sand, this much (screen heights) further inland than CLEAR allows
// (moved down to the wet band if a palm stands there). kind: 0 scallop, 1
// spiral, 2 starfish (last, so the shells keep their seeded looks), by the
// turtle
const SHELLS = {
  desktop: [
    { z: -0.45, wet: 0.35, kind: 0 },
    { z: 1.95, dry: 0, kind: 1 },
    { z: 1.25, dry: 0.08, kind: 2 },
  ],
  // MOBILE_PERF: one shell instead of two — revert by removing the ternary in buildShells
  mobile: [
    { z: 1.1, wet: 0.3, kind: 0 },
    { z: 0.95, dry: 0.02, kind: 2 },
  ],
};
// Shell width, in screen heights at its depth; the starfish STAR_SIZE times it
const SHELL_SIZE = { desktop: 0.028, mobile: 0.025 };
const STAR_SIZE = 1.2;
// The creatures: preferred depth, the depths it may move to if a palm or
// another creature is there, and when its first move comes (s), so they
// never move in step. By composition: wide screens, upright ones past the
// breakpoint (tall: the avatar big down to the near sand, so the crabs keep
// below its feet) and phones either way round
const CRAB = 0;
const TURTLE = 1;
// Each creature's size, in screen heights: the crab across its legs, the
// turtle from nose to hind flippers, a little bigger than the crabs
const CREATURE_SIZE = { [CRAB]: 0.075, [TURTLE]: 0.094 };
const CREATURES = {
  desktop: [
    { kind: CRAB, z: 0.35, range: [-1.6, 1.6], first: 3 },
    { kind: CRAB, z: 1.75, range: [1.6, 1.9], first: 6.5 },
    { kind: TURTLE, z: 1.4, range: [0.4, 1.8], first: 5 },
  ],
  tall: [
    { kind: CRAB, z: 0.45, range: [0.4, 0.7], first: 3 },
    { kind: CRAB, z: 1.75, range: [1.6, 1.9], first: 6.5 },
    { kind: TURTLE, z: 1.38, range: [1.3, 1.45], first: 5 },
  ],
  // MOBILE_PERF: one crab instead of two — revert by removing the ternary in creatureList
  mobile: [
    { kind: CRAB, z: 1.8, range: [1.65, 1.95], first: 3 },
    { kind: TURTLE, z: 1.3, range: [1.15, 1.45], first: 5 },
  ],
};
const creatureList = (isMobile, aspect) => CREATURES[isMobile ? "mobile" : layoutOf(isMobile, aspect) === "portrait" ? "tall" : "desktop"];
// Phones, either way round: one more crab, standing in the sand beside
// BeachProps' sandcastle (TOYS castle), facing the viewer a little off
// square: where it stands as a screen fraction [x from the left, y from the
// top] and its size across its legs (Home units, about the castle's keep).
// It holds still, so it costs no work per frame, and it is one more
// instance of the creatures' mesh, so no draw call either.
const CASTLE_CRAB = {
  portrait: [[0.435, 0.585], 0.2],
  landscape: [[0.618, 0.636], 0.3],
};
const MAX_CREATURES = 3;
// How far (in its own body widths) a scuttle carries the crab
const SCUTTLE = 0.8;
// The turtle's crawl stroke: how far the front flippers reach forward and
// row back and the hind flippers push (rad), how far the head lifts (rad),
// how far the body heaves forward and up (shell lengths; the nose rises
// about twice as far)
const FRONT_SWEEP = [-0.7, 0.35];
const HIND_PUSH = 0.3;
const HEAD_LIFT = 0.4;
const HEAVE = 0.08;
const HEAVE_LIFT = 0.04;
// Heading: from straight down the beach to the sea, turned this far toward
// the viewer (rad), so it shows its head
const TURTLE_TURN = 0.5;
// Clear of the avatar: a creature's resting spot stays right of this screen
// fraction
const MIN_SCREEN = 0.62;
// Keep-out around each palm's foot (its fallen coconuts, its grass), in
// Home units at palm scale 1
const PALM_CLEAR = 0.6;

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const hex = (h) => new THREE.Color(h);

// Warm sunset tints: [hinge / umbo / apex, body, rim / lip, accent]
const SHELL_PALETTES = [
  ["#b8452f", "#e0735a", "#f0a07e", "#cc5a40"], // coral
  ["#c25c30", "#e88a52", "#f5b27e", "#d06c3c"], // apricot
  ["#a84a5c", "#d87a86", "#eea7a4", "#bd6272"], // rose
  ["#98492f", "#d49468", "#e9bb8c", "#a8452e"], // sand with burnt-coral stripes
];
const SHELL_INSIDE = hex("#f5a391");
// The starfish: [middle, arms, tips]
const STAR_PALETTE = ["#c4452c", "#e0653b", "#f39a5e"];
const SHADOW = hex("#a0624c");
const EYE = hex("#221517");

const CRAB_TOP = hex("#e0563c");
const CRAB_RIM = hex("#c9412f");
const CRAB_BELLY = hex("#f39a68");
const CRAB_UNDER = hex("#f6b684");
const CRAB_LEG = hex("#d24c36");
const CRAB_SHIN = hex("#ea7a50");
const CRAB_CLAW = hex("#cf3f2c");
const CRAB_TIP = hex("#5a2620");

// The turtle: a muted olive shell, the plates down its spine a warmer brown,
// a lighter rim of marginal plates over a dark underside; sand-olive skin
// with darker scales on the crown; olive flippers, darker behind
const TURTLE_SPINE = hex("#7f6f45");
const TURTLE_SHELL = hex("#5d6848");
const TURTLE_RIM = hex("#b2a46d");
const TURTLE_UNDER = hex("#4d4731");
const TURTLE_SKIN = hex("#a99d63");
const TURTLE_SCALE = hex("#7c7247");
const TURTLE_JAW = hex("#cfc18d");
const TURTLE_FLIPPER = hex("#8f8553");

// Non-indexed RGBA triangle sink (alpha for the baked shadows); with `rig`,
// per-vertex aRig (kind, weight, phase) and aPivot for the creatures' shader.
// Flat shading takes its normals from screen-space derivatives, so winding
// and shared normals do not matter.
const RIG_BODY = [0, 0, 0];
const ORIGIN = V(0, 0, 0);
class Sink {
  constructor(rig) {
    this.position = [];
    this.color = [];
    this.rig = rig ? [] : null;
    this.pivot = rig ? [] : null;
    this.count = 0;
  }

  vertex(p, c, alpha = 1, rig = RIG_BODY, pivot = ORIGIN) {
    this.position.push(p.x, p.y, p.z);
    this.color.push(c.r, c.g, c.b, alpha);
    if (this.rig) {
      this.rig.push(...rig);
      this.pivot.push(pivot.x, pivot.y, pivot.z);
    }
  }

  tri(a, b, c, color, rig, pivot) {
    for (const p of [a, b, c]) this.vertex(p, color, 1, rig, pivot);
    this.count++;
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.position, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.color, 4));
    if (this.rig) {
      geometry.setAttribute("aRig", new THREE.Float32BufferAttribute(this.rig, 3));
      geometry.setAttribute("aPivot", new THREE.Float32BufferAttribute(this.pivot, 3));
    }
    geometry.computeBoundingSphere();
    return geometry;
  }
}

// A soft shadow fan on the ground: dark in the middle, clear at the rim
const shadowFan = (sink, center, rx, rz, strength, rig) => {
  const mid = center.clone().setY(center.y + 0.003);
  const rim = (s) => V(center.x + Math.cos((s / 10) * Math.PI * 2) * rx, mid.y, center.z + Math.sin((s / 10) * Math.PI * 2) * rz);
  for (let s = 0; s < 10; s++) {
    sink.vertex(mid, SHADOW, strength, rig);
    sink.vertex(rim(s), SHADOW, 0, rig);
    sink.vertex(rim(s + 1), SHADOW, 0, rig);
    sink.count++;
  }
};

// Shells: each built as a list of faces about its own origin, about one unit
// wide, then laid on the sand. A face: [a, b, c, color].
const shade = (random, color, amount) => color.clone().offsetHSL(0, 0, (random() - 0.5) * amount);

// Scallop: a fluted fan from the hinge, ridges and grooves alternating, the
// rim scalloped where the ridges end, two small ears at the hinge
const scallop = (random, palette, ribs) => {
  const [c0, c1, c2] = palette.map(hex);
  const n = ribs * 2;
  const hinge = V(0, 0.04, -0.45);
  const at = (i, r) => {
    const a = (i / n - 0.5) * 2.5;
    const ridge = i % 2 === 0;
    const rr = r * (ridge ? 1.04 : 0.96);
    const y = 0.65 * r * (1 - r) + 0.05 * (1 - r) + (ridge ? 0.16 * r * (1 - r) : 0);
    return V(Math.sin(a) * rr * 0.52, y, hinge.z + Math.cos(a) * rr * 0.92);
  };
  const faces = [];
  const ring1 = [];
  const ring2 = [];
  for (let i = 0; i <= n; i++) {
    ring1.push(at(i, 0.5));
    ring2.push(at(i, 1));
  }
  for (let i = 0; i < n; i++) {
    const tone = i % 2 === 0 ? 0.06 : -0.05;
    const inner = c0.clone().lerp(c1, 0.6).offsetHSL(0, 0, tone);
    const outer = c1.clone().lerp(c2, 0.55 + random() * 0.2).offsetHSL(0, 0, tone);
    faces.push([hinge, ring1[i], ring1[i + 1], shade(random, inner, 0.04)]);
    faces.push([ring1[i], ring2[i], ring2[i + 1], shade(random, outer, 0.04)]);
    faces.push([ring1[i], ring2[i + 1], ring1[i + 1], shade(random, outer, 0.04)]);
  }
  for (const s of [-1, 1]) faces.push([hinge, V(0.2 * s, 0.01, -0.5), V(0.07 * s, 0.07, -0.34), shade(random, c0, 0.06)]);
  return faces;
};

// Spiral: a turret shell lying on its side, whorls narrowing to the apex
// (+x), each ring turned a little so the facets and stripes wind around it,
// a pink aperture at the wide end
const spiral = (random, palette, sides, whorls) => {
  const [c0, c1, c2, c3] = palette.map(hex);
  const rings = [];
  for (let k = 0; k <= whorls; k++) {
    const t = k / whorls;
    // Widest at the body whorl just behind the aperture
    const r = 0.32 * Math.pow(1 - t, 1.05) * (k === 0 ? 0.92 : 1) + 0.02;
    const x = -0.45 + t * 0.85;
    const twist = k * 0.62;
    rings.push(
      Array.from({ length: sides + 1 }, (_, s) => {
        const a = ((s % sides) / sides) * Math.PI * 2 + twist;
        // A bulge per whorl: odd rings a touch wider
        const b = r * (k % 2 ? 1.08 : 1);
        return V(x, Math.cos(a) * b, Math.sin(a) * b);
      }),
    );
  }
  const faces = [];
  for (let k = 0; k < whorls; k++) {
    for (let s = 0; s < sides; s++) {
      const stripe = (s + k) % 3 === 0;
      const base = stripe ? c3 : c1.clone().lerp(c2, k / whorls);
      const color = shade(random, base, 0.05);
      faces.push([rings[k][s], rings[k + 1][s], rings[k + 1][s + 1], color]);
      faces.push([rings[k][s], rings[k + 1][s + 1], rings[k][s + 1], color]);
    }
  }
  const apex = V(0.5, 0, 0);
  const top = rings[whorls];
  for (let s = 0; s < sides; s++) faces.push([top[s], apex, top[s + 1], shade(random, c0, 0.05)]);
  const mouth = V(-0.36, 0, 0);
  for (let s = 0; s < sides; s++) faces.push([rings[0][s], mouth, rings[0][s + 1], shade(random, SHELL_INSIDE, 0.06)]);
  return faces;
};

// Starfish: five plump arms, each a ridge from the raised middle to a tip
// that curls a little, its edges low on the sand, the tips paler
const starfish = (random, palette) => {
  const [c0, c1, c2] = palette.map(hex);
  const top = V(0, 0.14, 0);
  const at = (a, r, y) => V(Math.sin(a) * r, y, Math.cos(a) * r);
  const faces = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const curl = (random() - 0.5) * 0.25;
    const len = 0.46 + random() * 0.06;
    const left = at(a - Math.PI / 5, 0.16, 0.03);
    const right = at(a + Math.PI / 5, 0.16, 0.03);
    const ridge = at(a + curl * 0.3, len * 0.5, 0.09);
    const sideL = at(a - 0.26 + curl * 0.5, len * 0.55, 0.015);
    const sideR = at(a + 0.26 + curl * 0.5, len * 0.55, 0.015);
    const tip = at(a + curl, len, 0.015);
    faces.push([top, left, ridge, shade(random, c0, 0.05)], [top, ridge, right, shade(random, c0, 0.05)]);
    faces.push([left, sideL, ridge, shade(random, c1, 0.05)], [ridge, sideR, right, shade(random, c1, 0.05)]);
    faces.push([sideL, tip, ridge, shade(random, c2, 0.05)], [ridge, tip, sideR, shade(random, c2, 0.05)]);
  }
  return faces;
};

// Turn a shell's faces to lie on the sand, `width` wide, turned by yaw and
// tipped a little toward the camera (as if settled on a ripple: seen this
// low, a shell lying flat is a sliver), resting on its lowest point; `reach`:
// how far it, or its shadow, comes seaward (+x) of its middle
const SHELL_SHADOW = { dx: -0.12, dz: 0.1, rx: 0.75, rz: 0.5 };
const orientShell = (random, faces, width, yaw) => {
  const box = new THREE.Box3();
  for (const [a, b, c] of faces) box.expandByPoint(a).expandByPoint(b).expandByPoint(c);
  const scale = width / (box.max.x - box.min.x);
  const matrix = new THREE.Matrix4().compose(
    V(0, 0, 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3 + (random() - 0.5) * 0.2, yaw, (random() - 0.5) * 0.25)),
    V(scale, scale, scale),
  );
  const placed = faces.map(([a, b, c, color]) => [a.clone().applyMatrix4(matrix), b.clone().applyMatrix4(matrix), c.clone().applyMatrix4(matrix), color]);
  let minY = Infinity;
  let reach = (SHELL_SHADOW.dx + SHELL_SHADOW.rx) * width;
  for (const [a, b, c] of placed) {
    minY = Math.min(minY, a.y, b.y, c.y);
    reach = Math.max(reach, a.x, b.x, c.x);
  }
  // Sunk a hair into the sand, so no sliver of daylight shows under the rim
  return { placed, lift: -minY - 0.02 * width, reach };
};

const layShell = (sink, { placed, lift }, x, z, width, shadow) => {
  const offset = V(x, lift, z);
  if (shadow) {
    const { dx, dz, rx, rz } = SHELL_SHADOW;
    shadowFan(sink, V(x + dx * width, 0, z + dz * width), rx * width, rz * width, 0.4);
  }
  for (const [a, b, c, color] of placed) sink.tri(a.add(offset), b.add(offset), c.add(offset), color);
};

const buildShells = (isMobile, aspect, palms) => {
  const random = createRandom(SEED);
  const layout = isMobile ? "mobile" : "desktop";
  const sink = new Sink(false);
  for (const { z, wet, dry, kind } of SHELLS[layout]) {
    const water = coastX(z, isMobile, aspect);
    const dryLine = dryX(z, isMobile, aspect);
    // Screen-constant size, a little smaller further out for depth
    const width = SHELL_SIZE[layout] * screenHeightAt(z) * Math.pow(6 / (CAMERA_Z - z), 0.3) * (0.85 + random() * 0.3) * (kind === 2 ? STAR_SIZE : 1);
    const palette = SHELL_PALETTES[Math.floor(random() * SHELL_PALETTES.length)];
    // MOBILE_PERF: fewer ribs on mobile — revert by removing the ternary
    const faces = kind === 0 ? scallop(random, palette, isMobile ? 5 : 7) : kind === 1 ? spiral(random, palette, 6, 5) : starfish(random, STAR_PALETTE);
    // A scallop reads best with its fan opening toward the viewer
    const yaw = kind === 0 ? (random() - 0.5) * 1.2 : random() * Math.PI * 2;
    const shell = orientShell(random, faces, width, yaw);
    let x = wet === undefined ? dryLine - clearAt(z, aspect) - shell.reach - dry * screenHeightAt(z) : dryLine + wet * (water - dryLine);
    // A dry-sand shell that would land by a palm goes down to the wet band
    const onDry = wet === undefined && palms.every((p) => Math.hypot(x - p.x, z - p.z) > PALM_CLEAR * p.scale);
    if (wet === undefined && !onDry) x = dryLine + 0.3 * (water - dryLine);
    layShell(sink, shell, x, z, width, onDry);
  }
  return sink.build();
};

// The crab, about its own origin: body width ≈ 1, across the legs ≈ 1.8,
// facing +z. aRig kinds: 0 body, 1 leg (weight 0 at the hip to 1 at the
// foot), 2 claw (phase = side, pivot = shoulder), 3 shadow (never moves).
const CRAB_SPAN = 1.8;
const addCrab = (sink, isMobile) => {
  const random = createRandom(SEED + 1);
  const tri = (a, b, c, color, rig, pivot) => sink.tri(a, b, c, shade(random, color, 0.05), rig, pivot);
  const rig = [3, 0, 0];
  shadowFan(sink, V(-0.12, 0, 0.1), 0.95, 0.55, 0.5, rig);

  // Carapace: a low faceted dome, wider at the front, pale belly under it
  // MOBILE_PERF: eight carapace sides instead of twelve — revert by removing the ternary
  const sides = isMobile ? 8 : 12;
  const outline = (a, k, y) => V(Math.cos(a) * 0.5 * k, y, Math.sin(a) * (Math.sin(a) > 0 ? 0.37 : 0.31) * k);
  const rings = [
    [0.5, 0.42],
    [0.87, 0.34],
    [1, 0.22],
    [0.8, 0.12],
  ].map(([k, y]) => Array.from({ length: sides + 1 }, (_, s) => outline(((s % sides) / sides) * Math.PI * 2 + Math.PI / sides, k, y)));
  const apex = V(0, 0.46, 0.02);
  const bottom = V(0, 0.1, 0);
  const bands = [CRAB_TOP, CRAB_RIM, CRAB_BELLY];
  for (let s = 0; s < sides; s++) {
    tri(apex, rings[0][s], rings[0][s + 1], CRAB_TOP.clone().offsetHSL(0, 0, 0.04));
    for (let r = 0; r < 3; r++) {
      tri(rings[r][s], rings[r + 1][s], rings[r + 1][s + 1], bands[r]);
      tri(rings[r][s], rings[r + 1][s + 1], rings[r][s + 1], bands[r]);
    }
    tri(rings[3][s], bottom, rings[3][s + 1], CRAB_UNDER);
  }

  // A thin segment from a to b: a three-sided prism, or a spike when b is a point
  const limb = (a, b, ra, rb, color, rigA, rigB, pivot) => {
    const dir = b.clone().sub(a).normalize();
    const side = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(side, dir);
    const ring = (center, r) => [0, 1, 2].map((i) => {
      const a = (i / 3) * Math.PI * 2;
      return center.clone().addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r);
    });
    const A = ring(a, ra);
    const B = rb > 0 ? ring(b, rb) : null;
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      const c = shade(random, color, 0.06);
      if (B) {
        for (const p of [A[i], B[i], B[j], A[i], B[j], A[j]]) sink.vertex(p, c, 1, p === B[i] || p === B[j] ? rigB : rigA, pivot);
        sink.count += 2;
      } else {
        sink.vertex(A[i], c, 1, rigA, pivot);
        sink.vertex(b, c, 1, rigB, pivot);
        sink.vertex(A[j], c, 1, rigA, pivot);
        sink.count++;
      }
    }
  };

  // Legs: hip on the shell's rim, knee up and out, foot on the sand; the
  // phases alternate so they patter in two sets while scuttling
  // MOBILE_PERF: three legs a side instead of four — revert by removing the ternary
  const legs = isMobile ? [0.08, -0.08, -0.22] : [0.12, 0.01, -0.1, -0.21];
  for (const s of [-1, 1]) {
    legs.forEach((z, i) => {
      const phase = i * Math.PI * 0.5 + (s > 0 ? Math.PI : 0);
      const hip = V(0.44 * s, 0.17, z);
      const knee = V((0.7 + 0.04 * (i % 2)) * s, 0.36 - 0.03 * i, z * 1.5 - 0.02);
      const foot = V((0.86 - 0.03 * i) * s, 0, z * 2.3 - 0.08);
      limb(hip, knee, 0.04, 0.035, CRAB_LEG, [1, 0, phase], [1, 0.55, phase]);
      limb(knee, foot, 0.035, 0, CRAB_SHIN, [1, 0.55, phase], [1, 1, phase]);
    });
  }

  // Claws: an arm from the shoulder, a plump faceted hand, two dark-tipped
  // fingers held a little open. The right one a size bigger, as a crab's
  // often is. The shader lifts each about its shoulder.
  for (const s of [-1, 1]) {
    const big = s > 0 ? 1.4 : 1.15;
    const claw = [2, 0, s];
    const shoulder = V(0.3 * s, 0.18, 0.26);
    const elbow = V(0.5 * s, 0.2, 0.44);
    const hand = V(0.4 * s, 0.24, 0.6 + 0.04 * big);
    limb(shoulder, elbow, 0.045, 0.05, CRAB_CLAW, claw, claw, shoulder);
    limb(elbow, hand, 0.05, 0.06, CRAB_CLAW, claw, claw, shoulder);
    // Hand: a squashed double pyramid along the claw's reach
    const reach = V(-0.35 * s, 0.05, 1).normalize();
    const across = new THREE.Vector3().crossVectors(reach, V(0, 1, 0)).normalize();
    const back = hand.clone().addScaledVector(reach, -0.09 * big);
    const front = hand.clone().addScaledVector(reach, 0.1 * big);
    const girth = [0, 1, 2, 3, 4, 5].map((i) => {
      const a = (i / 6) * Math.PI * 2;
      return hand.clone().addScaledVector(across, Math.cos(a) * 0.075 * big).addScaledVector(V(0, 1, 0), Math.sin(a) * 0.06 * big);
    });
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      const lit = girth[i].y > hand.y ? 0.05 : -0.04;
      tri(back, girth[i], girth[j], CRAB_CLAW.clone().offsetHSL(0, 0, lit), claw, shoulder);
      tri(front, girth[j], girth[i], CRAB_CLAW.clone().offsetHSL(0, 0, lit), claw, shoulder);
    }
    // Fingers: the fixed one on top, the moving one under, parted a little
    const tipUp = front.clone().addScaledVector(reach, 0.13 * big).add(V(0, 0.03, 0));
    const tipDown = front.clone().addScaledVector(reach, 0.12 * big).add(V(0, -0.04, 0));
    limb(front.clone().add(V(0, 0.02, 0)), tipUp, 0.03 * big, 0, CRAB_TIP, claw, claw, shoulder);
    limb(front.clone().add(V(0, -0.025, 0)), tipDown, 0.025 * big, 0, CRAB_TIP, claw, claw, shoulder);
  }

  // Eyes on stalks at the front of the shell
  for (const s of [-1, 1]) {
    const base = V(0.1 * s, 0.38, 0.24);
    const top = V(0.14 * s, 0.56, 0.29);
    limb(base, top, 0.025, 0.022, CRAB_RIM, RIG_BODY, RIG_BODY);
    const eye = new THREE.OctahedronGeometry(0.05, 0);
    const pos = eye.attributes.position;
    for (let i = 0; i < pos.count; i += 3) {
      const p = [0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(pos, i + j).add(top).add(V(0, 0.03, 0)));
      tri(p[0], p[1], p[2], EYE);
    }
    eye.dispose();
  }
};

// The sea turtle, about its own origin: shell ≈ 1 long, facing +z, its
// underside on the sand. aRig kinds: 4 body, 5 front flipper, 6 hind flipper
// (weight 0 at the root to 1 at the tip, phase = side, pivot = the root), 7
// head (pivot = the root of the neck), 8 shadow (never moves).
const TURTLE_SPAN = 1.4;
const TURTLE_BODY = [4, 0, 0];
const addTurtle = (sink, isMobile) => {
  const random = createRandom(SEED + 2);
  const tri = (a, b, c, color, rig = TURTLE_BODY, pivot) => sink.tri(a, b, c, shade(random, color, 0.04), rig, pivot);
  shadowFan(sink, V(-0.06, 0, -0.06), 0.62, 0.66, 0.45, [8, 0, 0]);

  // Carapace: a low dome of plates. A square of (s, t) maps onto the unit
  // disk, then onto an oval a touch wider in front and drawn out behind; each
  // plate is a shallow pyramid, so the light picks out its facets: five
  // vertebral plates down the spine, four costals either side, and round the
  // rim a ring of lighter marginals
  const dome = (s, t) => {
    const u = s * Math.sqrt(1 - (t * t) / 2);
    const v = t * Math.sqrt(1 - (s * s) / 2);
    const h = Math.pow(Math.max(0, 1 - u * u - v * v), 0.6);
    return V(u * 0.34 * (1 + 0.08 * v), 0.13 + 0.16 * h, v * (v < 0 ? 0.46 : 0.4) + 0.02);
  };
  const SPINE = 0.36;
  const VERTEBRALS = [-1, -0.6, -0.2, 0.2, 0.6, 1];
  const COSTALS = [-1, -0.42, 0.08, 0.56, 1];
  // Along a side, every point where a neighbouring plate has a corner, so
  // the plates share their vertices and never crack apart
  const cuts = [...VERTEBRALS, ...COSTALS];
  const between = (a, b) => cuts.filter((c) => c > Math.min(a, b) && c < Math.max(a, b)).sort((p, q) => (a < b ? p - q : q - p));
  // The flanks' long sides get a middle point, where the marginals meet
  // MOBILE_PERF: half as many marginals along the flanks — revert by removing the ternary
  const flank = isMobile ? () => [] : (a, b) => [(a + b) / 2];
  const plate = (s0, s1, t0, t1, color) => {
    const ring = [];
    const across = (t, a, b) => ring.push([a, t], [(a + b) / 2, t]);
    const along = (s, a, b) => ring.push([s, a], ...(Math.abs(s) < 1 ? between(a, b) : flank(a, b)).map((t) => [s, t]));
    across(t0, s0, s1);
    along(s1, t0, t1);
    across(t1, s1, s0);
    along(s0, t1, t0);
    const center = dome((s0 + s1) / 2, (t0 + t1) / 2).add(V(0, 0.026, 0));
    const points = ring.map(([s, t]) => dome(s, t));
    points.forEach((p, i) => tri(center, p, points[(i + 1) % points.length], color));
  };
  const tone = (color) => color.clone().offsetHSL((random() - 0.5) * 0.03, 0, (random() - 0.5) * 0.1);
  for (let k = 0; k < 5; k++) plate(-SPINE, SPINE, VERTEBRALS[k], VERTEBRALS[k + 1], tone(TURTLE_SPINE));
  for (let k = 0; k < 4; k++) {
    plate(SPINE, 1, COSTALS[k], COSTALS[k + 1], tone(TURTLE_SHELL));
    plate(-1, -SPINE, COSTALS[k], COSTALS[k + 1], tone(TURTLE_SHELL));
  }

  // Marginals: the square's edge walked round (through every plate corner
  // on it), each piece pushed out and down into the rim, the rear edge
  // serrated, a notch over the neck; under the rim, the dark body
  const edge = [];
  const acrossS = [-1, -(1 + SPINE) / 2, -SPINE, 0, SPINE, (1 + SPINE) / 2];
  for (const s of acrossS) edge.push([s, -1]);
  for (let k = 0; k < 4; k++) edge.push([1, COSTALS[k]], ...flank(COSTALS[k], COSTALS[k + 1]).map((t) => [1, t]));
  for (const s of acrossS) edge.push([-s, 1]);
  for (let k = 4; k > 0; k--) edge.push([-1, COSTALS[k]], ...flank(COSTALS[k], COSTALS[k - 1]).map((t) => [-1, t]));
  const inner = edge.map(([s, t]) => dome(s, t));
  const out = inner.map((p) => V(p.x, 0, p.z - 0.02).normalize());
  const rim = inner.map((p, i) => {
    const [s, t] = edge[i];
    const push = s === 0 && t === 1 ? 0.03 : p.z < -0.3 && i % 2 ? 0.1 : 0.075;
    return p.clone().addScaledVector(out[i], push).setY(s === 0 && t === 1 ? 0.1 : 0.085);
  });
  const under = rim.map((p, i) => p.clone().addScaledVector(out[i], -0.07).setY(0.02));
  for (let i = 0; i < edge.length; i++) {
    const j = (i + 1) % edge.length;
    const color = TURTLE_RIM.clone().offsetHSL(0, 0, i % 2 ? 0.03 : -0.02);
    tri(inner[i], rim[i], rim[j], color);
    tri(inner[i], rim[j], inner[j], color);
    tri(rim[i], under[i], under[j], TURTLE_UNDER);
    tri(rim[i], under[j], rim[j], TURTLE_UNDER);
  }

  // Head and neck: a five-sided neck out from under the shell, then the
  // head in hexagonal rings — a flat crown of darker scales on top, the
  // pale jaw under — to a blunt beak; a dark eye either side
  const neck = V(0, 0.1, 0.28);
  const head = [7, 1, 0];
  const hexRing = (z, w, h, y) => Array.from({ length: 6 }, (_, i) => V(Math.cos((i / 6) * Math.PI * 2) * w, y + Math.sin((i / 6) * Math.PI * 2) * h, z));
  const neckRings = [hexRing(0.3, 0.075, 0.064, 0.1), hexRing(0.53, 0.066, 0.055, 0.122)];
  const rings = [hexRing(0.5, 0.076, 0.064, 0.128), hexRing(0.61, 0.092, 0.074, 0.142), hexRing(0.71, 0.064, 0.053, 0.132)];
  const beak = V(0, 0.12, 0.79);
  const face = (i) => (i === 1 ? TURTLE_SCALE : i === 0 || i === 2 ? TURTLE_SKIN : TURTLE_JAW);
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    tri(neckRings[0][i], neckRings[1][i], neckRings[1][j], i < 3 ? TURTLE_SKIN : TURTLE_JAW, head, neck);
    tri(neckRings[0][i], neckRings[1][j], neckRings[0][j], i < 3 ? TURTLE_SKIN : TURTLE_JAW, head, neck);
    for (let r = 0; r < 2; r++) {
      tri(rings[r][i], rings[r + 1][i], rings[r + 1][j], face(i), head, neck);
      tri(rings[r][i], rings[r + 1][j], rings[r][j], face(i), head, neck);
    }
    tri(rings[2][i], beak, rings[2][j], face(i), head, neck);
  }
  for (const s of [-1, 1]) {
    const eye = V(0.073 * s, 0.177, 0.615);
    const up = V(-0.58 * s, 0.81, 0).multiplyScalar(0.012);
    tri(eye.clone().add(V(0, 0, 0.016)), eye.clone().add(up).add(V(0, 0, -0.01)), eye.clone().sub(up).add(V(0, 0, -0.01)), EYE, head, neck);
  }

  // Flippers: a thin blade from its root under the shell, a ridge along the
  // top, its tip resting on the sand, darker along the trailing edge; the
  // front pair long and swept back, the hind pair short, rounded paddles.
  // Stations along the blade: [along, leading edge, trailing edge, ridge
  // height], in its length and width
  const blade = (points, kind, side, root, color) => {
    const c = shade(random, color, 0.05);
    for (const [p, w] of points) sink.vertex(p, c, 1, [kind, w, side], root);
    sink.count++;
  };
  const flipper = (kind, side, root, angle, length, width, sweep, stations) => {
    const dir = V(side * Math.cos(angle), 0, -Math.sin(angle));
    const lead = V(side * Math.sin(angle), 0, Math.cos(angle));
    const at = (a, b, y) => root.clone().addScaledVector(dir, a * length).addScaledVector(lead, (b - sweep * a * a) * width).setY(Math.max(y, 0.004));
    const rows = stations.map(([a, l, r, y]) => ({ a, ridge: at(a, 0, y), lead: at(a, l, y - 0.02), trail: at(a, r, y - 0.02) }));
    const tip = [at(1, -0.4, 0.008), 1];
    rows.forEach((row, i) => {
      const next = rows[i + 1];
      const ridge = [row.ridge, row.a];
      if (next) {
        blade([ridge, [row.lead, row.a], [next.lead, next.a]], kind, side, root, TURTLE_FLIPPER);
        blade([ridge, [next.lead, next.a], [next.ridge, next.a]], kind, side, root, TURTLE_FLIPPER);
        blade([ridge, [next.trail, next.a], [row.trail, row.a]], kind, side, root, TURTLE_SCALE);
        blade([ridge, [next.ridge, next.a], [next.trail, next.a]], kind, side, root, TURTLE_SCALE);
      } else {
        blade([ridge, [row.lead, row.a], tip], kind, side, root, TURTLE_FLIPPER);
        blade([ridge, tip, [row.trail, row.a]], kind, side, root, TURTLE_SCALE);
      }
    });
  };
  for (const s of [-1, 1]) {
    flipper(5, s, V(0.28 * s, 0.08, 0.2), 0.25, 0.6, 0.17, 0.5, [
      [0, 0.45, -0.4, 0.08],
      [0.4, 0.55, -0.5, 0.05],
      [0.75, 0.3, -0.5, 0.025],
    ]);
    flipper(6, s, V(0.16 * s, 0.06, -0.36), 1.1, 0.26, 0.15, 0.1, [
      [0, 0.4, -0.4, 0.06],
      [0.55, 0.55, -0.5, 0.03],
    ]);
  }
};

// Every pose the turtle's moves take a point to (see the shader): flippers
// through their sweep, the body through its heave
const turtlePoses = (x, z, kind, side, px, pz) => {
  const sweeps = kind === 5 ? [...FRONT_SWEEP, 0] : kind === 6 ? [0, HIND_PUSH] : [0];
  return sweeps.flatMap((sweep) => {
    const c = Math.cos(sweep * side);
    const s = Math.sin(sweep * side);
    const rx = px + c * (x - px) + s * (z - pz);
    const rz = pz + c * (z - pz) - s * (x - px);
    return [
      [rx, rz],
      [rx, rz + HEAVE],
    ];
  });
};

// A creature's outline on the sand, in its own units: of all its points (from
// vertex `from` on), in every pose its moves take them to, the furthest out
// in each of 16 directions
const outlineOf = (sink, from, poses) => {
  const points = [];
  for (let i = from; i < sink.position.length / 3; i++) {
    const [x, , z] = sink.position.slice(i * 3, i * 3 + 3);
    const [kind, , side] = sink.rig.slice(i * 3, i * 3 + 3);
    points.push(...poses(x, z, kind, side, sink.pivot[i * 3], sink.pivot[i * 3 + 2]));
  }
  return Array.from({ length: 16 }, (_, k) => {
    const cx = Math.cos((k / 16) * Math.PI * 2);
    const cz = Math.sin((k / 16) * Math.PI * 2);
    return points.reduce((best, p) => (p[0] * cx + p[1] * cz > best[0] * cx + best[1] * cz ? p : best));
  });
};

// The creatures' one geometry, and each one's outline for placing it
const buildCreatures = (isMobile) => {
  const sink = new Sink(true);
  addCrab(sink, isMobile);
  const outlines = {
    [CRAB]: outlineOf(sink, 0, (x, z) => [
      [x - SCUTTLE, z],
      [x + SCUTTLE, z],
    ]),
  };
  const from = sink.position.length / 3;
  addTurtle(sink, isMobile);
  outlines[TURTLE] = outlineOf(sink, from, turtlePoses);
  const geometry = sink.build();
  geometry.setAttribute("aState", new THREE.InstancedBufferAttribute(new Float32Array(MAX_CREATURES * 4), 4));
  geometry.setAttribute("aBob", new THREE.InstancedBufferAttribute(new Float32Array(MAX_CREATURES), 1));
  geometry.setAttribute("aCreature", new THREE.InstancedBufferAttribute(new Float32Array(MAX_CREATURES), 1));
  return { geometry, outlines };
};

// Per-instance attributes. aCreature: which creature the instance shows (0
// crab, 1 turtle); the other's vertices fold to one point and draw nothing.
// Set per frame: for the crab, aState = (walk: 0 still, 1 scuttling — scales
// the leg patter; step: its phase; left and right claw lift: 0 rest, 1
// raised), aBob: the body's idle breathing; for the turtle, aState = (front
// flippers' sweep, their lift at the tip: 0 on the sand, 1 raised; the
// head's lift; the hind flippers' push — angles in rad), aBob: how far the
// body heaves up, nose first, the flipper tips staying on the sand
const CREATURE_VERTEX = /* glsl */ `
  float kind = aRig.x;
  if (abs(step(3.5, kind) - aCreature) > 0.5) {
    transformed = vec3(0.0);
  } else if (kind > 0.5 && kind < 1.5) {
    float lift = max(sin(aState.y + aRig.z), 0.0);
    transformed.y += aState.x * aRig.y * 0.12 * lift + aBob * (1.0 - aRig.y);
    transformed.z += aState.x * aRig.y * 0.05 * cos(aState.y + aRig.z);
  } else if (kind > 1.5 && kind < 2.5) {
    float a = (aRig.z < 0.0 ? aState.z : aState.w) * 0.75;
    vec3 d = transformed - aPivot;
    float c = cos(a);
    float s = sin(a);
    transformed = aPivot + vec3(d.x, c * d.y + s * d.z, c * d.z - s * d.y);
    transformed.y += aBob;
  } else if (kind < 0.5) {
    transformed.y += aBob;
  } else if (kind > 3.5 && kind < 7.5) {
    vec3 d = transformed - aPivot;
    float lift = aBob * (1.0 + 1.2 * transformed.z);
    if (kind > 4.5 && kind < 6.5) {
      float front = step(kind, 5.5);
      float a = mix(aState.w, aState.x, front) * aRig.z;
      float c = cos(a);
      float s = sin(a);
      d = vec3(c * d.x + s * d.z, d.y + front * aState.y * 0.05 * aRig.y, c * d.z - s * d.x);
      lift *= 1.0 - aRig.y;
    } else if (kind > 6.5) {
      float c = cos(aState.z);
      float s = sin(aState.z);
      d = vec3(d.x, c * d.y + s * d.z, c * d.z - s * d.y);
    }
    transformed = aPivot + d;
    transformed.y += lift;
  }
`;

// Kept across layout changes (a resize rebuilds only the geometry), so the
// programs stay compiled and the fade carries on
const buildMaterials = () => {
  const common = {
    vertexColors: true,
    flatShading: true,
    side: THREE.DoubleSide,
    // Transparent double-sided materials otherwise draw twice
    forceSinglePass: true,
    transparent: true,
    opacity: 0,
  };
  const shellMaterial = new THREE.MeshStandardMaterial({ ...common, roughness: 0.8 });
  const creatureMaterial = new THREE.MeshStandardMaterial({ ...common, roughness: 0.7 });
  creatureMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec3 aRig;\nattribute vec3 aPivot;\nattribute vec4 aState;\nattribute float aBob;\nattribute float aCreature;",
      )
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${CREATURE_VERTEX}`);
  };
  creatureMaterial.customProgramCacheKey = () => "shore-creatures-rig";
  return { shellMaterial, creatureMaterial };
};

const clearOf = (spots, x, z, radius) => spots.every((p) => Math.hypot(x - p.x, z - p.z) > radius + p.r);

// The furthest toward the sea a creature can rest at depth z, facing yaw:
// every point of its outline stays CLEAR short of the dry line at that
// point's own depth
const restX = (z, yaw, scale, outline, isMobile, aspect) => {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  let x = Infinity;
  for (const [px, pz] of outline) {
    const ox = (c * px + s * pz) * scale;
    const oz = (c * pz - s * px) * scale;
    x = Math.min(x, dryX(z + oz, isMobile, aspect) - clearAt(z + oz, aspect) - ox);
  }
  return x;
};

// Yaw of the way straight down the beach into the sea at depth z
const seaward = (z, isMobile, aspect) => Math.atan2(0.1, coastX(z - 0.05, isMobile, aspect) - coastX(z + 0.05, isMobile, aspect));

// Where each creature rests (Home-local), which way it faces and its scale:
// at its depth, or the nearest depth in its range clear of the palms and the
// others and right of the avatar. The crab turns toward the viewer,
// a little off square; the turtle heads for the sea, turned toward the viewer.
// On phones last the still crab by the sandcastle, turned off square the
// other way, toward the castle.
const placeCreatures = (isMobile, aspect, palms, outlines) => {
  const taken = palms.map((p) => ({ x: p.x, z: p.z, r: PALM_CLEAR * p.scale }));
  const placed = creatureList(isMobile, aspect).map(({ kind, z: preferred, range, first }) => {
    const outline = outlines[kind];
    const radius = Math.max(...outline.map(([x, z]) => Math.hypot(x, z)));
    const at = (z) => {
      const scale = (CREATURE_SIZE[kind] * screenHeightAt(z)) / (kind === CRAB ? CRAB_SPAN : TURTLE_SPAN);
      // Its turn depends on where it stands, which depends on its turn: twice
      // is enough to settle
      let x = dryX(z, isMobile, aspect);
      let yaw = 0;
      for (let pass = 0; pass < 2; pass++) {
        yaw = kind === CRAB ? Math.atan2(CAMERA_HOME.x - x, CAMERA_HOME.z - z) + 0.3 : seaward(z, isMobile, aspect) - TURTLE_TURN;
        x = restX(z, yaw, scale, outline, isMobile, aspect);
      }
      const screen = 0.5 + x / (screenHeightAt(z) * aspect);
      return { x, z, yaw, scale, reach: radius * scale, ok: screen >= MIN_SCREEN && clearOf(taken, x, z, radius * scale) };
    };
    let spot = at(preferred);
    for (let step = 1; !spot.ok && step <= 60; step++) {
      const z = preferred + Math.ceil(step / 2) * 0.1 * (step % 2 ? 1 : -1);
      if (z >= range[0] && z <= range[1] && at(z).ok) spot = at(z);
    }
    const { x, z, yaw, scale, reach } = spot;
    taken.push({ x, z, r: reach });
    return {
      kind,
      home: V(x, 0, z),
      rotation: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw),
      scale: V(scale, scale, scale),
      // Its own sideways (the crab's scuttle) and forward (the turtle's heave)
      right: V(Math.cos(yaw), 0, -Math.sin(yaw)),
      forward: V(Math.sin(yaw), 0, Math.cos(yaw)),
      first,
    };
  });
  const byCastle = isMobile && CASTLE_CRAB[layoutOf(isMobile, aspect)];
  if (byCastle) {
    const [at, span] = byCastle;
    const home = onSand(at, aspect);
    const scale = span / CRAB_SPAN;
    const yaw = Math.atan2(CAMERA_HOME.x - home.x, CAMERA_HOME.z - home.z) - 0.3;
    // Clear of the wet sand
    home.setX(Math.min(home.x, dryX(home.z, isMobile, aspect) - clearAt(home.z, aspect) - span / 2));
    placed.push({ kind: CRAB, still: true, home, rotation: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw), scale: V(scale, scale, scale) });
  }
  return placed;
};

const smooth = (t) => t * t * (3 - 2 * t);

// The crab's behavior: mostly still; now and then a quick sideways dash, a
// pause (claws up a little), and back. Mode 0 idle, 1 out, 2 pause, 3 back;
// `until` ends the current mode, `from`/`to` the offset in body widths along
// its side. A claw twitches every few seconds: one, both or a double flick.
// `first`: the clock time of its first scuttle
const newCrab = (first) => ({ mode: 0, start: 0, until: first, from: 0, to: 0, offset: 0, walk: 0, step: 0, clawAt: first - 1.5, clawStart: -10, clawMode: 0, clawL: 0, clawR: 0 });
const stepCrab = (c, t, delta) => {
  if (t >= c.until) {
    c.start = t;
    if (c.mode === 0) {
      c.mode = 1;
      c.from = 0;
      // More often toward the water (its right, +x) than inland
      c.to = (Math.random() < 0.65 ? 1 : -1) * SCUTTLE * (0.55 + Math.random() * 0.45);
      c.until = t + 0.35 + Math.abs(c.to) * 0.5;
    } else if (c.mode === 1) {
      c.mode = 2;
      c.until = t + 0.8 + Math.random() * 1.6;
    } else if (c.mode === 2) {
      c.mode = 3;
      c.from = c.to;
      c.to = 0;
      c.until = t + 0.45 + Math.abs(c.from) * 0.6;
    } else {
      c.mode = 0;
      c.until = t + 4 + Math.random() * 5;
    }
  }
  const moving = c.mode === 1 || c.mode === 3;
  if (moving) c.offset = c.from + (c.to - c.from) * smooth(Math.min(1, (t - c.start) / (c.until - c.start)));
  c.walk += ((moving ? 1 : 0) - c.walk) * Math.min(1, delta * 14);
  c.step += delta * 24 * c.walk;
  if (t >= c.clawAt) {
    c.clawStart = t;
    c.clawMode = Math.floor(Math.random() * 3);
    c.clawAt = t + 1.8 + Math.random() * 3.5;
  }
  const k = (t - c.clawStart) / 0.45;
  let lift = 0;
  if (k >= 0 && k < 1) lift = c.clawMode === 2 ? Math.abs(Math.sin(k * Math.PI * 2)) * 0.6 : Math.sin(k * Math.PI);
  const raised = c.mode === 2 ? Math.min(1, (t - c.start) / 0.25) * 0.35 : 0;
  c.clawL = Math.max(raised, c.clawMode === 1 ? 0 : lift * 0.5);
  c.clawR = Math.max(raised, lift);
};

// The turtle's behavior: still, but every 8 to 15 s one slow crawl stroke —
// the front flippers lift and reach forward, dig in and row back, heaving
// the body forward and up with the head raised, then ease back to rest while
// the body settles back into its hollow in the sand, so it never leaves its
// spot. `at`: when the current stroke began, `next`: when the next one comes
const REACH = 0.9;
const ROW = 1.4;
const SETTLE = 2;
const newTurtle = (first) => ({ at: -Infinity, next: first, sweep: 0, lift: 0, head: 0, push: 0, heave: 0, bob: 0 });
const stepTurtle = (u, t) => {
  if (t >= u.next) {
    u.at = t;
    u.next = t + 8 + Math.random() * 7;
  }
  const k = t - u.at;
  const [forward, back] = FRONT_SWEEP;
  u.sweep = 0;
  u.lift = 0;
  u.head = 0;
  u.push = 0;
  u.heave = 0;
  u.bob = 0;
  if (k < REACH) {
    const p = smooth(k / REACH);
    u.sweep = forward * p;
    u.lift = Math.sin(Math.PI * p);
    u.head = 0.35 * p * HEAD_LIFT;
  } else if (k < REACH + ROW) {
    const p = smooth((k - REACH) / ROW);
    u.sweep = forward + (back - forward) * p;
    u.head = (0.35 + 0.65 * p) * HEAD_LIFT;
    u.push = Math.sin(Math.PI * p) * HIND_PUSH;
    u.heave = p;
    u.bob = Math.sin(Math.PI * Math.min(1, p * 1.2));
  } else if (k < REACH + ROW + SETTLE) {
    const p = smooth((k - REACH - ROW) / SETTLE);
    u.sweep = back * (1 - p);
    u.lift = 0.3 * Math.sin(Math.PI * p);
    u.head = (1 - p) * HEAD_LIFT;
    u.heave = 1 - p;
  }
};

// palms: PalmTree's layout (optional): the creatures and the dry-sand shell
// keep clear of the palms' feet and the coconuts around them
const NO_PALMS = [];
export default function ShoreLife({ palms = NO_PALMS }) {
  const { isMobile, prefersReducedMotion } = useMobile();
  const get = useThree((state) => state.get);
  // Rounded, so the props rebuild only when the aspect really changes
  const aspect = useThree((state) => Math.round(state.viewport.aspect * 100) / 100);
  const materials = useMemo(buildMaterials, []);
  const shells = useMemo(() => buildShells(isMobile, aspect, palms), [isMobile, aspect, palms]);
  const model = useMemo(() => buildCreatures(isMobile), [isMobile]);
  const creatures = useMemo(() => placeCreatures(isMobile, aspect, palms, model.outlines), [isMobile, aspect, palms, model]);
  const group = useMemo(() => {
    const g = new THREE.Group();
    const shellMesh = new THREE.Mesh(new THREE.BufferGeometry(), materials.shellMaterial);
    const creatureMesh = new THREE.InstancedMesh(new THREE.BufferGeometry(), materials.creatureMaterial, MAX_CREATURES);
    // The legs, claws and flippers move past the bounding sphere; they are tiny
    creatureMesh.frustumCulled = false;
    for (const mesh of [shellMesh, creatureMesh]) {
      mesh.layers.set(LAYER);
      // After BeachDecor's sand (drawn over its low mound), before the sea
      // (renderOrder 1), so the swash washes over the wet-band shell
      mesh.renderOrder = 0.5;
      g.add(mesh);
    }
    g.visible = false;
    return g;
  }, [materials]);
  const ready = useRef(false);
  const fade = useRef(0);
  const behavior = useRef(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const position = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    group.children[0].geometry = shells;
    return () => shells.dispose();
  }, [group, shells]);
  useEffect(() => {
    group.children[1].geometry = model.geometry;
    return () => model.geometry.dispose();
  }, [group, model]);

  // Each creature at rest (and its behavior restarted) whenever the layout moves
  useEffect(() => {
    const creatureMesh = group.children[1];
    const { aCreature, aState, aBob } = model.geometry.attributes;
    creatureMesh.count = creatures.length;
    creatures.forEach((creature, i) => {
      creatureMesh.setMatrixAt(i, matrix.compose(creature.home, creature.rotation, creature.scale));
      aCreature.setX(i, creature.kind);
      aState.setXYZW(i, 0, 0, 0, 0);
      aBob.setX(i, 0);
    });
    creatureMesh.instanceMatrix.needsUpdate = true;
    aCreature.needsUpdate = true;
    aState.needsUpdate = true;
    aBob.needsUpdate = true;
    const now = get().clock.elapsedTime;
    behavior.current = creatures.map((creature) =>
      creature.still ? null : creature.kind === CRAB ? newCrab(now + creature.first) : newTurtle(now + creature.first),
    );
  }, [group, model, creatures, matrix, get]);

  useEffect(() => {
    let live = true;
    const { gl, camera, scene } = get();
    // Hidden until compiled, then faded in: after a hot update (Fast
    // Refresh) the materials are new, at opacity 0, but these refs are kept
    ready.current = false;
    fade.current = 0;
    group.visible = false;
    camera.layers.enable(LAYER);
    // Compiled off the main thread while hidden (see BeachDecor for why not
    // lib/prewarm)
    gl.compileAsync(group, camera, scene)
      .catch(() => {})
      .then(() => {
        if (live) ready.current = true;
      });
    return () => {
      live = false;
      camera.layers.disable(LAYER);
      materials.shellMaterial.dispose();
      materials.creatureMaterial.dispose();
    };
  }, [group, materials, get]);

  // Reduced motion: no fade (it appears at once) and the creatures hold still
  useFrame((state, delta) => {
    if (!ready.current) return;
    group.visible = true;
    if (fade.current < 1) {
      fade.current = prefersReducedMotion ? 1 : Math.min(1, fade.current + delta / FADE_SECONDS);
      const opacity = smooth(fade.current);
      materials.shellMaterial.opacity = opacity;
      materials.creatureMaterial.opacity = opacity;
    }
    if (prefersReducedMotion || !behavior.current) return;

    const t = state.clock.elapsedTime;
    const creatureMesh = group.children[1];
    const { aState, aBob } = creatureMesh.geometry.attributes;
    creatures.forEach((creature, i) => {
      const b = behavior.current[i];
      if (creature.still) return;
      if (creature.kind === CRAB) {
        stepCrab(b, t, delta);
        position.copy(creature.home).addScaledVector(creature.right, b.offset * creature.scale.x);
        aState.setXYZW(i, b.walk, b.step, b.clawL, b.clawR);
        aBob.setX(i, 0.012 * Math.sin(t * 1.9 + i * 2.1));
      } else {
        stepTurtle(b, t);
        position.copy(creature.home).addScaledVector(creature.forward, b.heave * HEAVE * creature.scale.x);
        aState.setXYZW(i, b.sweep, b.lift, b.head, b.push);
        aBob.setX(i, b.bob * HEAVE_LIFT);
      }
      creatureMesh.setMatrixAt(i, matrix.compose(position, creature.rotation, creature.scale));
    });
    creatureMesh.instanceMatrix.needsUpdate = true;
    aState.needsUpdate = true;
    aBob.needsUpdate = true;
  });

  return <primitive object={group} />;
}
