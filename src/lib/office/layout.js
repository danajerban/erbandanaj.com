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
export const T = 0.12; // wall thickness: the back face lies at BACK - T
export const WALL_H = 2.4;
export const FLOOR_Y = -0.012; // floor top, under the contact-shadow plane
export const RUG_Y = -0.004;
export const SIDE_END = -0.45; // front end of the left side wall
export const FRONT_Z = -0.4; // furniture mesh origin (its front edge)
export const SLAB = 0.14; // floor slab thickness
export const SLAB_FRONT = 1.3; // floor slab front edge
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
// `pivot` so the monitor reads on a phone. Composition data, not a
// performance gate; allowed 1.0–1.3.
export const VIGNETTE = { scale: 1.2, pivot: [1.35, 0, BACK] };
const vignetteScale = (layout) => (layout === "portrait" ? VIGNETTE.scale : 1);

export const vignetteMatrix = (layout) => {
  const s = vignetteScale(layout);
  const [x, y, z] = VIGNETTE.pivot;
  return new THREE.Matrix4()
    .makeTranslation(x, y, z)
    .multiply(new THREE.Matrix4().makeScale(s, s, s))
    .multiply(new THREE.Matrix4().makeTranslation(-x, -y, -z));
};

// Each room's [x, z] offset in the section-local frame. Desktop and tall
// keep x 0 (the arch is the avatar's corridor); the scaled portrait desk
// shifts the Projects room left so the plant stays on screen.
const PLACE = {
  skills: { desktop: [0, 0], tall: [0, -0.8], portrait: [0.4, 0], landscape: [0, 0] },
  projects: { desktop: [0, 0], tall: [0, -0.8], portrait: [-0.4, 0], landscape: [0, 0] },
};

export const place = (corner, layout) => {
  const [x, z] = PLACE[corner][layout];
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

// The monitor screen in the room frame (27", 16:9, 3 mm in front of the
// panel), through the vignette
const SCREEN = { position: [1.35, 1.065, -1.497], rotationX: -0.087, size: [0.597, 0.336] };
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

// Yaw follows HomeSection: an object faces (sin yaw, cos yaw)
export const CHAIR = { x: -0.95, z: -0.75, yaw: Math.PI + 0.6 };
export const SNAKE_PLANT = { x: 2.25, z: -1.5, yaw: 0.4 };

// Both titles on the back wall: Text3D's origin is the left end of the
// baseline, its back face 5 mm off the wall. Inter_Bold.json's caps are
// 1.01 × size tall, so size 0.2 spans y 2.13–2.33 (0.07 under the wall top).
export const TITLE = {
  size: 0.2,
  height: 0.04,
  baseline: 2.13,
  z: BACK + 0.005,
  left: { skills: -1.86, projects: 0.585 },
};

// Each corner's room and its window. Skills: a big open window in the back
// wall, its lace gathered at the sides and swaying a little. Projects: the
// window in the left side wall (as in the desk photos), lace closed and
// still. x0 is the outer face of the left side wall, x1 the room's cut
// right end; rod and lace in the room frame.
export const WINDOW = {
  skills: {
    room: { x0: -3.12, x1: 2.0 },
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
    room: { x0: -2.12, x1: 2.82 },
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
