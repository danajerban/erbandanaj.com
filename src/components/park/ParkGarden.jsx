import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { createRandom } from "../../lib/lowPoly";
import {
  RAILING_FRONT,
  REST_HALF_FOV_TAN,
  dogAt,
  lanterns,
  lawnTufts,
  pathCurve,
  pathPebbles,
  pondRocks,
  restEyeZ,
} from "../../lib/parkLayout";
import { FLOWERS, PARK_LAYER, ParkSink, parkSolidMaterial } from "../../lib/parkMaterials";
import { useGLTF } from "../../lib/useGLTF";
import { bench, dog, pebbles, rocks, tufts } from "./lawnDetails";

// The park's garden: round trees framing the edges, flower beds like sweets
// inside low box hedges, the iron railing along the sidewalk with its gate
// on the path, two shrubs beside it, and the lawn's small things
// (lawnDetails: the second bench, the dog, pebbles, rocks, grass tufts). One
// static mesh on the park-solid program, built in Contact-local units.

const v = (x, y, z) => new THREE.Vector3(x, y, z);

const TREE = {
  trunk: "#2e2522",
  crown: "#24392f",
  lampLit: "#4f6a45",
  moonRim: "#3c5a5e",
  under: "#18261f",
  // Crown lumps, biggest first: radius and centre (× the tree's size)
  lumps: [
    [0.75, [0, 1.9, 0]],
    [0.6, [0.45, 1.6, 0.1]],
    [0.55, [-0.4, 1.65, -0.1]],
  ],
  jitter: 0.12,
};
const HEDGE = { color: "#2c4a37", height: 0.14, thick: 0.12, segments: 24 };
const FLOWER_VALUE = 0.8;
const RAILING = {
  iron: new THREE.Color("#1a1e24"),
  moonEdge: new THREE.Color("#3a4250"),
  gate: 1.2,
};
// clear: from a lamp post's axis (its plinth is 0.16 wide)
const SHRUB = { color: "#2a4535", r: 0.35, clear: 0.5 };

// Faceted unit ball (icosahedron, detail 1): corners shared by position, so
// a jitter keeps the surface closed
const ICO = new THREE.IcosahedronGeometry(1, 1).getAttribute("position").array;
// The railing posts' ball finials
const FINIAL = new THREE.OctahedronGeometry(1, 0).getAttribute("position").array;

// A ball of radius r at c, each corner pushed out or in by up to ±jitter;
// colour by the face's facing (lamp-lit, moon rim, underside), sway by
// height between lo and hi
const lump = (sink, c, r, random, { base, shade, sway, phase }) => {
  const jitter = new Map();
  const corner = (i) => {
    const key = `${ICO[i].toFixed(3)},${ICO[i + 1].toFixed(3)},${ICO[i + 2].toFixed(3)}`;
    if (!jitter.has(key)) jitter.set(key, 1 + (random() * 2 - 1) * TREE.jitter);
    const k = r * jitter.get(key);
    return v(c.x + ICO[i] * k, c.y + ICO[i + 1] * k, c.z + ICO[i + 2] * k);
  };
  const normal = new THREE.Vector3();
  const centre = new THREE.Vector3();
  for (let i = 0; i < ICO.length; i += 9) {
    const [a, b, d] = [corner(i), corner(i + 3), corner(i + 6)];
    normal.subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    centre.copy(a).add(b).add(d).divideScalar(3);
    const hex = shade ? shade(normal, centre) : base;
    sink.tri(a, b, d, hex, { sway: sway ? [a, b, d].map(sway) : 0, phase });
  }
};

// A crown face's colour: undersides dark, the moon side (+x) a cool rim,
// faces turned to a lantern nearby warmed toward the lamp-lit green
const crownShade = (park) => {
  const lamps = lanterns(park).map(([x, y, z]) => v(x, y, z));
  const lit = new THREE.Color(TREE.lampLit);
  const toLamp = new THREE.Vector3();
  return (n, p) => {
    if (n.y < -0.35) return TREE.under;
    if (n.x > 0.6) return TREE.moonRim;
    let warm = 0;
    for (const lamp of lamps) {
      const d = toLamp.subVectors(lamp, p).length();
      const reach = Math.max(0, 1 - d / (2 * park.lampR));
      warm = Math.max(warm, Math.max(0, n.dot(toLamp.normalize())) * reach);
    }
    return new THREE.Color(TREE.crown).lerp(lit, warm).getHex();
  };
};

const tree = (sink, [x, z, size], random, shade, lumps) => {
  const phase = random() * Math.PI * 2;
  // Trunk: six sides, tapering r 0.13 → 0.08, 1.5 × size high
  const h = 1.5 * size;
  const [r0, r1] = [0.13 * size, 0.08 * size];
  for (let i = 0; i < 6; i++) {
    const [a, b] = [(Math.PI * 2 * i) / 6, (Math.PI * 2 * (i + 1)) / 6];
    const at = (r, y, t) => v(x + r * Math.cos(t), y, z - r * Math.sin(t));
    sink.quad(at(r0, 0, a), at(r0, 0, b), at(r1, h, b), at(r1, h, a), TREE.trunk);
  }
  // Two short branch stubs, up and out
  for (const [side, y] of [[1, 0.9], [-1, 1.1]]) {
    const base = v(x, y * size, z);
    const tip = v(x + side * 0.32 * size, (y + 0.28) * size, z + 0.04 * size);
    const w = 0.035 * size;
    sink.tri(v(base.x, base.y - w, z + w), tip, v(base.x, base.y + w, z + w), TREE.trunk);
    sink.tri(v(base.x, base.y - w, z - w), v(base.x, base.y + w, z - w), tip, TREE.trunk);
  }
  // Crown: the lumps sway more the higher they are (0.5 → 1)
  const [lo, hi] = [1.0 * size, 2.7 * size];
  const sway = (p) => 0.5 + 0.5 * THREE.MathUtils.clamp((p.y - lo) / (hi - lo), 0, 1);
  for (const [r, [cx, cy, cz]] of TREE.lumps.slice(0, lumps)) {
    lump(sink, v(x + cx * size, cy * size, z + cz * size), r * size, random, { shade, sway, phase });
  }
};

// A flower bed: a box-hedge ring around the ellipse, flowers inside
const bed = (sink, park, [x, z, rx, rz], random) => {
  const { color, height, thick, segments } = HEDGE;
  const at = (t, inset, y) => v(x + (rx - inset) * Math.cos(t), y, z - (rz - inset) * Math.sin(t));
  for (let i = 0; i < segments; i++) {
    const [a, b] = [(Math.PI * 2 * i) / segments, (Math.PI * 2 * (i + 1)) / segments];
    sink.quad(at(a, 0, 0), at(b, 0, 0), at(b, 0, height), at(a, 0, height), color);
    sink.quad(at(b, thick, 0), at(a, thick, 0), at(a, thick, height), at(b, thick, height), color);
    sink.quad(at(a, 0, height), at(b, 0, height), at(b, thick, height), at(a, thick, height), color);
  }
  // MOBILE_PERF: 22 flowers per bed on mobile (park.bedFlowersMax) — revert by giving the phone layouts in PARK the desktop value
  const count = Math.min(Math.round(70 * rx * rz), park.bedFlowersMax);
  const rgb = { r: 0, g: 0, b: 0 };
  for (let i = 0; i < count; i++) {
    const t = random() * Math.PI * 2;
    const u = Math.sqrt(random()) * 0.9;
    const [fx, fz] = [x + u * (rx - thick - 0.05) * Math.cos(t), z - u * (rz - thick - 0.05) * Math.sin(t)];
    const top = 0.12 + random() * 0.1;
    const bloom = new THREE.Color(FLOWERS[i % FLOWERS.length]);
    bloom.getRGB(rgb, THREE.SRGBColorSpace);
    bloom.setRGB(rgb.r * FLOWER_VALUE, rgb.g * FLOWER_VALUE, rgb.b * FLOWER_VALUE, THREE.SRGBColorSpace);
    // Stem (one thin triangle), then a 4-triangle cup 0.06 across
    sink.tri(v(fx - 0.006, 0, fz), v(fx + 0.006, 0, fz), v(fx, top, fz), HEDGE.color, { sway: [0, 0, 0.3] });
    const hw = 0.03;
    const apex = v(fx, top - hw, fz);
    const rim = [v(fx - hw, top + hw, fz + hw), v(fx + hw, top + hw, fz + hw), v(fx + hw, top + hw, fz - hw), v(fx - hw, top + hw, fz - hw)];
    for (let k = 0; k < 4; k++) sink.tri(apex, rim[(k + 1) % 4], rim[k], null, { color: bloom, sway: [0.3, 0.3, 0.3] });
  }
};

// The gravel path's x where it crosses depth z (the curve the ground draws,
// sampled finely)
const pathXAt = (park, z) => {
  const points = pathCurve(park).getSpacedPoints(200);
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]];
    if ((a.z - z) * (b.z - z) <= 0) return a.x + ((b.x - a.x) * (z - a.z)) / (b.z - a.z);
  }
  return points[points.length - 1].x;
};

// The railing along the sidewalk, from left to right with the gate gap:
// iron bars between posts (desktop and tall), or a solid band with a few
// posts on phones (park.detail.railing), where bars would be under 3 px
const railing = (sink, park, left, right, random) => {
  const z = park.row.z + RAILING_FRONT;
  // The gate opens where the path crosses the railing, on its way to the
  // café door just behind
  const gate = pathXAt(park, z);
  const [g0, g1] = [gate - RAILING.gate / 2, gate + RAILING.gate / 2];
  const bars = park.detail.railing === "bars";
  const step = bars ? 1.2 : 2.4;
  const iron = { color: RAILING.iron };
  const edge = { color: RAILING.moonEdge };
  // A post: a square shaft (moon side lighter) and a ball finial
  const post = (x) => {
    const [h, w] = [0.5, 0.035];
    sink.quad(v(x - w, 0, z + w), v(x + w, 0, z + w), v(x + w, h, z + w), v(x - w, h, z + w), null, iron);
    sink.quad(v(x + w, 0, z + w), v(x + w, 0, z - w), v(x + w, h, z - w), v(x + w, h, z + w), null, edge);
    sink.quad(v(x - w, 0, z - w), v(x - w, 0, z + w), v(x - w, h, z + w), v(x - w, h, z - w), null, iron);
    sink.quad(v(x - w, h, z + w), v(x + w, h, z + w), v(x + w, h, z - w), v(x - w, h, z - w), null, edge);
    const r = 0.045;
    for (let i = 0; i < FINIAL.length; i += 9) {
      const p = (k) => v(x + FINIAL[k] * r, h + r + FINIAL[k + 1] * r, z + FINIAL[k + 2] * r);
      const moon = FINIAL[i] + FINIAL[i + 3] + FINIAL[i + 6] > 0.5;
      sink.tri(p(i), p(i + 3), p(i + 6), null, moon ? edge : iron);
    }
  };
  // A rail: front and top faces
  const rail = (x0, x1, y0, y1) => {
    sink.quad(v(x0, y0, z + 0.015), v(x1, y0, z + 0.015), v(x1, y1, z + 0.015), v(x0, y1, z + 0.015), null, iron);
    sink.quad(v(x0, y1, z + 0.015), v(x1, y1, z + 0.015), v(x1, y1, z - 0.015), v(x0, y1, z - 0.015), null, edge);
  };
  for (const [x0, x1] of [[left, g0], [g1, right]]) {
    if (x1 <= x0) continue;
    if (bars) {
      rail(x0, x1, 0.06, 0.09);
      rail(x0, x1, 0.44, 0.47);
      for (let x = x0 + 0.08; x < x1 - 0.04; x += 0.16) {
        sink.quad(v(x - 0.009, 0.03, z), v(x + 0.009, 0.03, z), v(x + 0.009, 0.48, z), v(x - 0.009, 0.48, z), null, iron);
      }
    } else {
      sink.quad(v(x0, 0.12, z), v(x1, 0.12, z), v(x1, 0.42, z), v(x0, 0.42, z), null, iron);
      rail(x0, x1, 0.42, 0.47);
    }
  }
  // Posts flank the gate and repeat outward
  for (let x = g0; x > left; x -= step) post(x);
  for (let x = g1; x < right; x += step) post(x);
  // Two round shrubs flank the gate on the lawn side, each moved out past a
  // lamp post that stands where it would grow (the phone café lamp)
  for (const side of [-1, 1]) {
    const c = v(gate + side * (RAILING.gate / 2 + SHRUB.r + 0.05), SHRUB.r * 0.8, z + SHRUB.r + 0.05);
    for (const [lx, lz] of park.lamps) {
      if (Math.hypot(lx - c.x, lz - c.z) < SHRUB.clear) c.x = lx + side * SHRUB.clear;
    }
    lump(sink, c, SHRUB.r, random, { base: SHRUB.color, sway: () => 0.2, phase: side });
  }
};

// benchParts: Park Bench.glb's meshes as [geometry, day colour]
const buildGarden = (park, layout, aspect, benchParts) => {
  const sink = new ParkSink(park);
  const random = createRandom(24);
  const shade = crownShade(park);
  // MOBILE_PERF: 2 crown lumps per tree on mobile (park.crownLumps) — revert by giving the phone layouts in PARK the desktop value
  const lumps = park.crownLumps;
  for (const t of park.trees) tree(sink, t, random, shade, lumps);
  for (const b of park.beds) bed(sink, park, b, random);
  // The railing runs across the view at its depth, past both screen edges
  // (and further left on phones, where the section slides in)
  const z = park.row.z + RAILING_FRONT;
  const half = REST_HALF_FOV_TAN * (restEyeZ(layout) - z) * aspect + 0.5;
  railing(sink, park, -half - park.groundLeftExtra, half, random);
  // Origin at the content's centre: the near beds melt before the far row
  // (the lawn's small things below spread to the screen's bottom: they melt
  // with the garden, and leave its origin where it was)
  const box = new THREE.Box3().setFromArray(sink.position);
  const centre = box.getCenter(new THREE.Vector3());
  bench(sink, benchParts, park.bench2);
  dog(sink, dogAt(park, layout, aspect));
  pebbles(sink, pathPebbles(park));
  rocks(sink, pondRocks(park), random);
  tufts(sink, lawnTufts(park, layout, aspect));
  return sink.build([centre.x, 0, centre.z]);
};

export default function ParkGarden({ park, layout, aspect }) {
  const { nodes, materials } = useGLTF("/models/Park Bench.glb");
  const mesh = useMemo(() => {
    const benchParts = [
      [nodes["Park_Bench_Cube-Mesh"].geometry, materials.Metal.color],
      [nodes["Park_Bench_Cube-Mesh_1"].geometry, materials.Wood.color],
    ];
    const { geometry, origin } = buildGarden(park, layout, aspect, benchParts);
    const m = new THREE.Mesh(geometry, parkSolidMaterial);
    m.position.fromArray(origin);
    m.layers.set(PARK_LAYER);
    return m;
  }, [park, layout, aspect, nodes, materials]);
  useEffect(() => () => mesh.geometry.dispose(), [mesh]);
  return <primitive object={mesh} />;
}
