import * as THREE from "three";
import { LIGHT, PALETTE, hex } from "./bake";
import { BACK, DESK, FLOOR_Y } from "./layout";
import { bevelBox, box, contactShadow, cylinder, cylinderBetween, ellipse, fan, polygon, prism, tube, v3 } from "./shapes";

// Projects: the owner's desk from the photos.
// out = { solid: OfficeSink, glow: GlowSink }; ctx = { isMobile, layout,
// random }; room-frame coordinates (ProjectsSection pushes the desk
// vignette onto both sinks around buildDesk).

// The desk's lights (room frame, before the vignette): the desk lamp's cone
// and its broad room fill, the monitor light bar (only in front of its
// plane) and the screen's spill
export const DESK_LIGHTS = [
  { p: new THREE.Vector3(1.8, 1.21, -1.38), color: LIGHT.desk, R: 1.0, w: 0.7, cone: true },
  { p: new THREE.Vector3(1.8, 1.21, -1.38), color: LIGHT.desk, R: 3.5, w: 0.8 },
  { p: new THREE.Vector3(1.35, 1.334, -1.48), color: LIGHT.lightBar, R: 0.7, w: 0.5, front: -1.5 },
  { p: new THREE.Vector3(1.35, 1.1, -1.45), color: LIGHT.screen, R: 1.4, w: 0.35 },
];

const { DX, DZ, TOP } = DESK;
const X0 = DX - 0.7;
const X1 = DX + 0.7;
const Z0 = DZ - 0.35;
const Z1 = DZ + 0.35;
const THICK = 0.025;
const MAT = { x: [0.84, 1.74], z: [-1.47, -1.07], h: 0.004 };
const MAT_Y = TOP + MAT.h;
const UP = v3(0, 1, 0);

// Colours the palette has no token for (sRGB → linear)
const C = {
  black: hex("#151517"),
  ink: hex("#0f0f10"),
  bezel: hex("#141416"),
  plate: hex("#2a2b2e"),
  chrome: hex("#d8dadd"),
  lampBase: hex("#1d2333"),
  pages: hex("#efe6d2"),
  well: hex("#1c1c1e"),
  trackpad: hex("#b4b6b9"),
  cushion: hex("#2a2a2c"),
  grille: hex("#2c2c2e"),
  bark: hex("#5a4636"),
  pebbleDark: hex("#8c8983"),
  socket: hex("#3a3a3c"),
  ui: hex("#22303a"),
  uiTile: [hex("#3c5566"), hex("#4a6272"), hex("#566f63")],
  uiBar: hex("#141c22"),
  uiRed: hex("#d9534a"),
};

const rotY = (yaw) => new THREE.Matrix4().makeRotationY(yaw);
const rotX = (a) => new THREE.Matrix4().makeRotationX(a);
const move = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
// An item's frame: at (x, y, z), facing (sin yaw, cos yaw), then more
const frame = (x, y, z, yaw = 0, ...more) => more.reduce((m, n) => m.multiply(n), move(x, y, z).multiply(rotY(yaw)));

// Build `draw` in a frame pushed on the solid sink
const inFrame = (sink, matrix, draw) => {
  sink.push(matrix);
  draw();
  sink.pop();
};

// A flat, upward rectangle split into nx × nz quads (per-vertex lamp light)
const flatGrid = (sink, [x0, x1], [z0, z1], y, nx, nz, albedo) => {
  for (let i = 0; i < nx; i++) {
    const [xa, xb] = [x0 + ((x1 - x0) * i) / nx, x0 + ((x1 - x0) * (i + 1)) / nx];
    for (let j = 0; j < nz; j++) {
      const [za, zb] = [z0 + ((z1 - z0) * j) / nz, z0 + ((z1 - z0) * (j + 1)) / nz];
      sink.quad(v3(xa, y, zb), v3(xb, y, zb), v3(xb, y, za), v3(xa, y, za), albedo);
    }
  }
};

// A front-facing (+z) rectangle split along x
const frontStrip = (sink, [x0, x1], [y0, y1], z, n, albedo) => {
  for (let i = 0; i < n; i++) {
    const [xa, xb] = [x0 + ((x1 - x0) * i) / n, x0 + ((x1 - x0) * (i + 1)) / n];
    sink.quad(v3(xa, y0, z), v3(xb, y0, z), v3(xb, y1, z), v3(xa, y1, z), albedo);
  }
};

// The oak top: 12 grain bands along x (deep and light by seeded random),
// split every 0.2 m so the lamp's light falls off across it; edge band on
// the front and the ends (the back sits against the wall)
const buildTop = (s, random) => {
  const bands = 12;
  const weights = Array.from({ length: bands }, () => 0.6 + random() * 0.8);
  const total = weights.reduce((a, b) => a + b, 0);
  let z = Z0;
  weights.forEach((weight, k) => {
    const z2 = k === bands - 1 ? Z1 : z + ((Z1 - Z0) * weight) / total;
    const grain = k % 2 ? 0.25 + random() * 0.55 : random() * 0.12;
    const color = PALETTE.deskOak.clone().lerp(PALETTE.deskGrain, grain);
    flatGrid(s, [X0, X1], [z, z2], TOP, 7, 1, color);
    z = z2;
  });
  const y = [TOP - THICK, TOP];
  frontStrip(s, [X0, X1], y, Z1, 7, PALETTE.deskEdge);
  polygon(s, [v3(X0, y[0], Z0), v3(X0, y[0], Z1), v3(X0, y[1], Z1), v3(X0, y[1], Z0)], PALETTE.deskEdge, {}, v3(-1, 0, 0));
  polygon(s, [v3(X1, y[0], Z0), v3(X1, y[0], Z1), v3(X1, y[1], Z1), v3(X1, y[1], Z0)], PALETTE.deskEdge, {}, v3(1, 0, 0));
};

// Black sit-stand T-legs, the crossbar, the cable tray with its power strip
const buildFrame = (s) => {
  const steel = PALETTE.steel;
  const under = TOP - THICK;
  for (const x of [DX - 0.6, DX + 0.6]) {
    box(s, [x - 0.035, x + 0.035], [FLOOR_Y + 0.03, under - 0.045], [DZ - 0.035, DZ + 0.035], steel, { omit: "+y-y" });
    box(s, [x - 0.03, x + 0.03], [FLOOR_Y, FLOOR_Y + 0.03], [DZ - 0.33, DZ + 0.33], steel, { omit: "-y" });
    box(s, [x - 0.03, x + 0.03], [under - 0.045, under], [Z0 + 0.05, Z1 - 0.05], steel, { omit: "+y" });
  }
  box(s, [DX - 0.565, DX + 0.565], [under - 0.045, under], [DZ - 0.03, DZ + 0.03], steel, { omit: "+y-x+x" });
  box(s, [0.95, 1.65], [0.58, 0.63], [Z0 + 0.02, Z0 + 0.12], steel, { omit: "+y-z" });
  const strip = [1.05, 1.45];
  box(s, strip, [0.585, 0.625], [Z0 + 0.12, Z0 + 0.155], PALETTE.ceramic, { omit: "-z" });
  for (let k = 0; k < 4; k++) {
    const x = 1.1 + k * 0.1;
    const zf = Z0 + 0.1555;
    s.quad(v3(x - 0.012, 0.593, zf), v3(x + 0.012, 0.593, zf), v3(x + 0.012, 0.617, zf), v3(x - 0.012, 0.617, zf), C.socket);
  }
};

// The charcoal felt mat with lighter specks
const buildMat = (s, random) => {
  const { x, z } = MAT;
  flatGrid(s, x, z, MAT_Y, 6, 3, PALETTE.felt);
  box(s, x, [TOP, MAT_Y], z, PALETTE.felt, { omit: "-y+y-z" });
  for (let k = 0; k < 36; k++) {
    const px = x[0] + 0.02 + random() * (x[1] - x[0] - 0.04);
    const pz = z[0] + 0.02 + random() * (z[1] - z[0] - 0.04);
    const r = 0.003 + random() * 0.004;
    const a = random() * Math.PI;
    const y = MAT_Y + 0.0004;
    const p = (t) => v3(px + Math.cos(a + t) * r, y, pz + Math.sin(a + t) * r);
    polygon(s, [p(0), p(2.1), p(4.2)], PALETTE.feltSpeck, {}, UP);
  }
};

// 75 % keyboard: a wedge case and six stepped key rows (grey-blue caps,
// darker modifiers), Esc and Enter raised in the accent colour
const KEY_ROWS = [
  // [left modifier width, right modifier width]
  [0.0, 0.03],
  [0.0, 0.05],
  [0.03, 0.03],
  [0.037, 0.0],
  [0.047, 0.05],
  [0.06, 0.07],
];
const buildKeyboard = (s) => {
  const [W, D] = [0.325, 0.135];
  const [front, back] = [0.015, 0.024];
  const caseTop = (z) => front + ((D / 2 - z) / D) * (back - front);
  inFrame(s, frame(1.25, MAT_Y, -1.27, -0.04), () => {
    prism(s, [[0, D / 2], [0, -D / 2], [back, -D / 2], [front, D / 2]], [-W / 2, W / 2], PALETTE.keyCase, { axis: "x" });
    const inset = 0.008;
    const rowD = (D - 2 * inset) / KEY_ROWS.length;
    const [xl, xr] = [-W / 2 + inset, W / 2 - inset];
    KEY_ROWS.forEach(([ml, mr], k) => {
      const z0 = -D / 2 + inset + k * rowD + 0.001;
      const z1 = z0 + rowD - 0.002;
      const top = caseTop((z0 + z1) / 2) + 0.009;
      const y = [top - 0.012, top];
      const key = (x0, x1, color, lift = 0) => {
        if (x1 - x0 > 1e-4) box(s, [x0, x1], [y[0], y[1] + lift], [z0, z1], color, { omit: "-y-z" });
      };
      if (k === 0) {
        // Esc, then the function row
        key(xl, xl + 0.018, PALETTE.keyAccent, 0.002);
        key(xl + 0.021, xr - mr, PALETTE.keyCap);
      } else if (k === 3) {
        // Enter at the right end of the home row
        key(xl, xl + ml, PALETTE.keyMod);
        key(xl + ml + 0.002, xr - 0.036, PALETTE.keyCap);
        key(xr - 0.034, xr, PALETTE.keyAccent, 0.002);
        return;
      } else {
        key(xl, xl + ml, PALETTE.keyMod);
        key(xl + ml + (ml ? 0.002 : 0), xr - mr - (mr ? 0.002 : 0), PALETTE.keyCap);
      }
      key(xr - mr, xr, PALETTE.keyMod);
    });
  });
};

// A loft through rings of equal size (each a closed outline of points),
// capped at both ends
const loft = (s, rings, albedo) => {
  const centre = (ring) => ring.reduce((sum, p) => sum.add(p), v3(0, 0, 0)).divideScalar(ring.length);
  const mid = centre(rings.flat());
  for (let r = 0; r < rings.length - 1; r++) {
    const [a, b] = [rings[r], rings[r + 1]];
    for (let i = 0; i < a.length; i++) {
      const j = (i + 1) % a.length;
      const quad = [a[i], a[j], b[j], b[i]];
      polygon(s, quad, albedo, {}, centre(quad).sub(mid));
    }
  }
  for (const ring of [rings[0], rings[rings.length - 1]]) polygon(s, ring, albedo, {}, centre(ring).sub(mid));
};

// White vertical mouse (a leaning hump, lofted along its length) and the
// black wrist pad
const MOUSE_OUTLINE = [[-0.035, 0], [0.035, 0], [0.03, 0.025], [0.006, 0.064], [-0.014, 0.07], [-0.033, 0.046]];
const buildMouse = (s) => {
  inFrame(s, frame(1.6, MAT_Y, -1.25, 0.12), () => {
    const ring = (z, k, ky = k) => MOUSE_OUTLINE.map(([x, y]) => v3(x * k, y * ky, z));
    loft(s, [ring(-0.06, 0.55, 0.5), ring(-0.04, 0.95, 0.9), ring(0.03, 1, 1), ring(0.06, 0.65, 0.7)], PALETTE.ceramic);
  });
  inFrame(s, frame(1.57, MAT_Y, -1.15, 0.1), () => {
    bevelBox(s, [-0.04, 0.04], [0, 0.012], [-0.03, 0.03], 0.004, C.black);
  });
};

// Black notebook with cream page edges and its elastic band
const buildNotebook = (s) => {
  inFrame(s, frame(0.94, MAT_Y, -1.17, 0.1), () => {
    box(s, [-0.103, 0.103], [0, 0.012], [-0.063, 0.063], C.pages, { omit: "-y+y", faces: { "-x": C.black } });
    box(s, [-0.105, 0.105], [0.012, 0.015], [-0.065, 0.065], C.black, { omit: "-y" });
    box(s, [0.08, 0.086], [0.015, 0.0156], [-0.065, 0.065], C.ink, { omit: "-y" });
    box(s, [0.08, 0.086], [0, 0.015], [0.063, 0.066], C.ink, { omit: "-y-z" });
  });
};

// Silver pen on the mat, right of the keyboard
const buildPen = (s) => {
  const r = 0.005;
  inFrame(s, frame(1.49, MAT_Y + r, -1.22, 0.5), () => {
    cylinderBetween(s, v3(0, 0, -0.07), v3(0, 0, 0.045), r, r, 6, PALETTE.silver);
    cylinderBetween(s, v3(0, 0, 0.045), v3(0, 0, 0.07), r, 0.0015, 6, C.black, { caps: "start" });
    box(s, [-0.0015, 0.0015], [r, r + 0.002], [-0.065, -0.03], PALETTE.silver, { omit: "-y" });
  });
};

// Cream spiral sticky pad with a coral scribble, on the mat just right of
// the keyboard's back corner (straight behind it the keyboard hides it)
const buildSticky = (s) => {
  const h = 0.012;
  inFrame(s, frame(1.46, MAT_Y, -1.42, 0.08), () => {
    box(s, [-0.0375, 0.0375], [0, h], [-0.0375, 0.0375], PALETTE.sticky, { omit: "-y" });
    const y = h + 0.0004;
    for (let k = 0; k < 7; k++) {
      const x = -0.03 + k * 0.01;
      s.quad(v3(x - 0.002, y, -0.028), v3(x + 0.002, y, -0.028), v3(x + 0.002, y, -0.036), v3(x - 0.002, y, -0.036), C.socket);
    }
    const lines = [[-0.022, -0.012, 0.02, -0.01], [-0.024, 0.002, 0.012, 0.006], [-0.02, 0.016, 0.024, 0.012]];
    for (const [xa, za, xb, zb] of lines) {
      s.quad(v3(xa, y, za + 0.0015), v3(xb, y, zb + 0.0015), v3(xb, y, zb - 0.0015), v3(xa, y, za - 0.0015), PALETTE.coral);
    }
  });
};

// Black over-ear headphones lying flat: two cups and the band
const buildHeadphones = (s, sides) => {
  const y0 = TOP;
  for (const x of [0.675, 0.765]) {
    cylinder(s, [x, -1.36], [y0, y0 + 0.035], [0.045, 0.043], sides, C.black, { caps: "end" });
    const centre = v3(x, y0 + 0.0354, -1.36);
    fan(s, centre, ellipse(centre, 0.028, 0.028, sides), C.cushion, C.cushion);
  }
  const band = [];
  for (let k = 0; k <= 6; k++) {
    const t = Math.PI * (k / 6);
    band.push(v3(0.72 - Math.cos(t) * 0.075, y0 + 0.03 + Math.sin(t) * 0.012, -1.37 - Math.sin(t) * 0.035));
  }
  tube(s, band, 0.008, 4, C.black);
};

// Light grey tech pouch with its zip
const buildPouch = (s) => {
  inFrame(s, frame(0.93, TOP, -1.34, -0.15), () => {
    bevelBox(s, [-0.1, 0.1], [0, 0.05], [-0.06, 0.06], 0.016, PALETTE.pouch);
    box(s, [-0.085, 0.085], [0.05, 0.0505], [-0.004, 0.004], PALETTE.pouch.clone().multiplyScalar(0.7), { omit: "-y" });
  });
};

// MacBook Pro 14" open on its aluminium stand: the base tilted 20° (front
// down), the lid open 105° with a dim video call on its screen
const LAPTOP = { x: 0.78, zFront: -1.446, yFront: 0.8044, tilt: (20 * Math.PI) / 180, open: (105 * Math.PI) / 180 };
const buildLaptop = (s) => {
  const { silver } = PALETTE;
  const [W, D, H] = [0.312, 0.221, 0.0155];
  // Stand: two side plates under the base, a rear crossbar
  for (const x of [LAPTOP.x - 0.13, LAPTOP.x + 0.13]) {
    prism(s, [[TOP, -1.65], [TOP, -1.45], [0.803, -1.45], [0.878, -1.65]], [x - 0.004, x + 0.004], silver, { axis: "x" });
  }
  box(s, [LAPTOP.x - 0.126, LAPTOP.x + 0.126], [TOP, TOP + 0.012], [-1.65, -1.63], silver, { omit: "-y" });
  inFrame(s, frame(LAPTOP.x, LAPTOP.yFront, LAPTOP.zFront, 0, rotX(LAPTOP.tilt)), () => {
    box(s, [-W / 2, W / 2], [0, H], [-D, 0], silver, { omit: "-y" });
    const y = H + 0.0004;
    s.quad(v3(-0.13, y, -0.1), v3(0.13, y, -0.1), v3(0.13, y, -0.205), v3(-0.13, y, -0.205), C.well);
    s.quad(v3(-0.065, y, -0.02), v3(0.065, y, -0.02), v3(0.065, y, -0.09), v3(-0.065, y, -0.09), C.trackpad);
    // The lid, hinged at the rear edge; its screen side faces local −y
    inFrame(s, move(0, H, -D).multiply(rotX(-LAPTOP.open)), () => {
      box(s, [-W / 2, W / 2], [0, 0.006], [0, D], silver, { faces: { "-y": C.bezel } });
      const down = v3(0, -1, 0);
      const yy = -0.0008;
      const glow = (color) => ({ emissive: color.clone().multiplyScalar(0.4) });
      const rect = (x0, x1, z0, z1, color, dy = 0) =>
        polygon(s, [v3(x0, yy - dy, z0), v3(x1, yy - dy, z0), v3(x1, yy - dy, z1), v3(x0, yy - dy, z1)], color, glow(color), down);
      rect(-0.142, 0.142, 0.012, 0.205, C.ui);
      // A call: the speaker tile, two small tiles, the control bar
      rect(-0.07, 0.07, 0.07, 0.165, C.uiTile[0], 0.0003);
      rect(-0.13, -0.08, 0.13, 0.165, C.uiTile[1], 0.0003);
      rect(0.08, 0.13, 0.13, 0.165, C.uiTile[2], 0.0003);
      rect(-0.06, 0.06, 0.025, 0.045, C.uiBar, 0.0003);
      rect(0.03, 0.045, 0.029, 0.041, C.uiRed, 0.0006);
    });
  });
};

// The 32" monitor: black panel tilted 5° back (its face 3 mm behind
// layout.js SCREEN), VESA mount, neck and plate; the light bar on top (its
// underside strip glows) with the webcam
const PANEL = { x: 1.35, y: 1.1, z: -1.515, tilt: -0.087, w: 0.729, h: 0.439, d: 0.03 };
const BAR = { y: 1.334, z: -1.493, r: 0.014, half: 0.267 };
const buildMonitor = (s, sides) => {
  const steel = PALETTE.steel;
  const { x } = PANEL;
  box(s, [x - 0.13, x + 0.13], [TOP, TOP + 0.014], [-1.68, -1.475], C.plate, { omit: "-y" });
  box(s, [x - 0.024, x + 0.024], [TOP + 0.014, 1.15], [-1.587, -1.533], steel, { omit: "-y+y" });
  box(s, [x - 0.06, x + 0.06], [1.0, 1.15], [-1.55, -1.53], steel, { omit: "+z" });
  inFrame(s, frame(x, PANEL.y, PANEL.z, 0, rotX(PANEL.tilt)), () => {
    const [hw, hh, hd] = [PANEL.w / 2, PANEL.h / 2, PANEL.d / 2];
    box(s, [-hw, hw], [-hh, hh], [-hd, hd], steel);
    box(s, [-0.237, 0.237], [-0.178, 0.142], [-hd - 0.018, -hd], steel, { omit: "+z" });
  });
  // Light bar, its clamp over the panel and the counterweight behind
  const [xa, xb] = [x - BAR.half, x + BAR.half];
  cylinderBetween(s, v3(xa, BAR.y, BAR.z), v3(xb, BAR.y, BAR.z), BAR.r, BAR.r, sides, steel);
  box(s, [x - 0.024, x + 0.024], [BAR.y - 0.015, BAR.y], [-1.552, BAR.z], steel, { omit: "-y" });
  box(s, [x - 0.036, x + 0.036], [BAR.y - 0.074, BAR.y - 0.008], [-1.566, -1.54], steel);
  const n = v3(0, -0.5, 0.866);
  const t = v3(0, 0.866, 0.5).multiplyScalar(0.005);
  const q = v3(0, BAR.y, BAR.z).addScaledVector(n, BAR.r + 0.0008);
  const at = (px, sign) => v3(px, q.y + sign * t.y, q.z + sign * t.z);
  const emissive = LIGHT.lightBar.clone().multiplyScalar(1.4);
  polygon(s, [at(xa + 0.012, -1), at(xb - 0.012, -1), at(xb - 0.012, 1), at(xa + 0.012, 1)], LIGHT.lightBar, { emissive }, n);
  const top = BAR.y + BAR.r;
  box(s, [x - 0.04, x + 0.04], [top, top + 0.03], [BAR.z - 0.018, BAR.z + 0.018], steel, { omit: "-y" });
  const lens = v3(x, top + 0.015, BAR.z + 0.0184);
  fan(s, lens, ellipse(lens, 0.006, 0.006, 6, "xy"), C.grille, C.grille, { normal: v3(0, 0, 1) });
};

// Two small black speakers behind the monitor, grilles to the front
const buildSpeakers = (s, sides) => {
  for (const x of [1.1, 1.62]) {
    const z = -1.68;
    box(s, [x - 0.035, x + 0.035], [TOP, TOP + 0.12], [z - 0.04, z + 0.04], C.black, { omit: "-y" });
    const c = v3(x, TOP + 0.05, z + 0.0405);
    fan(s, c, ellipse(c, 0.024, 0.024, sides, "xy"), C.grille, C.grille, { normal: v3(0, 0, 1) });
  }
};

// Cream MagSafe stand: round base, a slab leaning back, the silver puck
const buildMagSafe = (s, sides) => {
  cylinder(s, [1.76, -1.45], [TOP, TOP + 0.012], [0.045, 0.043], sides, PALETTE.ceramic, { caps: "end" });
  inFrame(s, frame(1.76, TOP + 0.012, -1.455, 0, rotX(-0.26)), () => {
    bevelBox(s, [-0.028, 0.028], [0, 0.135], [-0.012, 0], 0.004, PALETTE.ceramic);
    cylinderBetween(s, v3(0, 0.1, 0), v3(0, 0.1, 0.006), 0.027, 0.027, sides, PALETTE.silver, { caps: "end" });
  });
};

// Architect lamp: navy base, chrome pole, black arm forward-left to the
// round head (= DESK_LIGHTS[0].p), tipped toward the room so its warm inner
// disc shows
const LAMP = { base: [1.88, -1.62], poleTop: 1.24, head: v3(1.8, 1.21, -1.38) };
const buildDeskLamp = (s, sides) => {
  const [bx, bz] = LAMP.base;
  cylinder(s, [bx, bz], [TOP, TOP + 0.025], [0.11, 0.105], sides + 4, C.lampBase, { caps: "end" });
  cylinder(s, [bx, bz], [TOP + 0.025, LAMP.poleTop], [0.008, 0.008], 6, C.chrome, { caps: false });
  const joint = v3(bx, LAMP.poleTop, bz);
  cylinderBetween(s, joint.clone().setY(LAMP.poleTop - 0.012), joint.clone().setY(LAMP.poleTop + 0.012), 0.014, 0.014, 6, C.black);
  const tail = v3(bx + 0.03, LAMP.poleTop + 0.004, bz - 0.06);
  cylinderBetween(s, LAMP.head.clone().setY(LAMP.head.y + 0.03), tail, 0.007, 0.007, 6, C.black);
  cylinderBetween(s, tail, tail.clone().add(v3(0.012, 0.002, -0.024)), 0.016, 0.016, 6, C.black);
  inFrame(s, frame(LAMP.head.x, LAMP.head.y, LAMP.head.z, 0, rotX(-0.5)), () => {
    cylinderBetween(s, v3(0, -0.012, 0), v3(0, 0.03, 0), 0.045, 0.026, sides, C.black, { caps: "end" });
    const disc = v3(0, -0.011, 0);
    fan(s, disc, ellipse(disc, 0.043, 0.043, sides), LIGHT.desk, LIGHT.desk, {
      normal: v3(0, -1, 0),
      emissive: LIGHT.desk.clone().multiplyScalar(1.5),
    });
  });
};

// A low-poly foliage cluster: a jittered octahedron, lighter on top
const cluster = (s, c, rx, ry, rz, random) => {
  const j = () => 0.8 + random() * 0.4;
  const [px, nx, py, ny, pz, nz] = [
    v3(c.x + rx * j(), c.y, c.z),
    v3(c.x - rx * j(), c.y, c.z),
    v3(c.x, c.y + ry * j(), c.z),
    v3(c.x, c.y - ry * j(), c.z),
    v3(c.x, c.y, c.z + rz * j()),
    v3(c.x, c.y, c.z - rz * j()),
  ];
  const [light, dark] = PALETTE.bonsai;
  for (const [a, b] of [[px, pz], [pz, nx], [nx, nz], [nz, px]]) {
    polygon(s, [a, b, py], light, {}, a.clone().add(b).add(py).sub(c.clone().multiplyScalar(3)));
    polygon(s, [a, b, ny], dark, {}, a.clone().add(b).add(ny).sub(c.clone().multiplyScalar(3)));
  }
};

// Artificial bonsai in a grey rectangular pot with pebbles: a bent trunk,
// a layered canopy of foliage clusters
const buildBonsai = (s, [x, z], yaw, clusters, random) => {
  inFrame(s, frame(x, TOP, z, yaw), () => {
    const [hx, hz, h] = [0.07, 0.05, 0.05];
    box(s, [-hx, hx], [0, h], [-hz, hz], PALETTE.bonsaiPot, { omit: "-y+y" });
    const rim = 0.008;
    flatGrid(s, [-hx, hx], [-hz, -hz + rim], h, 1, 1, PALETTE.bonsaiPot);
    flatGrid(s, [-hx, hx], [hz - rim, hz], h, 1, 1, PALETTE.bonsaiPot);
    flatGrid(s, [-hx, -hx + rim], [-hz + rim, hz - rim], h, 1, 1, PALETTE.bonsaiPot);
    flatGrid(s, [hx - rim, hx], [-hz + rim, hz - rim], h, 1, 1, PALETTE.bonsaiPot);
    flatGrid(s, [-hx + rim, hx - rim], [-hz + rim, hz - rim], h - 0.002, 1, 1, PALETTE.pebble);
    for (let k = 0; k < 8; k++) {
      const c = v3(-0.05 + random() * 0.1, h - 0.0015, -0.03 + random() * 0.06);
      const r = 0.004 + random() * 0.003;
      polygon(s, [0, 2.1, 4.2].map((a) => v3(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r)), C.pebbleDark, {}, UP);
    }
    const trunk = [v3(0.01, h - 0.002, 0), v3(-0.008, 0.1, 0.004), v3(0.014, 0.14, -0.004), v3(0.0, 0.18, 0.0)];
    tube(s, trunk, 0.008, 4, C.bark);
    // The canopy: three tiers, wide and low to narrow and high
    for (let k = 0; k < clusters; k++) {
      const tier = k % 3;
      const a = (k / clusters) * Math.PI * 2 * 2.3 + random();
      const spread = [0.085, 0.06, 0.03][tier] * (0.7 + random() * 0.5);
      const c = v3(Math.cos(a) * spread, 0.13 + tier * 0.035 + random() * 0.02, Math.sin(a) * spread * 0.6);
      const r = 0.032 + random() * 0.015;
      cluster(s, c, r, r * 0.7, r * 0.85, random);
    }
  });
};

// Contact blobs: on the oak, on the felt
const buildBlobs = (s) => {
  const oak = [
    [0.78, -1.55, 0.17, 0.12],
    [1.35, -1.578, 0.155, 0.12],
    [1.88, -1.62, 0.13, 0.13],
    [1.1, -1.68, 0.05, 0.055],
    [1.62, -1.68, 0.05, 0.055],
    [1.76, -1.45, 0.055, 0.055],
    [0.72, -1.36, 0.11, 0.06],
    [1.83, -1.24, 0.085, 0.065],
    [1.92, -1.38, 0.085, 0.065],
  ];
  // Each 0.4 mm above the last, so overlapping blobs never z-fight
  oak.forEach(([x, z, rx, rz], k) => contactShadow(s, x, z, rx, rz, PALETTE.deskOak, TOP + k * 0.0004, 12));
  const felt = [
    [1.25, -1.27, 0.18, 0.08],
    [1.6, -1.25, 0.045, 0.07],
    [1.46, -1.42, 0.05, 0.05],
    [0.95, -1.17, 0.12, 0.08],
  ];
  felt.forEach(([x, z, rx, rz], k) => contactShadow(s, x, z, rx, rz, PALETTE.felt, MAT_Y + k * 0.0004, 12));
};

// A soft pool of light on a GlowSink, sampled on a grid over its ellipse
// (clipped to `clip` = [[u0, u1], [v0, v1]]): colour × (1 − r²)² per
// vertex. plane "xz" (y = height(x, z) of the cell) or "xy" (a wall at
// depth `at`).
const pool = (glow, { c, ra, rb, color, clip, plane = "xz", at = 0, height = () => at, step = 0.1 }) => {
  const range = (centre, r, [lo, hi]) => [Math.max(centre - r, lo), Math.min(centre + r, hi)];
  const [u0, u1] = range(c[0], ra, clip[0]);
  const [w0, w1] = range(c[1], rb, clip[1]);
  const nu = Math.max(1, Math.ceil((u1 - u0) / step));
  const nw = Math.max(1, Math.ceil((w1 - w0) / step));
  const black = new THREE.Color(0, 0, 0);
  const shade = (u, w) => {
    const r2 = ((u - c[0]) / ra) ** 2 + ((w - c[1]) / rb) ** 2;
    return r2 >= 1 ? black : color.clone().multiplyScalar((1 - r2) ** 2);
  };
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nw; j++) {
      const [ua, ub] = [u0 + ((u1 - u0) * i) / nu, u0 + ((u1 - u0) * (i + 1)) / nu];
      const [wa, wb] = [w0 + ((w1 - w0) * j) / nw, w0 + ((w1 - w0) * (j + 1)) / nw];
      const corners = [[ua, wb], [ub, wb], [ub, wa], [ua, wa]];
      if (corners.every(([u, w]) => shade(u, w) === black)) continue;
      const y = height((ua + ub) / 2, (wa + wb) / 2);
      // xz: wound to face up; xy: wound to face +z
      const pts = plane === "xz" ? corners.map(([u, w]) => v3(u, y, w)) : [...corners].reverse().map(([u, w]) => v3(u, w, at));
      const cols = (plane === "xz" ? corners : [...corners].reverse()).map(([u, w]) => shade(u, w));
      glow.tri(pts[0], pts[1], pts[2], cols[0], cols[1], cols[2], 0);
      glow.tri(pts[0], pts[2], pts[3], cols[0], cols[2], cols[3], 0);
    }
  }
};

// The desk's glow decals, all on the lamps channel: the desk lamp's pool
// on the desk and mat, the light bar's strip on the mat, the monitor's
// bias light and the lamp's wash on the back wall
const buildDeskGlow = (glow) => {
  const inMat = (x, z) => x > MAT.x[0] && x < MAT.x[1] && z > MAT.z[0] && z < MAT.z[1];
  const surface = (x, z) => (inMat(x, z) ? MAT_Y : TOP) + 0.003;
  const deskClip = [[X0, X1], [Z0, Z1]];
  pool(glow, { c: [1.8, -1.38], ra: 0.45, rb: 0.45, color: LIGHT.desk.clone().multiplyScalar(0.45), clip: deskClip, height: surface, step: 0.09 });
  pool(glow, { c: [1.35, -1.4], ra: 0.3, rb: 0.14, color: LIGHT.lightBar.clone().multiplyScalar(0.35), clip: [MAT.x, MAT.z], height: () => MAT_Y + 0.003, step: 0.07 });
  const wallClip = [[X0, X1 + 0.6], [TOP, 2.3]];
  const wall = BACK + 0.003;
  pool(glow, { c: [1.35, 1.1], ra: 0.53, rb: 0.36, color: LIGHT.bias.clone().multiplyScalar(0.12), clip: wallClip, plane: "xy", at: wall, step: 0.1 });
  pool(glow, { c: [1.8, 1.08], ra: 0.6, rb: 0.6, color: LIGHT.desk.clone().multiplyScalar(0.15), clip: wallClip, plane: "xy", at: wall, step: 0.12 });
};

// Desk, its items, laptop, monitor body, light bar, desk lamp, bonsai ×2,
// desk glow decals
export const buildDesk = (out, ctx) => {
  const s = out.solid;
  const { isMobile, random } = ctx;
  const sides = 8;
  buildTop(s, random);
  buildFrame(s);
  buildMat(s, random);
  buildBlobs(s);
  buildKeyboard(s);
  buildMouse(s);
  buildNotebook(s);
  buildPen(s);
  buildSticky(s);
  buildHeadphones(s, 10);
  buildPouch(s);
  buildLaptop(s);
  buildMonitor(s, sides);
  buildSpeakers(s, sides);
  buildMagSafe(s, 12);
  buildDeskLamp(s, 12);
  // MOBILE_PERF: 8 bonsai foliage clusters on mobile — revert by removing the ternary
  const clusters = isMobile ? 8 : 14;
  buildBonsai(s, [1.83, -1.24], 0.15, clusters, random);
  buildBonsai(s, [1.92, -1.38], -0.2, clusters, random);
  buildDeskGlow(out.glow);
};

// The backpack: true scale, outside the vignette. Black, leaning back a
// little, with a front pocket, its zip and a top handle.
const PACK = hex("#232428");
export const buildBackpack = (out) => {
  const s = out.solid;
  inFrame(s, frame(2.45, FLOOR_Y, -0.75, 0, rotX(-0.17)), () => {
    bevelBox(s, [-0.15, 0.15], [0, 0.45], [-0.09, 0.09], 0.035, PACK);
    bevelBox(s, [-0.11, 0.11], [0.05, 0.25], [0.08, 0.12], 0.02, PACK.clone().multiplyScalar(1.25));
    box(s, [-0.1, 0.1], [0.255, 0.26], [0.085, 0.095], C.ink, { omit: "-y" });
    tube(s, [v3(-0.05, 0.44, 0), v3(-0.03, 0.48, 0), v3(0.03, 0.48, 0), v3(0.05, 0.44, 0)], 0.008, 4, PACK);
  });
  contactShadow(s, 2.45, -0.77, 0.17, 0.11, PALETTE.floorOak[0], FLOOR_Y, 12);
};
