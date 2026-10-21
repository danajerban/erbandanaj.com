import { CatmullRomCurve3, Vector3 } from "three";
import { byAspect } from "./aspectRows.js";
import { layoutOf } from "./coast.js";
import { createRandom } from "./lowPoly.js";

// The night park on Contact: every layout number in one place, so tuning the
// composition means editing this file only. Contact-local units: x right,
// y up from the floor, z toward the camera; the avatar stands at the origin
// (desktop) or at z −1 (phones). Pure data and helpers (three core and
// the pure lib modules only), so node can import it: scripts/check-park-layout.mjs runs
// the overlap check on these numbers, and the moon gate is checked against
// the same table outside the repo.

// The layout key: Home's composition by the screen's shape (aspect rounded to
// 0.01, as HomeSection reads it), and an upright screen past the breakpoint
// (an iPad Pro held upright) is "tall" — the same keys as the moon's (timeOfDay).
export const parkLayoutOf = (isMobile, aspect) => {
  const layout = layoutOf(isMobile, Math.round(aspect * 100) / 100);
  return !isMobile && layout === "portrait" ? "tall" : layout;
};

// Details whose smallest side drops under 3 CSS px on a phone are left out
// or thickened there: composition, not MOBILE_PERF. fine: the door knobs
// and the café door's handle are built, and the flower-box blooms stay small
// (false: no knobs or handle, bigger blooms).
const DETAIL_FULL = { railing: "bars", chalkStrokes: true, windowPlants: true, fine: true, catEyeScale: 1 };
const DETAIL_PHONE = { railing: "band", chalkStrokes: false, windowPlants: false, fine: false, catEyeScale: 2 };

// Per layout:
// - row: the house row's left end x, its facade plane z and its scale; the
//   H3/H4 party wall sits within ±0.25 of the avatar's axis.
// - path: [x, z] points of the gravel path (pathCurve), from the bottom of
//   the screen to the café door at row.z + CAFE_PATH_END; pathW its width.
// - lamps: [x, z] lamp posts; cafeLamp hangs the café string lights,
//   pondLamp throws the warm streak on the pond (null: none); lampR is the
//   reach of a lamp's pool and of its warmth on faces (nightShade).
// - pond: ellipse {x, z, rx, rz}; rimStones one per 0.46 of rim.
// - trees: [x, z, size]; beds: [x, z, rx, rz] ellipses.
// - groundFront: the lawn's front edge z; groundLeftExtra: more lawn on the
//   left on phones, where the section slides in (7 × DISSOLVE_END).
// - groundGrid [cols, rows], fireflies, crownLumps, bedFlowersMax: the
//   phone values are MOBILE_PERF degradations (tagged where they are read).
// - balloonString: the balloon strings' length scale.
// - bench2: the second bench [x, z, yaw] (yaw as BENCH's: −π/2 faces the
//   camera); dog: where the sleeping dog lies, [dx, dz, yaw] from the first
//   bench's place (benchAt), so it stays by that bench at any width.
// - pondRocks: [angle, size] boulders just outside the pond's rim (angle as
//   the rim stones': +π/2 is the near rim, −π/2 the back).
// - tufts: grass tufts scattered over the visible lawn (lawnTufts).
export const PARK = {
  desktop: {
    row: { x: -3.7, z: -11, scale: 0.9 },
    path: [[0, 3], [0, 0.6], [0.35, -2.6], [1.15, -6], [1.84, -9.7]],
    pathW: 0.8,
    lamps: [[-4.4, -3.8], [2.75, -4.5], [3.95, -9.0]],
    cafeLamp: 2,
    pondLamp: 1,
    lampR: 1.8,
    pond: { x: 5.0, z: -5.2, rx: 2.1, rz: 1.0 },
    rimStones: 22,
    duckScale: 1,
    trees: [[-6.6, -6.8, 1.15], [5.9, -10.0, 0.75], [9.4, -8.8, 1.1]],
    beds: [[-4.8, -1.9, 0.8, 0.45], [2.55, -6.6, 0.6, 0.36], [-2.6, -8.6, 0.9, 0.42]],
    groundFront: 2.5,
    groundLeftExtra: 0,
    groundGrid: [64, 48],
    fireflies: 40,
    crownLumps: 3,
    bedFlowersMax: 40,
    balloonString: 1,
    bench2: [5.3, -7.1, -Math.PI / 2],
    dog: [0.12, 0.12, Math.PI / 4],
    pondRocks: [[-2.2, 0.26], [-0.75, 0.26], [-0.45, 0.18], [3.3, 0.18]],
    tufts: 340,
    detail: DETAIL_FULL,
  },
  tall: {
    row: { x: -3.6, z: -12, scale: 0.8 },
    path: [[0, 3], [0, 0.6], [0.3, -2.6], [0.9, -6.5], [1.33, -10.7]],
    pathW: 0.8,
    lamps: [[-2.7, -4.6], [3.15, -7.1], [3.3, -10.0]],
    cafeLamp: 2,
    pondLamp: 1,
    lampR: 1.8,
    pond: { x: 2.75, z: -6.2, rx: 1.25, rz: 0.6 },
    rimStones: 13,
    duckScale: 1,
    trees: [[-3.7, -7.6, 1.0], [4.6, -9.2, 1.0]],
    beds: [[-2.6, -2.0, 0.65, 0.38], [1.85, -4.5, 0.5, 0.28]],
    groundFront: 2.5,
    groundLeftExtra: 0,
    groundGrid: [64, 48],
    fireflies: 40,
    crownLumps: 3,
    bedFlowersMax: 40,
    balloonString: 1,
    bench2: [-1.55, -8.7, -0.4 * Math.PI],
    dog: [0.12, 0.12, Math.PI / 4],
    pondRocks: [[-1.9, 0.2], [-1.6, 0.14], [-0.5, 0.16]],
    tufts: 240,
    detail: DETAIL_FULL,
  },
  portrait: {
    row: { x: -3.4, z: -10.5, scale: 0.8 },
    path: [[0, 6.5], [0, 0], [0.1, -3], [0.2, -6.0], [1.53, -9.2]],
    pathW: 0.6,
    lamps: [[-1.85, -4.4], [1.0, -6.7], [2.7, -8.6]],
    cafeLamp: 2,
    pondLamp: 1,
    lampR: 1.5,
    pond: { x: 1.8, z: -5.6, rx: 1.1, rz: 0.75 },
    rimStones: 13,
    duckScale: 1.25,
    trees: [[-2.95, -7.2, 1.0], [3.7, -9.9, 0.9]],
    beds: [[-1.6, -1.4, 0.5, 0.3], [-1.1, -6.0, 0.5, 0.28]],
    groundFront: 6.5,
    groundLeftExtra: 3.36,
    groundGrid: [36, 28],
    fireflies: 16,
    crownLumps: 2,
    bedFlowersMax: 22,
    balloonString: 0.9,
    bench2: [2.3, -7.7, -0.6 * Math.PI],
    dog: [0.12, 0.12, Math.PI / 4],
    pondRocks: [[-1.2, 0.2], [-0.6, 0.16]],
    tufts: 260,
    detail: DETAIL_PHONE,
  },
  landscape: {
    row: { x: -3.2, z: -8.5, scale: 0.75 },
    path: [[0, 6.5], [0, 0], [0.3, -3], [1.0, -5.6], [1.42, -7.2]],
    pathW: 0.6,
    lamps: [[-4.6, -3.2], [4.3, -3.4], [3.4, -7.4]],
    cafeLamp: 2,
    pondLamp: null,
    lampR: 1.5,
    pond: { x: 7.2, z: -4.2, rx: 2.2, rz: 0.9 },
    rimStones: 22,
    duckScale: 1,
    trees: [[-7.6, -5.6, 1.2], [12.0, -6.35, 1.2]],
    beds: [[-2.6, 4.2, 0.8, 0.25], [2.8, 4.4, 0.8, 0.25], [-5.0, -2.4, 0.8, 0.4]],
    groundFront: 6.5,
    groundLeftExtra: 3.36,
    groundGrid: [36, 28],
    fireflies: 16,
    crownLumps: 2,
    bedFlowersMax: 22,
    balloonString: 0.9,
    bench2: [2.6, -5.6, -0.6 * Math.PI],
    dog: [0.12, 0.12, Math.PI / 4],
    pondRocks: [[-2.5, 0.3], [-2.0, 0.2], [-0.7, 0.26]],
    tufts: 260,
    detail: DETAIL_PHONE,
  },
};

// The house row, left to right (unit sizes at scale 1: multiply by
// row.scale). Shared rules in HOUSE; per house: W, floors (the café's
// ground floor counts), eave and top heights, the roof, the door (x as a
// fraction of W, colour), the day facade and roof colours (facades go
// through nightShade), and its specials.
export const HOUSE = {
  depth: 1.2, // facade at row.z, 1.2 back
  plinth: 0.12, // plinth height (facade × 0.7)
  groundTop: 1.27, // upper floor k (1, 2) spans groundTop + (k − 1) .. + 1
  cornice: { height: 0.06, out: 0.05 },
  trim: "#efe6dc",
  window: { w: 0.3, h: 0.48, trim: 0.03, sill: 0.04 },
  windowY: [0.72, 1.82, 2.82], // centre y: ground, first and second upper floor
  windowX: [0.27, 0.73], // centre x, fractions of W
  door: { w: 0.42, h: 0.85, y: 0.12 },
  transom: { w: 0.42, y0: 0.97, y1: 1.11, glow: 0.6, color: "#ffd27a" },
  lit: ["#ffd27a", "#ffc56a", "#ffe0a0"],
  unlit: "#283052",
  glint: "#3b4772",
  // Any window whose centre has |x| below this is unlit (behind the avatar)
  unlitAxis: 0.45,
};

// Window (house h 0..4, floor f, column c) is lit about 60 % of the time
export const isLit = (h, f, c) => (h * 2 + f * 3 + c) % 5 !== 0 && (h + f + c) % 4 !== 1;

export const HOUSES = [
  {
    name: "rose",
    W: 1.45,
    floors: 3,
    eave: 3.5,
    top: 4.5,
    roof: "frontGable", // a triangle on the facade from the eave corners to the apex at 0.5 W
    door: { at: 0.27, color: "#2f5d50" },
    day: "#e8a5a0",
    roofColor: "#5b4a63",
    gableWindow: { w: 0.24, h: 0.36, above: 0.38 }, // at (0.5 W, eave + above)
    flowerBox: true,
  },
  {
    name: "sage",
    W: 1.3,
    floors: 3,
    eave: 3.9,
    top: 4.7,
    roof: "sideGable", // from the eave at the facade to the ridge; both side gables built
    ridge: { y: 4.7, z: -0.6 },
    overhang: 0.08,
    door: { at: 0.73, color: "#8a3b3b" },
    day: "#9fcdb5",
    roofColor: "#4e5a6b",
    dormer: { at: 0.5, w: 0.42, cheek: 0.42, cap: 0.15, z: -0.15, window: [0.24, 0.3] },
    cat: { at: 0.3, height: 0.32 }, // sits on the ridge
  },
  {
    name: "butter",
    W: 1.55,
    floors: 2, // plus the attic
    eave: 3.1,
    top: 4.3,
    roof: "neckGable", // the facade rises as a neck, then a triangle; a side-gable roof behind
    neck: { from: 0.2, to: 0.8, y: 3.8 },
    ridge: { y: 4.0, z: -0.6 },
    door: { at: 0.27, color: "#2f4a6b" },
    day: "#f0d48e",
    roofColor: "#6b4f4a",
    atticWindow: { r: 0.15, segments: 8, y: 3.55 }, // at 0.5 W
    chimney: { at: 0.8, z: -0.5, size: 0.18, top: 4.5, cap: [0.24, 0.04] },
    flowerBox: true,
  },
  {
    name: "powder",
    W: 1.4,
    floors: 3,
    eave: 3.7,
    top: 4.6,
    roof: "frontGable",
    door: { at: 0.73, color: "#3a2c2c" },
    day: "#9cb8de",
    roofColor: "#4a4f6b",
    gableWindow: { w: 0.24, h: 0.36, above: 0.38 },
    // The story window: first upper floor, right window; off and on now and then
    storyWindow: { floor: 1, column: 1 },
    flowerBox: true,
  },
  {
    name: "cafe",
    W: 2.3,
    floors: 2, // the café and one upper floor
    eave: 3.0,
    top: 3.8,
    roof: "hip", // a front trapezoid and two side triangles rising to a ridge
    hip: { rise: 0.8, ridge: [0.3, 0.7], z: -0.6 },
    door: { at: 0.2, glass: true },
    // From x[0] to x[1] W, sloping from top on the facade to its scallops
    // at low, depth out (the string lights hang from its left front corner)
    awning: { x: [0.05, 0.95], top: 1.55, low: 1.37, depth: 0.6 },
    day: "#f2b48f",
    roofColor: "#5c4448",
    upperWindowX: [0.2, 0.5, 0.8],
    sideWindow: { z: -0.6, y: 1.82 }, // one lit window on the right side
  },
];

// Flower boxes under the first-upper-floor windows of H1, H3, H4
export const FLOWER_BOX = { w: 0.38, h: 0.08, d: 0.1, color: "#5a3d33", blooms: 5 };

const CAFE = HOUSES.length - 1;

// Each house's span, scaled: [{ x0, x1, eave, top }]
export const houseSpans = (park) => {
  const { x, scale } = park.row;
  let x0 = x;
  return HOUSES.map(({ W, eave, top }) => {
    const span = { x0, x1: x0 + W * scale, eave: eave * scale, top: top * scale };
    x0 = span.x1;
    return span;
  });
};

const cafeX = (park, fraction) => houseSpans(park)[CAFE].x0 + fraction * HOUSES[CAFE].W * park.row.scale;

// The café's door: [x, z] on its facade; the path ends CAFE_PATH_END in front of it
export const cafeDoor = (park) => [cafeX(park, HOUSES[CAFE].door.at), park.row.z];
export const CAFE_PATH_END = 1.3;

// The café's big window centre: [x, y, z], just in front of its facade
export const cafeWindow = (park) => [cafeX(park, 0.64), 0.72 * park.row.scale, park.row.z + 0.02];

// The two terrace tables on the sidewalk: [[x, z], [x, z]]
export const cafeTables = (park) => [0.55, 0.85].map((f) => [cafeX(park, f), park.row.z + 0.8]);

// The chimney's top (H3), where the smoke starts: [x, y, z]
export const chimneyTop = (park) => {
  const s = park.row.scale;
  const { at, top, z } = HOUSES[2].chimney;
  return [houseSpans(park)[2].x0 + at * HOUSES[2].W * s, top * s, park.row.z + z * s];
};

// The lamp posts' lanterns: [x, y, z][]
export const LANTERN_Y = 2.35;
export const lanterns = (park) => park.lamps.map(([x, z]) => [x, LANTERN_Y, z]);

// The café string lights: from the awning's left front corner to the café
// lamp's crossbar, sagging 0.3 in the middle; bulbs evenly spaced along it.
// point(u) gives the wire at u in 0..1; each bulb (ParkLamps, its halo in
// ParkSparkles) hangs CAFE_BULB_R under it.
const CAFE_LIGHTS_SAG = 0.3;
export const CAFE_BULB_R = 0.03;
export const cafeLights = (park) => {
  const s = park.row.scale;
  const [lx, lz] = park.lamps[park.cafeLamp];
  const { x, low, depth } = HOUSES[CAFE].awning;
  const from = [cafeX(park, x[0]), low * s, park.row.z + depth * s];
  const to = [lx, 2.05, lz];
  const point = (u) => [
    from[0] + (to[0] - from[0]) * u,
    from[1] + (to[1] - from[1]) * u - CAFE_LIGHTS_SAG * 4 * u * (1 - u),
    from[2] + (to[2] - from[2]) * u,
  ];
  const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const count = Math.max(6, Math.round(length / 0.24));
  const bulbs = Array.from({ length: count }, (_, i) => point((i + 0.5) / count));
  return { point, bulbs };
};

// The gravel path through its points at y 0 (centripetal Catmull-Rom); the
// ground and the overlap check sample the same curve
export const pathCurve = (park) => new CatmullRomCurve3(park.path.map(([x, z]) => new Vector3(x, 0, z)));

const isPhone = (layout) => layout === "portrait" || layout === "landscape";

// The CONTACT title (ContactSection, SectionTitle): the left end of its
// baseline [x, y, z] and its scale, turned TITLE_TURN toward the camera; at
// scale 1 it runs 1.84 to the right and 1.06 back.
// - Desktop and upright screens past the breakpoint, by the screen's shape
//   alone (so it frames the same at any size): [aspect, x, z, scale] rows.
//   Its right end stays left of the avatar's legs, its left end on screen;
//   where the screen is too narrow for both, it steps back and shrinks.
// - Phones: on the lawn in front of the avatar's feet. The contact card is
//   fixed in CSS px, so on a short screen (a canvas under skyBelow CSS px
//   tall: upright, the iPhone SE and 16:9 Android phones; a mini and
//   taller keep the lawn) it covers his feet and that lawn: there the
//   title floats in the sky above the houses, clear of the menu and the
//   moon.
export const TITLE_TURN = Math.PI / 6;
const TITLE_DESKTOP = [
  [0.75, -1.52, -0.5, 0.55],
  [1, -1.92, -0.5, 0.75],
  [1.33, -2.45, 0, 1],
  [1.45, -2.35, 0.5, 1],
];
const TITLE_PHONE = {
  portrait: { lawn: [-1.1, 0, 0.5], sky: [-1.6, 2.9, -2], skyBelow: 680 },
  landscape: { lawn: [-1.1, 0, 0.5], sky: [-3.5, 2.3, -1], skyBelow: 380 },
};
export const titleInSky = (layout, height) => isPhone(layout) && height < TITLE_PHONE[layout].skyBelow;
export const titleAt = (layout, aspect, inSky) => {
  if (isPhone(layout)) return { position: TITLE_PHONE[layout][inSky ? "sky" : "lawn"], scale: 1 };
  const [x, z, scale] = byAspect(TITLE_DESKTOP, aspect);
  return { position: [x, 0, z], scale };
};

// The first bench (ParkProps, Park Bench.glb): its x in a group at
// benchShift, z, yaw (its seat faces raw +x: −π/4 turns it toward the path
// and the camera) and scale; the second bench (PARK[key].bench2) shares the
// scale. BENCH_HALF: a bench's footprint half-extents at that scale (Park
// Bench.glb raw x −0.82..1.02, z ±1.56), along its seat and across it.
export const BENCH = { x: -0.5, z: -2.5, yaw: -Math.PI / 4, scale: 0.5 };
export const BENCH_HALF = { along: 0.78, across: 0.46 };
// The group's x, by aspect ([aspect, x] rows): where it stood at 1280×800
// and 1800×987, further left on wider screens, nearer the avatar on narrower
// ones (whole on screen, its balloons clear of the logo). Phones: per layout.
const BENCH_SHIFT = [[0.75, -0.75], [1.33, -0.9], [1.6, -1.333], [1.82, -1.875], [2.4, -2.6]];
const BENCH_SHIFT_PHONE = { portrait: -0.41, landscape: -0.89 };
export const benchShift = (layout, aspect) =>
  isPhone(layout) ? BENCH_SHIFT_PHONE[layout] : byAspect(BENCH_SHIFT, aspect)[0];
const benchAt = (layout, aspect) => [benchShift(layout, aspect) + BENCH.x, BENCH.z, BENCH.yaw];
// Both benches as [x, z, yaw]
export const benches = (park, layout, aspect) => [benchAt(layout, aspect), park.bench2];

// The sleeping dog: [x, z, yaw]; DOG_R its footprint radius
export const DOG_R = 0.3;
export const dogAt = (park, layout, aspect) => {
  const [bx, bz] = benchAt(layout, aspect);
  const [dx, dz, yaw] = park.dog;
  return [bx + dx, bz + dz, yaw];
};

// The mailbox's foot [x, z] (ParkProps) and the avatar's [x, z] by layout
export const MAILBOX_AT = [1, 0.5];
export const avatarAt = (layout) => [0, isPhone(layout) ? -1 : 0];

// The railing along the sidewalk stands this far in front of the facades
export const RAILING_FRONT = 1.55;

// The camera at Contact rest, Contact-local: the eye REST_EYE_Y above the
// floor at restEyeZ (the camera's z 5 in SceneCanvas; on phones the section
// sits PHONE_SECTION_Z back, ContactSection), looking at the point 1 above
// the floor 5 ahead; fov 42. project([x, y, z]) gives [fx, fy], the screen
// fractions (0..1 from the top left).
export const PHONE_SECTION_Z = -4;
export const REST_EYE_Y = 1.5;
export const restEyeZ = (layout) => 5 - (isPhone(layout) ? PHONE_SECTION_Z : 0);
export const REST_HALF_FOV_TAN = Math.tan((21 * Math.PI) / 180);
const REST_LOOK = Math.hypot(0.5, 5);
export const restProjector = (layout, aspect) => {
  const ez = restEyeZ(layout);
  const [fy, fz] = [-0.5 / REST_LOOK, -5 / REST_LOOK];
  const [uy, uz] = [5 / REST_LOOK, -0.5 / REST_LOOK];
  return ([x, y, z]) => {
    const [dy, dz] = [y - REST_EYE_Y, z - ez];
    const depth = dy * fy + dz * fz;
    const up = dy * uy + dz * uz;
    return [(x / (depth * REST_HALF_FOV_TAN * aspect) + 1) / 2, (1 - up / (depth * REST_HALF_FOV_TAN)) / 2];
  };
};

// Desktop: the contact card sits on the lawn at the lower right; nothing
// new and opaque goes there (screen fractions)
export const CARD_ZONE = { x: 0.7, y: 0.6 };
export const inCardZone = (layout, [fx, fy]) => layout === "desktop" && fx > CARD_ZONE.x && fy > CARD_ZONE.y;

// Signed clearance of [x, z] from an ellipse [cx, cz, rx, rz] grown by g
// (approximate; > 0 outside)
export const ellipseClear = ([x, z], [cx, cz, rx, rz], g) =>
  (Math.hypot((x - cx) / (rx + g), (z - cz) / (rz + g)) - 1) * Math.min(rx + g, rz + g);
// Signed clearance of [x, z] from a bench's footprint grown by g (> 0 outside)
export const benchClear = ([x, z], [bx, bz, yaw], g) => {
  const [dx, dz] = [x - bx, z - bz];
  // The bench's raw +x (across) and +z (along) after its yaw
  const across = Math.abs(dx * Math.cos(yaw) - dz * Math.sin(yaw)) - BENCH_HALF.across - g;
  const along = Math.abs(dx * Math.sin(yaw) + dz * Math.cos(yaw)) - BENCH_HALF.along - g;
  return across > 0 && along > 0 ? Math.hypot(across, along) : Math.max(across, along);
};

// Points along the path's middle, every ~0.1 (the tufts keep clear of them)
const pathSamples = (park) => pathCurve(park).getSpacedPoints(200).map((p) => [p.x, p.z]);
const pathClear = (samples, [x, z], half) => Math.min(...samples.map(([px, pz]) => Math.hypot(x - px, z - pz))) - half;

// The boulders by the pond: [x, z, size]
export const pondRocks = (park) => {
  const { x, z, rx, rz } = park.pond;
  return park.pondRocks.map(([a, size]) => [x + (rx + 0.1 + size) * Math.cos(a), z + (rz + 0.1 + size) * Math.sin(a), size]);
};

// The pebble edge either side of the path, from the screen's bottom to the
// railing: [x, z, size, seed]; a pebble a lamp post, bed or the pond would
// stand on is left out
const PEBBLES = { step: 0.16, out: 0.04, skip: 0.25, min: 0.035, max: 0.065 };
export const pathPebbles = (park) => {
  const random = createRandom(7);
  const curve = pathCurve(park);
  const count = Math.round(curve.getLength() / PEBBLES.step);
  const end = park.row.z + RAILING_FRONT + 0.25;
  const pebbles = [];
  const point = new Vector3();
  const tangent = new Vector3();
  for (let i = 0; i <= count; i++) {
    const u = (i + 0.4 * random()) / count;
    curve.getPointAt(Math.min(u, 1), point);
    curve.getTangentAt(Math.min(u, 1), tangent);
    for (const side of [-1, 1]) {
      const size = PEBBLES.min + (PEBBLES.max - PEBBLES.min) * random();
      const out = park.pathW / 2 + PEBBLES.out + size / 2 + 0.03 * random();
      const at = [point.x - side * tangent.z * out, point.z + side * tangent.x * out];
      if (random() < PEBBLES.skip || at[1] < end) continue;
      if (park.lamps.some(([lx, lz]) => Math.hypot(at[0] - lx, at[1] - lz) < 0.2)) continue;
      if (park.beds.some((bed) => ellipseClear(at, bed, 0.05) < 0)) continue;
      if (ellipseClear(at, [park.pond.x, park.pond.z, park.pond.rx, park.pond.rz], 0.1) < 0) continue;
      pebbles.push([...at, size, random()]);
    }
  }
  return pebbles;
};

// Grass tufts over the lawn, evenly spread on screen (uniform in 1 / view
// depth, like the ground's rows) between the screen's bottom and the
// railing, clear of the path and its pebbles, the pond and its rocks, the
// beds, lamp posts, tree trunks, both benches, the dog, the mailbox, the
// avatar's feet and (desktop) the contact card: [x, z, seed]
export const lawnTufts = (park, layout, aspect) => {
  const random = createRandom(11);
  const project = restProjector(layout, aspect);
  const ez = restEyeZ(layout);
  const depthOf = (z) => (0.75 + 5 * (ez - z)) / REST_LOOK;
  const [near, far] = [park.groundFront, park.row.z + RAILING_FRONT + 0.6];
  const [nearInv, farInv] = [1 / depthOf(near), 1 / depthOf(far)];
  const samples = pathSamples(park);
  const pond = [park.pond.x, park.pond.z, park.pond.rx, park.pond.rz];
  const rocks = pondRocks(park);
  const seats = benches(park, layout, aspect);
  const [dogX, dogZ] = dogAt(park, layout, aspect);
  const avatar = avatarAt(layout);
  const tufts = [];
  for (let i = 0; i < park.tufts; i++) {
    const depth = 1 / (farInv + (nearInv - farInv) * random());
    const z = ez - (depth * REST_LOOK - 0.75) / 5;
    const half = depth * REST_HALF_FOV_TAN * aspect;
    const x = (random() * 2 - 1) * half;
    const at = [x, z];
    const seed = random();
    const [fx, fy] = project([x, 0, z]);
    if (fx < -0.02 || fx > 1.02 || fy > 1.02 || inCardZone(layout, [fx, fy])) continue;
    if (pathClear(samples, at, park.pathW / 2 + 0.2) < 0) continue;
    if (ellipseClear(at, pond, 0.35) < 0 || park.beds.some((bed) => ellipseClear(at, bed, 0.15) < 0)) continue;
    if (rocks.some(([rx, rz, size]) => Math.hypot(x - rx, z - rz) < size + 0.15)) continue;
    if (park.lamps.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 0.25)) continue;
    if (park.trees.some(([tx, tz, size]) => Math.hypot(x - tx, z - tz) < 0.2 * size + 0.1)) continue;
    if (seats.some((bench) => benchClear(at, bench, 0.05) < 0)) continue;
    if (Math.hypot(x - dogX, z - dogZ) < DOG_R + 0.1) continue;
    if (Math.hypot(x - MAILBOX_AT[0], z - MAILBOX_AT[1]) < 0.3 || Math.hypot(x - avatar[0], z - avatar[1]) < 0.45) continue;
    tufts.push([x, z, seed]);
  }
  return tufts;
};
