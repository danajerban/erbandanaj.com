import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { LANTERN_Y, cafeLights } from "../../lib/parkLayout";
import { PARK_LAYER, ParkSink, parkSolidMaterial } from "../../lib/parkMaterials";

// The park's lamp posts and the café's string lights: one static mesh on
// the park-solid program. Old-town iron posts (plinth, tapering octagonal
// post, crossbar, a four-pane lantern, pyramid cap and ball finial); the
// glass and the bulbs glow (aGlow) and dim with timeOfDay.lamps through the
// shared material. The café lamp's crossbar is where the string lights hang.

const IRON = "#1f2a27";
// The faces turned to the moon (+x) catch a cooler, lighter edge
const IRON_MOON = "#3a4744";
const GLASS = new THREE.Color("#ffd58a");
const WIRE = new THREE.Color("#15151b");
const BULB = new THREE.Color("#ffe3a0");

const POST = { bottom: 0.18, top: 2.1, r0: 0.055, r1: 0.04, sides: 8 };
const PLINTH = { w: 0.16, h: 0.18 };
const CROSSBAR = { y: 2.05, w: 0.34, t: 0.03 };
const NECK = { r: 0.025 };
const PANE = { w: 0.2, h: 0.28 }; // centred at LANTERN_Y
const PLATE = { w: 0.24, t: 0.02 };
const CAP = { w: 0.26, h: 0.08 };
const FINIAL = { r: 0.03, top: 2.62 };
const WIRE_WIDTH = 0.012;
const WIRE_SEGMENTS = 24;
const BULB_R = 0.03;

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
// A box's faces: the outward normal and two tangents with u × v = n
const FACES = [
  [X, Y, Z],
  [X.clone().negate(), Z, Y],
  [Y, Z, X],
  [Y.clone().negate(), X, Z],
  [Z, X, Y],
  [Z.clone().negate(), Y, X],
];
const ironOf = (n) => (n.x > 0.5 ? IRON_MOON : IRON);

const v = (x, y, z) => new THREE.Vector3(x, y, z);

// An axis-aligned box: centre and size
const box = (sink, [cx, cy, cz], [sx, sy, sz]) => {
  const half = v(sx / 2, sy / 2, sz / 2);
  const c = v(cx, cy, cz);
  for (const [n, u, w] of FACES) {
    const f = c.clone().addScaledVector(n, Math.abs(n.dot(half)));
    const du = u.clone().multiplyScalar(Math.abs(u.dot(half)));
    const dw = w.clone().multiplyScalar(Math.abs(w.dot(half)));
    sink.quad(
      f.clone().sub(du).sub(dw),
      f.clone().add(du).sub(dw),
      f.clone().add(du).add(dw),
      f.clone().sub(du).add(dw),
      ironOf(n),
    );
  }
};

// A tapering prism round the y axis, sides only
const prism = (sink, y0, y1, r0, r1, sides) => {
  const at = (i, r, y) => {
    const a = ((i + 0.5) / sides) * 2 * Math.PI;
    return v(r * Math.sin(a), y, r * Math.cos(a));
  };
  for (let i = 0; i < sides; i++) {
    const mid = ((i + 1) / sides) * 2 * Math.PI;
    sink.quad(at(i, r0, y0), at(i + 1, r0, y0), at(i + 1, r1, y1), at(i, r1, y1), Math.sin(mid) > 0.5 ? IRON_MOON : IRON);
  }
};

// An octahedron (the finial and the bulbs): opts as ParkSink.tri
const octahedron = (sink, [cx, cy, cz], r, hex, opts) => {
  const tips = [v(r, 0, 0), v(0, 0, -r), v(-r, 0, 0), v(0, 0, r)];
  const top = v(cx, cy + r, cz);
  const bottom = v(cx, cy - r, cz);
  const c = v(cx, cy, cz);
  for (let i = 0; i < 4; i++) {
    const a = c.clone().add(tips[i]);
    const b = c.clone().add(tips[(i + 1) % 4]);
    sink.tri(a, b, top, hex, opts);
    sink.tri(b, a, bottom, hex, opts);
  }
};

const addLamp = (sink) => {
  box(sink, [0, PLINTH.h / 2, 0], [PLINTH.w, PLINTH.h, PLINTH.w]);
  prism(sink, POST.bottom, POST.top, POST.r0, POST.r1, POST.sides);
  box(sink, [0, CROSSBAR.y, 0], [CROSSBAR.w, CROSSBAR.t, CROSSBAR.t]);
  const paneBottom = LANTERN_Y - PANE.h / 2;
  const paneTop = LANTERN_Y + PANE.h / 2;
  prism(sink, POST.top, paneBottom - PLATE.t, NECK.r, NECK.r, 6);
  // The lantern: plates, four glass panes, iron corners, cap and finial
  box(sink, [0, paneBottom - PLATE.t / 2, 0], [PLATE.w, PLATE.t, PLATE.w]);
  box(sink, [0, paneTop + PLATE.t / 2, 0], [PLATE.w, PLATE.t, PLATE.w]);
  const h = PANE.w / 2;
  const glass = { color: GLASS, glow: 1 };
  sink.quad(v(-h, paneBottom, h), v(h, paneBottom, h), v(h, paneTop, h), v(-h, paneTop, h), null, glass);
  sink.quad(v(h, paneBottom, -h), v(-h, paneBottom, -h), v(-h, paneTop, -h), v(h, paneTop, -h), null, glass);
  sink.quad(v(h, paneBottom, h), v(h, paneBottom, -h), v(h, paneTop, -h), v(h, paneTop, h), null, glass);
  sink.quad(v(-h, paneBottom, -h), v(-h, paneBottom, h), v(-h, paneTop, h), v(-h, paneTop, -h), null, glass);
  for (const [x, z] of [[-h, -h], [h, -h], [h, h], [-h, h]]) {
    box(sink, [x, LANTERN_Y, z], [0.02, PANE.h, 0.02]);
  }
  const capBase = paneTop + PLATE.t;
  const apex = v(0, capBase + CAP.h, 0);
  const c = CAP.w / 2;
  const corners = [v(c, capBase, c), v(c, capBase, -c), v(-c, capBase, -c), v(-c, capBase, c)];
  for (let i = 0; i < 4; i++) sink.tri(corners[i], corners[(i + 1) % 4], apex, IRON);
  octahedron(sink, [0, FINIAL.top - FINIAL.r, 0], FINIAL.r, IRON);
};

// The café string lights: a thin upright ribbon along the sagging wire, and
// a bulb on it every so often
const addStringLights = (sink, park) => {
  const { point, bulbs } = cafeLights(park);
  const wire = { color: WIRE };
  const w = WIRE_WIDTH / 2;
  for (let i = 0; i < WIRE_SEGMENTS; i++) {
    const [ax, ay, az] = point(i / WIRE_SEGMENTS);
    const [bx, by, bz] = point((i + 1) / WIRE_SEGMENTS);
    sink.quad(v(ax, ay - w, az), v(bx, by - w, bz), v(bx, by + w, bz), v(ax, ay + w, az), null, wire);
  }
  const bulb = { color: BULB, glow: 1 };
  for (const [x, y, z] of bulbs) octahedron(sink, [x, y - BULB_R, z], BULB_R, null, bulb);
};

const buildLamps = (park) => {
  const sink = new ParkSink(park);
  const matrix = new THREE.Matrix4();
  for (const [x, z] of park.lamps) {
    sink.push(matrix.makeTranslation(x, 0, z));
    addLamp(sink);
    sink.pop();
  }
  addStringLights(sink, park);
  // Origin at the posts' centre (the dissolve melts the nearest origins first)
  const n = park.lamps.length;
  const cx = park.lamps.reduce((sum, [x]) => sum + x, 0) / n;
  const cz = park.lamps.reduce((sum, [, z]) => sum + z, 0) / n;
  return sink.build([cx, 0, cz]);
};

export default function ParkLamps({ park }) {
  // park is PARK[layout]: one geometry per layout
  const { geometry, origin } = useMemo(() => buildLamps(park), [park]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const mesh = useMemo(() => {
    const lamps = new THREE.Mesh(undefined, parkSolidMaterial);
    lamps.layers.set(PARK_LAYER);
    return lamps;
  }, []);
  return <primitive object={mesh} geometry={geometry} position={origin} />;
}
