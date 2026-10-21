import * as THREE from "three";
import { layoutOf } from "../coast";

// The office: Skills and Projects are two corners of one small room, each
// built in its own room frame (y = 0 the floor, +z toward the camera, x = 0
// the hallway arch behind the avatar, 1 unit = 1 m). The room frame sits in
// the section-local frame (origin = the avatar's feet at rest) at
// place(corner, layout).

// Render layer of every office mesh, both titles and the monitor screen: the
// camera draws it, the contact-shadow pass does not (OfficeCorner)
export const OFFICE_LAYER = 10;

export const BACK = -1.8; // inner face of the back wall
export const WALL_T = 0.12; // wall thickness: the back face lies at BACK - WALL_T
export const WALL_H = 2.4;
export const FLOOR_Y = -0.012; // floor top, under the contact-shadow plane
export const RUG_Y = -0.004;
export const SIDE_END = -0.45; // the side wall's front end on phones
export const FRONT_Z = -0.4; // furniture mesh origin (its front edge)
export const SLAB = 0.14; // floor slab thickness
// The open hallway arch at room x 0 in both back walls: jambs to `spring`,
// a semicircular head up to `top`
export const ARCH = { x: 0.45, spring: 1.65, top: 2.1 };

// Layout key: lib/coast's layoutOf, and an upright screen past the
// breakpoint (an iPad held upright) is "tall" (HomeSection's rule)
export const officeLayout = (isMobile, aspect) => {
  const layout = layoutOf(isMobile, aspect);
  return !isMobile && layout === "portrait" ? "tall" : layout;
};

// Phone portrait only: the desk group (desk, its items, monitor, desk lamp,
// desk glow, the screen, the desk lights) and the snake plant scale about
// `pivot` so the monitor reads on a phone. The pivot lies left of the
// monitor, so the scaled monitor grows to the right, clear of the avatar's
// shoulder. Composition data, not a performance gate; allowed 1.0–1.3.
export const VIGNETTE = { scale: 1.2, pivot: [1.05, 0, BACK] };
const vignetteScale = (layout) => (layout === "portrait" ? VIGNETTE.scale : 1);

export const vignetteMatrix = (layout) => {
  const s = vignetteScale(layout);
  const [x, y, z] = VIGNETTE.pivot;
  return new THREE.Matrix4()
    .makeTranslation(x, y, z)
    .multiply(new THREE.Matrix4().makeScale(s, s, s))
    .multiply(new THREE.Matrix4().makeTranslation(-x, -y, -z));
};

// The room is a background, like the park: per layout, the floor and the
// back wall run past the screen edges, at rest and while the corner
// dissolves (the camera travels up to 0.48 sections before it is gone), so
// sky shows only above the wall tops. Room frame: `right` the back wall's
// and the floor's right end, `front` the floor's front edge, `side` the left
// side wall's front end, `left` the back wall's and the floor's left end
// where the side wall stops short. On desktop and an upright iPad the avatar
// walks along z through the arch, so the side wall runs on toward the camera
// and closes the frame on the left. On phones the avatar walks along x
// across the room, so the side wall stops behind it (SIDE_END) and the back
// wall and floor carry on past it to the left.
export const SHELL = {
  desktop: { left: null, right: 11, front: 7.5, side: 7 },
  tall: { left: null, right: 11, front: 7.5, side: 7 },
  portrait: { left: -6.5, right: 6.5, front: 7.5, side: SIDE_END },
  landscape: { left: -13, right: 13, front: 7.5, side: SIDE_END },
};

// 0 at a, 1 at b (either way round), clamped
const ramp = (x, [a, b]) => Math.min(1, Math.max(0, (x - a) / (b - a)));
// Exactly a at t 0 and b at t 1, so the tuned spots hold to the last digit
const mix = (a, b, t) => (t <= 0 ? a : t >= 1 ? b : a.map((v, i) => v + (b[i] - v) * t));

// Past the breakpoint the spots (the room's offset, the titles) slide by
// the aspect from the upright iPad's ("tall", 1024x1366) to the laptop's
// ("desktop", 1280x800 and wider): a window in between sees a width in
// between, so both titles and the props at the room's ends stay in frame
const DESKTOP_BLEND = [0.75, 1.6];
// A spot table's entry for the layout; past the breakpoint, blended by the
// aspect
const spotOf = (spots, layout, aspect) =>
  layout === "desktop" || layout === "tall" ? mix(spots.tall, spots.desktop, ramp(aspect, DESKTOP_BLEND)) : spots[layout];

// Each room's [x, z] offset in the section-local frame. Desktop and tall
// keep x 0 (the arch is the avatar's corridor); the scaled portrait desk
// shifts the Projects room left so the plant stays on screen.
const PLACE = {
  skills: { desktop: [0, 0], tall: [0, -0.8], portrait: [0.4, 0], landscape: [0, 0] },
  projects: { desktop: [0, 0], tall: [0, -0.8], portrait: [-0.4, 0], landscape: [0, 0] },
};

export const place = (corner, layout, aspect) => {
  const [x, z] = spotOf(PLACE[corner], layout, aspect);
  return corner === "projects" ? [x - 1.0 * (vignetteScale(layout) - 1), z] : [x, z];
};

// Lights moved by a matrix (the desk vignette): position, the `front` plane
// and the radius
export const transformLights = (lights, matrix) => {
  const s = matrix.getMaxScaleOnAxis();
  return lights.map((light) => ({
    ...light,
    p: light.p.clone().applyMatrix4(matrix),
    R: light.R * s,
    ...(light.front === undefined ? {} : { front: new THREE.Vector3(0, 0, light.front).applyMatrix4(matrix).z }),
  }));
};

// The owner's desk: centre x, centre z, top height
export const DESK = { DX: 1.3, DZ: -1.43, TOP: 0.73 };

// The monitor screen in the room frame (32", 16:9, 3 mm in front of the
// panel's face, same tilt), through the vignette
const SCREEN = { position: [1.35, 1.1016, -1.4971], rotationX: -0.087, size: [0.708, 0.398] };
const screens = new Map();
export const monitorScreen = (layout) => {
  if (!screens.has(layout)) {
    const m = vignetteMatrix(layout);
    const s = m.getMaxScaleOnAxis();
    screens.set(layout, {
      position: new THREE.Vector3(...SCREEN.position).applyMatrix4(m).toArray(),
      rotationX: SCREEN.rotationX,
      size: [SCREEN.size[0] * s, SCREEN.size[1] * s],
    });
  }
  return screens.get(layout);
};

// Yaw follows HomeSection: an object faces (sin yaw, cos yaw). The office
// chair stands pulled out at the right end of the desk, just in front of
// it, turned three-quarters to the desk and the monitor. Where the desk's
// right end nears the screen edge (an upright iPad) it turns side-on to the
// camera, so it hides less of the desk; on a phone held upright it sits
// further right, past the scaled-up monitor (VIGNETTE).
const CHAIR = {
  default: { x: 1.62, z: -0.8, yaw: Math.PI + 1.05 },
  tall: { x: 1.42, z: -0.8, yaw: Math.PI + 1.45 },
  portrait: { x: 1.75, z: -0.8, yaw: Math.PI + 1.05 },
};
export const chairAt = (layout) => CHAIR[layout] ?? CHAIR.default;
// The snake plant on the floor in the corner right of the desk, between
// the chair and the backpack (inside the vignette, so on a phone held
// upright it stands closer to the desk to stay in that gap)
const SNAKE_PLANT = {
  default: { x: 2.32, z: -1.6, yaw: 0.4 },
  portrait: { x: 2.15, z: -1.62, yaw: 0.4 },
};
export const snakePlantAt = (layout) => SNAKE_PLANT[layout] ?? SNAKE_PLANT.default;

// The left corner, where the back wall meets the window wall: a light-oak
// wardrobe against the back wall, clear of the side window's lace (x -1.875)
// and the arch casing (x -0.52); its legs stand behind the rug. A framed
// print hangs on the back wall between it and the arch. Room frame, true
// scale; the print's x, y are its centre.
export const WARDROBE = { x: [-1.74, -1.0], depth: 0.44, height: 1.9, legs: 0.1 };
export const PRINT = { x: -0.76, y: 1.36, w: 0.26, h: 0.34 };

// Both titles stand on the floor in front of the furniture, like CONTACT
// in the park (SectionTitle's own size and depth, turned toward the camera
// by TITLE_TURN), clear of the cards: Skills left of them, Projects right of
// them on desktop; on phones above the card carousel (the bottom 30%), in
// front of the avatar's feet. Per layout, the left end of the baseline
// (Text3D's origin) in the room frame, on the floor; its far end stays at
// z >= 0.2. Past the breakpoint, blended from tall to desktop by the
// aspect (DESKTOP_BLEND), so neither title runs off a near-square window.
// The phone cards sit a fixed number of CSS px above the bottom
// (index.css), so on phones the room a title has above them goes by the
// canvas's height (CSS px; in iOS Safari the large viewport, about 120 px
// less than the screen: an iPhone SE 589, a mini 704, a 402x874 iPhone
// 754). On a phone held upright shorter than PORTRAIT_OVERHEAD (the SE and
// 16:9 Android phones) the floor in front of the avatar lies under the
// card, so both titles hang overhead instead: above the avatar's hat,
// under the menu, and clear of the moon (lib/timeOfDay moonAt). From the mini
// up the floor spot clears the card. A tablet in
// the phone UI (768x1024 and up) has a wide stretch of bare floor between
// the avatar and its short card, so there the floor spot comes forward to
// "tablet", big and about 75-125 px above the card; phones (aspect up to
// 0.5, at most 932 px tall in this UI) keep "portrait". A phone held
// sideways lower than 852x393 lifts both titles off the floor, up the
// blank back wall left of the room, toward "lowLandscape" (568x320), so
// they keep 852x393's gap of about 22 px above the card.
export const TITLE_TURN = Math.PI / 6;
const TITLE_AT = {
  skills: {
    desktop: [-2.0, 0, 0.9],
    tall: [-1.25, 0, 0.9],
    portrait: [-1.55, 0, 2.6],
    overhead: [-1.15, 2.05, 1.5],
    tablet: [-1.5, 0, 4.6],
    landscape: [-4.6, 0, 0.5],
    lowLandscape: [-4.6, 0.85, 0.5],
  },
  projects: {
    desktop: [0.4, 0, 1.3],
    tall: [-0.9, 0, 2.3],
    portrait: [-0.5, 0, 3.0],
    overhead: [-0.5, 2.1, 1.5],
    tablet: [-0.6, 0, 4.2],
    landscape: [-5.2, 0, -0.6],
    lowLandscape: [-5.2, 0.85, -0.6],
  },
};
const PORTRAIT_OVERHEAD = 680;
const TABLET = { aspect: [0.5, 0.69], height: [830, 1024] };
const LOW_LANDSCAPE = [393, 320];
// height: the canvas's CSS height
export const titleAt = (corner, layout, aspect, height) => {
  const spots = TITLE_AT[corner];
  if (layout === "portrait") {
    if (height < PORTRAIT_OVERHEAD) return spots.overhead;
    return mix(spots.portrait, spots.tablet, Math.min(ramp(aspect, TABLET.aspect), ramp(height, TABLET.height)));
  }
  if (layout === "landscape") return mix(spots.landscape, spots.lowLandscape, ramp(height, LOW_LANDSCAPE));
  return spotOf(spots, layout, aspect);
};

// Each corner's room and its window. Skills: a big open window in the back
// wall, its lace gathered at the sides and swaying a little. Projects: the
// window in the left side wall (as in the desk photos), lace closed and
// still. x0 is the outer face of the left side wall (the room's extents per
// layout: SHELL); rod and lace in the room frame.
export const WINDOW = {
  skills: {
    room: { x0: -3.12 },
    wall: "back",
    hole: { u: [-2.65, -0.65], v: [0.55, 2.0] },
    trim: 0.05,
    mullions: [-1.983, -1.317],
    transom: [1.6, 1.64],
    sill: { x: [-2.72, -0.58], y: [0.51, 0.55], z: [-1.84, -1.66] },
    rod: { y: 2.08, z: -1.71, x: [-2.97, -0.56], brackets: [-2.85, -0.66] },
    lace: { panels: [[-2.95, -2.4], [-0.9, -0.58]], top: 2.075, at: -1.71 },
    sway: 0.02,
    rug: { x: [-2.1, 0.5], z: [-1.5, 0.3] },
  },
  projects: {
    room: { x0: -2.12 },
    wall: "side",
    hole: { u: [-1.62, -0.72], v: [0.85, 2.1] },
    trim: 0.05,
    mullions: [-1.17],
    transom: [1.6, 1.64],
    sill: { x: [-2.04, -1.9], y: [0.81, 0.85], z: [-1.66, -0.68] },
    rod: { y: 2.18, x: -1.91, z: [-1.7, -0.6], brackets: [-1.62, -0.68] },
    lace: { panels: [[-1.68, -1.15], [-1.15, -0.62]], top: 2.175, at: -1.91 },
    sway: 0,
    rug: { x: [-1.55, 1.45], z: [-1.35, 0.15] },
    socket: { x: 0.7, y: 0.95, cableTo: 1.0 },
  },
};
