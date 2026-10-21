import * as THREE from "three";
import { PALETTE, hex } from "./bake";
import { FLOOR_Y } from "./layout";
import { contactShadow, cylinder, fan, polygon, v3 } from "./shapes";

// Projects: the snake plant on the floor beside the desk, at { x, z, yaw }
// (layout.js SNAKE_PLANT); out = { solid, glow }, ctx = { isMobile, layout,
// random }. A glossy white pot on a saucer, dark clay pebbles with white
// stones, banded sword leaves with yellow edges.

const SAUCER = { r: 0.14, h: 0.015 };
const POT = { r0: 0.115, r1: 0.13, h: 0.2, rim: 0.01, soil: 0.018 };
const C = {
  clay: hex("#3a2a22"),
  clayDark: hex("#2a1d17"),
  stone: hex("#f2f0ea"),
};

// The pot's glossy streak: a narrow highlight on the side facing `toward`
const gloss = (a, toward) => 1 + 0.18 * Math.max(0, Math.cos(a - toward)) ** 12;

// Pot on its saucer: walls with the glossy streak, the rim, the inner wall
// down to the pebbles, clay pebbles with darker specks and 10 white stones
const buildPot = (s, sides, random) => {
  cylinder(s, [0, 0], [0, SAUCER.h], [SAUCER.r, SAUCER.r + 0.006], sides, PALETTE.ceramic, { caps: "end" });
  const base = SAUCER.h;
  const top = base + POT.h;
  const ring = (r, y) => Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2;
    return v3(Math.sin(a) * r, y, Math.cos(a) * r);
  });
  const outer = [ring(POT.r0, base), ring(POT.r1, top)];
  const inner = [ring(POT.r1 - POT.rim, top), ring(POT.r1 - POT.rim - 0.004, top - POT.soil)];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    const [a, b] = [(i / sides) * Math.PI * 2, ((i + 1) / sides) * Math.PI * 2];
    const k = [gloss(a, 0.5), gloss(b, 0.5)];
    const shine = (q) => PALETTE.ceramic.clone().multiplyScalar(q);
    const mid = v3(Math.sin((a + b) / 2), 0, Math.cos((a + b) / 2));
    polygon(s, [outer[0][i], outer[0][j], outer[1][j], outer[1][i]], [shine(k[0]), shine(k[1]), shine(k[1]), shine(k[0])], {}, mid);
    polygon(s, [outer[1][i], outer[1][j], inner[0][j], inner[0][i]], PALETTE.ceramic, {}, v3(0, 1, 0));
    polygon(s, [inner[0][i], inner[0][j], inner[1][j], inner[1][i]], PALETTE.ceramic, { ao: 0.8 }, mid.clone().negate());
  }
  const soil = v3(0, top - POT.soil, 0);
  fan(s, soil, inner[1], C.clay, C.clay);
  const y = soil.y + 0.0006;
  const speck = (r, color, h = 0) => {
    const a = random() * Math.PI * 2;
    const d = Math.sqrt(random()) * (POT.r1 - POT.rim - 0.016);
    const c = v3(Math.sin(a) * d, y, Math.cos(a) * d);
    const t = random() * Math.PI;
    const pts = [0, 2.1, 4.2].map((q) => v3(c.x + Math.cos(t + q) * r, y, c.z + Math.sin(t + q) * r));
    if (!h) return polygon(s, pts, color, {}, v3(0, 1, 0));
    // A white stone: a tiny three-sided pyramid
    const tip = c.clone().setY(y + h);
    for (let q = 0; q < 3; q++) polygon(s, [pts[q], pts[(q + 1) % 3], tip], color, {}, pts[q].clone().add(pts[(q + 1) % 3]).add(tip).divideScalar(3).sub(c));
  };
  for (let k = 0; k < 18; k++) speck(0.006 + random() * 0.004, C.clayDark);
  for (let k = 0; k < 10; k++) speck(0.006 + random() * 0.003, C.stone, 0.006);
  return soil.y;
};

// One sword leaf from `root`: it rises along `up`, leans out along `out`
// (bending more toward the tip) and twists about its axis; its width is
// narrow at the base, widest at 40 %, a point at the tip. Three columns
// across: yellow edge, banded green middle, yellow edge; both sides drawn.
const leaf = (s, { root, out, length, width, lean, twist, face }, segments, random) => {
  const up = v3(0, 1, 0);
  const side0 = v3(Math.cos(face), 0, -Math.sin(face));
  const rows = [];
  for (let k = 0; k <= segments; k++) {
    const t = k / segments;
    const axis = root.clone().addScaledVector(up, length * t).addScaledVector(out, length * (lean * t + 0.25 * lean * t * t));
    const w = width * (t < 0.4 ? 0.6 + t : 1 - ((t - 0.4) / 0.6) ** 1.6) * 0.5;
    const side = side0.clone().applyAxisAngle(up, twist * t);
    const edge = Math.min(0.006, w * 0.3);
    rows.push([-w, -w + edge, w - edge, w].map((d) => axis.clone().addScaledVector(side, d)));
  }
  const tone = 0.85 + random() * 0.3;
  for (let k = 0; k < segments; k++) {
    const green = (k % 2 ? PALETTE.snakeBand : PALETTE.snakeLeaf).clone().multiplyScalar(tone);
    const colors = [PALETTE.snakeEdge, green, PALETTE.snakeEdge];
    for (let c = 0; c < 3; c++) {
      const [a, b, cc, d] = [rows[k][c], rows[k][c + 1], rows[k + 1][c + 1], rows[k + 1][c]];
      s.quad(a, b, cc, d, colors[c]);
      s.quad(a, d, cc, b, colors[c]);
    }
  }
};

export const buildSnakePlant = (out, ctx, { x, z, yaw }) => {
  const s = out.solid;
  const { isMobile, random } = ctx;
  contactShadow(s, x, z, 0.19, 0.19, PALETTE.floorOak[1], FLOOR_Y, 12);
  s.push(new THREE.Matrix4().makeTranslation(x, FLOOR_Y, z).multiply(new THREE.Matrix4().makeRotationY(yaw)));
  const soilY = buildPot(s, 16, random);
  // MOBILE_PERF: 5 snake-plant leaf segments on mobile — revert by removing the ternary
  const segments = isMobile ? 5 : 8;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + random() * 0.5;
    const out = v3(Math.sin(a), 0, Math.cos(a));
    const d = 0.012 + random() * 0.03;
    leaf(
      s,
      {
        root: v3(out.x * d, soilY - 0.01, out.z * d),
        out,
        length: 0.3 + random() * 0.15,
        width: 0.045 + random() * 0.015,
        lean: 0.06 + random() * 0.18,
        twist: (0.17 + random() * 0.27) * (random() < 0.5 ? -1 : 1),
        face: a,
      },
      segments,
      random,
    );
  }
  s.pop();
};
