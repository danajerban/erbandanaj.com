import * as THREE from "three";
import { AO, LIGHT, PALETTE } from "./bake";
import { ARCH, BACK, FLOOR_Y, RUG_Y, SIDE_END, SLAB, SLAB_FRONT, T, TITLE, WALL_H, WINDOW, titleLeft } from "./layout";
import { box, cylinderBetween, fan, polygon, tube, v3, wallWithHoles } from "./shapes";

// The empty room of each office corner (room frame): floor slab with oak
// planks, back wall with the hallway arch (and, at Skills, the big window),
// left side wall (at Projects, with the window), trim, sill, mullions, rod,
// lace, rug, skirting, baked AO, the clay block behind the title; at
// Projects the wall socket and its cable; at Skills the afterglow the
// window throws on the floor.
// out = { solid: OfficeSink (shell), furniture: OfficeSink, glow: GlowSink,
// lace: LaceSink }.

const UP = v3(0, 1, 0);
const PLANK = 0.18;
const SEAM = 0.004;
const SKIRT_H = 0.07;
const SKIRT_D = 0.012;
const CASING = 0.07;
const CASING_D = 0.02;
const ROD_R = 0.012;
const FINIAL_R = 0.02;
const AO_FOOT = 0.25;
const AO_CORNER = 0.2;
const AO_FLOOR = 0.3;
// Plank segments split on this grid too (per-vertex lamp light)
const PLANK_STEP = 0.5;
// Curtains: pleats across the panel
const PLEAT_AMPLITUDE = 0.035;
const PLEAT_PERIOD = 0.12;
const LACE_BOTTOM = 0.02;
const LACE_ROWS = 8;
// Rug
const RUG_BORDER = 0.08;
const RUG_LINE = 0.02;
const RUG_STEP = 0.3;

const smooth01 = (x) => THREE.MathUtils.smoothstep(x, 0, 1);
const shade = (color, k) => color.clone().multiplyScalar(k);

// The floor's AO: in front of the back wall, and along the side wall up to
// its front end (fading out past it)
const floorAo = (x, z, xi) => {
  const back = AO.floorEdge(z - BACK);
  const side = 1 - (1 - AO.floorEdge(x - xi)) * (1 - smooth01((z - SIDE_END) / AO_FLOOR));
  return back * side;
};

// Oak planks along z over x [xa, xb], z [za, zb]: 2–3 segments each with
// staggered 4 mm seams, the three tones by seeded random
const planks = (sink, [xa, xb], [za, zb], random, { y = FLOOR_Y, tone = 1, ao = () => 1, zBreaks = [] } = {}) => {
  const length = zb - za;
  for (let x = xa; x < xb - 1e-6; x += PLANK) {
    const x2 = Math.min(x + PLANK, xb);
    const count = random() < 0.5 ? 2 : 3;
    const joints = [];
    for (let k = 1; k < count; k++) joints.push(za + length * (k / count + (random() - 0.5) * 0.25));
    const ends = [za, ...joints, zb];
    for (let k = 0; k < ends.length - 1; k++) {
      const z0 = ends[k] + (k > 0 ? SEAM / 2 : 0);
      const z1 = ends[k + 1] - (k < ends.length - 2 ? SEAM / 2 : 0);
      const color = shade(PALETTE.floorOak[Math.floor(random() * 3)], tone);
      const cuts = [z0];
      for (let z = za + PLANK_STEP; z < zb; z += PLANK_STEP) if (z > z0 + 0.05 && z < z1 - 0.05) cuts.push(z);
      for (const z of zBreaks) if (z > z0 + 0.02 && z < z1 - 0.02) cuts.push(z);
      cuts.sort((a, b) => a - b).push(z1);
      for (let i = 0; i < cuts.length - 1; i++) {
        const [c0, c1] = [cuts[i], cuts[i + 1]];
        sink.quad(v3(x, y, c1), v3(x2, y, c1), v3(x2, y, c0), v3(x, y, c0), color, {
          ao: [ao(x, c1), ao(x2, c1), ao(x2, c0), ao(x, c0)],
        });
      }
    }
    for (const z of joints) {
      const seam = shade(PALETTE.seam, tone);
      sink.quad(v3(x, y, z + SEAM / 2), v3(x2, y, z + SEAM / 2), v3(x2, y, z - SEAM / 2), v3(x, y, z - SEAM / 2), seam, {
        ao: ao(x, z),
      });
    }
  }
};

// The slab's cut faces (front, ends) under the floor top
const slabEdges = (sink, [xa, xb], [za, zb], { front = true, left = true, right = true } = {}) => {
  const y = [FLOOR_Y - SLAB, FLOOR_Y];
  const omit = `-y+y-z${front ? "" : "+z"}${left ? "" : "-x"}${right ? "" : "+x"}`;
  box(sink, [xa, xb], y, [za, zb], PALETTE.slabEdge, { omit });
};

// Floor slab, planks, hallway threshold and stub
const buildFloor = (sink, corner, random) => {
  const { x0, x1 } = WINDOW[corner].room;
  const xi = x0 + T;
  const ao = (x, z) => floorAo(x, z, xi);
  const zBreaks = [BACK + AO_FLOOR, SIDE_END, SIDE_END + AO_FLOOR];
  // Under the side wall's footprint only in front of its end
  planks(sink, [x0, xi], [SIDE_END, SLAB_FRONT], random, { ao, zBreaks });
  planks(sink, [xi, x1], [BACK, SLAB_FRONT], random, { ao, zBreaks });
  slabEdges(sink, [x0, x1], [BACK - T, SLAB_FRONT]);
  // The arch's threshold, flush with the floor, then the hallway stub
  // (nothing above it: the sky shows through the arch)
  sink.quad(v3(-ARCH.x, FLOOR_Y, BACK), v3(ARCH.x, FLOOR_Y, BACK), v3(ARCH.x, FLOOR_Y, BACK - T), v3(-ARCH.x, FLOOR_Y, BACK - T), PALETTE.oak);
  const stub = [BACK - T - 0.63, BACK - T];
  planks(sink, [-ARCH.x, ARCH.x], stub, random, { tone: 0.9 });
  slabEdges(sink, [-ARCH.x, ARCH.x], [stub[0], stub[1]], { front: false });
};

// The walls: faces with holes, reveals, caps, skirting, arch casing
const buildWalls = (sink, corner) => {
  const w = WINDOW[corner];
  const { x0, x1 } = w.room;
  const xi = x0 + T;
  const foot = (y) => AO.wallFoot(y - FLOOR_Y);
  const arch = { u: [-ARCH.x, ARCH.x], v: [FLOOR_Y, ARCH.top], arch: true };
  const backHoles = w.wall === "back" ? [arch, { ...w.hole, bottom: false }] : [arch];
  const vBreaks = [FLOOR_Y + AO_FOOT];

  // Back wall: its face looks along +z
  wallWithHoles(sink, { u: [xi, x1], v: [FLOOR_Y, WALL_H] }, backHoles, { o: v3(0, 0, BACK), u: v3(1, 0, 0), v: UP }, PALETTE.limewash, {
    ao: (u, v) => foot(v) * AO.corner(u - xi),
    breaks: { u: [xi + AO_CORNER], v: vBreaks },
    depth: T,
    revealAo: AO.reveal,
  });
  // Left side wall: its face looks along +x, u runs along −z
  const sideHoles = w.wall === "side" ? [{ u: [-w.hole.u[1], -w.hole.u[0]], v: w.hole.v, bottom: false }] : [];
  wallWithHoles(sink, { u: [-SIDE_END, -BACK], v: [FLOOR_Y, WALL_H] }, sideHoles, { o: v3(xi, 0, 0), u: v3(0, 0, -1), v: UP }, PALETTE.limewash, {
    ao: (u, v) => foot(v) * AO.corner(-BACK - u),
    breaks: { u: [-BACK - AO_CORNER], v: vBreaks },
    depth: T,
    revealAo: AO.reveal,
  });

  // The model cut: wall tops, the side wall's front end, the back wall's
  // right end
  const cut = PALETTE.cut;
  polygon(sink, [v3(x0, WALL_H, BACK - T), v3(x1, WALL_H, BACK - T), v3(x1, WALL_H, BACK), v3(x0, WALL_H, BACK)], cut, {}, UP);
  polygon(sink, [v3(x0, WALL_H, BACK), v3(xi, WALL_H, BACK), v3(xi, WALL_H, SIDE_END), v3(x0, WALL_H, SIDE_END)], cut, {}, UP);
  polygon(sink, [v3(x0, FLOOR_Y, SIDE_END), v3(xi, FLOOR_Y, SIDE_END), v3(xi, WALL_H, SIDE_END), v3(x0, WALL_H, SIDE_END)], cut, {}, v3(0, 0, 1));
  polygon(sink, [v3(x1, FLOOR_Y, BACK - T), v3(x1, FLOOR_Y, BACK), v3(x1, WALL_H, BACK), v3(x1, WALL_H, BACK - T)], cut, {}, v3(1, 0, 0));

  // Skirting: along the back wall, broken by the arch casing; along the
  // side wall to its front end
  const skirt = [FLOOR_Y, FLOOR_Y + SKIRT_H];
  const edge = ARCH.x + CASING;
  box(sink, [xi, -edge], skirt, [BACK, BACK + SKIRT_D], PALETTE.trim, { omit: "-y-z-x", ao: AO.wallFoot(0.12) });
  box(sink, [edge, x1], skirt, [BACK, BACK + SKIRT_D], PALETTE.trim, { omit: "-y-z-x", ao: AO.wallFoot(0.12) });
  box(sink, [xi, xi + SKIRT_D], skirt, [BACK + SKIRT_D, SIDE_END], PALETTE.trim, { omit: "-y-z-x", ao: AO.wallFoot(0.12) });

  // Arch casing: a flat band around the jambs and the head
  for (const s of [-1, 1]) {
    const xs = s < 0 ? [-edge, -ARCH.x] : [ARCH.x, edge];
    box(sink, xs, [FLOOR_Y, ARCH.spring], [BACK, BACK + CASING_D], PALETTE.trim, { omit: "-y+y-z" });
  }
  const segments = 12;
  const centre = v3(0, ARCH.spring, BACK);
  const at = (r, t, z) => v3(r * Math.cos(t), ARCH.spring + r * Math.sin(t), z);
  const [zf, zb] = [BACK + CASING_D, BACK];
  for (let k = 0; k < segments; k++) {
    const [t0, t1] = [Math.PI - (k / segments) * Math.PI, Math.PI - ((k + 1) / segments) * Math.PI];
    const [ri, ro] = [ARCH.x, edge];
    polygon(sink, [at(ri, t0, zf), at(ro, t0, zf), at(ro, t1, zf), at(ri, t1, zf)], PALETTE.trim, {}, v3(0, 0, 1));
    const mid = at(ri, (t0 + t1) / 2, BACK).sub(centre);
    polygon(sink, [at(ri, t0, zb), at(ri, t1, zb), at(ri, t1, zf), at(ri, t0, zf)], PALETTE.trim, {}, mid.clone().negate());
    polygon(sink, [at(ro, t0, zb), at(ro, t1, zb), at(ro, t1, zf), at(ro, t0, zf)], PALETTE.trim, {}, mid);
  }
};

// Window trim, sill, the reveal floor behind the sill, mullions, transom,
// rod with finials and brackets. The Skills window is in the back wall
// (u = x), the Projects one in the left side wall (u = z).
const buildWindow = (sink, corner) => {
  const w = WINDOW[corner];
  const { trim, sill, transom, rod } = w;
  const [a, b] = w.hole.u;
  const [c, d] = w.hole.v;
  const { trim: white, oak } = PALETTE;
  box(sink, sill.x, sill.y, sill.z, oak, { omit: "-y-z" });
  if (w.wall === "back") {
    const z = [BACK, BACK + 0.015];
    box(sink, [a - trim, a], [c, d], z, white, { omit: "-z-y" });
    box(sink, [b, b + trim], [c, d], z, white, { omit: "-z-y" });
    box(sink, [a - trim, b + trim], [d, d + trim], z, white, { omit: "-z" });
    // The reveal's floor behind the sill
    polygon(sink, [v3(a, c, BACK - T), v3(b, c, BACK - T), v3(b, c, sill.z[0]), v3(a, c, sill.z[0])], PALETTE.limewash, { ao: AO.reveal }, UP);
    // Mullions and the transom between them, set in the reveal
    const inset = [-1.88, -1.84];
    const bars = w.mullions.map((m) => [m - 0.02, m + 0.02]);
    for (const xs of bars) box(sink, xs, [c, d], inset, white, { omit: "-z-y+y" });
    const gaps = [a, ...bars.flat(), b];
    for (let i = 0; i < gaps.length; i += 2) box(sink, [gaps[i], gaps[i + 1]], transom, inset, white, { omit: "-z-x+x" });
    // Rod along x
    const y = rod.y;
    cylinderBetween(sink, v3(rod.x[0], y, rod.z), v3(rod.x[1], y, rod.z), ROD_R, ROD_R, 6, oak, { caps: false });
    for (const x of rod.x) cylinderBetween(sink, v3(x - FINIAL_R, y, rod.z), v3(x + FINIAL_R, y, rod.z), FINIAL_R, FINIAL_R, 6, oak);
    for (const x of rod.brackets) box(sink, [x - 0.01, x + 0.01], [y - 0.01, y + 0.01], [BACK, rod.z], oak, { omit: "-z" });
  } else {
    const xi = w.room.x0 + T;
    const x = [xi, xi + 0.015];
    // u runs along z here: a, b are the hole's z range
    box(sink, x, [c, d], [a - trim, a], white, { omit: "-x-y" });
    box(sink, x, [c, d], [b, b + trim], white, { omit: "-x-y" });
    box(sink, x, [d, d + trim], [a - trim, b + trim], white, { omit: "-x" });
    polygon(sink, [v3(w.room.x0, c, a), v3(sill.x[0], c, a), v3(sill.x[0], c, b), v3(w.room.x0, c, b)], PALETTE.limewash, { ao: AO.reveal }, UP);
    const inset = [xi - 0.08, xi - 0.04];
    const bars = w.mullions.map((m) => [m - 0.02, m + 0.02]);
    for (const zs of bars) box(sink, inset, [c, d], zs, white, { omit: "-x-y+y" });
    const gaps = [a, ...bars.flat(), b];
    for (let i = 0; i < gaps.length; i += 2) box(sink, inset, transom, [gaps[i], gaps[i + 1]], white, { omit: "-x-z+z" });
    // Rod along z
    const y = rod.y;
    cylinderBetween(sink, v3(rod.x, y, rod.z[0]), v3(rod.x, y, rod.z[1]), ROD_R, ROD_R, 6, oak, { caps: false });
    for (const z of rod.z) cylinderBetween(sink, v3(rod.x, y, z - FINIAL_R), v3(rod.x, y, z + FINIAL_R), FINIAL_R, FINIAL_R, 6, oak);
    for (const z of rod.brackets) box(sink, [xi, rod.x], [y - 0.01, y + 0.01], [z - 0.01, z + 0.01], oak, { omit: "-x" });
  }
};

// Lace: pleated panels hung at the rod, with (u, h) baked per vertex
const buildLace = (sink, corner, isMobile) => {
  const w = WINDOW[corner];
  const { panels, top, at } = w.lace;
  // MOBILE_PERF: 12 lace columns on mobile — revert by removing the ternary
  const columns = isMobile ? 12 : 24;
  for (const [start, end] of panels) {
    const width = end - start;
    const point = (i, j) => {
      const u = (i / columns) * width;
      const h = LACE_BOTTOM + (j / LACE_ROWS) * (top - LACE_BOTTOM);
      const pleat = PLEAT_AMPLITUDE * Math.sin((2 * Math.PI * u) / PLEAT_PERIOD);
      const p = w.wall === "back" ? v3(start + u, h, at + pleat) : v3(at + pleat, h, start + u);
      return [p, u, h];
    };
    for (let i = 0; i < columns; i++) {
      for (let j = 0; j < LACE_ROWS; j++) {
        const [p00, p10, p11, p01] = [point(i, j), point(i + 1, j), point(i + 1, j + 1), point(i, j + 1)];
        for (const q of [p00, p10, p11, p00, p11, p01]) sink.vertex(...q);
      }
    }
  }
};

// The clay block painted behind the title, 2 mm proud of the wall, from
// the wall top down past the caps; split along x so the lamps' light on it
// stays smooth
const BLOCK_STEP = 0.3;
const buildTitleBlock = (sink, corner, layout) => {
  const { ink, block } = TITLE;
  const left = titleLeft(corner, layout);
  const xa = left + ink[corner][0] - block.pad;
  const xb = left + ink[corner][1] + block.pad;
  const z = BACK + 0.002;
  const count = Math.ceil((xb - xa) / BLOCK_STEP);
  for (let k = 0; k < count; k++) {
    const x0 = xa + ((xb - xa) * k) / count;
    const x1 = xa + ((xb - xa) * (k + 1)) / count;
    sink.quad(v3(x0, block.bottom, z), v3(x1, block.bottom, z), v3(x1, WALL_H, z), v3(x0, WALL_H, z), PALETTE.clay);
  }
};

// Sand rug: coral border, cream inner line, a row of low-poly diamonds
// along each long side, coral edges
const buildRug = (sink, corner) => {
  const { x: [xa, xb], z: [za, zb] } = WINDOW[corner].rug;
  const y = RUG_Y;
  const flat = (x0, x1, z0, z1, color, h = y) =>
    sink.quad(v3(x0, h, z1), v3(x1, h, z1), v3(x1, h, z0), v3(x0, h, z0), color);
  // A frame of width k inside [x0, x1] × [z0, z1]
  const frame = (x0, x1, z0, z1, k, color) => {
    flat(x0, x1, z0, z0 + k, color);
    flat(x0, x1, z1 - k, z1, color);
    flat(x0, x0 + k, z0 + k, z1 - k, color);
    flat(x1 - k, x1, z0 + k, z1 - k, color);
  };
  frame(xa, xb, za, zb, RUG_BORDER, PALETTE.coral);
  const i = RUG_BORDER;
  frame(xa + i, xb - i, za + i, zb - i, RUG_LINE, PALETTE.sandLine);
  const f = RUG_BORDER + RUG_LINE;
  const [fx0, fx1, fz0, fz1] = [xa + f, xb - f, za + f, zb - f];
  const nx = Math.max(1, Math.round((fx1 - fx0) / RUG_STEP));
  const nz = Math.max(1, Math.round((fz1 - fz0) / RUG_STEP));
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      const [x0, x1] = [fx0 + ((fx1 - fx0) * ix) / nx, fx0 + ((fx1 - fx0) * (ix + 1)) / nx];
      const [z0, z1] = [fz0 + ((fz1 - fz0) * iz) / nz, fz0 + ((fz1 - fz0) * (iz + 1)) / nz];
      flat(x0, x1, z0, z1, PALETTE.sand);
    }
  }
  // Diamonds 1 mm over the field, along both long (x) sides
  const r = 0.05;
  const count = Math.round((fx1 - fx0 - 0.1) / 0.2);
  const step = (fx1 - fx0) / count;
  for (const zc of [fz0 + 0.09, fz1 - 0.09]) {
    for (let k = 0; k < count; k++) {
      const xc = fx0 + step * (k + 0.5);
      const h = y + 0.001;
      sink.quad(v3(xc, h, zc + r), v3(xc + r, h, zc), v3(xc, h, zc - r), v3(xc - r, h, zc), PALETTE.sandMotif);
    }
  }
  // Its 8 mm edges (front and ends)
  box(sink, [xa, xb], [FLOOR_Y, y], [za, zb], PALETTE.coral, { omit: "-y+y-z" });
};

// Projects: the wall socket by the desk and its white cable, down to the
// floor and along the wall under the desk; it goes into the furniture mesh,
// so it dissolves with the desk it powers
const buildSocket = (sink) => {
  const { x, y, cableTo } = WINDOW.projects.socket;
  box(sink, [x - 0.06, x + 0.06], [y - 0.04, y + 0.04], [BACK, BACK + 0.01], PALETTE.steel, { omit: "-z" });
  for (const dx of [-0.03, 0.03]) {
    box(sink, [x + dx - 0.015, x + dx + 0.015], [y - 0.015, y + 0.015], [BACK + 0.01, BACK + 0.013], PALETTE.ceramic, { omit: "-z" });
  }
  const zc = BACK + SKIRT_D + 0.005;
  const low = FLOOR_Y + 0.004;
  tube(sink, [v3(x + 0.03, y - 0.005, BACK + 0.013), v3(x + 0.03, y - 0.06, zc), v3(x + 0.03, low, zc), v3(cableTo, low, zc)], 0.004, 4, PALETTE.ceramic);
};

// Skills: the afterglow the open window throws on the floor and rug, on
// the daylight channel (it goes as the sky does)
const buildAfterglow = (glow, isMobile) => {
  const y = RUG_Y + 0.003;
  const corners = [v3(-2.45, y, BACK), v3(-0.85, y, BACK), v3(-0.5, y, -0.75), v3(-2.1, y, -0.75)];
  // MOBILE_PERF: 12 glow-decal segments on mobile — revert by removing the ternary
  const segments = isMobile ? 12 : 24;
  const perEdge = segments / 4;
  const rim = [];
  for (let e = 0; e < 4; e++) {
    for (let k = 0; k < perEdge; k++) rim.push(corners[e].clone().lerp(corners[(e + 1) % 4], k / perEdge));
  }
  const centre = corners.reduce((sum, p) => sum.add(p), v3(0, 0, 0)).divideScalar(4);
  fan(glow, centre, rim, LIGHT.afterglow.clone().multiplyScalar(0.22), new THREE.Color(0, 0, 0), { channel: 1 });
};

// out = { solid, furniture, glow, lace }; ctx = { isMobile, layout, random }
export const buildRoom = (out, corner, ctx) => {
  buildFloor(out.solid, corner, ctx.random);
  buildWalls(out.solid, corner);
  buildWindow(out.solid, corner);
  buildTitleBlock(out.solid, corner, ctx.layout);
  buildRug(out.solid, corner);
  if (corner === "projects") buildSocket(out.furniture);
  else buildAfterglow(out.glow, ctx.isMobile);
  buildLace(out.lace, corner, ctx.isMobile);
};
