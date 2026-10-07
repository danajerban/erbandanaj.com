import * as THREE from "three";
import { PALETTE, hex } from "./bake";
import { RUG_Y } from "./layout";
import { box, contactShadow, cylinder, cylinderBetween, polygon, prism, v3 } from "./shapes";

// Projects: the black mesh office chair (desk corner step), at { x, z, yaw }
// (layout.js CHAIR); out = { solid, glow }, ctx = { isMobile, layout, random }.
// Built in its own frame (front +z, the backrest at −z); every part lies
// within 0.355 of its centre on the floor plan.

const C = {
  shell: PALETTE.steel,
  cushion: hex("#5b5c60"),
  mesh: [hex("#26272b"), hex("#18191c")],
  chrome: hex("#c9ccd0"),
  caster: hex("#111113"),
};

// A seat outline: a 0.50 square with 0.06 chamfered corners, in [x, z]
const SEAT = (() => {
  const [h, c] = [0.25, 0.06];
  return [[-h + c, h], [h - c, h], [h, h - c], [h, -h + c], [h - c, -h], [-h + c, -h], [-h, -h + c], [-h, h - c]];
})();
const inset = (outline, k) => outline.map(([x, z]) => [x * k, z * k]);

// The backrest's surface: across x it wraps forward at the sides, up y it
// bulges forward at the lumbar
const backZ = (x, y) => -0.27 + 0.06 * (x / 0.24) ** 2 + 0.03 * Math.exp(-(((y - 0.74) / 0.1) ** 2));

// A curved mesh panel (backrest or headrest): a grid over x × y on
// surface z(x, y), its back (−z, the side the room sees) striped by row,
// its front plain, the rim closed
const panel = (s, [x0, x1], [y0, y1], z, depth, nx, ny, striped, plain) => {
  const p = (i, j, dz = 0) => {
    const x = x0 + ((x1 - x0) * i) / nx;
    const y = y0 + ((y1 - y0) * j) / ny;
    return v3(x, y, z(x, y) + dz);
  };
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const color = striped[j % 2];
      // Back face (−z): wound clockwise seen from +z
      s.quad(p(i, j, -depth), p(i, j + 1, -depth), p(i + 1, j + 1, -depth), p(i + 1, j, -depth), color);
      s.quad(p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1), plain);
    }
  }
  const rim = (a, b) => polygon(s, [a(0), b(0), b(-depth), a(-depth)], plain, {}, a(0).add(b(0)).multiplyScalar(0.5).sub(v3((x0 + x1) / 2, (y0 + y1) / 2, a(0).z)));
  for (let i = 0; i < nx; i++) {
    rim((dz) => p(i, 0, dz), (dz) => p(i + 1, 0, dz));
    rim((dz) => p(i, ny, dz), (dz) => p(i + 1, ny, dz));
  }
  for (let j = 0; j < ny; j++) {
    rim((dz) => p(0, j, dz), (dz) => p(0, j + 1, dz));
    rim((dz) => p(nx, j, dz), (dz) => p(nx, j + 1, dz));
  }
};

export const buildOfficeChair = (out, ctx, { x, z, yaw }) => {
  const s = out.solid;
  // MOBILE_PERF: 5-sided caster and lift cylinders on mobile — revert by removing the ternary
  const sides = ctx.isMobile ? 5 : 8;
  contactShadow(s, x, z, 0.3, 0.3, PALETTE.sand, RUG_Y, 12);
  s.push(new THREE.Matrix4().makeTranslation(x, RUG_Y, z).multiply(new THREE.Matrix4().makeRotationY(yaw)));

  // Chrome 5-star base on casters, the hub and the gas lift
  const hub = v3(0, 0.1, 0);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    const dir = v3(Math.sin(a), 0, Math.cos(a));
    const tip = dir.clone().multiplyScalar(0.3).setY(0.07);
    cylinderBetween(s, hub, tip, 0.024, 0.015, 4, C.chrome, { caps: "end", phase: Math.PI / 4 });
    const wheel = dir.clone().multiplyScalar(0.305).setY(0.026);
    const across = v3(dir.z, 0, -dir.x).multiplyScalar(0.011);
    cylinderBetween(s, wheel.clone().sub(across), wheel.clone().add(across), 0.025, 0.025, sides, C.caster);
    cylinderBetween(s, wheel.clone().setY(0.05), tip, 0.006, 0.006, 4, C.chrome, { caps: false });
  }
  cylinder(s, [0, 0], [0.06, 0.13], [0.045, 0.04], sides, C.shell, { caps: "end" });
  cylinder(s, [0, 0], [0.13, 0.26], [0.032, 0.032], sides, C.shell, { caps: false });
  cylinder(s, [0, 0], [0.26, 0.43], [0.025, 0.025], sides, C.chrome, { caps: false });

  // Seat: the black shell, the grey cushion, the mechanism under it
  box(s, [-0.09, 0.09], [0.4, 0.43], [-0.11, 0.09], C.shell, { omit: "+y" });
  prism(s, SEAT, [0.43, 0.46], C.shell, { axis: "y" });
  prism(s, inset(SEAT, 0.95), [0.46, 0.5], C.cushion, { axis: "y", omit: "start" });

  // The spine from the seat's back up to the backrest
  const spine = [v3(0, 0.44, -0.18), v3(0, 0.5, -0.27), v3(0, 0.64, -0.275)];
  for (let k = 0; k < spine.length - 1; k++) cylinderBetween(s, spine[k], spine[k + 1], 0.024, 0.024, 4, C.shell, { phase: Math.PI / 4 });

  // Mesh backrest 0.48 × 0.58 (y 0.62–1.20), the headrest on its stalk
  panel(s, [-0.24, 0.24], [0.62, 1.2], backZ, 0.02, 6, 8, C.mesh, C.shell);
  cylinderBetween(s, v3(0, 1.17, backZ(0, 1.17) - 0.022), v3(0, 1.27, -0.295), 0.012, 0.012, 4, C.shell);
  const headZ = (hx) => -0.28 + 0.05 * (hx / 0.15) ** 2;
  panel(s, [-0.15, 0.15], [1.24, 1.38], (hx) => headZ(hx), 0.025, 4, 3, C.mesh, C.shell);

  // L-post armrests: a bracket under the seat, the post, the pad
  for (const side of [-1, 1]) {
    const xs = (a, b) => (side > 0 ? [a, b] : [-b, -a]);
    box(s, xs(0.12, 0.27), [0.41, 0.435], [-0.03, 0.03], C.shell, { omit: "" });
    box(s, xs(0.245, 0.275), [0.435, 0.66], [-0.025, 0.025], C.shell, { omit: "-y+y" });
    box(s, xs(0.22, 0.3), [0.66, 0.69], [-0.13, 0.13], C.shell, { omit: "-y" });
  }
  s.pop();
};
