import { useScroll } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useMobile } from "../contexts/MobileContext";
import { layoutOf } from "../lib/coast";
import { createRandom } from "../lib/lowPoly";

// A few dolphins far out at sea on Home, the island's one rare, cinematic
// moment: now and then two or three leap near the horizon, each time in a new
// place and direction and in another formation than the time before:
// together, heading the same way a moment apart like a small pod, each one
// behind a little farther out; or opposite, rising from both sides toward
// each other and slipping back in near the middle a little apart, their arcs
// mirroring each other like the halves of a heart (with three, two come from
// one side). The farther ones look a little smaller, their water lines a
// little higher on screen. Each rises out of the water in a smooth arc,
// pitching along it (nose up, level over the top, nose down), flicks its
// flukes in the air and slips back in, with a little spray and a faint ring
// on the water where it leaves and where it goes back in. Drawn like the gulls
// (Birds): flat silhouettes in their deep plum, built the same way so they
// render the same ink, the farther ones hazed a little more, dark shapes
// against the water and the sun's glitter. On desktop they leap right of the
// title, in and beside that glitter; on mobile the sun is low over the land,
// so they leap over the water on the right, below the gulls.
//
// One draw call, and only while they leap: each body is a strip of triangles
// down its profile plus fins and flukes; all three dolphins, their spray and
// their rings are in one geometry (a leap of two draws only the nearest two),
// and the vertex shader moves everything from a few uniforms set per frame, a
// value for each dolphin. Each point of a body follows its beak along the
// arc, so the body bends over the top and slides in and out of the water
// through one spot; the fragment shader cuts away whatever is under the water
// line. Drawn after the sea (renderOrder) and blended over it, depth-tested
// against it, so a wave in front hides a foot and anything nearer (the palms,
// the title) passes in front; the farthest dolphin first, so a nearer one is
// always drawn over it.
//
// Home floor coordinates, like the sea: they hold the floor's level while the
// section group drops away, slide with the world as the visitor leaves and
// fade out over the same span of the scroll as the sea and the gulls. Their
// size is set on screen, like the gulls': each is LENGTH units long, the
// nearest placed as far away as its size on screen needs and the others a
// little farther, so every leap peaks just under the horizon (the camera is
// CAMERA_HEIGHT above the water) and each water line sits about a body length
// below it. Each leaps along the screen's horizontal, square to the view, so
// their spacing on screen is exact.
//
// A lazy chunk mounted after the first visible frame (HomeSection): it
// compiles its shader off the main thread while hidden. On its own layer,
// like the other sea life, so the contact-shadow pass does not draw it.
// Reduced motion: no leaps, nothing rendered.

const LAYER = 4;
const SEED = 3;
// Seconds from when the scene appears (SceneReady's scene-visible mark) to
// the first leap, and from one leap to the next (never before the last one's
// dolphins and spray are gone)
const FIRST_LEAP = 2;
const LEAP_EVERY = [4, 8];
// Seconds from the beak breaking the surface to the flukes going back under,
// longer for the higher leaps
const LEAP_SECONDS = [1.2, 1.6];
// Leaving Home: over this span of the scroll toward Skills (in sections) it
// fades out, with the sea (Sea's LEAVE_START/LEAVE_END)
const LEAVE_START = 0.06;
const LEAVE_END = 0.48;

// Camera: SceneCanvas (position [0, 0.5, 5]; its group, and so the floor,
// sits at y = -1)
const CAMERA_Z = 5;
const CAMERA_HEIGHT = 1.5;

// Where they leap, by layout (lib/coast layoutOf): band, the stretch of the
// screen (fractions from the left) the dolphins keep to, each leap somewhere
// else along it: over the water (lib/coast keeps it right of ≈ 0.68 at the
// horizon on desktop, ≈ 0.71 on mobile, a little further left at the
// dolphins' depths) and clear of the right edge; on desktop right of where
// the title's end sways to on a wide screen (on a narrower one it passes in
// front now and then; the sun sits at 0.855), in portrait right of the palm
// leaning out over the water. Size, the nearest one's body length as a
// fraction of the screen's shorter side, each leap somewhere between these (a
// little nearer or farther); arc, the radius of the beak's arc (body lengths,
// below), tighter on the narrow portrait screen.
const SPOT = {
  desktop: { band: [0.842, 0.98], size: [0.028, 0.038], arc: 1.85 },
  landscape: { band: [0.72, 0.975], size: [0.046, 0.062], arc: 1.85 },
  portrait: { band: [0.75, 0.97], size: [0.038, 0.046], arc: 1.5 },
};
// The formations: each dolphin, nearest first, with far, how many times as
// far away as the nearest it is (so it looks smaller, its water line a little
// higher), and where it leaps: behind the nearest, along the way they leap,
// by that many of the nearest's body lengths (on screen), a moment after the
// one before it; or facing it, from the other side, going back in GAP of the
// nearest's body lengths from where the nearest does, within a moment of it
const FORMATIONS = {
  "together-2": [{ far: 1 }, { far: 1.3, behind: 1.3 }],
  "together-3": [{ far: 1 }, { far: 1.3, behind: 1.3 }, { far: 1.65, behind: 2.6 }],
  "opposite-2": [{ far: 1 }, { far: 1.4, facing: true }],
  "opposite-3": [{ far: 1 }, { far: 1.25, behind: 1.3 }, { far: 1.5, facing: true }],
};
const MOST = 3;
const GAP = 0.8;
// Seconds from one dolphin leaving the water to the next one behind it, and
// at most between the two sides
const BEHIND_STAGGER = [0.1, 0.35];
const FACING_STAGGER = 0.1;
// The least a leap's middle moves along the band from the last one's, as a
// share of the band; where the band leaves no room for that, the leap goes
// the other way round from the last one instead
const MOVE = 0.25;

// The dolphin in profile, facing +x with the beak tip at the origin, in body
// lengths (beak tip to flukes): rows [s, top, bottom] down the body, s back
// from the beak tip. The beak, the melon rising steeply behind it, the back
// arching to its deepest just ahead of the dorsal fin, the tail stock.
const BODY = [
  [0, 0.004, -0.004],
  [0.03, 0.008, -0.01],
  [0.058, 0.013, -0.016],
  [0.08, 0.037, -0.024],
  [0.105, 0.057, -0.034],
  [0.14, 0.072, -0.046],
  [0.2, 0.086, -0.062],
  [0.28, 0.096, -0.074],
  [0.36, 0.1, -0.08],
  [0.44, 0.098, -0.079],
  [0.52, 0.09, -0.071],
  [0.6, 0.077, -0.058],
  [0.68, 0.061, -0.044],
  [0.76, 0.044, -0.031],
  [0.84, 0.028, -0.02],
  [0.91, 0.016, -0.011],
];
// Fins and flukes: outlines [s, y] from their first root point on the body
// (a BODY row, and 0 top / 1 bottom) round to the last. The dorsal fin sweeps
// back to a hooked tip; the flipper points back and down; the flukes fork.
const FINS = [
  {
    root: [
      [9, 0],
      [10, 0],
      [11, 0],
    ],
    outline: [
      [0.48, 0.128],
      [0.53, 0.162],
      [0.58, 0.187],
      [0.625, 0.198],
      [0.607, 0.163],
      [0.6, 0.125],
    ],
  },
  {
    root: [
      [6, 1],
      [7, 1],
    ],
    outline: [
      [0.26, -0.102],
      [0.36, -0.134],
      [0.33, -0.108],
    ],
  },
  {
    root: [
      [15, 0],
      [15, 1],
    ],
    outline: [
      [0.95, 0.046],
      [1, 0.086],
      [0.974, 0.042],
      [0.952, 0.003],
      [0.974, -0.036],
      [1, -0.079],
      [0.95, -0.041],
    ],
  },
];
// How far back the flukes reach, and how high the dorsal fin
const TAIL = Math.max(...FINS.flatMap(({ outline }) => outline.map(([s]) => s)));
const FIN_TOP = Math.max(...FINS.flatMap(({ outline }) => outline.map(([, y]) => y)));

// The leap, in body lengths: the beak follows a circle arc (the spot's arc)
// out of the water and back in, meeting the water at ±EXIT_ANGLE (radians;
// the higher leaps steeper), and the body follows it; under the water the
// path runs on along the arc's tangent. The body's balance point, BALANCE
// behind the beak, crosses the screen at an even pace, like anything thrown,
// so it hangs a moment over the top.
const EXIT_ANGLE = [0.8, 0.92];
const BALANCE = 0.45;
// How far the dorsal fin's tip, crossing the water line, reaches past where
// the beak meets the water (body lengths; most on the flattest leaps): kept
// inside the band too
const OVERHANG = FIN_TOP / Math.sin(EXIT_ANGLE[0]);
// Body length in Home units: the top of the highest leap on the widest arc
// (the dorsal fin over the arc's top) rises to just under the camera's
// height, so it stays just under the horizon, which is level with the camera
const LENGTH = (0.92 * CAMERA_HEIGHT) / (SPOT.desktop.arc * (1 - Math.cos(EXIT_ANGLE[1])) + FIN_TOP);
// The flick, once the flukes clear the water: radians the tip of the tail
// bends (up, then down), bending from FLICK_FROM body lengths back, over
// FLICK_SECONDS
const FLICK = 0.4;
const FLICK_FROM = 0.6;
const FLICK_SECONDS = 0.36;

// Spray, where it leaves the water (thrown up and a little ahead) and where
// it goes back in (a crown, thrown up and back): droplets per splash and
// their launch velocities [x along the leap, y] in body lengths per second,
// each after a delay (s) as the body slides through, falling back under
// GRAVITY (body lengths / s², a little over a real one so it all falls
// within SPRAY_SECONDS). With each splash a faint ring widens on the water,
// flattened as it would be seen from low over the sea, fading as it goes.
const SPRAY = [
  { drops: 7, vx: [-0.3, 0.9], vy: [0.9, 2] },
  { drops: 9, vx: [-0.9, 0.5], vy: [1.1, 2.3] },
];
const DROP_DELAY = [0, 0.2];
const DROP_SIZE = [0.018, 0.032];
const GRAVITY = 7;
const SPRAY_SECONDS = 0.6;
const RING_SEGMENTS = 16;
const RING_REACH = 0.45;
const RING_FLAT = 0.2;
const RING_WIDTH = 0.016;
// A ring lies on the water round its splash, the near half in front of the
// leap: drawn this much nearer the camera (in view space, so the same on
// screen), so the water there, which the sea has already drawn, does not
// hide it
const RING_PULL = 0.8;

const glsl = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `vec3(${[16, 8, 0].map((s) => (((n >> s) & 255) / 255).toFixed(3)).join(", ")})`;
};
// As Birds builds its colours: THREE.Color reads the hex as sRGB and holds it
// linear, which written straight to the canvas renders darker than the hex
const linear = (hex) => {
  const c = new THREE.Color(hex);
  return `vec3(${[c.r, c.g, c.b].map((v) => v.toFixed(3)).join(", ")})`;
};
const f = (x) => x.toFixed(4);
const lerp = ([a, b], t) => a + (b - a) * t;

// The gulls' ink and horizon haze (Birds), built the way Birds builds them
// (linear), so the dolphins render the gulls' deep plum (the ink ≈ #18070b):
// the nearest hazed as little as the nearest gull, each farther one more, by
// HAZE_FAR for each time as far away again. The spray, lit by the low sun
// behind it, is sRGB written straight to the canvas like the sun and the sea.
const INK = "#4a2433";
const HAZE = "#c7868a";
const NEAR_HAZE = 0.05;
const HAZE_FAR = 0.375;
const SPRAY_COLOR = "#fff1e6";
const DROP_ALPHA = 0.9;
const RING_ALPHA = 0.4;

const VERTEX = /* glsl */ `
  // Per dolphin: the beak's arc angle (radians, 0 = the top of the arc), its
  // way (1: right, -1: left), the flukes' bend (radians), seconds since each
  // splash began (x out of the water, y back in; < 0: not yet), its arc's
  // middle on the water (Home floor coordinates) and its haze
  uniform float uHead[${MOST}];
  uniform float uDir[${MOST}];
  uniform float uFlick[${MOST}];
  uniform vec2 uSpray[${MOST}];
  uniform vec3 uBase[${MOST}];
  uniform float uHaze[${MOST}];
  // The arcs' radius (body lengths) and where they meet the water (±uExit)
  uniform float uArc;
  uniform float uExit;
  // x: 0 body, 1 droplet, 2 ring; y: its splash (0 out of the water, 1 back
  // in); zw: a droplet's launch velocity
  attribute vec4 aSpray;
  // Its dolphin: 0 the nearest
  attribute float aWho;
  varying vec4 vColor;
  // Height above the water, cut at 0 (the rings, on the water, never are)
  varying float vHeight;

  // The point on the path at arc angle a, and the way along it there
  vec2 path(float a, out vec2 dir) {
    float c = clamp(a, -uExit, uExit);
    dir = vec2(cos(c), -sin(c));
    return uArc * (vec2(sin(c), cos(c) - cos(uExit)) + dir * (a - c));
  }

  void main() {
    int who = int(aWho);
    float flick = uFlick[who];
    // In the leap's plane, body lengths: x along the leap, y up from the water
    vec2 p;
    float height = 1.0;
    vec3 color = ${glsl(SPRAY_COLOR)};
    float alpha = 1.0;
    float splash = aSpray.y;
    vec2 from = vec2((splash * 2.0 - 1.0) * uArc * sin(uExit), 0.0);
    float age = mix(uSpray[who].x, uSpray[who].y, splash);
    if (aSpray.x < 0.5) {
      // Body: each point s body lengths behind the beak along the path
      float s = -position.x;
      vec2 dir;
      p = path(uHead[who] - s / uArc, dir);
      // The flick bends the tail stock and flukes, most at the tip
      float k = max(s - ${f(FLICK_FROM)}, 0.0) / ${f(1 - FLICK_FROM)};
      float bend = flick * k;
      p += vec2(-dir.y, dir.x) * flick * k * k * ${f((1 - FLICK_FROM) / 2)};
      dir = vec2(dir.x * cos(bend) + dir.y * sin(bend), dir.y * cos(bend) - dir.x * sin(bend));
      p += vec2(-dir.y, dir.x) * position.y;
      height = p.y;
      color = mix(${linear(INK)}, ${linear(HAZE)}, uHaze[who]);
    } else if (aSpray.x < 1.5) {
      // Droplet: thrown up after its delay, falling back into the water;
      // collapsed to a point before and after its life
      float t = age - position.z;
      vec2 center = from + aSpray.zw * t - vec2(0.0, ${f(GRAVITY / 2)} * t * t);
      float live = step(0.0, t) * step(t, ${f(SPRAY_SECONDS)});
      p = center + position.xy * live;
      height = center.y;
      alpha = ${f(DROP_ALPHA)} * (1.0 - smoothstep(${f(SPRAY_SECONDS / 2)}, ${f(SPRAY_SECONDS)}, t));
    } else {
      // Ring: a flat ellipse round the splash, widening fast and then
      // slowly, its line the same width all round
      float live = step(0.0, age) * step(age, ${f(SPRAY_SECONDS)});
      float r = mix(0.04, ${f(RING_REACH)}, 1.0 - exp(-4.0 * age));
      vec2 normal = normalize(vec2(position.x * ${f(RING_FLAT)}, position.y));
      p = from + (vec2(position.x, position.y * ${f(RING_FLAT)}) * r + normal * position.z * ${f(RING_WIDTH)}) * live;
      alpha = ${f(RING_ALPHA)} * (1.0 - smoothstep(0.0, ${f(SPRAY_SECONDS)}, age));
    }
    p.x *= uDir[who];

    // Across the view along world x, which is the screen's horizontal
    vec3 local = uBase[who] + vec3(p * ${f(LENGTH)}, 0.0);
    vec4 mv = modelViewMatrix * vec4(local, 1.0);
    if (aSpray.x > 1.5) mv.xyz *= ${f(RING_PULL)};
    vColor = vec4(color, alpha);
    vHeight = height;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying vec4 vColor;
  varying float vHeight;
  void main() {
    // Cut at the water line, softened over a pixel
    float above = vHeight / max(fwidth(vHeight), 1e-6);
    if (above < 0.0) discard;
    gl_FragColor = vec4(vColor.rgb, vColor.a * uOpacity * min(above, 1.0));
  }
`;

const buildGeometry = () => {
  const position = [];
  const spray = [];
  const whose = [];
  const index = [];
  const random = createRandom(SEED);
  // The farthest first, so wherever two might overlap the nearer one is
  // drawn over it, and a leap of two draws the last two
  for (let who = MOST - 1; who >= 0; who--) {
    const vertex = (x, y, z, kind = 0, splash = 0, vx = 0, vy = 0) => {
      position.push(x, y, z);
      spray.push(kind, splash, vx, vy);
      whose.push(who);
      return position.length / 3 - 1;
    };

    // Body: a strip down the profile, two points a row
    const rows = BODY.map(([s, top, bottom]) => [vertex(-s, top, 0), vertex(-s, bottom, 0)]);
    for (let i = 0; i < rows.length - 1; i++) {
      const [a, b] = rows[i];
      const [c, d] = rows[i + 1];
      index.push(a, b, c, b, d, c);
    }
    // Fins, sharing their roots with the body so nothing overlaps
    for (const { root, outline } of FINS) {
      const roots = root.map(([row, side]) => rows[row][side]);
      const ids = [roots[0], ...outline.map(([s, y]) => vertex(-s, y, 0)), ...roots.slice(1).reverse()];
      const contour = ids.map((id) => new THREE.Vector2(position[id * 3], position[id * 3 + 1]));
      for (const face of THREE.ShapeUtils.triangulateShape(contour, [])) index.push(...face.map((k) => ids[k]));
    }

    SPRAY.forEach(({ drops, vx, vy }, splash) => {
      // Droplets: a small triangle each, turned at random
      for (let i = 0; i < drops; i++) {
        const velocity = [lerp(vx, random()), lerp(vy, random())];
        const delay = lerp(DROP_DELAY, random());
        const size = lerp(DROP_SIZE, random());
        const turn = random() * Math.PI;
        for (let k = 0; k < 3; k++) {
          const a = turn + (k * 2 * Math.PI) / 3;
          index.push(vertex(Math.cos(a) * size, Math.sin(a) * size, delay, 1, splash, ...velocity));
        }
      }
      // Ring: both edges of the line at each step round it
      const ring = [];
      for (let k = 0; k < RING_SEGMENTS; k++) {
        const a = (k / RING_SEGMENTS) * Math.PI * 2;
        ring.push([-1, 1].map((edge) => vertex(Math.cos(a), Math.sin(a), edge, 2, splash)));
      }
      ring.forEach(([a, b], k) => {
        const [c, d] = ring[(k + 1) % RING_SEGMENTS];
        index.push(a, b, c, b, d, c);
      });
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("aSpray", new THREE.Float32BufferAttribute(spray, 4));
  geometry.setAttribute("aWho", new THREE.Float32BufferAttribute(whose, 1));
  geometry.setIndex(index);
  return geometry;
};

const createDolphins = () => {
  const each = (value) => ({ value: Array.from({ length: MOST }, value) });
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uHead: each(() => 0),
      uDir: each(() => 1),
      uFlick: each(() => 0),
      uSpray: each(() => new THREE.Vector2(-1, -1)),
      uBase: each(() => new THREE.Vector3()),
      uHaze: each(() => NEAR_HAZE),
      uArc: { value: SPOT.desktop.arc },
      uExit: { value: EXIT_ANGLE[0] },
      uOpacity: { value: 1 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    // A dolphin leaping left is mirrored, its triangles turned round
    side: THREE.DoubleSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(buildGeometry(), material);
  mesh.layers.set(LAYER);
  // After the sea (renderOrder 1), over it
  mesh.renderOrder = 2;
  // Placed by the shader: no bounding volume applies
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
};

// A formation's layout on an arc of radius `arc` meeting the water at `exit`,
// in the nearest one's body lengths along the way they leap: each dolphin's
// arc middle, and the whole formation's extent (its beaks, fins and flukes
// where they meet the water)
const layout = (dolphins, arc, exit) => {
  const half = arc * Math.sin(exit);
  const at = dolphins.map(({ far, behind = 0, facing }) => (facing ? half + GAP + half / far : -behind));
  const ends = dolphins.map(({ far }, i) => [at[i] - (half + OVERHANG) / far, at[i] + (half + OVERHANG) / far]);
  return { at, lo: Math.min(...ends.map(([lo]) => lo)), hi: Math.max(...ends.map(([, hi]) => hi)) };
};

// A leap's formation on the band: the nearest one's size (as it drew between
// the spot's sizes, or smaller if the band has no room for that), its body
// length and the formation's width in screen widths, and where its left end
// sits (as far along the band as it drew)
const fit = (spot, { lo, hi, grow, slide }, aspect) => {
  const room = spot.band[1] - spot.band[0];
  // Screen widths per nearest body length, per unit of size
  const unit = Math.min(1, aspect) / aspect;
  const size = Math.min(lerp(spot.size, grow), room / ((hi - lo) * unit));
  const length = size * unit;
  const width = (hi - lo) * length;
  return { size, length, width, left: spot.band[0] + slide * (room - width) };
};

// A random point of [a, b] at least `gap` from `last`, or, if there is none,
// the end of it farthest from `last`
const awayFrom = (a, b, last, gap) => {
  const below = Math.max(0, Math.min(b, last - gap) - a);
  const above = Math.max(0, b - Math.max(a, last + gap));
  if (below + above <= 0) return Math.abs(a - last) > Math.abs(b - last) ? a : b;
  const u = Math.random() * (below + above);
  return u < below ? a + u : b - (u - below);
};

// A leap starting at `start` (s), after the `last` one: in a formation other
// than the last one's that fits the band (at the spot's smallest size, on the
// highest leap), the arc and pace its dolphins share (one height, so their
// arcs mirror or follow each other), and when (seconds into a dolphin's leap)
// its balance point is in the air, its beak goes back in, its flukes clear
// the water, and its last spray is gone; then each dolphin's place, way and
// start, which way the nearest leaps, and how large and where along the band
// the formation sits: somewhere else than the last one
const createLeap = (start, spot, aspect, last) => {
  const unit = Math.min(1, aspect) / aspect;
  const room = spot.band[1] - spot.band[0];
  const names = Object.keys(FORMATIONS).filter((name) => name !== last?.name);
  const fits = names.filter((name) => {
    const { lo, hi } = layout(FORMATIONS[name], spot.arc, EXIT_ANGLE[1]);
    return (hi - lo) * spot.size[0] * unit <= room;
  });
  const pool = fits.length ? fits : names;
  const name = pool[Math.floor(Math.random() * pool.length)];
  const dolphins = FORMATIONS[name];

  const height = Math.random();
  const arc = spot.arc;
  const exit = lerp(EXIT_ANGLE, height);
  const duration = lerp(LEAP_SECONDS, height);
  const sin = Math.sin(exit);
  const cos = Math.cos(exit);
  // Across the screen, body lengths per second
  const pace = (TAIL * cos + 2 * arc * sin) / duration;
  const up = (BALANCE * cos) / pace;
  const down = up + (2 * arc * sin) / pace;
  // When the balance point is at arc angle a, on the arc
  const at = (a) => up + ((down - up) * (Math.sin(a) / sin + 1)) / 2;
  const entry = at(exit - BALANCE / arc);

  // Each one behind a moment after the one before it, the facing one within
  // a moment of the nearest, either first
  const delays = [];
  dolphins.forEach(({ facing }, i) => {
    if (i === 0) delays.push(0);
    else if (facing) delays.push((Math.random() * 2 - 1) * FACING_STAGGER);
    else delays.push(delays[i - 1] + lerp(BEHIND_STAGGER, Math.random()));
  });
  const first = Math.min(...delays);
  const formation = layout(dolphins, arc, exit);
  // Its middle at least MOVE of the band from the last leap's, or as far from
  // it as the band leaves room for, and if that is still near it, the other
  // way round from the last one
  const grow = Math.random();
  const { width } = fit(spot, { ...formation, grow, slide: 0 }, aspect);
  const from = spot.band[0] + width / 2;
  const free = room - width;
  const middle = last ? awayFrom(from, from + free, last.middle, MOVE * room) : from + Math.random() * free;
  let dir = Math.random() < 0.5 ? -1 : 1;
  if (last && Math.abs(middle - last.middle) < (MOVE * room) / 2) dir = -last.dir;
  return {
    start,
    name,
    arc,
    exit,
    pace,
    up,
    down,
    entry,
    flick: at((TAIL - BALANCE) / arc - exit),
    dolphins: dolphins.map(({ far, facing }, i) => ({
      far,
      at: formation.at[i],
      dir: facing ? -dir : dir,
      delay: delays[i] - first,
    })),
    lo: formation.lo,
    hi: formation.hi,
    // The nearest one's way: 1 right, -1 left
    dir,
    end: Math.max(...delays) - first + Math.max(duration, entry + DROP_DELAY[1] + SPRAY_SECONDS),
    // How large, between the spot's sizes, how far along the band, and its
    // middle there (screen fraction)
    grow,
    slide: free > 0 ? (middle - from) / free : 0.5,
    middle,
  };
};

// The beak's arc angle t seconds into the leap
const headAngle = ({ arc, exit, pace, up, down }, t) => {
  // Under the water it runs straight on: radians of the arc per second
  const turn = pace / (arc * Math.cos(exit));
  let balance;
  if (t < up) balance = -exit - (up - t) * turn;
  else if (t > down) balance = exit + (t - down) * turn;
  else balance = Math.asin(Math.sin(exit) * ((2 * (t - up)) / (down - up) - 1));
  return balance + BALANCE / arc;
};

// The flukes' bend t seconds into the flick: up, then down, easing in and out
const flickAngle = (t) =>
  t > 0 && t < FLICK_SECONDS ? FLICK * Math.sin((2 * Math.PI * t) / FLICK_SECONDS) * Math.sin((Math.PI * t) / FLICK_SECONDS) : 0;

// The leap's place, in Home floor coordinates: each dolphin's arc middle on
// the water, the formation fitted to the band, mirrored when the nearest
// leaps left.
const place = (uniforms, spot, leap, aspect, halfTan) => {
  const { dolphins, lo, hi, dir } = leap;
  const { size, length, left } = fit(spot, leap, aspect);
  // The nearest one as far away as makes its body `size` of the screen's
  // shorter side
  const nearest = LENGTH / (2 * halfTan * size * Math.min(1, aspect));
  dolphins.forEach(({ far, at }, i) => {
    const x = left + (dir > 0 ? at - lo : hi - at) * length;
    const depth = nearest * far;
    uniforms.uBase.value[i].set((x - 0.5) * 2 * halfTan * aspect * depth, 0, CAMERA_Z - depth);
  });
};

function Leaps() {
  const { isMobile } = useMobile();
  const get = useThree((state) => state.get);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const mesh = useMemo(createDolphins, []);
  const scroll = useScroll();
  const ready = useRef(false);
  // Seconds since they were ready, when the next leap starts, the current
  // leap, and the last one made, whose formation, place and way the next one
  // avoids (kept through a hot update)
  const time = useRef(0);
  const next = useRef(0);
  const leap = useRef(null);
  const last = useRef(null);
  const aspect = size.width / size.height;
  const spot = SPOT[layoutOf(isMobile, aspect)];
  const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

  // Placed again when the viewport changes, mid-leap too
  useLayoutEffect(() => {
    if (leap.current) place(mesh.material.uniforms, spot, leap.current, aspect, halfTan);
  }, [mesh, spot, aspect, halfTan]);

  useEffect(() => {
    let live = true;
    // From the start, as on the first mount: a hot update (Fast Refresh)
    // builds a new mesh but keeps the refs, and a clock that ran on would
    // fire every leap it had missed
    ready.current = false;
    time.current = 0;
    next.current = 0;
    leap.current = null;
    const { gl, scene } = get();
    camera.layers.enable(LAYER);
    // Compiled off the main thread while hidden (see BeachDecor for why not
    // lib/prewarm)
    gl.compileAsync(mesh, camera, scene)
      .catch(() => {})
      .then(() => {
        if (!live) return;
        // The first leap FIRST_LEAP after the scene appeared, or at once if
        // they are ready later than that; after a hot update that follows a
        // leap, FIRST_LEAP after the recompile
        const shown = performance.getEntriesByName("scene-visible")[0];
        const since = shown && !last.current ? (performance.now() - shown.startTime) / 1000 : 0;
        next.current = Math.max(0, FIRST_LEAP - since);
        ready.current = true;
      });
    return () => {
      live = false;
      camera.layers.disable(LAYER);
      mesh.geometry.dispose();
      mesh.material.dispose();
    };
  }, [mesh, camera, get]);

  useFrame((_, delta) => {
    if (!ready.current) return;
    const { uniforms } = mesh.material;
    // A long frame (a background tab) does not skip a leap's frames
    time.current += Math.min(delta, 0.1);
    if (time.current >= next.current) {
      leap.current = createLeap(next.current, spot, aspect, last.current);
      last.current = leap.current;
      next.current += Math.max(lerp(LEAP_EVERY, Math.random()), leap.current.end);
      const { arc, exit, dolphins } = leap.current;
      uniforms.uArc.value = arc;
      uniforms.uExit.value = exit;
      dolphins.forEach(({ far, dir }, i) => {
        uniforms.uDir.value[i] = dir;
        uniforms.uHaze.value[i] = NEAR_HAZE + (far - 1) * HAZE_FAR;
      });
      // The nearest ones' part of the geometry, which holds the farthest first
      const each = mesh.geometry.index.count / MOST;
      mesh.geometry.setDrawRange((MOST - dolphins.length) * each, dolphins.length * each);
      place(uniforms, spot, leap.current, aspect, halfTan);
    }
    const current = leap.current;
    const t = current ? time.current - current.start : 0;
    // How far the visitor has scrolled from Home toward Skills
    const leave = THREE.MathUtils.smoothstep(scroll.offset * (scroll.pages - 1), LEAVE_START, LEAVE_END);
    mesh.visible = current !== null && t < current.end && leave < 1;
    if (!mesh.visible) return;
    uniforms.uOpacity.value = 1 - leave;
    // Each one's own seconds into its leap
    current.dolphins.forEach(({ delay }, i) => {
      const own = t - delay;
      uniforms.uHead.value[i] = headAngle(current, own);
      uniforms.uFlick.value[i] = flickAngle(own - current.flick);
      uniforms.uSpray.value[i].set(own, own - current.entry);
    });
    // Hold the floor's level while the section group drops away or rises
    mesh.position.y = -mesh.parent.position.y;
  });

  return <primitive object={mesh} />;
}

export default function Dolphin() {
  const { prefersReducedMotion } = useMobile();
  // Reduced motion: no leaps
  return prefersReducedMotion ? null : <Leaps />;
}
