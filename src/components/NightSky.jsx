import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useMobile } from "../contexts/MobileContext";
import { moonAt, timeOfDay } from "../lib/timeOfDay";

// The night sky's render layer (1–8 and 12 Home, 9 here, 10 office, 11 park)
const LAYER = 9;
// The evening star, the first to show (blue hour): clear of the office
// walls, the old town's roofs, the menu and the moon, per layout
const EVENING_STAR = { desktop: [0.8, 0.165], tall: [0.7, 0.16], portrait: [0.55, 0.19], landscape: [0.74, 0.22] };
// MOBILE_PERF: fewer stars on mobile — revert by removing the ternary
const starCount = (isMobile) => (isMobile ? 140 : 260);
const HORIZON = 0.37;
// The moon's halo reaches HALO disc radii
const HALO = 5;
const moonRadius = (size) => Math.min(28, Math.max(18, 0.026 * Math.min(size.width, size.height)));

// Seeded, so every visit (and every screenshot) has the same sky
const rng = (seed) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

// Stars as screen fractions: the evening star first, then the rest, denser
// toward the top, none within `clear` (screen heights) of the moon
const buildStars = (count, eveningStar, moon, aspect, clear) => {
  const random = rng(24);
  const star = [];
  const tint = [];
  star.push(...eveningStar, 3.4, 0);
  tint.push(1, 0.96, 0.86);
  while (star.length / 4 < count) {
    const x = 0.01 + random() * 0.98;
    const y = 0.015 + (HORIZON - 0.06) * Math.pow(random(), 1.35);
    if (Math.hypot((x - moon[0]) * aspect, y - moon[1]) < clear) continue;
    const bright = random() < 0.1;
    const size = bright ? 2.2 + random() * 0.9 : 1 + random() * 1.1;
    // Its turn to appear: bright ones first
    const threshold = bright ? random() * 0.3 : 0.2 + random() * 0.7;
    star.push(x, y, size, threshold + Math.floor(random() * 1000));
    const warm = random();
    tint.push(...(warm < 0.2 ? [0.82, 0.88, 1] : warm < 0.35 ? [1, 0.88, 0.7] : [1, 0.97, 0.92]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(new Array(count * 3).fill(0), 3));
  g.setAttribute("aStar", new THREE.Float32BufferAttribute(star, 4));
  g.setAttribute("aTint", new THREE.Float32BufferAttribute(tint, 3));
  return g;
};

// aStar: x, y (screen fractions), size (CSS px), threshold + 1000 × seed
const STAR_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uPx;
  attribute vec4 aStar;
  attribute vec3 aTint;
  varying float vA;
  varying vec3 vTint;
  void main() {
    float threshold = fract(aStar.w);
    float seed = floor(aStar.w) / 1000.0;
    float twinkle = 0.78 + 0.22 * sin(uTime * (0.7 + seed * 1.8) + seed * 40.0);
    vA = clamp((uOpacity - threshold) / 0.3, 0.0, 1.0) * twinkle;
    vTint = aTint;
    gl_PointSize = aStar.z * uPx;
    gl_Position = vec4(aStar.x * 2.0 - 1.0, 1.0 - aStar.y * 2.0, 0.99999, 1.0);
  }
`;
const STAR_FRAGMENT = /* glsl */ `
  varying float vA;
  varying vec3 vTint;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = vA * (1.0 - smoothstep(0.25, 1.0, d));
    gl_FragColor = vec4(vTint * a, a);
  }
`;

const MOON_VERTEX = /* glsl */ `
  uniform vec2 uAt;
  uniform vec2 uSize;
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = vec4(uAt.x * 2.0 - 1.0 + position.x * uSize.x, 1.0 - uAt.y * 2.0 + position.y * uSize.y, 0.99998, 1.0);
  }
`;
// A waxing crescent, its lit side turned down and right, toward the sun
// below the horizon; faint earthshine on the rest of the disc; a cool halo.
// vP spans the halo (HALO moon radii); p is in moon radii.
const MOON_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  uniform float uEdge;
  varying vec2 vP;
  vec4 over(vec4 below, vec3 color, float alpha) {
    return vec4(color * alpha, alpha) + below * (1.0 - alpha);
  }
  void main() {
    vec2 p = vP * ${HALO.toFixed(1)};
    float r = length(p);
    float disc = 1.0 - smoothstep(1.0 - uEdge, 1.0 + uEdge, r);
    float lit = disc * smoothstep(1.0 - uEdge, 1.0 + uEdge, length(p - vec2(-0.42, 0.36)));
    float halo = 0.32 * exp(-r * r / 3.2) * (1.0 - smoothstep(${(HALO * 0.6).toFixed(1)}, ${HALO.toFixed(1)}, r));
    vec4 c = over(vec4(0.0), vec3(0.78, 0.83, 1.0), halo);
    c = over(c, vec3(0.42, 0.47, 0.66), disc * 0.55);
    c = over(c, vec3(1.0, 0.95, 0.82), lit);
    gl_FragColor = c * uOpacity;
  }
`;

// Drawn in clip space behind everything (every 3D object occludes it),
// premultiplied, no fog, no tone mapping
const material = (vertexShader, fragmentShader, uniforms) =>
  new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });

// Stars and a waxing crescent, faded in by timeOfDay.stars / .moon (they
// start past Skills, s > 1). layout and aspect (rounded) come from TimeOfDay.
export function NightSky({ layout, aspect }) {
  const { isMobile, prefersReducedMotion } = useMobile();
  const get = useThree((state) => state.get);
  const size = useThree((state) => state.size);
  const dpr = useThree((state) => state.viewport.dpr);
  const camera = useThree((state) => state.camera);
  const moonCentre = useMemo(() => moonAt(layout, aspect), [layout, aspect]);
  const r = moonRadius(size);
  // Stars keep this far from the moon (screen heights), rounded so a resize
  // rebuilds them only on a real change
  const clear = Math.round(Math.max(0.09, (2 * r) / size.height + 0.02) * 100) / 100;
  const sky = useMemo(() => {
    const points = new THREE.Points(new THREE.BufferGeometry(), material(STAR_VERTEX, STAR_FRAGMENT, { uTime: { value: 0 }, uOpacity: { value: 0 }, uPx: { value: 1 } }));
    const moon = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material(MOON_VERTEX, MOON_FRAGMENT, { uOpacity: { value: 0 }, uAt: { value: new THREE.Vector2() }, uSize: { value: new THREE.Vector2() }, uEdge: { value: 0.05 } }));
    for (const o of [points, moon]) {
      o.layers.set(LAYER);
      o.frustumCulled = false;
      o.renderOrder = -1;
    }
    return { points, moon };
  }, []);
  const geometry = useMemo(
    () => buildStars(starCount(isMobile), EVENING_STAR[layout], moonCentre, aspect, clear),
    [isMobile, layout, moonCentre, aspect, clear],
  );
  const warm = useRef(0);
  const group = useRef();

  useLayoutEffect(() => {
    sky.points.geometry = geometry;
    sky.points.material.uniforms.uPx.value = dpr;
    const u = sky.moon.material.uniforms;
    u.uAt.value.set(...moonCentre);
    const reach = (r * HALO) / size.height;
    u.uSize.value.set((reach * 2) / aspect, reach * 2);
    u.uEdge.value = 1.5 / r;
  }, [sky, geometry, dpr, moonCentre, r, size.height, aspect]);
  // Freed only when replaced or unmounted, not on every resize
  useEffect(() => () => geometry.dispose(), [geometry]);

  // Dispose the materials and the moon quad on unmount
  useEffect(
    () => () => {
      sky.points.material.dispose();
      sky.moon.material.dispose();
      sky.moon.geometry.dispose();
    },
    [sky],
  );

  useEffect(() => {
    let live = true;
    const { gl, scene } = get();
    camera.layers.enable(LAYER);
    gl.compileAsync(group.current, camera, scene)
      .catch(() => {})
      .then(() => {
        if (live) warm.current = 1;
      });
    return () => {
      live = false;
      camera.layers.disable(LAYER);
    };
  }, [sky, camera, get]);

  useFrame((state, delta) => {
    const { points, moon } = sky;
    // Hidden until compiled; then two frames drawn at zero opacity (GPU
    // pipeline state) before they may show
    if (warm.current === 0) {
      points.visible = moon.visible = false;
      return;
    }
    if (warm.current < 3) {
      warm.current++;
      points.visible = moon.visible = true;
      points.material.uniforms.uOpacity.value = 0;
      moon.material.uniforms.uOpacity.value = 0;
      return;
    }
    points.material.uniforms.uOpacity.value = timeOfDay.stars;
    moon.material.uniforms.uOpacity.value = timeOfDay.moon;
    points.visible = timeOfDay.stars > 0;
    moon.visible = timeOfDay.moon > 0;
    if (!prefersReducedMotion && points.visible) points.material.uniforms.uTime.value += Math.min(delta, 0.1);
  });

  return (
    <group ref={group}>
      <primitive object={sky.points} />
      <primitive object={sky.moon} />
    </group>
  );
}
