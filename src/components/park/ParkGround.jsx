import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { CAMERA_HEIGHT } from "../../lib/camera";
import { HOUSES, cafeWindow, houseSpans, pathCurve, restEyeZ } from "../../lib/parkLayout";
import { LANTERN_WARMTH, PARK_LAYER, parkGroundMaterial } from "../../lib/parkMaterials";

// The park's ground: one mesh of RGBA vertex colours, drawn first among the
// transparent things (renderOrder −1) so the props' contact shadows still
// land on it. A lawn that follows the view — a trapezoid from the house row
// to below the screen, its rows evenly spaced on screen, its sides past the
// screen's edges where they fade out — and, drawn over it in index order,
// the gravel path, the sidewalk with its curb, the café terrace and the
// flower beds' soil. Every vertex takes the lamps' warm pools; the colours
// are night colours already (unlit, no light). Static: built per layout and
// aspect.

// sRGB 0..1 triples (the maths is in sRGB, like nightShade; converted to the
// linear working space per vertex)
const srgb = (hex) => {
  const c = new THREE.Color(hex);
  const out = { r: 0, g: 0, b: 0 };
  c.getRGB(out, THREE.SRGBColorSpace);
  return [out.r, out.g, out.b];
};
const LAWN_DARK = srgb("#24392f");
const LAWN_LIGHT = srgb("#30493b");
const TREE_SHADE = srgb("#1c2e26");
const LAWN_POOL = srgb("#5c6a3e");
const PATH = srgb("#5f5649");
const PATH_EDGE = srgb("#4a4339");
const PATH_POOL = srgb("#c49a62");
const SIDEWALK = srgb("#3e3c4b");
const CURB = srgb("#5a5770");
const TERRACE = srgb("#6e5747");
const CAFE_POOL = srgb("#8a6a4c");
const SOIL = srgb("#2b2420");
const WARM = srgb(LANTERN_WARMTH.color);

const NOISE_SCALE = 1.3;
const STRIPE = { width: 0.6, angle: Math.PI / 6, amount: 0.03 };
const POOL_MIX = 0.75;
const TREE_SHADE_MIX = 0.85;
// The lawn runs this far past each screen edge, fading out over it
const FADE = 1.5;
const PATH_SEGMENTS = 60;
const PATH_EDGE_SHARE = 0.06;
const PAVEMENT = { depth: 1.4, curb: 0.08, past: 2, cell: 0.25 };
const CAFE_GLOW_R = 1.4;
const BED_GROW = 1.08;
// Over the lawn in draw order; no depth writes, so no fighting
const Y = { path: 0.002, sidewalk: 0.003, curb: 0.004, terrace: 0.005, soil: 0.006 };

const mix = (a, b, w) => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
const smoothstep = (e0, e1, x) => THREE.MathUtils.smoothstep(x, e0, e1);

// Value noise, 0..1 (an integer hash at the lattice, smoothly blended)
const hash = (x, z) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const noise = (x, z) => {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz) + (hash(ix + 1, iz) - hash(ix, iz)) * sx;
  const b = hash(ix, iz + 1) + (hash(ix + 1, iz + 1) - hash(ix, iz + 1)) * sx;
  return a + (b - a) * sz;
};

// The lamps' pools: a smooth falloff from each post to its reach R (bright
// over the inner half, so a pool reads on the night lawn), summed over the
// posts, at most 1
const poolAt = (park, x, z) => {
  let w = 0;
  for (const [lx, lz] of park.lamps) {
    const d = Math.hypot(x - lx, z - lz);
    if (d < park.lampR) w += 1 - smoothstep(0, park.lampR, d);
  }
  return Math.min(w, 1);
};
// Paving takes a lamp's warmth as the faces do (nightShade)
const warmed = (c, w) => c.map((v, i) => Math.min(v + WARM[i] * LANTERN_WARMTH.amount * w, 1));

// spacing: the grid's cell size here; stripes finer than the grid would
// alias, so they fade out where the rows spread (far back)
const lawnAt = (park, x, z, spacing) => {
  let c = mix(LAWN_DARK, LAWN_LIGHT, noise(x / NOISE_SCALE, z / NOISE_SCALE));
  const u = x * Math.cos(STRIPE.angle) + z * Math.sin(STRIPE.angle);
  const stripe = THREE.MathUtils.clamp(3 * Math.sin((Math.PI * u) / STRIPE.width), -1, 1);
  const clear = THREE.MathUtils.clamp((1.2 * STRIPE.width - spacing) / (0.6 * STRIPE.width), 0, 1);
  c = c.map((v) => v * (1 + STRIPE.amount * stripe * clear));
  for (const [tx, tz, size] of park.trees) {
    const r = 0.9 * size;
    const w = 1 - smoothstep(0.6 * r, r, Math.hypot(x - tx - 0.25, z - tz));
    if (w > 0) c = mix(c, TREE_SHADE, TREE_SHADE_MIX * w);
  }
  return mix(c, LAWN_POOL, POOL_MIX * poolAt(park, x, z));
};

// Positions, RGBA colours (linear) and indices
class GroundBuilder {
  constructor() {
    this.position = [];
    this.color = [];
    this.index = [];
    this.linear = new THREE.Color();
  }

  // c: an sRGB triple; returns the vertex's index
  vertex(x, y, z, c, alpha = 1) {
    this.linear.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
    this.position.push(x, y, z);
    this.color.push(this.linear.r, this.linear.g, this.linear.b, alpha);
    return this.position.length / 3 - 1;
  }

  // Whether a, b, c in that order face up (the material is front-sided)
  facesUp(a, b, c) {
    const p = this.position;
    const ux = p[b * 3] - p[a * 3];
    const uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3];
    const vz = p[c * 3 + 2] - p[a * 3 + 2];
    return uz * vx - ux * vz >= 0;
  }

  // Facing up whichever way round the corners come
  quad(a, b, c, d) {
    if (this.facesUp(a, b, c)) this.index.push(a, b, c, a, c, d);
    else this.index.push(a, c, b, a, d, c);
  }

  tri(a, b, c) {
    if (this.facesUp(a, b, c)) this.index.push(a, b, c);
    else this.index.push(a, c, b);
  }

  // A grid of quads over (u, v) in 0..1: at(u, v) gives [x, y, z, colour]
  sheet(cols, rows, at) {
    const first = this.position.length / 3;
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) this.vertex(...at(i / cols, j / rows));
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = first + j * (cols + 1) + i;
        this.quad(a, a + 1, a + cols + 2, a + cols + 1);
      }
    }
  }

  build(origin) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.position, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.color, 4));
    geometry.setIndex(this.index);
    geometry.translate(-origin[0], -origin[1], -origin[2]);
    geometry.computeBoundingSphere();
    return geometry;
  }
}

// An ellipse [x, z, rx, rz] as a fan round its centre and rings of quads
const ellipse = (builder, [cx, cz, rx, rz], y, colourAt, segments = 16, rings = 2) => {
  const centre = builder.vertex(cx, y, cz, colourAt(cx, cz));
  const ring = [];
  for (let k = 1; k <= rings; k++) {
    ring.push(
      Array.from({ length: segments }, (_, i) => {
        const a = (i / segments) * 2 * Math.PI;
        const x = cx + (k / rings) * rx * Math.cos(a);
        const z = cz + (k / rings) * rz * Math.sin(a);
        return builder.vertex(x, y, z, colourAt(x, z));
      }),
    );
  }
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    builder.tri(centre, ring[0][i], ring[0][j]);
    for (let k = 1; k < rings; k++) builder.quad(ring[k - 1][i], ring[k][i], ring[k][j], ring[k - 1][j]);
  }
};

const buildGround = (park, layout, aspect, camera) => {
  const builder = new GroundBuilder();
  const { row } = park;
  const back = row.z;
  const front = park.groundFront;

  // The lawn: rows evenly spaced on screen (uniform in 1 / view depth),
  // each as wide as the view at its depth plus the fade, and on phones more
  // on the left, where the section slides in from
  const forward = camera.getWorldDirection(new THREE.Vector3());
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const ez = restEyeZ(layout);
  const depthOf = (z) => -CAMERA_HEIGHT * forward.y + (z - ez) * forward.z;
  const zOf = (depth) => ez + (depth + CAMERA_HEIGHT * forward.y) / forward.z;
  const halfWidth = (z) => depthOf(z) * tan * aspect;
  const nearInv = 1 / depthOf(front);
  const farInv = 1 / depthOf(back);
  const zAt = (v) => zOf(1 / (farInv + (nearInv - farInv) * v));
  // MOBILE_PERF: coarser ground grid on phones (park.groundGrid 36 × 28
  // instead of 64 × 48) — revert by giving the phone layouts [64, 48] in
  // lib/parkLayout
  const [cols, rows] = park.groundGrid;
  builder.sheet(cols, rows, (u, v) => {
    const z = zAt(v);
    const right = halfWidth(z) + FADE;
    const left = -right - park.groundLeftExtra;
    const x = left + (right - left) * u;
    const spacing = Math.max(Math.abs(zAt(Math.min(v + 0.5 / rows, 1)) - zAt(Math.max(v - 0.5 / rows, 0))), (right - left) / cols);
    const alpha = smoothstep(0, FADE, Math.min(x - left, right - x));
    return [x, 0, z, lawnAt(park, x, z, spacing), alpha];
  });

  // The gravel path: a darker edge either side, lit gravel in the pools
  const curve = pathCurve(park);
  const rails = [-0.5, -0.5 + PATH_EDGE_SHARE, -0.5 + PATH_EDGE_SHARE, 0.5 - PATH_EDGE_SHARE, 0.5 - PATH_EDGE_SHARE, 0.5];
  const railColour = [PATH_EDGE, PATH_EDGE, PATH, PATH, PATH_EDGE, PATH_EDGE];
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  let previous = null;
  for (let i = 0; i <= PATH_SEGMENTS; i++) {
    curve.getPointAt(i / PATH_SEGMENTS, point);
    curve.getTangentAt(i / PATH_SEGMENTS, tangent);
    const side = new THREE.Vector2(-tangent.z, tangent.x).normalize();
    const section = rails.map((r, k) => {
      const x = point.x + side.x * r * park.pathW;
      const z = point.z + side.y * r * park.pathW;
      return builder.vertex(x, Y.path, z, mix(railColour[k], PATH_POOL, POOL_MIX * poolAt(park, x, z)));
    });
    if (previous) {
      for (const k of [0, 2, 4]) builder.quad(previous[k], section[k], section[k + 1], previous[k + 1]);
    }
    previous = section;
  }

  // The sidewalk and its curb along the row, the café terrace on it, in the
  // café's glow
  const spans = houseSpans(park);
  const cafe = spans[spans.length - 1];
  const [wx, , wz] = cafeWindow(park);
  const cafeGlow = (x, z) => Math.max(0, 1 - Math.hypot(x - wx, z - wz) / CAFE_GLOW_R) ** 2;
  const paving = (base) => (x, z) => warmed(mix(base, CAFE_POOL, cafeGlow(x, z)), poolAt(park, x, z));
  const x0 = spans[0].x0 - PAVEMENT.past;
  const x1 = cafe.x1 + PAVEMENT.past;
  const across = Math.ceil((x1 - x0) / PAVEMENT.cell);
  const strip = (from, to, z0, z1, y, colourAt, n, m) =>
    builder.sheet(n, m, (u, v) => {
      const x = from + (to - from) * u;
      const z = z0 + (z1 - z0) * v;
      return [x, y, z, colourAt(x, z)];
    });
  const curbZ = back + PAVEMENT.depth - PAVEMENT.curb;
  strip(x0, x1, back, curbZ, Y.sidewalk, paving(SIDEWALK), across, 4);
  strip(x0, x1, curbZ, back + PAVEMENT.depth, Y.curb, (x, z) => warmed(CURB, poolAt(park, x, z)), across, 1);
  const cafeW = HOUSES[HOUSES.length - 1].W * row.scale;
  strip(cafe.x0 + 0.05 * cafeW, cafe.x1 + 0.1, back + 0.05, back + 1.35, Y.terrace, paving(TERRACE), 10, 4);

  // The flower beds' soil, a little wider than the beds
  for (const [x, z, rx, rz] of park.beds) {
    ellipse(builder, [x, z, rx * BED_GROW, rz * BED_GROW], Y.soil, (px, pz) => warmed(SOIL, poolAt(park, px, pz)));
  }

  // Origin at the back edge, the house row's plane: the dissolve fades the
  // nearest origins first, and the ground goes last, with the row, so
  // nothing standing on it is left in the haze
  const origin = [0, 0, back];
  return { geometry: builder.build(origin), origin };
};

export default function ParkGround({ park, layout, aspect }) {
  const camera = useThree((state) => state.camera);
  const { geometry, origin } = useMemo(() => buildGround(park, layout, aspect, camera), [park, layout, aspect, camera]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const mesh = useMemo(() => {
    const ground = new THREE.Mesh(undefined, parkGroundMaterial);
    ground.layers.set(PARK_LAYER);
    // Before the contact shadows (0), which then draw over it
    ground.renderOrder = -1;
    return ground;
  }, []);
  return <primitive object={mesh} geometry={geometry} position={origin} />;
}
