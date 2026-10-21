import * as THREE from "three";
import { AO, PALETTE, hex } from "./bake";
import { BACK, FLOOR_Y, RUG_Y } from "./layout";
import { bevelBox, box, cylinder, cylinderBetween, ellipse, fan, orientedTri, polygon, strip, tube, v3 } from "./shapes";

// Skills: the reading corner (reading corner step): armchair, fiddle-leaf
// fig, side table, bookcase, books, pothos.
// out = { solid: OfficeSink, glow: GlowSink }; ctx = { isMobile, layout,
// random }; room-frame coordinates.

// The afterglow coming in at the window: a broad warm light in front of it
// that keeps the armchair, rug and bookcase warm
export const READING_LIGHTS = [{ p: new THREE.Vector3(-1.7, 1.4, -1.1), color: hex("#ffc49a"), R: 3.2, w: 0.3 }];

const COLOR = {
  olive: hex("#8a9a5b"),
  cream: hex("#f3ead8"),
  charcoal: hex("#3b3b3b"),
  mustard: hex("#d9a441"),
  page: hex("#efe5cf"),
  terracotta: hex("#c66f4c"),
  coffee: hex("#4a2e1f"),
  stem: hex("#4d7a3a"),
  skyGlow: hex("#f6b38f"),
  sun: hex("#ffd9a0"),
  island: hex("#6f8f4a"),
  bark: hex("#7a5a3c"),
  soil: hex("#3a2a22"),
  fig: hex("#3f6f35"),
  figLight: hex("#5e8f45"),
};
const UP = v3(0, 1, 0);
const DEG = Math.PI / 180;

// A placement: position, then yaw (about y) over pitch (about x) over roll
// (about z), the HomeSection yaw convention (an object faces (sin, cos))
const frame = (x, y, z, { yaw = 0, pitch = 0, roll = 0 } = {}) =>
  new THREE.Matrix4().compose(
    v3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, "YXZ")),
    v3(1, 1, 1),
  );

const placed = (sink, matrix, draw) => {
  sink.push(matrix);
  draw();
  sink.pop();
};

const shade = (color, k) => color.clone().multiplyScalar(k);

// Armchair: a Scandinavian lounge chair in its own frame (origin at the
// floor under its centre, facing +z), footprint x ±0.37, z ±0.40
const ARMCHAIR = { x: -1.45, z: -0.9, yaw: 0.35 };
const LEG_X = 0.335;
const SPLAY = Math.tan(8 * DEG);
const RECLINE = 15 * DEG;
// The back cushion's frame: its front-bottom edge, tilted back
const BACK_CUSHION = { y: 0.4, z: -0.19, height: 0.414, depth: 0.1 };

const buildArmchair = (sink) => {
  const { oak, oakGrain, seaTeal, seaTealShade, coral, sand } = PALETTE;
  sink.push(frame(ARMCHAIR.x, 0, ARMCHAIR.z, { yaw: ARMCHAIR.yaw }));
  // Legs splayed 8° front and back, thickest at the seat rail (r 0.035),
  // tapering to the foot (r 0.02); a slimmer post carries the arm rail
  const joint = 0.3;
  const arm = 0.565;
  for (const sx of [-1, 1]) {
    const x = sx * LEG_X;
    for (const [foot, dir] of [[0.35, -1], [-0.29, 1]]) {
      const atJoint = foot + dir * (joint - FLOOR_Y) * SPLAY;
      const atArm = atJoint + dir * (arm - joint) * SPLAY;
      cylinderBetween(sink, v3(x, FLOOR_Y, foot), v3(x, joint, atJoint), 0.02, 0.035, 6, oak, { caps: false });
      cylinderBetween(sink, v3(x, joint, atJoint), v3(x, arm, atArm), 0.03, 0.022, 6, oak, { caps: false });
    }
    // Side seat rail and arm rail (0.05 wide, its top at 0.60)
    const xs = sx < 0 ? [-0.355, -0.315] : [0.315, 0.355];
    box(sink, xs, [0.24, 0.3], [-0.24, 0.3], oakGrain, { omit: "-y" });
    bevelBox(sink, sx < 0 ? [-0.36, -0.31] : [0.31, 0.36], [arm, 0.6], [-0.25, 0.36], 0.008, oak);
    // Back post, reclined with the back cushion
    const lean = Math.tan(RECLINE);
    cylinderBetween(sink, v3(x, joint, -0.27), v3(x, 0.74, -0.27 - (0.74 - joint) * lean), 0.022, 0.018, 6, oak, { caps: "end" });
  }
  box(sink, [-0.315, 0.315], [0.24, 0.3], [0.285, 0.325], oakGrain, { omit: "-y" });
  box(sink, [-0.315, 0.315], [0.24, 0.3], [-0.265, -0.225], oakGrain, { omit: "-y" });
  cylinderBetween(sink, v3(-LEG_X, 0.62, -0.362), v3(LEG_X, 0.62, -0.362), 0.012, 0.012, 6, oak, { caps: false });

  // Seat cushion (top 0.42, 0.12 thick) with a darker welt along its front
  bevelBox(sink, [-0.3, 0.3], [0.3, 0.42], [-0.22, 0.37], 0.03, seaTeal);
  sink.quad(v3(-0.27, 0.355, 0.3712), v3(0.27, 0.355, 0.3712), v3(0.27, 0.365, 0.3712), v3(-0.27, 0.365, 0.3712), seaTealShade);

  // Back cushion tilted 15°, up to y 0.80; the coral lumbar pillow on the
  // seat against it; the sand knitted throw over its back-left corner
  const { y, z, height, depth } = BACK_CUSHION;
  placed(sink, frame(0, y, z, { pitch: -RECLINE }), () => {
    bevelBox(sink, [-0.29, 0.29], [0, height], [-depth, 0], 0.03, seaTeal);
    buildThrow(sink, sand);
  });
  placed(sink, frame(0.03, 0.42, z - 0.006, { yaw: -0.1, pitch: -RECLINE }), () => {
    bevelBox(sink, [-0.18, 0.18], [0, 0.24], [0.002, 0.102], 0.035, coral);
  });

  // A book left face down over the right arm rail, its covers resting on
  // the rail's edges
  placed(sink, frame(LEG_X, 0.635, 0.06, { yaw: 0.2 }), () => {
    for (const sx of [-1, 1]) {
      placed(sink, frame(0, 0, 0, { roll: -sx * 40 * DEG }), () => {
        box(sink, sx < 0 ? [-0.13, 0] : [0, 0.13], [-0.014, 0], [-0.1, 0.1], COLOR.page, {
          faces: { "+y": COLOR.mustard },
        });
      });
    }
  });
  sink.pop();
};

// The throw in the back cushion's frame: a knitted band over the cushion's
// top, hanging lower at the outer (left) end, in cable stripes, with a
// fringe along its front edge
const buildThrow = (sink, sand) => {
  const { height, depth } = BACK_CUSHION;
  const lift = 0.012;
  const xs = [-0.305, -0.24, -0.17, -0.1, -0.035];
  const along = (x) => (x - xs[0]) / (xs[xs.length - 1] - xs[0]);
  const hem = (x) => 0.1 + 0.2 * along(x);
  const path = (x) => {
    const back = 0.08 + 0.2 * along(x);
    return [
      v3(x, hem(x), lift),
      v3(x, height - 0.05, lift),
      v3(x, height - 0.008, lift * 0.5),
      v3(x, height + lift, -0.02),
      v3(x, height + lift, -depth + 0.02),
      v3(x, height - 0.008, -depth - lift * 0.5),
      v3(x, height - 0.05, -depth - lift),
      v3(x, back, -depth - lift),
    ];
  };
  const rows = xs.map(path);
  for (let i = 0; i < xs.length - 1; i++) strip(sink, rows[i], rows[i + 1], i % 2 ? shade(sand, 0.9) : sand);
  // Fringe: little tassels under the front edge
  for (let k = 0; k < 6; k++) {
    const x = xs[0] + 0.01 + k * 0.047;
    const y = hem(x);
    orientedTri(sink, v3(x - 0.008, y, lift), v3(x + 0.008, y, lift), v3(x, y - 0.03, lift), shade(sand, 0.85), {}, v3(0, 0, 1));
  }
};

// Fiddle-leaf fig in a terracotta pot in the window corner: a slim trunk
// and a side branch, broad leaves turned up and out, the lower ones drooping;
// the canopy stays clear of the lace (z −1.71) and the left wall
const FIG = { x: -2.5, z: -1.15, leaves: 34 };
const FIG_POT = [[0, 0.13], [0.29, 0.165], [0.3, 0.18], [0.36, 0.18]];
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const leafSpan = new THREE.Vector3();
const leafLift = new THREE.Vector3();

// The fiddle shape: [along the midrib, half width] from the stalk to the
// blunt tip, widest near the tip
const FIDDLE = [[0.3, 0.32], [0.62, 0.5], [0.88, 0.42]];

// A broad leaf from `base` along `dir` (unit), its face turned toward
// `facing`, the halves folded up a little along the midrib, both sides
// drawn; the two halves take slightly different greens
const broadLeaf = (sink, base, dir, facing, length, width, colors) => {
  leafSpan.crossVectors(facing, dir);
  if (leafSpan.lengthSq() < 1e-6) leafSpan.set(1, 0, 0);
  leafSpan.normalize();
  leafLift.crossVectors(leafSpan, dir).normalize();
  const spine = [0, ...FIDDLE.map(([t]) => t), 1].map((t) => base.clone().addScaledVector(dir, length * t));
  const half = (sx, color) => {
    const edge = FIDDLE.map(([t, w]) =>
      base.clone().addScaledVector(dir, length * t).addScaledVector(leafSpan, sx * w * width).addScaledVector(leafLift, -0.15 * w * width),
    );
    const tris = [[spine[0], edge[0], spine[1]]];
    for (let i = 0; i < FIDDLE.length - 1; i++) tris.push([spine[i + 1], edge[i], edge[i + 1]], [spine[i + 1], edge[i + 1], spine[i + 2]]);
    tris.push([spine[FIDDLE.length], edge[FIDDLE.length - 1], spine[FIDDLE.length + 1]]);
    for (const [a, b, c] of tris) {
      sink.tri(a, b, c, color);
      sink.tri(a, c, b, color);
    }
  };
  half(1, colors[0]);
  half(-1, colors[1]);
};

const buildFig = (sink, random) => {
  const { x, z } = FIG;
  for (let k = 0; k < FIG_POT.length - 1; k++) {
    const [[y0, r0], [y1, r1]] = [FIG_POT[k], FIG_POT[k + 1]];
    cylinder(sink, [x, z], [FLOOR_Y + y0, FLOOR_Y + y1], [r0, r1], 14, k === 1 ? shade(COLOR.terracotta, 0.9) : COLOR.terracotta, { caps: false });
  }
  polygon(sink, ellipse(v3(x, FLOOR_Y + 0.335, z), 0.17, 0.17, 14), COLOR.soil, {}, UP);
  const trunk = [v3(x, 0.3, z), v3(x + 0.01, 0.8, z + 0.01), v3(x + 0.03, 1.38, z + 0.02)];
  const branches = [
    [v3(x + 0.01, 0.78, z + 0.01), v3(x + 0.13, 0.95, z + 0.07), v3(x + 0.22, 1.08, z + 0.12)],
    [v3(x + 0.01, 0.92, z + 0.01), v3(x - 0.1, 1.06, z + 0.05), v3(x - 0.17, 1.16, z + 0.08)],
  ];
  tube(sink, trunk, 0.016, 5, COLOR.bark);
  for (const branch of branches) tube(sink, branch, 0.01, 4, COLOR.bark);
  const along = (path, t) => {
    const f = t * (path.length - 1);
    const i = Math.min(path.length - 2, Math.floor(f));
    return path[i].clone().lerp(path[i + 1], f - i);
  };
  for (let k = 0; k < FIG.leaves; k++) {
    // Two leaves in five on the branches; more leaves toward each tip
    const host = k % 5 === 2 ? branches[0] : k % 5 === 4 ? branches[1] : trunk;
    const t = 1 - (1 - (k + 0.5) / FIG.leaves) ** 1.3;
    const at = host === trunk ? along(trunk, 0.38 + 0.62 * t) : along(host, 0.25 + 0.75 * random());
    const a = k * GOLDEN;
    // Lower leaves droop, the top ones reach up
    const rise = host === trunk ? -0.35 + 1.4 * t + random() * 0.25 : 0.05 + random() * 0.45;
    const dir = v3(Math.cos(a), rise, Math.sin(a) * 0.8 + 0.15).normalize();
    const length = 0.24 + random() * 0.08;
    // A short stalk, then the leaf; the canopy keeps off the lace and the wall
    const reach = length + 0.04;
    if (at.z + dir.z * reach < -1.62) dir.z = Math.abs(dir.z);
    if (at.x + dir.x * reach < -2.92) dir.x = Math.abs(dir.x);
    dir.normalize();
    const stalk = at.clone().addScaledVector(dir, 0.04);
    tube(sink, [at, stalk], 0.004, 3, COLOR.bark);
    const tone = 0.85 + random() * 0.3;
    const green = COLOR.fig.clone().lerp(COLOR.figLight, random() * 0.6).multiplyScalar(tone);
    // Each leaf faces up, out from the trunk and a little toward the room
    const facing = v3(dir.x, 0, dir.z).normalize().multiplyScalar(0.7).add(v3(0, 0.75, 0.35)).normalize();
    broadLeaf(sink, stalk, dir, facing, length, 0.18 + random() * 0.05, [green, shade(green, 0.82)]);
  }
};

// Side table: round oak top on three legs; three stacked books and a mug
const TABLE = { x: -0.8, z: -1.25, r: 0.22, top: 0.5, thick: 0.025 };

// A book lying flat in its own frame (centred, on y 0): covers top and
// bottom, the spine to the front (+z), page edges elsewhere
const flatBook = (sink, [w, h, d], cover) =>
  box(sink, [-w / 2, w / 2], [0, h], [-d / 2, d / 2], COLOR.page, {
    omit: "-y",
    faces: { "+y": cover, "+z": cover },
  });

const buildSideTable = (sink) => {
  const { x, z, r, top, thick } = TABLE;
  const { oak, coral, sand } = PALETTE;
  cylinder(sink, [x, z], [top - thick, top], [r, r], 16, oak, { caps: "end" });
  for (let k = 0; k < 3; k++) {
    const a = Math.PI / 2 + (k * 2 * Math.PI) / 3;
    const at = (radius, h) => v3(x + radius * Math.cos(a), h, z + radius * Math.sin(a));
    cylinderBetween(sink, at(0.17, FLOOR_Y), at(0.13, top - thick), 0.012, 0.018, 6, oak, { caps: false });
  }
  // Three books (charcoal, sand, coral from the bottom), a little askew
  let y = top;
  for (const [size, cover, yaw] of [
    [[0.22, 0.035, 0.16], COLOR.charcoal, 0.1],
    [[0.2, 0.028, 0.15], sand, -0.12],
    [[0.18, 0.025, 0.13], coral, 0.25],
  ]) {
    placed(sink, frame(x - 0.04, y, z - 0.05, { yaw }), () => flatBook(sink, size, cover));
    y += size[1];
  }
  buildMug(sink, x + 0.12, z + 0.09, top);
};

// A cream mug (r 0.04, h 0.09) with coffee in it and a handle to the right
const buildMug = (sink, x, z, y) => {
  const { cream, coffee } = COLOR;
  const [r, h, wall] = [0.04, 0.09, 0.005];
  const sides = 12;
  cylinder(sink, [x, z], [y, y + h], [r * 0.95, r], sides, cream, { caps: false });
  const rimOuter = ellipse(v3(x, y + h, z), r, r, sides);
  const rimInner = ellipse(v3(x, y + h, z), r - wall, r - wall, sides);
  const surface = ellipse(v3(x, y + h - 0.014, z), r - wall, r - wall, sides);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    polygon(sink, [rimOuter[i], rimOuter[j], rimInner[j], rimInner[i]], cream, {}, UP);
    const inward = v3(x, 0, z).sub(v3(rimInner[i].x, 0, rimInner[i].z));
    polygon(sink, [rimInner[i], rimInner[j], surface[j], surface[i]], shade(cream, 0.85), {}, inward);
  }
  polygon(sink, surface, coffee, {}, UP);
  const handle = [];
  for (let k = 0; k <= 4; k++) {
    const a = -Math.PI / 2 + (k / 4) * Math.PI;
    handle.push(v3(x + r - 0.004 + 0.026 * Math.cos(a), y + h * 0.5 + 0.024 * Math.sin(a), z));
  }
  tube(sink, handle, 0.006, 4, cream);
};

// Bookcase: open oak against the back wall, right of the arch; books on
// the three lower levels, a vase and a framed photo on the fourth
const SHELF = {
  x: [0.55, 1.4],
  z: [-1.78, -1.46],
  height: 1.85,
  board: 0.025,
  levels: [0.08, 0.5, 0.92, 1.34],
};
const BOOK = { width: [0.022, 0.045], height: [0.17, 0.27], depth: [0.14, 0.2] };

const buildBookcase = (sink) => {
  const { x, z, height, board, levels } = SHELF;
  const { oak, oakGrain } = PALETTE;
  const inner = [x[0] + board, x[1] - board];
  const front = z[1];
  box(sink, [x[0], inner[0]], [FLOOR_Y, height - board], z, oak, { omit: "-y-z" });
  box(sink, [inner[1], x[1]], [FLOOR_Y, height - board], z, oak, { omit: "-y-z" });
  box(sink, x, [height - board, height], z, oak, { omit: "-z" });
  // Kick board under the bottom shelf
  box(sink, inner, [FLOOR_Y, levels[0] - board], [front - 0.03, front - 0.01], oakGrain, { omit: "-y-z-x+x" });
  // Shelf boards: their tops darker toward the back (inside the case)
  for (const y of levels) {
    box(sink, inner, [y - board, y], z, oak, { omit: "-y-z-x+x+y" });
    polygon(sink, [v3(inner[0], y, front), v3(inner[1], y, front), v3(inner[1], y, z[0]), v3(inner[0], y, z[0])], oak, { ao: [0.95, 0.95, 0.8, 0.8] }, UP);
  }
};

const between = (random, [lo, hi]) => lo + (hi - lo) * random();

// A standing book in its own frame: x [0, w] from its bottom-left edge,
// y [0, h], z [-d, 0] (the spine at z 0); a band across some spines
const standingBook = (sink, [w, h, d], cover, band) => {
  box(sink, [0, w], [0, h], [-d, 0], cover, { omit: "-y-z", faces: { "+y": COLOR.page } });
  if (!band) return;
  const [y0, y1] = [h * 0.76, h * 0.82];
  sink.quad(v3(0.003, y0, 0.0008), v3(w - 0.003, y0, 0.0008), v3(w - 0.003, y1, 0.0008), v3(0.003, y1, 0.0008), band);
};

// One level of books: 14–18 spines from left to right, the last one
// before a gap leaning on its neighbour, and one flat stack
const buildShelfBooks = (sink, y, random) => {
  const { coral, sand, seaTeal } = PALETTE;
  const colors = [coral, sand, seaTeal, COLOR.olive, COLOR.cream, COLOR.charcoal, COLOR.mustard];
  const pick = () => colors[Math.floor(random() * colors.length)];
  const [x0, x1] = [SHELF.x[0] + SHELF.board + 0.008, SHELF.x[1] - SHELF.board - 0.008];
  const count = 14 + Math.floor(random() * 5);
  const stackSize = random() < 0.5 ? 3 : 4;
  // The stack goes after this many standing books (left, middle or right)
  const standing = count - stackSize;
  const stackAfter = [0, Math.floor(standing / 2), standing][Math.floor(random() * 3)];
  let cursor = x0;
  let previous = null;
  const stand = (lean) => {
    const size = [between(random, BOOK.width), between(random, BOOK.height), between(random, BOOK.depth)];
    const [w, h] = size;
    const zf = SHELF.z[1] - 0.005 - random() * 0.012;
    const band = random() < 0.5 ? (random() < 0.5 ? COLOR.cream : COLOR.charcoal) : null;
    const cover = pick();
    if (lean && previous) {
      // Resting on its bottom-left edge against the previous book's top
      // edge (or its own top corner against the previous book's side)
      const angle = between(random, [0.18, 0.32]);
      const contact = Math.min(previous.h, h * Math.cos(angle));
      const pivot = previous.end + contact * Math.tan(angle);
      const end = pivot + w * Math.cos(angle);
      if (end > x1) return false;
      placed(sink, frame(pivot, y, zf, { roll: angle }), () => standingBook(sink, size, cover, band));
      cursor = end + 0.012;
      previous = null;
      return true;
    }
    if (cursor + w > x1) return false;
    placed(sink, frame(cursor, y, zf), () => standingBook(sink, size, cover, band));
    previous = { end: cursor + w, h };
    cursor += w + 0.0015;
    return true;
  };
  const stack = () => {
    const books = [];
    for (let k = 0; k < stackSize; k++) {
      books.push([between(random, [0.17, 0.24]), between(random, [0.025, 0.04]), between(random, [0.14, 0.18])]);
    }
    const width = Math.max(...books.map((b) => b[0]));
    if (cursor + width > x1) return;
    let h = y;
    for (const size of books) {
      const cx = cursor + width / 2 + (random() - 0.5) * 0.012;
      placed(sink, frame(cx, h, SHELF.z[1] - 0.01 - size[2] / 2, { yaw: (random() - 0.5) * 0.12 }), () => flatBook(sink, size, pick()));
      h += size[1];
    }
    cursor += width + 0.012;
    previous = null;
  };
  for (let k = 0; k < standing; k++) {
    if (k === stackAfter) stack();
    // The book before the stack and the row's last one lean
    const lean = k > 0 && (k === stackAfter - 1 || k === standing - 1);
    if (!stand(lean)) break;
  }
  if (stackAfter === standing) stack();
};

// A terracotta vase with three dried grass stems, on the fourth level
const VASE = { x: 1.24, z: -1.6 };
const VASE_PROFILE = [[0, 0.04], [0.07, 0.06], [0.14, 0.045], [0.19, 0.025], [0.21, 0.032]];

const buildVase = (sink, y) => {
  const { x, z } = VASE;
  const sides = 10;
  for (let k = 0; k < VASE_PROFILE.length - 1; k++) {
    const [[y0, r0], [y1, r1]] = [VASE_PROFILE[k], VASE_PROFILE[k + 1]];
    cylinder(sink, [x, z], [y + y0, y + y1], [r0, r1], sides, COLOR.terracotta, { caps: false });
  }
  polygon(sink, ellipse(v3(x, y + 0.205, z), 0.027, 0.027, sides), shade(COLOR.terracotta, 0.35), {}, UP);
  for (const [dx, dz, tip] of [[-0.07, 0.01, 0.4], [0.02, -0.02, 0.44], [0.08, 0.02, 0.36]]) {
    const base = v3(x, y + 0.17, z);
    const end = v3(x + dx, y + tip, z + dz);
    const dir = end.clone().sub(base).normalize();
    tube(sink, [base, end], 0.0025, 3, PALETTE.sandMotif);
    cylinderBetween(sink, end.clone().addScaledVector(dir, -0.09), end, 0.012, 0, 5, PALETTE.sand);
  }
};

// The framed photo of the Home island at sunset: a slim charcoal frame
// leaning back on the fourth level, coral sky, the sun on the horizon,
// teal sea, the island with its palm, a cream sand sliver
const PHOTO = { x: 0.8, z: -1.61, w: 0.26, h: 0.2, bar: 0.015, lean: 10 * DEG };

const buildPhoto = (sink, y) => {
  const { charcoal, cream, skyGlow, sun, island } = COLOR;
  const { coral, seaTeal } = PALETTE;
  placed(sink, frame(PHOTO.x, y, PHOTO.z, { pitch: -PHOTO.lean }), () => {
    const { w, h, bar } = PHOTO;
    const half = w / 2;
    const depth = [0, 0.015];
    box(sink, [-half, half], [0, bar], depth, charcoal, { omit: "-z" });
    box(sink, [-half, half], [h - bar, h], depth, charcoal, { omit: "-z" });
    box(sink, [-half, -half + bar], [bar, h - bar], depth, charcoal, { omit: "-z-y+y" });
    box(sink, [half - bar, half], [bar, h - bar], depth, charcoal, { omit: "-z-y+y" });
    const zp = 0.006;
    const [l, r] = [-half + bar, half - bar];
    const band = (y0, y1, c0, c1) => sink.quad(v3(l, y0, zp), v3(r, y0, zp), v3(r, y1, zp), v3(l, y1, zp), [c0, c0, c1, c1]);
    const [shore, horizon] = [bar + 0.02, bar + 0.065];
    band(bar, shore, cream, cream);
    band(shore, horizon, shade(seaTeal, 0.85), seaTeal);
    band(horizon, h - bar, skyGlow, coral);
    const front = v3(0, 0, 1);
    const disc = v3(0.045, horizon, zp + 0.0005);
    const rim = [];
    for (let k = 0; k <= 6; k++) rim.push(v3(disc.x + 0.022 * Math.cos((k / 6) * Math.PI), horizon + 0.022 * Math.sin((k / 6) * Math.PI), disc.z));
    fan(sink, disc, rim, sun, sun, { normal: front });
    const at = (u, v) => v3(u, horizon + v, zp + 0.0008);
    orientedTri(sink, at(-0.085, 0), at(-0.015, 0), at(-0.05, 0.012), island, {}, front);
    sink.quad(at(-0.047, 0.008), at(-0.044, 0.008), at(-0.04, 0.042), at(-0.043, 0.042), charcoal);
    for (const s of [-1, 0.4, 1]) orientedTri(sink, at(-0.0415, 0.044), at(-0.0415 + 0.024 * s, 0.03), at(-0.0415 + 0.018 * s, 0.042), island, {}, front);
  });
};

// Pothos on the bookcase top: a cream pot, a crown of leaves, five vines
// trailing over the front edge, the longest down to y ≈ 1.55
const POTHOS = { x: 1.15, y: 1.85, z: -1.62, vines: 5 };
const LEAF_FACING = v3(0, -0.12, 1).normalize();
const leafSide = new THREE.Vector3();

// A leaf from `base` along `dir` (unit), drawn on both sides
const leaf = (sink, base, dir, length, width, color, facing = LEAF_FACING) => {
  leafSide.crossVectors(dir, facing).normalize().multiplyScalar(width / 2);
  const mid = base.clone().addScaledVector(dir, length * 0.4);
  const [right, tip, left] = [mid.clone().add(leafSide), base.clone().addScaledVector(dir, length), mid.clone().sub(leafSide)];
  for (const [a, b, c] of [[base, right, tip], [base, tip, left]]) {
    sink.tri(a, b, c, color);
    sink.tri(a, c, b, color);
  }
};

const buildPothos = (sink, random) => {
  const { x, y, z } = POTHOS;
  const front = SHELF.z[1];
  cylinder(sink, [x, z], [y, y + 0.1], [0.058, 0.07], 10, COLOR.cream, { caps: false });
  cylinder(sink, [x, z], [y + 0.088, y + 0.1], [0.074, 0.074], 10, COLOR.cream, { caps: false });
  const light = hex("#9fbf5a");
  const tone = () => PALETTE.pothos.clone().lerp(light, random() * 0.45).multiplyScalar(0.85 + random() * 0.25);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + random() * 0.4;
    const base = v3(x + 0.03 * Math.cos(a), y + 0.1, z + 0.03 * Math.sin(a));
    leaf(sink, base, v3(Math.cos(a), 0.9, Math.sin(a)).normalize(), 0.055 + random() * 0.015, 0.035, tone());
  }
  for (let k = 0; k < POTHOS.vines; k++) {
    const vx = x - 0.15 + k * 0.075 + (random() - 0.5) * 0.03;
    const end = 1.55 + random() * 0.17;
    const drift = (random() - 0.5) * 0.08;
    const start = v3(x + (vx - x) * 0.4, y + 0.1, z + 0.05);
    const edge = v3(vx, y + 0.012, front + 0.006);
    const hang = [v3(vx + drift * 0.3, y - 0.05, front + 0.012), v3(vx + drift * 0.7, (y + end) / 2 - 0.04, front + 0.018), v3(vx + drift, end, front + 0.024)];
    const vine = [start, edge, ...hang];
    tube(sink, vine, 0.0025, 3, COLOR.stem);
    // Leaves every 3.5 cm from the edge down, alternating sides
    let side = random() < 0.5 ? -1 : 1;
    for (let i = 1; i < vine.length - 1; i++) {
      const [p, q] = [vine[i], vine[i + 1]];
      const steps = Math.max(1, Math.round(p.distanceTo(q) / 0.035));
      for (let s = 0; s < steps; s++) {
        const at = p.clone().lerp(q, s / steps);
        const dir = v3(side * 0.7, -0.55, 0.3).normalize();
        leaf(sink, at, dir, 0.04 + random() * 0.018, 0.03, tone());
        side = -side;
      }
    }
    leaf(sink, vine[vine.length - 1], v3(drift, -1, 0.25).normalize(), 0.045, 0.03, tone());
  }
};

// A contact blob (as shapes' contactShadow): an opaque fan 2 mm over the
// surface, its centre the surface × 0.7; on the floor its rim takes the
// floor's AO in front of the back wall, so it meets the planks seamlessly
const blob = (sink, [x, z], [rx, rz], under, { y = FLOOR_Y, onRug = false, segments = 16 } = {}) => {
  const centre = v3(x, y + 0.002, z);
  const rim = ellipse(centre, rx, rz, segments);
  const ao = (p) => (onRug ? 1 : AO.floorEdge(p.z - BACK));
  const dark = shade(under, 0.7);
  for (let i = 0; i < segments; i++) {
    const [a, b] = [rim[i], rim[(i + 1) % segments]];
    // The ellipse runs from +x toward +z, so centre, b, a faces up
    sink.tri(centre, b, a, [dark, under, under], { ao: [ao(centre), ao(b), ao(a)] });
  }
};

const buildContactBlobs = (sink) => {
  const { sand, floorOak } = PALETTE;
  placed(sink, frame(ARMCHAIR.x, 0, ARMCHAIR.z, { yaw: ARMCHAIR.yaw }), () => {
    blob(sink, [0, 0], [0.5, 0.5], sand, { y: RUG_Y, onRug: true });
  });
  blob(sink, [FIG.x, FIG.z], [0.24, 0.24], floorOak[0]);
  blob(sink, [TABLE.x, TABLE.z + 0.04], [0.21, 0.19], sand, { y: RUG_Y, onRug: true });
  blob(sink, [(SHELF.x[0] + SHELF.x[1]) / 2, (SHELF.z[0] + SHELF.z[1]) / 2], [0.5, 0.19], floorOak[0]);
};

export const buildReadingCorner = (out, ctx) => {
  const { solid } = out;
  buildContactBlobs(solid);
  buildArmchair(solid);
  buildSideTable(solid);
  buildBookcase(solid);
  for (const y of SHELF.levels.slice(0, 3)) buildShelfBooks(solid, y, ctx.random);
  buildVase(solid, SHELF.levels[3]);
  buildPhoto(solid, SHELF.levels[3]);
  buildPothos(solid, ctx.random);
  // After the books and the pothos, so their random draws stay as they were
  buildFig(solid, ctx.random);
};
