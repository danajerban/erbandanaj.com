import { useScroll } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ANIMATION_CONSTANTS } from "../constants/animation";
import { useMobile } from "../contexts/MobileContext";
import { layoutOf } from "../lib/coast";

// Low cumulus banks on the horizon around the sun, in the sunset's light:
// billowy tops over flatter bases, peach-cream where the light falls, rose in
// the body, coral-orange undersides like the sea's reflection, a silver-gold
// lining on the edges facing the sun (brightest nearest it) and soft wisps
// trailing off their ends; a softer, hazier layer behind the front one.
// Part of the sky, like the sun (Experience): placed in view space from the
// sun's screen place and size (the `sun` and `scale` props, Experience's
// SUN_SCREEN and SUN_SCALE), so they hold at every viewport. Home only:
// they fade out as the visitor leaves it, with the sea and the gulls. Their
// shapes are noise, drifting slowly; reduced motion holds them still.
//
// One draw call: a quad per bank in one geometry, drawn just in front of the
// sun. Depth-tested, so the palms, the avatar and the title pass in front.
// A lazy chunk mounted after the first visible frame (Experience): it
// compiles its shader off the main thread, then fades in. On its own layer,
// so the contact-shadow pass does not draw it.

const LAYER = 8;
const DEPTH = 21;
const FADE_SECONDS = 2.5;
// Leaving Home: over this span of the scroll toward Skills (in sections)
// they fade out, with the section, the sea and the gulls
const { DISSOLVE_START: LEAVE_START, DISSOLVE_END: LEAVE_END } = ANIMATION_CONSTANTS;

// Per bank, in sun units (the screen's short side times the sun's scale):
// x, its middle's offset right of the sun's center; y, its middle's height
// above the eye-level horizon (its base lies 0.55 h below that); w, h, its
// half-width and half-height; seed, its shape; back, 1 for the hazier layer
// behind (listed first, so drawn first).
const BANKS = {
  desktop: [
    { x: -0.22, y: 0.061, w: 0.22, h: 0.045, seed: 6, back: 1 },
    { x: 0.14, y: 0.062, w: 0.18, h: 0.035, seed: 7, back: 1 },
    { x: -0.3, y: 0.041, w: 0.2, h: 0.055, seed: 2, back: 0 },
    { x: 0.15, y: 0.036, w: 0.16, h: 0.05, seed: 3, back: 0 },
    { x: -0.03, y: 0.022, w: 0.2, h: 0.022, seed: 1, back: 0 },
  ],
  landscape: [
    { x: -0.25, y: 0.06, w: 0.2, h: 0.035, seed: 6, back: 1 },
    { x: 0.22, y: 0.06, w: 0.15, h: 0.03, seed: 7, back: 1 },
    { x: -0.32, y: 0.03, w: 0.18, h: 0.04, seed: 2, back: 0 },
    { x: 0.22, y: 0.028, w: 0.14, h: 0.036, seed: 3, back: 0 },
    { x: 0, y: 0.013, w: 0.16, h: 0.014, seed: 1, back: 0 },
  ],
  portrait: [
    { x: -0.07, y: 0.066, w: 0.13, h: 0.03, seed: 6, back: 1 },
    { x: 0.1, y: 0.07, w: 0.1, h: 0.028, seed: 7, back: 1 },
    { x: -0.1, y: 0.036, w: 0.11, h: 0.036, seed: 2, back: 0 },
    { x: 0.09, y: 0.031, w: 0.1, h: 0.032, seed: 3, back: 0 },
    { x: 0, y: 0.02, w: 0.12, h: 0.017, seed: 1, back: 0 },
  ],
};

const VERTEX = /* glsl */ `
  uniform vec2 uSun;
  uniform float uHorizon;
  uniform float uUnit;
  uniform float uTanV;
  uniform float uAspect;
  // x, y: the bank's middle from the sun and the horizon, z, w: its half-size
  attribute vec4 aBank;
  // x: its shape's seed, y: 1 for the layer behind
  attribute vec2 aLook;
  varying vec2 vP;
  varying vec2 vHalf;
  varying vec2 vSun;
  varying vec2 vLook;

  void main() {
    vP = position.xy * aBank.zw;
    vHalf = aBank.zw;
    vLook = aLook;
    // In screen heights from the top-left, then from the sun in sun units
    vec2 sun = vec2(uSun.x * uAspect, uSun.y);
    vec2 s = vec2(sun.x + (aBank.x + vP.x) * uUnit, uHorizon - (aBank.y + vP.y) * uUnit);
    vSun = vec2(s.x - sun.x, sun.y - s.y) / uUnit;
    float D = ${DEPTH.toFixed(1)};
    gl_Position = projectionMatrix * vec4((2.0 * s.x - uAspect) * uTanV * D, (1.0 - 2.0 * s.y) * uTanV * D, -D, 1.0);
  }
`;

// sRGB written as is (no tone mapping), like the sun
const fragment = (octaves) => /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vP;
  varying vec2 vHalf;
  varying vec2 vSun;
  varying vec2 vLook;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < ${octaves}; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }
  // Inside the puffs above 0 (roughly the distance to their outline, in sun
  // units): a row of rounded tops of mixed sizes, highest mid-bank, over a
  // flat base 0.55 h below the middle. x drifts with time.
  float puffs(vec2 p, float x) {
    float s = vLook.x * 17.0;
    float qx = p.x / vHalf.x;
    float e = sqrt(max(1.0 - qx * qx / 0.6, 0.0));
    float ridge = 0.55 * noise(vec2(x * 14.0, s)) + 0.3 * noise(vec2(x * 31.0, s + 3.0)) + 0.15 * noise(vec2(x * 67.0, s + 7.0));
    float top = vHalf.y * (-0.55 + 1.55 * e * (0.3 + 0.7 * ridge));
    return min(top - p.y, p.y + 0.55 * vHalf.y);
  }

  void main() {
    float h = vHalf.y;
    float back = vLook.y;
    float drift = uTime * 0.002;
    vec2 p = vP;
    // Billowy, eroded edges
    float erode = (fbm(p * vec2(40.0, 60.0) + vec2(drift * 40.0 + vLook.x * 13.1, vLook.x * 7.3)) - 0.5) * 0.6 * h;
    float d = puffs(p, p.x + drift) + erode;
    float soft = h * mix(0.1, 0.3, back);
    float alpha = smoothstep(0.0, soft, d);
    // Wisps trailing off low along the base, past the puffs
    float qx = p.x / vHalf.x;
    vec2 w = vec2(p.x * 22.0 + drift * 22.0 + vLook.x * 5.0, p.y / h * 3.0);
    float wisp = smoothstep(0.45, 0.85, 0.65 * noise(w) + 0.35 * noise(w * 2.1))
      * exp(-pow((p.y / h + 0.4) / 0.2, 2.0)) * (1.0 - smoothstep(0.8, 1.0, abs(qx)));
    alpha = max(alpha, 0.5 * wisp);
    if (alpha < 0.002) discard;

    // Lit where the outline lies close toward the sun
    vec2 toSun = -normalize(vSun);
    float probe = 0.1 * h;
    float lit = clamp(0.5 + (d - puffs(p + toSun * probe, p.x + toSun.x * probe + drift) - erode) / probe * 0.8, 0.0, 1.0);
    // 0 at the base, 1 at the tallest tops
    float high = clamp((p.y / h + 0.55) / 1.35, 0.0, 1.0);
    float inner = smoothstep(0.0, 0.4 * h, d);
    float near = exp(-length(vSun) / 0.14);
    float warm = exp(-length(vSun) / 0.35);

    // Coral-orange underside, rose body, peach-cream where the light falls
    // (and on the billows' bulges), a mauve-rose shade on the side away from
    // the sun
    vec3 color = mix(vec3(1.0, 0.5, 0.34), vec3(0.9, 0.6, 0.62), smoothstep(0.0, 0.45, high));
    color = mix(color, vec3(1.0, 0.9, 0.78), clamp(smoothstep(0.35, 1.0, high) * (0.4 + 0.6 * lit) + 0.35 * high * erode / h, 0.0, 1.0));
    color = mix(color, vec3(0.72, 0.48, 0.56), (1.0 - lit) * inner * 0.55);
    color *= mix(vec3(1.0, 0.93, 0.93), vec3(1.0, 0.88, 0.78), warm);
    // The lining: gold, near white by the sun
    float lining = (1.0 - smoothstep(0.0, 0.25 * h, d)) * lit * (0.55 + 1.2 * near);
    color = mix(color, mix(vec3(1.0, 0.72, 0.46), vec3(1.0, 0.95, 0.8), near), clamp(lining, 0.0, 1.0));
    // The layer behind: hazed toward the sky and fainter
    color = mix(color, vec3(0.95, 0.62, 0.56), 0.25 * back);
    alpha *= uOpacity * mix(0.97, 0.75, back);
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;

const buildGeometry = (banks) => {
  const position = [];
  const aBank = [];
  const aLook = [];
  const index = [];
  banks.forEach(({ x, y, w, h, seed, back }, i) => {
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      position.push(cx, cy, 0);
      aBank.push(x, y, w, h);
      aLook.push(seed, back);
    }
    index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("aBank", new THREE.Float32BufferAttribute(aBank, 4));
  geometry.setAttribute("aLook", new THREE.Float32BufferAttribute(aLook, 2));
  geometry.setIndex(index);
  return geometry;
};

const createClouds = (isMobile) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uSun: { value: new THREE.Vector2() },
      uHorizon: { value: 0 },
      uUnit: { value: 1 },
      uTanV: { value: 1 },
      uAspect: { value: 1 },
    },
    vertexShader: VERTEX,
    // MOBILE_PERF: 4 noise octaves on mobile instead of 5 — revert by removing the ternary
    fragmentShader: fragment(isMobile ? 4 : 5),
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.layers.set(LAYER);
  // Placed in view space by the shader: no bounding volume applies
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
};

export default function Clouds({ sun, scale }) {
  const { isMobile, prefersReducedMotion } = useMobile();
  const get = useThree((state) => state.get);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const aspect = size.width / size.height;
  const layout = layoutOf(isMobile, aspect);
  const mesh = useMemo(() => createClouds(isMobile), [isMobile]);
  const geometry = useMemo(() => buildGeometry(BANKS[layout]), [layout]);
  const scroll = useScroll();
  const ready = useRef(false);
  const fade = useRef(0);

  // The camera never moves, so this only re-runs on resize
  useLayoutEffect(() => {
    mesh.geometry = geometry;
    const { uniforms } = mesh.material;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const forward = camera.getWorldDirection(new THREE.Vector3());
    // The eye-level horizon, as a screen fraction from the top
    uniforms.uHorizon.value = 0.5 - -forward.y / Math.hypot(forward.x, forward.z) / (2 * tanV);
    uniforms.uSun.value.set(...sun);
    uniforms.uUnit.value = (Math.min(size.width, size.height) / size.height) * scale;
    uniforms.uTanV.value = tanV;
    uniforms.uAspect.value = aspect;
    // Sorted as if DEPTH down the view, so it draws after the sun
    mesh.parent.updateWorldMatrix(true, false);
    mesh.position.copy(mesh.parent.worldToLocal(camera.position.clone().addScaledVector(forward, DEPTH)));
    return () => geometry.dispose();
  }, [mesh, geometry, camera, size, aspect, sun, scale]);

  useEffect(() => {
    ready.current = false;
    fade.current = 0;
    let live = true;
    const { gl, scene } = get();
    camera.layers.enable(LAYER);
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

  // Reduced motion: no fade in (they appear at once), and no drift
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
    if (!prefersReducedMotion) uniforms.uTime.value += Math.min(delta, 0.1);
  });

  return <primitive object={mesh} />;
}
