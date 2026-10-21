import { PALETTE, hex } from "./bake";
import { BACK, FLOOR_Y } from "./layout";
import { bevelBox, box, contactShadow, cylinder, cylinderBetween, fan, polygon, v3 } from "./shapes";

// Projects: the left corner, where the back wall meets the window wall.
// A light-oak wardrobe with simple Scandinavian lines (two flush doors with
// vertical grain, slim black pulls, a thin overhanging top, tapered legs), a
// woven basket and a folded linen throw on top, and a framed print on the
// back wall: a coral sun setting over two hills, like the beach at Home.
// out = { solid, glow }, ctx = { isMobile, layout, random }; room frame,
// true scale (layout.js WARDROBE and PRINT).

const C = {
  oak: hex("#dfba8a"),
  grain: hex("#cea06c"),
  seam: hex("#6e5238"),
  pull: PALETTE.steel,
  rattan: [hex("#c39a62"), hex("#a98150")],
  linen: hex("#e9dcc6"),
  paper: hex("#f1e4cf"),
  sun: PALETTE.coral,
  hill: [hex("#a3ad8a"), hex("#c98b67")],
};

const FRONT = v3(0, 0, 1);

// A flat panel facing +z split into vertical grain bands (seeded weights,
// alternating light and deep oak)
const grainPanel = (s, [x0, x1], [y0, y1], z, bands, random) => {
  const weights = Array.from({ length: bands }, () => 0.6 + random() * 0.8);
  const total = weights.reduce((a, b) => a + b, 0);
  let x = x0;
  weights.forEach((weight, k) => {
    const x2 = k === bands - 1 ? x1 : x + ((x1 - x0) * weight) / total;
    const color = C.oak.clone().lerp(C.grain, k % 2 ? 0.25 + random() * 0.3 : random() * 0.1);
    polygon(s, [v3(x, y0, z), v3(x2, y0, z), v3(x2, y1, z), v3(x, y1, z)], color, {}, FRONT);
    x = x2;
  });
};

const buildWardrobe = (s, { x: [x0, x1], depth, height, legs }, random) => {
  const zb = BACK + 0.01;
  const zf = zb + depth - 0.018;
  const top = height - 0.025;
  const mid = (x0 + x1) / 2;
  contactShadow(s, mid, zb + depth / 2, (x1 - x0) / 2 + 0.06, depth / 2 + 0.05, PALETTE.floorOak[1], FLOOR_Y, 12);

  // Tapered legs, splayed a little outward
  for (const lx of [x0 + 0.06, x1 - 0.06]) {
    for (const lz of [zb + 0.06, zf - 0.05]) {
      const out = v3(Math.sign(lx - mid) * 0.012, 0, Math.sign(lz - (zb + zf) / 2) * 0.012);
      cylinderBetween(s, v3(lx, legs, lz), v3(lx + out.x, FLOOR_Y, lz + out.z), 0.022, 0.014, 6, C.grain, { caps: false });
    }
  }

  // The carcass (its front shows only in the seam between the doors), the
  // thin top overhanging the sides and the front
  box(s, [x0, x1], [legs, top], [zb, zf], C.oak, { omit: "-z-y", faces: { "+z": C.seam } });
  bevelBox(s, [x0 - 0.008, x1 + 0.008], [top, height], [zb, zf + 0.026], 0.004, C.oak);

  // Two flush doors, 3 mm apart, with vertical grain, and their pulls
  const gap = 0.003;
  for (const [a, b] of [[x0 + 0.004, mid - gap], [mid + gap, x1 - 0.004]]) {
    const ys = [legs + 0.012, top - 0.01];
    box(s, [a, b], ys, [zf, zf + 0.018], C.grain, { omit: "-z+z" });
    grainPanel(s, [a, b], ys, zf + 0.018, 9, random);
    const px = a < mid ? b - 0.035 : a + 0.035;
    box(s, [px - 0.006, px + 0.006], [0.9, 1.22], [zf + 0.018, zf + 0.036], C.pull, { omit: "-z" });
  }

  // On top: a woven basket (horizontal weave bands) and a folded throw
  const bx = x0 + 0.17;
  const bz = zb + depth / 2 - 0.02;
  const bands = 4;
  for (let k = 0; k < bands; k++) {
    const [y0, y1] = [height + (0.15 * k) / bands, height + (0.15 * (k + 1)) / bands];
    const [r0, r1] = [0.11 + (0.015 * k) / bands, 0.11 + (0.015 * (k + 1)) / bands];
    cylinder(s, [bx, bz], [y0, y1], [r0, r1], 10, C.rattan[k % 2], { caps: k === 0 ? "start" : false });
  }
  const rim = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return v3(bx + Math.cos(a) * 0.125, height + 0.15, bz + Math.sin(a) * 0.125);
  });
  // The basket's dark inside, seen from above
  fan(s, v3(bx, height + 0.15, bz), rim, C.rattan[1].clone().multiplyScalar(0.55), C.rattan[1].clone().multiplyScalar(0.8));
  const tx = x1 - 0.2;
  bevelBox(s, [tx - 0.15, tx + 0.15], [height, height + 0.045], [bz - 0.13, bz + 0.13], 0.012, C.linen);
  bevelBox(s, [tx - 0.14, tx + 0.13], [height + 0.045, height + 0.085], [bz - 0.12, bz + 0.12], 0.012, C.linen.clone().multiplyScalar(0.94));
};

// A hump from xa to xb on the art's bottom edge, rising to `peak`
const hill = (s, [xa, xb], y0, peak, z, color, segments = 8) => {
  const pts = [v3(xa, y0, z), v3(xb, y0, z)];
  for (let k = segments; k >= 0; k--) {
    const t = k / segments;
    pts.push(v3(xa + (xb - xa) * t, y0 + peak * Math.sin(Math.PI * t) ** 0.8, z));
  }
  polygon(s, pts, color, {}, FRONT);
};

const buildPrint = (s, { x, y, w, h }) => {
  const z = BACK;
  const [fw, fd, matW] = [0.018, 0.02, 0.035];
  const [l, r, b, t] = [x - w / 2, x + w / 2, y - h / 2, y + h / 2];
  // Thin oak frame
  box(s, [l, r], [t - fw, t], [z, z + fd], PALETTE.oak, { omit: "-z" });
  box(s, [l, r], [b, b + fw], [z, z + fd], PALETTE.oak, { omit: "-z" });
  box(s, [l, l + fw], [b + fw, t - fw], [z, z + fd], PALETTE.oak, { omit: "-z-y+y" });
  box(s, [r - fw, r], [b + fw, t - fw], [z, z + fd], PALETTE.oak, { omit: "-z-y+y" });
  // Cream mat, then the art: paper, the sun, two hills over it
  const zm = z + 0.008;
  polygon(s, [v3(l + fw, b + fw, zm), v3(r - fw, b + fw, zm), v3(r - fw, t - fw, zm), v3(l + fw, t - fw, zm)], PALETTE.sandLine, {}, FRONT);
  const [al, ar, ab, at] = [l + fw + matW, r - fw - matW, b + fw + matW, t - fw - matW];
  const za = zm + 0.001;
  polygon(s, [v3(al, ab, za), v3(ar, ab, za), v3(ar, at, za), v3(al, at, za)], C.paper, {}, FRONT);
  const sun = v3(x + 0.012, ab + (at - ab) * 0.42, za + 0.001);
  const half = Array.from({ length: 11 }, (_, i) => {
    const a = (i / 10) * Math.PI;
    return v3(sun.x + Math.cos(a) * 0.05, sun.y + Math.sin(a) * 0.05, sun.z);
  });
  polygon(s, half, C.sun, {}, FRONT);
  hill(s, [al, ar], ab, (at - ab) * 0.4, za + 0.002, C.hill[0]);
  hill(s, [al + (ar - al) * 0.3, ar], ab, (at - ab) * 0.26, za + 0.003, C.hill[1]);
};

export const buildWardrobeCorner = (out, ctx, wardrobe, print) => {
  buildWardrobe(out.solid, wardrobe, ctx.random);
  buildPrint(out.solid, print);
};
