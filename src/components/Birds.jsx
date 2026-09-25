import { useScroll } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useMobile } from "../contexts/MobileContext";

// A few gulls over the sea on Home, drawn like the birds in the owner's logo:
// flat brushstroke silhouettes, a deep V at the body between an arched wing
// and a longer one sweeping up, in a deep warm plum that sits in the sunset
// (the far ones hazed toward the sky). Each circles slowly over the water, in
// a wide loop in depth: it grows as it comes nearer and shrinks as it heads
// out toward the horizon, banks into the turn, and turns its silhouette to
// face the way it flies. On desktop the loops pass in front of the sun's
// glow; on mobile the sun is low over the land, so they keep to the water on
// the right, near the horizon. Now and then one gives a few gentle wing
// beats; the rest of the time they glide, bobbing a little.
//
// One draw call: every bird is a strip of triangles in one geometry, with
// its loop in per-vertex attributes, and the vertex shader places, flaps and
// banks them from one uTime uniform. They live in view space, like the sun
// (Experience), placed by screen fractions: sky things far away do not slide
// or fall with the world, so when the visitor leaves Home (the section group
// drops away, the world slides) they stay level and fade out with the scroll
// offset, as the sea does. Depth-tested, so anything nearer (the palms, the
// title) passes in front of them.
//
// A lazy chunk mounted after the first visible frame (HomeSection): it
// compiles its shader off the main thread, then fades in. On its own layer,
// like BeachDecor, so the contact-shadow pass does not draw it.

const LAYER = 5;
const FADE_SECONDS = 1.2;
// Leaving Home: over this span of the scroll toward Skills (in sections) the
// birds fade out, with the sea (Sea's LEAVE_START/LEAVE_END)
const LEAVE_START = 0.06;
const LEAVE_END = 0.48;

// Per bird, a loop: x, y, its center (screen fractions from the left and the
// top; lib/coast keeps the water right of ≈ 0.68 at the horizon on desktop,
// ≈ 0.71 on mobile, and the desktop sun sits at 0.855, 0.278); rx, its
// half-width (screen widths); ry, how much lower it flies on the far side
// (screen heights); depth, the view-space distance at its center, which
// swings by ±dz of itself around the loop; period, seconds per turn; dir, the
// way round; at, where on the loop it is when the flock appears (radians; 0 =
// the loop's right end, -PI / 2 the near side), the placement reduced motion
// keeps; size, wingspan at the loop's center as a fraction of the screen's
// shorter side; haze, mix toward the sky.
// Desktop: loops across the sun, the nearest just above its heart on the
// near side and over it on the far side, clear of the title below and the
// menu above. Mobile: two small loops over the water, off the right edge and
// back.
const FLOCK = {
  desktop: [
    { x: 0.87, y: 0.255, rx: 0.08, ry: 0.02, depth: 12, dz: 0.3, period: 48, dir: 1, at: -1.76, size: 0.04, haze: 0.05 },
    { x: 0.84, y: 0.2, rx: 0.1, ry: 0.015, depth: 17, dz: 0.25, period: 64, dir: -1, at: 0.6, size: 0.028, haze: 0.2 },
    { x: 0.9, y: 0.165, rx: 0.06, ry: 0.01, depth: 26, dz: 0.2, period: 80, dir: 1, at: 2.5, size: 0.019, haze: 0.4 },
  ],
  mobile: [
    { x: 0.89, y: 0.33, rx: 0.09, ry: 0.012, depth: 12, dz: 0.3, period: 40, dir: 1, at: -2.2, size: 0.055, haze: 0.08 },
    { x: 0.87, y: 0.285, rx: 0.07, ry: 0.01, depth: 18, dz: 0.25, period: 56, dir: -1, at: 0.9, size: 0.036, haze: 0.3 },
  ],
};

// The logo's gull, in wingspans with the body at the origin, facing right:
// each wing a cubic Bezier from the body to the tip, the near one arching and
// drooping to its tip, the far one longer, sweeping up and out. The stroke is
// thickest at the body and tapers to fine tips.
const WINGS = [
  [
    [0, 0],
    [-0.08, 0.2],
    [-0.38, 0.24],
    [-0.5, 0.025],
  ],
  [
    [0, 0],
    [0.06, 0.14],
    [0.2, 0.2],
    [0.5, 0.25],
  ],
];
const SEGMENTS = 8;
const halfWidth = (t) => 0.028 * Math.pow(1 - t * t, 0.8) + 0.002;
// How far the joint's miter may reach: the V comes to a point below the body
const MAX_MITER = 2.5;

// Picked as sRGB, but THREE.Color (glsl) turns them linear and the shader
// writes that straight to the canvas, so the gulls render much darker than
// written, the approved look: the near desktop gull ≈ #18070b (the sun and
// the sea write their sRGB as is)
const INK = "#4a2433";
const HAZE = "#c7868a";

const glsl = (hex) => {
  const c = new THREE.Color(hex);
  return `vec3(${[c.r, c.g, c.b].map((v) => v.toFixed(3)).join(", ")})`;
};

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uMotion;
  uniform float uTanV;
  uniform float uAspect;
  uniform float uMinSide;
  uniform float uPx;
  // x, y: loop center (screen fractions), z: half-width, w: far-side drop
  attribute vec4 aLoop;
  // x: depth, y: depth swing, z: signed turns per second, w: start angle
  attribute vec4 aFlight;
  // x: size, y: haze
  attribute vec2 aLook;
  // The same point on the gull facing left, and both edges' offsets from
  // the stroke's center line (wingspans)
  attribute vec2 aMirror;
  attribute vec2 aEdge;
  attribute vec2 aMirrorEdge;
  // Distance from the body along the wing, 0..1
  attribute float aSpan;
  varying float vHaze;

  void main() {
    float t = uTime;
    float seed = aFlight.w * 7.0 + aFlight.x;
    float a = aFlight.w + 6.2832 * aFlight.z * t;
    float c = cos(a);
    float s = sin(a);
    float fx = aLoop.x + aLoop.z * c;
    float fy = aLoop.y + aLoop.w * s + 0.004 * sin(t * 0.7 + seed) * uMotion;
    float D = aFlight.x * (1.0 + aFlight.y * s);

    // World units per screen height at the loop's center, and the wingspan
    // (a fixed size in the world, so it grows and shrinks with the depth)
    float screen = 2.0 * uTanV * aFlight.x;
    float span = aLook.x * uMinSide * screen;

    // Facing the way it flies across the screen, turning through a
    // symmetric, head-on shape at the loop's ends
    float facing = smoothstep(-0.4, 0.4, -sign(aFlight.z) * s);
    vec2 p = mix(aMirror, position.xy, facing);
    vec2 edge = mix(aMirrorEdge, aEdge, facing);

    // Wing beats in short bursts, a different moment for each bird; the rest
    // of the time a glide with the wings breathing a little
    float gate = smoothstep(0.8, 0.97, sin(t * 0.21 + seed));
    float flap = uMotion * (gate * sin(t * 9.0 + seed) + 0.05 * sin(t * 1.3 + seed));
    p.y += 0.2 * flap * pow(aSpan, 1.4);
    p.x *= 1.0 - 0.1 * abs(flap) * aSpan;
    // The stroke never thinner than ~half a CSS pixel a side, so the far
    // birds' wing tips hold instead of flickering
    float px = uPx * 2.0 * uTanV * D / span;
    p += edge * max(1.0, 0.55 * px / length(edge));
    // Banked into the turn, most at the loop's ends, with a slight sway
    float roll = uMotion * 0.03 * sin(t * 0.83 + seed) + 0.14 * c;
    p = mat2(cos(roll), sin(roll), -sin(roll), cos(roll)) * p;

    vec3 view = vec3((fx * 2.0 - 1.0) * uTanV * uAspect * D, (1.0 - fy * 2.0) * uTanV * D, -D);
    view.xy += p * span;
    vHaze = aLook.y;
    gl_Position = projectionMatrix * vec4(view, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying float vHaze;
  void main() {
    gl_FragColor = vec4(mix(${glsl(INK)}, ${glsl(HAZE)}, vHaze), uOpacity);
  }
`;

const bezier = ([a, b, c, d], t) => {
  const u = 1 - t;
  return [0, 1].map((i) => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i]);
};

// The stroke's center line, from the left wing's tip through the body to the
// right wing's tip, with each point's edge offset and distance from the body
const buildStroke = ([left, right]) => {
  const points = [];
  for (let i = SEGMENTS; i >= 1; i--) points.push({ p: bezier(left, i / SEGMENTS), t: i / SEGMENTS });
  for (let i = 0; i <= SEGMENTS; i++) points.push({ p: bezier(right, i / SEGMENTS), t: i / SEGMENTS });
  return points.map(({ p, t }, k) => {
    // Normal: the mean of the adjoining segments' normals, with a miter
    const normals = [points[k - 1]?.p, points[k + 1]?.p]
      .map((other, side) => {
        if (!other) return null;
        const [dx, dy] = side === 0 ? [p[0] - other[0], p[1] - other[1]] : [other[0] - p[0], other[1] - p[1]];
        const length = Math.hypot(dx, dy);
        return [-dy / length, dx / length];
      })
      .filter(Boolean);
    const sum = normals.reduce((acc, n) => [acc[0] + n[0], acc[1] + n[1]], [0, 0]);
    const length = Math.hypot(...sum);
    const [nx, ny] = [sum[0] / length, sum[1] / length];
    const h = halfWidth(t) * Math.min(MAX_MITER, 1 / (nx * normals[0][0] + ny * normals[0][1]));
    return { x: p[0], y: p[1], ex: nx * h, ey: ny * h, span: t };
  });
};

const mirror = (curve) => curve.map(([x, y]) => [-x, y]);
// Facing right (the logo) and left: the left-facing gull's left wing is the
// mirrored long one, so the two strokes pair point for point, body to body
const STROKE = buildStroke(WINGS);
const STROKE_LEFT = buildStroke([mirror(WINGS[1]), mirror(WINGS[0])]);

const buildGeometry = (flock) => {
  const attributes = { position: [], aMirror: [], aEdge: [], aMirrorEdge: [], aSpan: [], aLoop: [], aFlight: [], aLook: [] };
  const index = [];
  for (const bird of flock) {
    const base = attributes.position.length / 3;
    STROKE.forEach((point, k) => {
      const other = STROKE_LEFT[k];
      // Two edges per point, either side of the center line
      for (const side of [1, -1]) {
        attributes.position.push(point.x, point.y, 0);
        attributes.aMirror.push(other.x, other.y);
        attributes.aEdge.push(side * point.ex, side * point.ey);
        attributes.aMirrorEdge.push(side * other.ex, side * other.ey);
        attributes.aSpan.push(point.span);
        attributes.aLoop.push(bird.x, bird.y, bird.rx, bird.ry);
        attributes.aFlight.push(bird.depth, bird.dz, bird.dir / bird.period, bird.at);
        attributes.aLook.push(bird.size, bird.haze);
      }
    });
    for (let k = 0; k < STROKE.length - 1; k++) {
      const a = base + k * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const sizes = { position: 3, aMirror: 2, aEdge: 2, aMirrorEdge: 2, aSpan: 1, aLoop: 4, aFlight: 4, aLook: 2 };
  const geometry = new THREE.BufferGeometry();
  for (const [name, values] of Object.entries(attributes)) {
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, sizes[name]));
  }
  geometry.setIndex(index);
  return geometry;
};

const createBirds = () => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMotion: { value: 1 },
      uOpacity: { value: 0 },
      uTanV: { value: 1 },
      uAspect: { value: 1 },
      uMinSide: { value: 1 },
      uPx: { value: 0.001 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    side: THREE.DoubleSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.layers.set(LAYER);
  // Placed in view space by the shader: no bounding volume applies
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
};

export default function Birds() {
  const { isMobile, prefersReducedMotion } = useMobile();
  const get = useThree((state) => state.get);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const mesh = useMemo(createBirds, []);
  const geometry = useMemo(() => buildGeometry(FLOCK[isMobile ? "mobile" : "desktop"]), [isMobile]);
  const scroll = useScroll();
  const ready = useRef(false);
  const fade = useRef(0);
  // Flight time, from when the flock appears, so it first shows as placed
  const time = useRef(0);

  useLayoutEffect(() => {
    mesh.geometry = geometry;
    const { uniforms } = mesh.material;
    const aspect = size.width / size.height;
    uniforms.uTanV.value = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    uniforms.uAspect.value = aspect;
    uniforms.uMinSide.value = Math.min(1, aspect);
    uniforms.uPx.value = 1 / size.height;
    uniforms.uMotion.value = prefersReducedMotion ? 0 : 1;
    return () => geometry.dispose();
  }, [mesh, geometry, camera, size, prefersReducedMotion]);

  useEffect(() => {
    // A hot update (Fast Refresh) builds a new mesh, hidden at opacity 0,
    // but keeps these refs: start over, so it waits for its compile and
    // fades in again instead of showing at once
    ready.current = false;
    fade.current = 0;
    let live = true;
    const { gl, scene } = get();
    camera.layers.enable(LAYER);
    // Compiled off the main thread while hidden (see BeachDecor for why not
    // lib/prewarm)
    gl.compileAsync(mesh, camera, scene)
      .catch(() => {})
      .then(() => {
        if (live) ready.current = true;
      });
    return () => {
      live = false;
      camera.layers.disable(LAYER);
      mesh.material.dispose();
    };
  }, [mesh, camera, get]);

  // Reduced motion: no fade in (they appear at once), and they hold their
  // places, wings still
  useFrame((_, delta) => {
    if (!ready.current) return;
    const { uniforms } = mesh.material;
    if (fade.current < 1) {
      fade.current = prefersReducedMotion ? 1 : Math.min(1, fade.current + delta / FADE_SECONDS);
    }
    // How far the visitor has scrolled from Home toward Skills
    const leave = THREE.MathUtils.smoothstep(scroll.offset * (scroll.pages - 1), LEAVE_START, LEAVE_END);
    const opacity = THREE.MathUtils.smoothstep(fade.current, 0, 1) * (1 - leave);
    uniforms.uOpacity.value = opacity;
    mesh.visible = opacity > 0;
    // A long frame (a background tab) does not jump them across the sky
    if (!prefersReducedMotion) time.current += Math.min(delta, 0.1);
    uniforms.uTime.value = time.current;
  });

  return <primitive object={mesh} />;
}
