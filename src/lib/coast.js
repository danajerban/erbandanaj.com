// Home island shoreline, shared by the sea (Sea) and the palm group on the
// beach (HomeSection, PalmTree, BeachDecor). Home-local floor coordinates:
// y = 0 is the floor, +z toward the camera; water lies where x > coastX(z),
// and nothing wet (waves washing up the sand, foam, wet-sand sheen) ever
// reaches left of dryX(z).
//
// The shore is a ⊂-shaped arc, sea on its right only: it comes in through the
// right screen edge at the bottom, bends left to its deepest point at
// COAST_DEEP_Z, then drifts back right toward the horizon, ending clear of the
// sun (screen x 0.855 on desktop, 0.8 on phones), so the water meets the
// horizon under it and holds its reflection. Under the palm group the beach
// bulges out into a small, rounded sand point: along the palms' feet
// (PALM_Z) the arc runs as if its deepest point sat at POINT_SCREEN, easing
// back to COAST_SCREEN either side, so the palms stand on dry sand near the
// water, with water in front of and behind them. Upright screens have no
// point: their palms stand inland, left of the avatar (HomeSection), and the
// far arm drifts less, for a wider stretch of water under the sun. Around
// the point the shore is a smooth beach; the far arm is ragged — coves, a
// sand spit, uneven wobble at several scales — and the front arm wobbles a
// little. Everything is laid out in screen fractions from the left, so it
// lands on the same part of the screen at any aspect: the floor's screen
// height runs nearly linear in 1 / depth, so a parabola in DEEP_D / depth is
// a smooth arc on screen.

// Screen fraction of the arc's deepest point, from the left, and where the
// sand point pushes it out to, by layout (layoutOf)
const COAST_SCREEN = { desktop: 0.59, landscape: 0.62, portrait: 0.62 };
const POINT_SCREEN = { desktop: 0.66, landscape: 0.68, portrait: 0.62 };
// Home-local z of the deepest point
const COAST_DEEP_Z = -4.5;
// Home composition (HomeSection) by the screen's shape (aspect = canvas
// width / height): an upright screen gets the portrait one on either side
// of the breakpoint (an iPad Pro held upright is past it), a wide one the
// desktop one, or on mobile the landscape one
export const layoutOf = (isMobile, aspect) => (aspect > 1 ? (isMobile ? "landscape" : "desktop") : "portrait");
// Home-local z of each palm's foot (HomeSection), by layout: the sand point
// runs along them, and falls away over POINT_WIDTH (in log-depth) beyond
export const PALM_Z = {
  desktop: [-4.2, -4.9, -3.45],
  landscape: [-5.8, -6.7, -5],
  portrait: [-7.5, -8.06, -6.9],
};
const POINT_WIDTH = 0.2;
// Screen fraction the shore reaches at the bottom edge (just past the right
// edge) and how far right the far arm drifts by the horizon, by layout
const FRONT_SCREEN = 1.08;
const FAR_DRIFT = { desktop: 0.09, landscape: 0.09, portrait: 0.04 };

// Waves washing up the beach (Sea), in screen-width fractions at each depth:
// the furthest run-up past coastX, and the soft edge of the swash front and
// its wet-sand sheen beyond it. dryX adds both, so the sea shader and the
// palms read the same numbers.
export const SWASH = {
  runup: { desktop: 0.016, mobile: 0.02 },
  edge: 0.004,
};

// Camera: SceneCanvas (position [0, 0.5, 5], fov 42)
const CAMERA_Z = 5;
const HALF_FOV_TAN = Math.tan((42 / 2) * (Math.PI / 180));
// Distance from the camera (along -z) where the floor leaves the bottom of
// the screen, and of the deepest point
const FRONT_D = 3;
const DEEP_D = CAMERA_Z - COAST_DEEP_Z;

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const bump = (s, depth, width) => Math.exp(-(((s - Math.log(depth)) / width) ** 2));

// Irregular part of the shore, screen fraction (+ = land reaches further
// into the sea), by distance from the camera. Smooth from ≈ 6.5 to 14 units
// out — every palm depth on both layouts.
const shoreShape = (depth) => {
  const s = Math.log(depth);
  const front = 1 - smoothstep(4.5, 6.5, depth);
  const far = smoothstep(14, 22, depth);
  const ragged =
    0.05 * bump(s, 26, 0.1) - // a sand spit
    0.03 * bump(s, 18, 0.1) - // a cove before it
    0.02 * bump(s, 45, 0.14) + // a cove after it
    // finer wobble, gone before it would crowd into a few pixels near the
    // horizon
    0.009 * Math.sin(s * 21 + 1) * (1 - smoothstep(35, 70, depth)) +
    0.005 * Math.sin(s * 43 + 2.3) * (1 - smoothstep(22, 40, depth));
  return far * ragged + front * (0.008 * Math.sin(s * 14 + 0.5) + 0.004 * Math.sin(s * 31 + 2));
};

const depthOf = (z) => Math.max(CAMERA_Z - z, 1);
// World width of the screen at that distance
const screenWidth = (depth, aspect) => 2 * HALF_FOV_TAN * aspect * depth;

// aspect = canvas width / height (R3F viewport.aspect)
export const coastX = (z, isMobile, aspect) => {
  const layout = layoutOf(isMobile, aspect);
  const depth = depthOf(z);
  // The sand point: 1 along the palms' feet, easing to 0 either side
  const feet = PALM_Z[layout].map(depthOf);
  const along = Math.min(Math.max(depth, Math.min(...feet)), Math.max(...feet));
  const point = bump(Math.log(depth), along, POINT_WIDTH);
  const deep = COAST_SCREEN[layout] + (POINT_SCREEN[layout] - COAST_SCREEN[layout]) * point;
  const q = DEEP_D / depth - 1;
  const bend = q > 0 ? (FRONT_SCREEN - deep) / (DEEP_D / FRONT_D - 1) ** 2 : FAR_DRIFT[layout];
  const f = deep + bend * q * q + shoreShape(depth);
  return (f - 0.5) * screenWidth(depth, aspect);
};

// Most landward x anything wet reaches at depth z: left of it is dry sand
export const dryX = (z, isMobile, aspect) =>
  coastX(z, isMobile, aspect) -
  (SWASH.runup[isMobile ? "mobile" : "desktop"] + SWASH.edge) * screenWidth(depthOf(z), aspect);
