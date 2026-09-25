import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useMobile } from "../contexts/MobileContext";
import { TriangleSink, createRandom } from "../lib/lowPoly";

// Procedural low-poly palms — flat-shaded, vertex-colored. The whole group
// (HomeSection's layout: position, size, lean direction, bend and seed per
// palm) is merged into two draw calls (trunks + coconuts, fronds), built in
// useMemo whenever the layout changes; fixed seeds, so every load grows the
// same trees, and nothing is fetched. At scale 1 a palm is ≈2.7 units of
// slim trunk with a crown ≈1.8 wide (≈2 on desktop).

const TRUNK_HEIGHT = 2.7;
const BASE_RADIUS = 0.095;

const BARK_DARK = new THREE.Color("#9a6a43");
const BARK_LIGHT = new THREE.Color("#c4915f");
const BARK_LIT = new THREE.Color("#e6ad6e");
const CROWN_BASE = new THREE.Color("#6b4a30");
const LEAF_BASE = new THREE.Color("#3d7d3c");
const LEAF_TIP = new THREE.Color("#93c85a");
const SPINE = new THREE.Color("#6a9a3c");
const COCONUT = new THREE.Color("#5e3b25");
// Where the sunset lights the palms from (Home xz: behind them and to the
// right, toward the desktop sun). Baked into the vertex colors, so each
// palm gets it turned into its own frame (buildPalms).
const LIT_DIR = new THREE.Vector3(0.5, 0, -0.87).normalize();
const UP = new THREE.Vector3(0, 1, 0);

// Tapered, gently S-curved trunk from stacked rings with alternating bark
// bands; the sun-facing side (`lit`, tree-local) of each band is warmed
// toward orange. The top leans toward local -x; `bend` scales the lean and
// the S-curve (1 = the original single palm). Past 1 the foot's counter-
// curve fades out, so a strongly leaning trunk sweeps out in one curve and
// palms leaning apart from one clump fan out without crossing. Returns the
// crown center (trunk top).
const buildTrunk = (sink, random, rings, sides, baseRadius, taper, lit, bend) => {
  const H = TRUNK_HEIGHT;
  const counter = Math.max(0, Math.min(bend, 2 - bend));
  const p3 = new THREE.Vector3(-0.1 * H * bend, H, -0.03 * H * bend);
  const spine = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.04 * H * counter, 0.36 * H, 0.02 * H * counter),
    new THREE.Vector3(-0.14 * H * bend, 0.72 * H, -0.02 * H * bend),
    p3,
  );
  // The bottom two rings flare into a root collar
  const FLARE = [1.35, 1.12];

  const ringPoints = [];
  const ringDirs = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const center = spine.getPoint(t);
    const flare = FLARE[i] ?? 1;
    const radius = baseRadius * (1 - taper * t) * flare;
    const twist = i * 0.12 + (random() - 0.5) * 0.12;
    const points = [];
    const dirs = [];
    for (let s = 0; s < sides; s++) {
      const angle = twist + (s / sides) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      points.push(dir.clone().multiplyScalar(radius * (1 + (random() - 0.5) * 0.08)).add(center));
      dirs.push(dir);
    }
    ringPoints.push(points);
    ringDirs.push(dirs);
  }

  const shade = (band, dir) => band.clone().lerp(BARK_LIT, Math.max(0, dir.dot(lit)) * 0.6);
  for (let i = 0; i < rings; i++) {
    const band = (i % 2 === 0 ? BARK_DARK : BARK_LIGHT).clone().offsetHSL(0, 0, (random() - 0.5) * 0.06);
    for (let s = 0; s < sides; s++) {
      const s1 = (s + 1) % sides;
      const a = ringPoints[i][s];
      const b = ringPoints[i][s1];
      const c = ringPoints[i + 1][s1];
      const d = ringPoints[i + 1][s];
      const ca = shade(band, ringDirs[i][s]);
      const cb = shade(band, ringDirs[i][s1]);
      const cc = shade(band, ringDirs[i + 1][s1]);
      const cd = shade(band, ringDirs[i + 1][s]);
      // Outward winding (rings run clockwise seen from above)
      sink.tri(a, c, b, ca, cc, cb);
      sink.tri(a, d, c, ca, cd, cc);
    }
  }

  // Crown base: a dark bulb wider than the trunk top, where the fronds and
  // the coconuts emerge
  const crown = p3;
  const top = ringPoints[rings];
  const bulbRadius = baseRadius * 1.3;
  const bulb = ringDirs[rings].map((dir) => crown.clone().addScaledVector(dir, bulbRadius).addScaledVector(UP, 0.03 * H));
  const apex = crown.clone().addScaledVector(UP, 0.09 * H);
  for (let s = 0; s < sides; s++) {
    const s1 = (s + 1) % sides;
    sink.tri(top[s], bulb[s1], top[s1], CROWN_BASE, CROWN_BASE, CROWN_BASE);
    sink.tri(top[s], bulb[s], bulb[s1], CROWN_BASE, CROWN_BASE, CROWN_BASE);
    sink.tri(bulb[s], apex, bulb[s1], CROWN_BASE, CROWN_BASE, CROWN_BASE);
  }
  return crown;
};

// One frond: a cubic spine that rises steeply, arches over and hangs its tip
// (the horizontal reach is ~0.8 of the length), a thin ribbon along it, and
// two pairs of slim folded leaflets per segment, each narrower than its
// share of the segment so the gaps read as a pinnate leaf. Leaflet length
// follows a sin profile (short at the base, longest a third of the way out,
// tapering to the tip); leaflets hang further down toward the tip and are
// warmed on the sun side. Sway weight grows with distance along the spine
// so the crown holds still and the tips move.
const LEAFLETS_PER_SIDE = 2;
const LEAFLET_SHARE = 0.36;

const buildFrond = (sink, random, crown, spec, segments, lit) => {
  const { azimuth, length, rise, arch, drop, reach, hue, phase } = spec;
  const out = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
  const side = new THREE.Vector3().crossVectors(out, UP).normalize();
  const root = crown.clone().addScaledVector(out, 0.02 * TRUNK_HEIGHT).addScaledVector(UP, 0.02 * TRUNK_HEIGHT);
  const spine = new THREE.CubicBezierCurve3(
    root,
    root.clone().addScaledVector(out, length * 0.22).addScaledVector(UP, length * rise),
    root.clone().addScaledVector(out, length * (reach - 0.14)).addScaledVector(UP, length * arch),
    root.clone().addScaledVector(out, length * reach).addScaledVector(UP, length * drop),
  );
  const base = LEAF_BASE.clone().offsetHSL(hue, 0, 0);
  const tip = LEAF_TIP.clone().offsetHSL(hue, 0, 0);
  const leafColor = (t, warmth = 0) => base.clone().lerp(tip, THREE.MathUtils.smoothstep(t, 0, 1) * 0.8 + warmth * 0.3);
  const weight = (t) => t * t;

  const points = [];
  const tangents = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    points.push(spine.getPoint(t));
    tangents.push(spine.getTangent(t));
  }

  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const tm = (t0 + t1) / 2;
    const a = points[i];
    const b = points[i + 1];
    const tangent = tangents[i];
    const wa = weight(t0);
    const wb = weight(t1);

    const leafLength = length * 0.16 * Math.pow(Math.sin(Math.PI * Math.pow(tm, 0.6)), 0.5);
    for (const sign of [-1, 1]) {
      const warm = Math.max(0, sign * side.dot(lit));
      for (let k = 0; k < LEAFLETS_PER_SIDE; k++) {
        // Each leaflet folds and sweeps a little differently so the frond
        // reads as leaves, not a comb
        const fold = 0.5 + tm * 0.75 + (random() - 0.5) * 0.3;
        const jitter = 1 + (random() - 0.5) * 0.36;
        const dir = side
          .clone()
          .multiplyScalar(sign * Math.cos(fold) * leafLength)
          .addScaledVector(UP, -Math.sin(fold) * leafLength)
          .addScaledVector(tangent, -(0.2 + random() * 0.2) * leafLength);
        const u0 = k / LEAFLETS_PER_SIDE;
        const u1 = u0 + LEAFLET_SHARE;
        const s0 = a.clone().lerp(b, u0);
        const s1 = a.clone().lerp(b, u1);
        const o0 = s0.clone().addScaledVector(dir, jitter);
        const o1 = s1.clone().addScaledVector(dir, 0.45 * jitter);
        const c0 = leafColor(t0 + (t1 - t0) * u0);
        const c1 = leafColor(t0 + (t1 - t0) * u1);
        const cOut = leafColor(Math.min(1, tm + 0.25), warm);
        const w0 = wa + (wb - wa) * u0;
        const w1 = wa + (wb - wa) * u1;
        sink.tri(s0, s1, o1, c0, c1, cOut, [w0, w1, w1 + 0.15], phase);
        sink.tri(s0, o1, o0, c0, cOut, cOut, [w0, w1 + 0.15, w0 + 0.15], phase);
      }
    }

    // Spine ribbon, tapering to the tip
    const hw0 = 0.012 * TRUNK_HEIGHT * (1 - t0 * 0.85);
    const hw1 = 0.012 * TRUNK_HEIGHT * (1 - t1 * 0.85);
    const a0 = a.clone().addScaledVector(side, -hw0);
    const a1 = a.clone().addScaledVector(side, hw0);
    const b0 = b.clone().addScaledVector(side, -hw1);
    const b1 = b.clone().addScaledVector(side, hw1);
    sink.tri(a0, b0, b1, SPINE, SPINE, SPINE, [wa, wb, wb], phase);
    sink.tri(a0, b1, a1, SPINE, SPINE, SPINE, [wa, wb, wa], phase);
  }
};

// Three tiers make the crown round: long outer fronds that arch over and
// hang their tips below the crown, a mid ring lifted higher, and a few short
// young fronds standing up at the center.
const buildFronds = (sink, random, crown, count, segments, outerReach, lit) => {
  const H = TRUNK_HEIGHT;
  const specs = [];
  const ring = (n, offset, make) => {
    for (let k = 0; k < n; k++) {
      specs.push({
        azimuth: (k / n) * Math.PI * 2 + offset + (random() - 0.5) * 0.35,
        phase: random() * Math.PI * 2,
        ...make(),
      });
    }
  };
  ring(count, 0, () => ({
    length: H * (0.42 + (random() - 0.5) * 0.08),
    rise: 0.34,
    arch: 0.26 + random() * 0.08,
    drop: -0.3 - random() * 0.12,
    reach: outerReach,
    hue: (random() - 0.5) * 0.05,
  }));
  const mid = Math.max(3, count - 3);
  ring(mid, Math.PI / mid, () => ({
    length: H * (0.32 + random() * 0.04),
    rise: 0.44,
    arch: 0.44 + random() * 0.08,
    drop: 0.06 - random() * 0.1,
    reach: 0.76,
    hue: 0.02 + (random() - 0.5) * 0.03,
  }));
  ring(3, random() * Math.PI, () => ({
    length: H * (0.22 + random() * 0.04),
    rise: 0.5,
    arch: 0.6,
    drop: 0.38,
    reach: 0.55,
    hue: 0.04,
  }));
  for (const spec of specs) buildFrond(sink, random, crown, spec, segments, lit);
};

// Coconuts hang in a cluster under the crown base, a little to the sun side
// of the trunk so they show against the sky rather than the fronds.
const buildCoconuts = (sink, random, crown, count, lit) => {
  const ico = new THREE.IcosahedronGeometry(0.1, 1);
  const pos = ico.attributes.position;
  const start = Math.atan2(lit.z, lit.x) - 0.8;
  for (let k = 0; k < count; k++) {
    const angle = start + (k / count) * 1.9 + (random() - 0.5) * 0.3;
    const center = crown
      .clone()
      .add(new THREE.Vector3(Math.cos(angle) * 0.19, -0.12 - random() * 0.1, Math.sin(angle) * 0.19));
    const color = COCONUT.clone().offsetHSL(0, 0, (random() - 0.5) * 0.1);
    const scale = 0.9 + random() * 0.25;
    for (let i = 0; i < pos.count; i++) {
      sink.vertex(new THREE.Vector3().fromBufferAttribute(pos, i).multiplyScalar(scale).add(center), color);
    }
  }
  ico.dispose();
};

const SWAY_VERTEX = /* glsl */ `
  float swayT = uTime + aSway.y;
  transformed += aSway.x * vec3(sin(swayT * 1.3) * 0.05, sin(swayT * 0.8) * 0.03, cos(swayT * 1.1) * 0.05);
`;

// palms: [{ x, z, scale, yaw, bend, seed }] in Home coordinates (foot on
// the floor); yaw turns the palm about its foot, so yaw 0 leans it toward -x
// and yaw PI toward +x.
const buildPalms = (isMobile, palms) => {
  // MOBILE_PERF: fewer trunk rings and sides on mobile — revert by removing the ternaries
  const rings = isMobile ? 10 : 13;
  const sides = isMobile ? 6 : 7;
  // MOBILE_PERF: fewer fronds and leaflet segments on mobile — revert by removing the ternaries
  const fronds = isMobile ? 8 : 11;
  const segments = isMobile ? 9 : 12;

  const trunkSink = new TriangleSink(false);
  const frondSink = new TriangleSink(true);
  for (const { x, z, scale, yaw, bend, seed } of palms) {
    const random = createRandom(seed);
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromAxisAngle(UP, yaw),
      new THREE.Vector3(scale, scale, scale),
    );
    trunkSink.matrix = matrix;
    frondSink.matrix = matrix;
    // The sway offset is in Home units: a smaller palm sways less
    frondSink.swayScale = scale;
    const lit = LIT_DIR.clone().applyAxisAngle(UP, -yaw);
    // Desktop: a sturdier, less tapered trunk and a wider crown
    const crown = isMobile
      ? buildTrunk(trunkSink, random, rings, sides, BASE_RADIUS, 0.45, lit, bend)
      : buildTrunk(trunkSink, random, rings, sides, BASE_RADIUS * 1.12, 0.35, lit, bend);
    buildCoconuts(trunkSink, random, crown, 4, lit);
    buildFronds(frondSink, random, crown, fronds, segments, isMobile ? 0.8 : 0.9, lit);
  }
  return { trunk: trunkSink.build(), fronds: frondSink.build() };
};

// Kept across layout changes (a resize rebuilds only the geometry), so the
// programs compiled in the Home pre-warm stay in use
const buildMaterials = () => {
  const uniforms = { uTime: { value: 0 } };
  const trunkMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.9,
  });
  const frondMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.75,
    side: THREE.DoubleSide,
  });
  // Gentle sway in the vertex shader: weight and phase come from the aSway
  // attribute, time from one uniform. Flat shading takes its normals from the
  // displaced positions, so the bend lights correctly. Compiled during the
  // Home pre-warm like any other program.
  frondMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aSway;\nuniform float uTime;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>${SWAY_VERTEX}`);
  };
  frondMaterial.customProgramCacheKey = () => "palm-fronds-sway";

  return { trunkMaterial, frondMaterial, uniforms };
};

export function PalmTree({ palms, ...props }) {
  const { isMobile, prefersReducedMotion } = useMobile();
  const materials = useMemo(buildMaterials, []);
  const geometry = useMemo(() => buildPalms(isMobile, palms), [isMobile, palms]);

  useEffect(() => {
    return () => {
      materials.trunkMaterial.dispose();
      materials.frondMaterial.dispose();
    };
  }, [materials]);
  useEffect(() => {
    return () => {
      geometry.trunk.dispose();
      geometry.fronds.dispose();
    };
  }, [geometry]);

  // Reduced motion: the time uniform stays put, so the fronds hold still.
  useFrame((state) => {
    if (!prefersReducedMotion) materials.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <group {...props}>
      <mesh geometry={geometry.trunk} material={materials.trunkMaterial} />
      <mesh geometry={geometry.fronds} material={materials.frondMaterial} />
    </group>
  );
}
