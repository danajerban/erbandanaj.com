import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useMobile } from "../../contexts/MobileContext";
import { FLOWER_BOX, HOUSE, HOUSES, cafeTables, houseSpans, isLit } from "../../lib/parkLayout";
import { PARK_LAYER, ParkSink, nightShade, parkSolidMaterial, parkStats } from "../../lib/parkMaterials";

// The old-town row behind the park: five narrow pastel houses, the corner
// café with its awning and terrace, the cat on the sage house's ridge and
// the powder house's story window. One static mesh on the park-solid
// program; the cat's blink and the story window rewrite their own vertex
// colours now and then. Each house is built in its own units (x 0..W from
// its left end, y up from the floor, z 0 on the facade, toward the camera),
// placed and scaled by the sink's matrix stack.

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const SRGB = THREE.SRGBColorSpace;
const rgb = { r: 0, g: 0, b: 0 };
// A hex colour scaled in sRGB (the plinth is the facade × 0.7)
const scaleHex = (hex, k) => {
  const c = new THREE.Color(hex);
  c.getRGB(rgb, SRGB);
  return c.setRGB(rgb.r * k, rgb.g * k, rgb.b * k, SRGB).getHex();
};

// The facades at night: their day colours a step darker before the shading,
// so the pastel row sits behind the balloons and lets the lit windows glow
const FACADE_NIGHT = 0.8;

// Glass and night colours, shown as given (no shading)
const LIT = HOUSE.lit.map((hex) => new THREE.Color(hex));
const UNLIT = new THREE.Color(HOUSE.unlit);
const GLINT = new THREE.Color(HOUSE.glint);
const TRANSOM = new THREE.Color(HOUSE.transom.color);
const PLANT = new THREE.Color("#1d2622");
const FLOWERS = ["#e8798c", "#f3cf62", "#f2ece0", "#a88bd6", "#f19a6a"].map((hex) => new THREE.Color(hex));
const KNOB = "#b69552";
const CHIMNEY = "#7a5148";

// The café
const CAFE = {
  frame: "#24443b",
  gold: "#b69552",
  glass: new THREE.Color("#ffc27a"),
  counter: new THREE.Color("#3a2a22"),
  pendant: new THREE.Color("#ffe2a0"),
  stripes: ["#c4594a", "#d9c9a8"],
  furniture: "#1e1e24",
  board: "#2a2f2c",
  chalk: new THREE.Color("#d9d6cc"),
  bay: "#2a4535",
  pot: "#6b4a3a",
};
const CAFE_GLOW = new THREE.Color("#ffc27a");

// The cat: a sitting silhouette seen from the front (unit height 0.32),
// counter-clockwise; its tail lies along the ridge and curls up
const CAT = new THREE.Color("#121218");
const CAT_EYE = new THREE.Color("#e8f27a");
const CAT_OUTLINE = [
  [-0.09, 0], [0.09, 0], [0.095, 0.05], [0.075, 0.13], [0.05, 0.19], [0.065, 0.22], [0.065, 0.26],
  [0.06, 0.32], [0.03, 0.285], [-0.03, 0.285], [-0.06, 0.32], [-0.065, 0.26], [-0.065, 0.22],
  [-0.05, 0.19], [-0.075, 0.13], [-0.095, 0.05],
].map(([x, y]) => new THREE.Vector2(x, y));
const CAT_TAIL = [[0.085, 0.02], [0.15, 0.025], [0.2, 0.06], [0.215, 0.12], [0.195, 0.16]];
const CAT_DEPTH = 0.1;
const EYE = { x: 0.032, y: 0.238, w: 0.03, h: 0.02 };

// Blink every 5–8 s for 0.15 s; the story window switches every 20–35 s
const BLINK = [5, 8];
const BLINK_TIME = 0.15;
const STORY = [20, 35];

// Faces of an axis-aligned box, outward and counter-clockwise; skip any of
// "f" front, "b" back, "l" left, "r" right, "t" top, "d" down
const box = (sink, [x0, x1], [y0, y1], [z0, z1], hex, opts, skip = "") => {
  if (!skip.includes("f")) sink.quad(v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1), hex, opts);
  if (!skip.includes("b")) sink.quad(v(x1, y0, z0), v(x0, y0, z0), v(x0, y1, z0), v(x1, y1, z0), hex, opts);
  if (!skip.includes("r")) sink.quad(v(x1, y0, z1), v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1), hex, opts);
  if (!skip.includes("l")) sink.quad(v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0), hex, opts);
  if (!skip.includes("t")) sink.quad(v(x0, y1, z1), v(x1, y1, z1), v(x1, y1, z0), v(x0, y1, z0), hex, opts);
  if (!skip.includes("d")) sink.quad(v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1), v(x0, y0, z1), hex, opts);
};

// A rectangle facing +z
const rect = (sink, x0, x1, y0, y1, z, hex, opts) =>
  sink.quad(v(x0, y0, z), v(x1, y0, z), v(x1, y1, z), v(x0, y1, z), hex, opts);

// A convex polygon (fan), turned to face along `out`
const scratchA = new THREE.Vector3();
const scratchB = new THREE.Vector3();
const poly = (sink, points, out, hex, opts) => {
  const n = scratchA.subVectors(points[1], points[0]).cross(scratchB.subVectors(points[2], points[0]));
  const pts = n.dot(out) < 0 ? [...points].reverse() : points;
  for (let i = 1; i < pts.length - 1; i++) sink.tri(pts[0], pts[i], pts[i + 1], hex, opts);
};
const FRONT = v(0, 0, 1);
const UP = v(0, 1, 0);
const DOWN = v(0, -1, 0);

// A 4-triangle cup (a bloom): apex down, open square on top
const cup = (sink, x, y, z, size, color, opts) => {
  const h = size / 2;
  const apex = v(x, y - h, z);
  const c = [v(x - h, y + h, z + h), v(x + h, y + h, z + h), v(x + h, y + h, z - h), v(x - h, y + h, z - h)];
  for (let i = 0; i < 4; i++) sink.tri(apex, c[(i + 1) % 4], c[i], null, { ...opts, color });
};

// A window centred at (cx, cy) on the facade: trim frame, sill, glass (lit,
// or dark with a glint). Returns the glass's vertex range.
const windowAt = (sink, cx, cy, w, h, glass) => {
  const { trim, sill } = HOUSE.window;
  const [x0, x1, y0, y1] = [cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2];
  rect(sink, x0 - trim, x1 + trim, y1, y1 + trim, 0.012, HOUSE.trim);
  rect(sink, x0 - trim, x0, y0, y1, 0.012, HOUSE.trim);
  rect(sink, x1, x1 + trim, y0, y1, 0.012, HOUSE.trim);
  box(sink, [x0 - trim - 0.02, x1 + trim + 0.02], [y0 - 0.04, y0], [0, sill], HOUSE.trim, undefined, "bd");
  const range = sink.mark();
  rect(sink, x0, x1, y0, y1, 0.006, null, { color: glass.lit ? glass.color : UNLIT, glow: glass.lit ? 1 : 0 });
  // The glint: a dark window's top-left corner catches the sky
  if (!glass.lit || glass.story) {
    const g = glass.lit ? glass.color : GLINT;
    sink.tri(v(x0, y1 - h * 0.35, 0.009), v(x0 + w * 0.45, y1, 0.009), v(x0, y1, 0.009), null, { color: g, glow: glass.lit ? 1 : 0 });
  }
  return range();
};

// A dark potted plant in the lower third of a lit window
const windowPlant = (sink, cx, cy, h) => {
  const y = cy - h / 2;
  const opts = { color: PLANT };
  sink.quad(v(cx - 0.05, y, 0.008), v(cx + 0.05, y, 0.008), v(cx + 0.06, y + 0.06, 0.008), v(cx - 0.06, y + 0.06, 0.008), null, opts);
  sink.tri(v(cx - 0.03, y + 0.06, 0.008), v(cx - 0.005, y + 0.06, 0.008), v(cx - 0.08, y + 0.15, 0.008), null, opts);
  sink.tri(v(cx - 0.02, y + 0.06, 0.008), v(cx + 0.02, y + 0.06, 0.008), v(cx + 0.005, y + 0.18, 0.008), null, opts);
  sink.tri(v(cx + 0.005, y + 0.06, 0.008), v(cx + 0.03, y + 0.06, 0.008), v(cx + 0.085, y + 0.14, 0.008), null, opts);
};

// A flower box under a window: 5 blooms in the flower colours (bigger on
// phones, where 0.06 would be a speck under 3 CSS px)
const flowerBox = (sink, cx, y, seed, fine) => {
  const { w, h, d, color, blooms } = FLOWER_BOX;
  box(sink, [cx - w / 2, cx + w / 2], [y - h, y], [0, d], color, undefined, "b");
  for (let i = 0; i < blooms; i++) {
    const x = cx - w / 2 + (w * (i + 0.5)) / blooms;
    cup(sink, x, y + 0.04 + (i % 2) * 0.015, d / 2, fine ? 0.06 : 0.075, FLOWERS[(seed + i) % FLOWERS.length], { sway: [0, 0.3, 0.3] });
  }
};

// A front gable's roof: barge boards along both edges of the facade's
// triangle (0, eave)–(W/2, apex)–(W, eave), their soffits back to the
// facade, and the two slopes back to the house's depth
const BARGE = { out: 0.08, thick: 0.07, over: 0.1 };
const gableRoof = (sink, W, eave, apex, hex) => {
  const back = -HOUSE.depth;
  const half = W / 2;
  const len = Math.hypot(half, apex - eave);
  const [dx, dy] = [half / len, (apex - eave) / len];
  const edges = [
    // [eave end, apex end, outward normal in the facade plane]
    [[-dx * BARGE.over, eave - dy * BARGE.over], [half, apex], [-dy, dx]],
    [[W + dx * BARGE.over, eave - dy * BARGE.over], [half, apex], [dy, dx]],
  ];
  const tops = edges.map(([a, b, [nx, ny]]) => {
    const [a2, b2] = [[a[0] + nx * BARGE.thick, a[1] + ny * BARGE.thick], [b[0] + nx * BARGE.thick, b[1] + ny * BARGE.thick]];
    poly(sink, [v(a[0], a[1], BARGE.out), v(b[0], b[1], BARGE.out), v(b2[0], b2[1], BARGE.out), v(a2[0], a2[1], BARGE.out)], FRONT, hex);
    // Soffit, seen from below
    poly(sink, [v(a[0], a[1], 0), v(b[0], b[1], 0), v(b[0], b[1], BARGE.out), v(a[0], a[1], BARGE.out)], v(-nx, -ny, 0), hex);
    // The slope
    poly(sink, [v(a2[0], a2[1], BARGE.out), v(b2[0], b2[1], BARGE.out), v(b2[0], b2[1], back), v(a2[0], a2[1], back)], v(nx, ny, 0), hex);
    return b2;
  });
  // The notch above the apex and the ridge between the slopes
  poly(sink, [v(half, apex, BARGE.out), v(tops[1][0], tops[1][1], BARGE.out), v(tops[0][0], tops[0][1], BARGE.out)], FRONT, hex);
  poly(sink, [v(tops[0][0], tops[0][1], BARGE.out), v(tops[1][0], tops[1][1], BARGE.out), v(tops[1][0], tops[1][1], back), v(tops[0][0], tops[0][1], back)], UP, hex);
};

// A roof sloping up from the eave at the facade (with an overhang) to a
// ridge along x at (ridgeY, ridgeZ), and down again to the back; x from
// a0..a1 at the eave to r0..r1 at the ridge (a hip narrows to its ridge)
const slopedRoof = (sink, [a0, a1], [r0, r1], eave, ridgeY, ridgeZ, overhang, hex) => {
  const slope = (ridgeY - eave) / -ridgeZ;
  const back = 2 * ridgeZ - overhang;
  const low = eave - overhang * slope;
  const front = [v(a0, low, overhang), v(a1, low, overhang), v(r1, ridgeY, ridgeZ), v(r0, ridgeY, ridgeZ)];
  poly(sink, front, v(0, 1, 1), hex);
  poly(sink, [v(a1, low, back), v(a0, low, back), v(r0, ridgeY, ridgeZ), v(r1, ridgeY, ridgeZ)], v(0, 1, -1), hex);
  // Fascia along the front edge
  rect(sink, a0, a1, low - 0.06, low, overhang, hex);
  return { slope, low, back };
};

// The facade's outline above the ground (a polygon in x, y), the side walls
// and the gables, by roof kind; returns the facade polygons (convex parts)
const facadeParts = (house) => {
  const { W, eave, top, roof } = house;
  const y0 = HOUSE.plinth;
  const body = [[0, y0], [W, y0], [W, eave], [0, eave]];
  if (roof === "frontGable") return [body, [[0, eave], [W, eave], [W / 2, top]]];
  if (roof === "neckGable") {
    const { from, to, y } = house.neck;
    return [body, [[from * W, eave], [to * W, eave], [to * W, y], [from * W, y]], [[from * W, y], [to * W, y], [W / 2, top]]];
  }
  return [body];
};

const place = (x, y, z, scale = 1, yaw = 0) =>
  new THREE.Matrix4().compose(v(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), v(scale, scale, scale));

// A door at fraction `at` of W: frame, leaf, knob (not on phones), transom,
// step
const door = (sink, cx, color, plinthHex, fine) => {
  const { w, h, y } = HOUSE.door;
  const { y1 } = HOUSE.transom;
  const trim = HOUSE.window.trim;
  const [x0, x1] = [cx - w / 2, cx + w / 2];
  rect(sink, x0 - trim, x1 + trim, y1, y1 + trim, 0.012, HOUSE.trim);
  rect(sink, x0 - trim, x0, y, y1, 0.012, HOUSE.trim);
  rect(sink, x1, x1 + trim, y, y1, 0.012, HOUSE.trim);
  rect(sink, x0, x1, y + h, y + h + 0.012, 0.012, HOUSE.trim);
  rect(sink, x0, x1, y, y + h, 0.006, color);
  if (fine) rect(sink, x1 - 0.08, x1 - 0.05, y + 0.42, y + 0.45, 0.01, KNOB);
  rect(sink, x0, x1, y + h + 0.012, y1, 0.006, null, { color: TRANSOM, glow: HOUSE.transom.glow });
  box(sink, [x0 - 0.06, x1 + 0.06], [0, y], [0, 0.14], plinthHex, undefined, "bd");
};

// The dormer on the sage house's front slope: cheeks, a gable cap, its window
const dormer = (sink, house, day, glass) => {
  const { W, eave, ridge, dormer: d } = house;
  const slope = (ridge.y - eave) / -ridge.z;
  const cx = d.at * W;
  const [x0, x1] = [cx - d.w / 2, cx + d.w / 2];
  const z = d.z;
  const y0 = eave + -z * slope - 0.03;
  const y1 = y0 + 0.03 + d.cheek;
  const zTop = -(y1 - eave) / slope; // where the cheek top meets the roof
  const apex = y1 + d.cap;
  const zApex = -(apex - eave) / slope;
  poly(sink, [v(x0, y0, z), v(x1, y0, z), v(x1, y1, z), v(cx, apex, z), v(x0, y1, z)], FRONT, day);
  poly(sink, [v(x1, y0, z), v(x1, y1, zTop), v(x1, y1, z)], v(1, 0, 0), day);
  poly(sink, [v(x0, y0, z), v(x0, y1, z), v(x0, y1, zTop)], v(-1, 0, 0), day);
  for (const [xe, side] of [[x0 - 0.04, -1], [x1 + 0.04, 1]]) {
    poly(sink, [v(xe, y1 - 0.02, z + 0.05), v(cx, apex + 0.04, z + 0.05), v(cx, apex + 0.04, zApex), v(xe, y1 - 0.02, zTop)], v(side, 1, 0), house.roofColor);
  }
  const [gw, gh] = d.window;
  return windowAt(sink, cx, (y0 + y1) / 2 + 0.02, gw, gh, glass);
};

// The cat on the ridge (its own units: x across, y up from the ridge, z
// toward the camera): an extruded silhouette, a swaying tail, two eyes.
// Returns the eyes' vertex range.
const cat = (sink, eyeScale) => {
  const opts = { color: CAT };
  const faces = THREE.ShapeUtils.triangulateShape(CAT_OUTLINE, []);
  const zf = CAT_DEPTH / 2;
  const at = (i, z) => v(CAT_OUTLINE[i].x, CAT_OUTLINE[i].y, z);
  for (const [a, b, c] of faces) {
    sink.tri(at(a, zf), at(b, zf), at(c, zf), null, opts);
    sink.tri(at(a, -zf), at(c, -zf), at(b, -zf), null, opts);
  }
  CAT_OUTLINE.forEach((_, i) => {
    const j = (i + 1) % CAT_OUTLINE.length;
    sink.quad(at(i, zf), at(i, -zf), at(j, -zf), at(j, zf), null, opts);
  });
  // The tail: a ribbon from the haunch, swaying more toward its tip
  const half = 0.014;
  for (let i = 0; i < CAT_TAIL.length - 1; i++) {
    const [ax, ay] = CAT_TAIL[i];
    const [bx, by] = CAT_TAIL[i + 1];
    const [wa, wb] = [i / (CAT_TAIL.length - 1), (i + 1) / (CAT_TAIL.length - 1)];
    sink.quad(v(ax, ay - half, 0), v(bx, by - half, 0), v(bx, by + half, 0), v(ax, ay + half, 0), null, {
      color: CAT,
      sway: [wa, wb, wb, wa],
      phase: Math.PI,
    });
  }
  const eyes = sink.mark();
  for (const side of [-1, 1]) {
    const [w, h] = [EYE.w * eyeScale, EYE.h * eyeScale];
    rect(sink, side * EYE.x - w / 2, side * EYE.x + w / 2, EYE.y - h / 2, EYE.y + h / 2, zf + 0.004, null, { color: CAT_EYE, glow: 1 });
  }
  return eyes();
};

// A faceted ball (icosahedron, detail 0)
const ICO = new THREE.IcosahedronGeometry(1, 0).getAttribute("position").array;
const ball = (sink, x, y, z, r, hex, opts) => {
  const at = (i) => v(x + ICO[i] * r, y + ICO[i + 1] * r, z + ICO[i + 2] * r);
  for (let i = 0; i < ICO.length; i += 9) sink.tri(at(i), at(i + 3), at(i + 6), hex, opts);
};

// The café's ground floor (house units): the green shopfront, the glass
// door (its handle not on phones), the big window with the counter and a
// pendant lamp, the awning
const shopfront = (sink, park, house, fine) => {
  const { W } = house;
  const y0 = HOUSE.plinth;
  rect(sink, 0.04 * W, 0.96 * W, y0, HOUSE.groundTop, 0.004, CAFE.frame);
  rect(sink, 0.04 * W, 0.96 * W, 1.19, 1.21, 0.014, CAFE.gold);
  const dx = house.door.at * W;
  rect(sink, dx - 0.21, dx + 0.21, y0, y0 + 0.95, 0.008, null, { color: CAFE.glass, glow: 0.7 });
  if (fine) rect(sink, dx + 0.12, dx + 0.15, 0.5, 0.62, 0.012, CAFE.gold);
  const [wx0, wx1] = [0.34 * W, 0.94 * W];
  rect(sink, wx0, wx1, 0.3, 1.15, 0.008, null, { color: CAFE.glass, glow: 1 });
  rect(sink, wx0, wx1, 0.3, 0.5, 0.01, null, { color: CAFE.counter });
  const px = 0.64 * W;
  rect(sink, px - 0.005, px + 0.005, 1.0, 1.15, 0.01, null, { color: CAFE.counter });
  sink.tri(v(px - 0.07, 0.93, 0.011), v(px + 0.07, 0.93, 0.011), v(px, 1.0, 0.011), null, { color: CAFE.pendant, glow: 1 });

  // The awning: 8 stripes sloping from the facade to their scallops; its
  // underside catches the café's glow
  const { top, low, depth } = house.awning;
  const [ax0, ax1] = house.awning.x.map((f) => f * W);
  const n = 8;
  const sw = (ax1 - ax0) / n;
  for (let i = 0; i < n; i++) {
    const [x0, x1] = [ax0 + i * sw, ax0 + (i + 1) * sw];
    const hex = CAFE.stripes[i % 2];
    poly(sink, [v(x0, top, 0), v(x1, top, 0), v(x1, low, depth), v(x0, low, depth)], v(0, 1, 0.3), hex);
    const centre = v((x0 + x1) / 2, (top + low) / 2, depth / 2).applyMatrix4(sink.matrix);
    const under = nightShade(hex, DOWN, centre, park).lerp(CAFE_GLOW, 0.3);
    poly(sink, [v(x0, top - 0.006, 0), v(x1, top - 0.006, 0), v(x1, low - 0.006, depth), v(x0, low - 0.006, depth)], v(0, -1, -0.3), null, { color: under });
    const r = sw / 2;
    const mid = v(x0 + r, low, depth);
    for (let k = 0; k < 7; k++) {
      const [a, b] = [Math.PI + (Math.PI * k) / 7, Math.PI + (Math.PI * (k + 1)) / 7];
      sink.tri(mid, v(mid.x + r * Math.cos(a), low + 0.6 * r * Math.sin(a), depth), v(mid.x + r * Math.cos(b), low + 0.6 * r * Math.sin(b), depth), hex);
    }
  }
};

// The terrace (Contact-local, × row.scale): two round tables with two
// bent-back chairs each, the A-frame chalkboard, two bay trees by the door
const chair = (sink) => {
  const hex = CAFE.furniture;
  box(sink, [-0.1, 0.1], [0.38, 0.41], [-0.1, 0.1], hex, undefined, "d");
  for (const [x, z] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]]) {
    box(sink, [x - 0.01, x + 0.01], [0, 0.38], [z - 0.01, z + 0.01], hex, undefined, "td");
  }
  sink.quad(v(-0.1, 0.41, -0.1), v(0.1, 0.41, -0.1), v(0.1, 0.62, -0.12), v(-0.1, 0.62, -0.12), hex);
  sink.quad(v(-0.1, 0.62, -0.12), v(0.1, 0.62, -0.12), v(0.1, 0.76, -0.17), v(-0.1, 0.76, -0.17), hex);
};
const table = (sink) => {
  const hex = CAFE.furniture;
  const [r, y, t, n] = [0.2, 0.62, 0.03, 12];
  const ring = Array.from({ length: n }, (_, i) => [r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)]);
  ring.forEach(([ax, az], i) => {
    const [bx, bz] = ring[(i + 1) % n];
    sink.tri(v(0, y, 0), v(bx, y, bz), v(ax, y, az), hex);
    sink.quad(v(ax, y - t, az), v(ax, y, az), v(bx, y, bz), v(bx, y - t, bz), hex);
  });
  box(sink, [-0.02, 0.02], [0.03, y - t], [-0.02, 0.02], hex, undefined, "td");
  box(sink, [-0.12, 0.12], [0, 0.03], [-0.12, 0.12], hex, undefined, "d");
  for (const side of [-1, 1]) {
    sink.push(place(side * 0.34, 0, 0, 1, (-side * Math.PI) / 2));
    chair(sink);
    sink.pop();
  }
};
const chalkboard = (sink, strokes) => {
  const hex = CAFE.board;
  const [w, h, d] = [0.15, 0.5, 0.12];
  poly(sink, [v(-w, 0, d), v(w, 0, d), v(w, h, 0), v(-w, h, 0)], v(0, d, h), hex);
  poly(sink, [v(w, 0, -d), v(-w, 0, -d), v(-w, h, 0), v(w, h, 0)], v(0, d, -h), hex);
  if (!strokes) return;
  // Three chalk lines on the front board, just off its face
  const len = Math.hypot(h, d);
  const off = [0, (d / len) * 0.006, (h / len) * 0.006];
  const on = (x, u) => v(x + off[0], h * u + off[1], d * (1 - u) + off[2]);
  for (const [u, half] of [[0.7, 0.1], [0.55, 0.075], [0.4, 0.09]]) {
    sink.quad(on(-half, u - 0.02), on(half, u - 0.02), on(half, u + 0.02), on(-half, u + 0.02), null, { color: CAFE.chalk });
  }
};
const bayTree = (sink) => {
  box(sink, [-0.08, 0.08], [0, 0.18], [-0.08, 0.08], CAFE.pot, undefined, "d");
  box(sink, [-0.012, 0.012], [0.18, 0.56], [-0.012, 0.012], "#3a2e28", undefined, "td");
  ball(sink, 0, 0.68, 0, 0.16, CAFE.bay, { sway: 0.15 });
};

// The whole row as one geometry, its origin (the row's centre on the
// facade plane: the far row melts last), the cat's eyes and the story
// window as [start, count] vertex ranges
const buildRow = (park) => {
  const sink = new ParkSink(park);
  const { row, detail } = park;
  // Desktop and tall: the trinkets under 3 CSS px on a phone (door knobs,
  // the café door's handle) are built only here
  const fine = detail.knobs;
  const s = row.scale;
  const spans = houseSpans(park);
  const D = HOUSE.depth;
  let eyes;
  let story;
  HOUSES.forEach((house, h) => {
    const { W, eave, top, roof, roofColor } = house;
    const day = scaleHex(house.day, FACADE_NIGHT);
    const span = spans[h];
    sink.push(place(span.x0, 0, row.z, s));
    const plinthHex = scaleHex(day, 0.7);
    box(sink, [0, W], [0, HOUSE.plinth], [-0.05, 0.02], plinthHex, undefined, "bdlr");
    for (const part of facadeParts(house)) poly(sink, part.map(([x, y]) => v(x, y, 0)), FRONT, day);
    poly(sink, [v(0, 0, 0), v(0, 0, -D), v(0, eave, -D), v(0, eave, 0)], v(-1, 0, 0), day);
    poly(sink, [v(W, 0, 0), v(W, 0, -D), v(W, eave, -D), v(W, eave, 0)], v(1, 0, 0), day);
    box(sink, [-HOUSE.cornice.out, W + HOUSE.cornice.out], [eave - HOUSE.cornice.height, eave], [0, HOUSE.cornice.out], HOUSE.trim, undefined, "b");

    // Glass: lit by the pattern, never behind the avatar's head
    const glassAt = (fx, f, c) => {
      const isStory = house.storyWindow?.floor === f && house.storyWindow?.column === c;
      const lit = isStory || (isLit(h, f, c) && Math.abs(span.x0 + fx * W * s) >= HOUSE.unlitAxis);
      return { lit, story: isStory, color: LIT[(h + f + c) % LIT.length] };
    };
    const sides = [v(-1, 0, 0), v(1, 0, 0)];
    const gableSides = (ridgeY, ridgeZ) =>
      [0, W].forEach((x, i) => poly(sink, [v(x, eave, 0), v(x, eave, -D), v(x, ridgeY, ridgeZ)], sides[i], day));

    if (roof === "frontGable") {
      gableRoof(sink, W, eave, top, roofColor);
      const g = house.gableWindow;
      windowAt(sink, W / 2, eave + g.above, g.w, g.h, glassAt(0.5, 3, 0));
    } else if (roof === "sideGable") {
      const { ridge } = house;
      slopedRoof(sink, [-0.04, W + 0.04], [-0.04, W + 0.04], eave, ridge.y, ridge.z, house.overhang, roofColor);
      gableSides(ridge.y, ridge.z);
      dormer(sink, house, day, glassAt(house.dormer.at, 3, 0));
      sink.push(place(house.cat.at * W, ridge.y - 0.02, ridge.z));
      eyes = cat(sink, detail.catEyeScale);
      sink.pop();
    } else if (roof === "neckGable") {
      const { ridge, neck, atticWindow: a, chimney: c } = house;
      slopedRoof(sink, [0, W], [0, W], eave, ridge.y, ridge.z, 0.08, roofColor);
      gableSides(ridge.y, ridge.z);
      // Coping along the neck's shoulders and its gable
      box(sink, [neck.from * W - 0.03, neck.to * W + 0.03], [neck.y - 0.04, neck.y], [0, 0.04], HOUSE.trim, undefined, "b");
      for (const x of [neck.from * W, neck.to * W]) {
        poly(sink, [v(x, neck.y, 0.03), v(W / 2, top, 0.03), v(W / 2, top + 0.05, 0.03), v(x, neck.y + 0.05, 0.03)], FRONT, HOUSE.trim);
      }
      const ax = W / 2;
      const ring = (r, z, hex, opts) => {
        for (let i = 0; i < a.segments; i++) {
          const [p, q] = [(2 * Math.PI * i) / a.segments, (2 * Math.PI * (i + 1)) / a.segments];
          sink.tri(v(ax, a.y, z), v(ax + r * Math.cos(p), a.y + r * Math.sin(p), z), v(ax + r * Math.cos(q), a.y + r * Math.sin(q), z), hex, opts);
        }
      };
      ring(a.r + HOUSE.window.trim, 0.006, HOUSE.trim);
      const g = glassAt(0.5, 3, 0);
      ring(a.r, 0.01, null, { color: g.lit ? g.color : UNLIT, glow: g.lit ? 1 : 0 });
      const cx = c.at * W;
      const roofY = eave + (-c.z * (ridge.y - eave)) / -ridge.z;
      box(sink, [cx - c.size / 2, cx + c.size / 2], [roofY - 0.1, c.top], [c.z - c.size / 2, c.z + c.size / 2], CHIMNEY, undefined, "bd");
      box(sink, [cx - c.cap[0] / 2, cx + c.cap[0] / 2], [c.top, c.top + c.cap[1]], [c.z - c.cap[0] / 2, c.z + c.cap[0] / 2], roofColor, undefined, "b");
    } else {
      const { rise, ridge: [r0, r1], z } = house.hip;
      const { low, back } = slopedRoof(sink, [-0.08, W + 0.08], [r0 * W, r1 * W], eave, eave + rise, z, 0.08, roofColor);
      poly(sink, [v(-0.08, low, 0.08), v(-0.08, low, back), v(r0 * W, eave + rise, z)], v(-1, 1, 0), roofColor);
      poly(sink, [v(W + 0.08, low, 0.08), v(r1 * W, eave + rise, z), v(W + 0.08, low, back)], v(1, 1, 0), roofColor);
    }

    // Floors: the door, the windows (flower boxes, plants), the café
    let plants = 0;
    for (let f = 0; f < house.floors; f++) {
      const y = HOUSE.windowY[f];
      if (f === 0 && house.door.glass) {
        shopfront(sink, park, house, fine);
        continue;
      }
      if (f === 0) door(sink, house.door.at * W, house.door.color, plinthHex, fine);
      const columns = f > 0 && house.upperWindowX ? house.upperWindowX : HOUSE.windowX;
      columns.forEach((fx, c) => {
        if (f === 0 && fx === house.door.at) return;
        const glass = glassAt(fx, f, c);
        const { w, h: wh } = HOUSE.window;
        const range = windowAt(sink, fx * W, y, w, wh, glass);
        if (glass.story) story = range;
        if (detail.windowPlants && (h === 0 || h === 2) && f > 0 && glass.lit && plants < 2) {
          windowPlant(sink, fx * W, y, wh);
          plants++;
        }
        if (f === 1 && house.flowerBox) flowerBox(sink, fx * W, y - wh / 2 - 0.04, h + c, fine);
      });
    }
    if (house.sideWindow) {
      // The café's right side, toward the moon: one lit window
      sink.push(place(W, 0, house.sideWindow.z, 1, Math.PI / 2));
      windowAt(sink, 0, house.sideWindow.y, HOUSE.window.w, HOUSE.window.h, { lit: true, color: LIT[0] });
      sink.pop();
    }
    sink.pop();
  });

  // The terrace on the sidewalk
  const cafe = spans[spans.length - 1];
  const W5 = HOUSES[HOUSES.length - 1].W;
  for (const [x, z] of cafeTables(park)) {
    sink.push(place(x, 0, z, s));
    table(sink);
    sink.pop();
  }
  sink.push(place(cafe.x0 + 0.33 * W5 * s, 0, row.z + 1.15, s));
  chalkboard(sink, detail.chalkStrokes);
  sink.pop();
  const doorX = cafe.x0 + HOUSES[HOUSES.length - 1].door.at * W5 * s;
  for (const side of [-1, 1]) {
    sink.push(place(doorX + side * 0.32 * s, 0, row.z + 0.2, s));
    bayTree(sink);
    sink.pop();
  }

  const { geometry, origin } = sink.build([(spans[0].x0 + cafe.x1) / 2, 0, row.z]);
  return { geometry, origin, eyes, story };
};

// Writes a vertex range's colours (rgb per vertex) and uploads only it
const paint = (color, [start, count], values) => {
  color.array.set(values, start * 3);
  color.addUpdateRange(start * 3, count * 3);
  color.needsUpdate = true;
};
const fill = (count, ...parts) => {
  const out = new Float32Array(count * 3);
  let i = 0;
  for (const [c, n] of parts) for (let k = 0; k < n; k++, i += 3) out.set([c.r, c.g, c.b], i);
  return out;
};
const between = ([a, b]) => a + Math.random() * (b - a);

export default function ParkHouses({ park }) {
  const { prefersReducedMotion } = useMobile();
  const row = useMemo(() => {
    const built = buildRow(park);
    const mesh = new THREE.Mesh(built.geometry, parkSolidMaterial);
    mesh.position.fromArray(built.origin);
    mesh.layers.set(PARK_LAYER);
    // Each range's two looks: as built (eyes open, window lit) and the other
    const color = built.geometry.attributes.color;
    const open = (range) => color.array.slice(range[0] * 3, (range[0] + range[1]) * 3);
    // The story window's glass quad, then its glint
    const dark = fill(built.story[1], [UNLIT, 6], [GLINT, built.story[1] - 6]);
    return {
      mesh,
      eyes: { range: built.eyes, on: open(built.eyes), off: fill(built.eyes[1], [CAT, built.eyes[1]]) },
      story: { range: built.story, on: open(built.story), off: dark },
    };
  }, [park]);
  useEffect(() => () => row.mesh.geometry.dispose(), [row]);

  // The cat's blink and the story window, on their own clock: closed, off,
  // and when each changes next
  const state = useRef(null);
  useFrame((_, delta) => {
    const color = row.mesh.geometry.attributes.color;
    let st = state.current;
    if (!st || st.row !== row) {
      st = state.current = { row, t: 0, closed: false, dark: false, blinkAt: between(BLINK), storyAt: between(STORY) };
    }
    if (prefersReducedMotion) {
      // Eyes open, window lit
      if (st.closed) paint(color, row.eyes.range, row.eyes.on);
      if (st.dark) paint(color, row.story.range, row.story.on);
      st.closed = st.dark = false;
      return;
    }
    st.t += Math.min(delta, 0.1);
    if (st.t >= st.blinkAt) {
      st.closed = !st.closed;
      paint(color, row.eyes.range, st.closed ? row.eyes.off : row.eyes.on);
      st.blinkAt = st.t + (st.closed ? BLINK_TIME : between(BLINK));
      if (import.meta.env.DEV && st.closed) parkStats.blinks++;
    }
    if (st.t >= st.storyAt) {
      st.dark = !st.dark;
      paint(color, row.story.range, st.dark ? row.story.off : row.story.on);
      st.storyAt = st.t + between(STORY);
      if (import.meta.env.DEV) parkStats.storyToggles++;
    }
  });

  return <primitive object={row.mesh} />;
}
