import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { useMobile } from "../../contexts/MobileContext";
import { dissolveUniform } from "../../lib/dissolve";
import { createRandom } from "../../lib/lowPoly";
import { CAFE_BULB_R, cafeLights, cafeWindow, chimneyTop, lanterns } from "../../lib/parkLayout";
import { PARK_LAYER, parkUniforms } from "../../lib/parkMaterials";
import { timeOfDay } from "../../lib/timeOfDay";

// The park's lights in the air, one point cloud: soft halos round the
// lanterns, the café's bulbs and its big window, fireflies drifting round
// the lamps, the beds and the pond, and a few puffs of chimney smoke.
// Additive, so they only ever add light; sized in world units (smaller with
// distance) up to a clamp in CSS px. Points are outside the dissolve patch
// (lib/dissolve handles meshes): they fade with the section through uFade.

const KIND = { halo: 0, firefly: 1, smoke: 2 };
const HALO = { lamp: [1.3, 0.55], bulb: [0.32, 0.6], window: [2.2, 0.45], color: "#ffb35c", windowColor: "#ff9a3c" };
const FIREFLY = { size: 0.22, color: "#d6f07a", core: "#f6ffd0", reach: 1.6, y: [0.4, 2.2], drift: [0.2, 0.5], blink: [1.2, 2.5] };
// Where the fireflies live: shares of them by the lamps, the beds, the pond
const HOMES = { lamps: 0.6, beds: 0.25 };
const SMOKE = { puffs: 6, size: 0.18, color: "#8a90b3" };
// The largest a point may draw, in CSS px (× DPR)
const MAX_CSS_PX = 256;

const VERTEX = `
attribute float aKind;
attribute vec4 aSeed;
attribute vec3 aColor;
attribute float aSize;
uniform float uTime, uLamps, uNight, uFade, uMotion, uScale, uMaxPx;
varying vec3 vColor;
varying float vAlpha;
varying float vKind;
void main() {
  vec3 p = position;
  float size = aSize;
  float alpha;
  if (aKind < 0.5) {
    // Halo: aSeed.x its peak
    alpha = aSeed.x * uLamps;
  } else if (aKind < 1.5) {
    // Firefly: aSeed = drift frequencies (x, y, z) and blink rate
    vec4 phase = fract(aSeed * 17.31) * 6.2832;
    p += uMotion * vec3(
      sin(uTime * aSeed.x + phase.x) * 0.35,
      sin(uTime * aSeed.y + phase.y) * 0.18,
      cos(uTime * aSeed.z + phase.z) * 0.3);
    float blink = pow(max(0.0, sin(uTime * aSeed.w + phase.w)), 6.0);
    alpha = mix(0.6, blink, uMotion) * smoothstep(0.6, 1.0, uNight);
  } else {
    // Smoke: aSeed.x its place in the cycle
    float life = fract(uTime / 7.0 + aSeed.x);
    p += vec3(0.25, 1.1, 0.0) * life;
    size = 0.18 + 0.5 * life;
    alpha = 0.1 * sin(3.14159 * life) * uMotion;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(size * uScale / -mv.z, uMaxPx);
  vColor = aColor;
  vAlpha = alpha * uFade;
  vKind = aKind;
}`;

const FRAGMENT = `
uniform vec3 uCore;
varying vec3 vColor;
varying float vAlpha;
varying float vKind;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0 || vAlpha <= 0.0) discard;
  vec3 color = vColor;
  float a;
  if (vKind < 0.5) {
    a = exp(-r2 * 5.0);
  } else if (vKind < 1.5) {
    float core = exp(-r2 * 40.0);
    a = max(exp(-r2 * 6.0), core);
    color = mix(vColor, uCore, core);
  } else {
    a = exp(-r2 * 3.0);
  }
  gl_FragColor = vec4(color, a * vAlpha);
  #include <colorspace_fragment>
}`;

const sparkleUniforms = {
  uTime: parkUniforms.uTime,
  uLamps: parkUniforms.uLamps,
  uNight: { value: 0 },
  uFade: { value: 1 },
  uMotion: { value: 1 },
  uScale: { value: 1 },
  uMaxPx: { value: MAX_CSS_PX },
  uCore: { value: new THREE.Color(FIREFLY.core) },
};

const sparkleMaterial = new THREE.ShaderMaterial({
  uniforms: sparkleUniforms,
  vertexShader: VERTEX,
  fragmentShader: FRAGMENT,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  fog: false,
  toneMapped: false,
});
sparkleMaterial.customProgramCacheKey = () => "park-sparkles";

const buildSparkles = (park) => {
  const position = [];
  const kind = [];
  const seed = [];
  const color = [];
  const size = [];
  const scratch = new THREE.Color();
  const add = (k, [x, y, z], s, hex, sd) => {
    position.push(x, y, z);
    kind.push(k);
    seed.push(...sd);
    scratch.set(hex);
    // Linear, like every colour the renderer takes (the shader converts)
    color.push(scratch.r, scratch.g, scratch.b);
    size.push(s);
  };
  for (const p of lanterns(park)) add(KIND.halo, p, HALO.lamp[0], HALO.color, [HALO.lamp[1], 0, 0, 0]);
  for (const [x, y, z] of cafeLights(park).bulbs) {
    add(KIND.halo, [x, y - CAFE_BULB_R, z], HALO.bulb[0], HALO.color, [HALO.bulb[1], 0, 0, 0]);
  }
  add(KIND.halo, cafeWindow(park), HALO.window[0], HALO.windowColor, [HALO.window[1], 0, 0, 0]);

  // MOBILE_PERF: 16 fireflies on phones instead of 40 (park.fireflies) —
  // revert by giving the phone layouts 40 in lib/parkLayout
  const random = createRandom(23);
  const between = ([lo, hi]) => lo + (hi - lo) * random();
  const anchors = (share) => {
    if (share < HOMES.lamps) return park.lamps;
    if (share < HOMES.lamps + HOMES.beds) return park.beds;
    return [[park.pond.x, park.pond.z]];
  };
  for (let i = 0; i < park.fireflies; i++) {
    const home = anchors(i / park.fireflies);
    const [ax, az] = home[i % home.length];
    const r = FIREFLY.reach * Math.sqrt(random());
    const a = random() * 2 * Math.PI;
    add(
      KIND.firefly,
      [ax + r * Math.cos(a), between(FIREFLY.y), az + r * Math.sin(a)],
      FIREFLY.size,
      FIREFLY.color,
      [between(FIREFLY.drift), between(FIREFLY.drift), between(FIREFLY.drift), between(FIREFLY.blink)],
    );
  }
  const chimney = chimneyTop(park);
  for (let k = 0; k < SMOKE.puffs; k++) add(KIND.smoke, chimney, SMOKE.size, SMOKE.color, [k / SMOKE.puffs, 0, 0, 0]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("aKind", new THREE.Float32BufferAttribute(kind, 1));
  geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 4));
  geometry.setAttribute("aColor", new THREE.Float32BufferAttribute(color, 3));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(size, 1));
  return geometry;
};

export default function ParkSparkles({ park }) {
  const { prefersReducedMotion } = useMobile();
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const height = useThree((state) => state.size.height);
  const dpr = useThree((state) => state.viewport.dpr);
  const dissolve = dissolveUniform("contact");
  // park is PARK[layout]: one cloud per layout
  const geometry = useMemo(() => buildSparkles(park), [park]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const points = useMemo(() => {
    const cloud = new THREE.Points(undefined, sparkleMaterial);
    cloud.layers.set(PARK_LAYER);
    // Spread round the park and moved by the shader: drawn always (and so
    // in the section's hidden warm-up draw too)
    cloud.frustumCulled = false;
    return cloud;
  }, []);
  const maxPointSize = useMemo(() => {
    const context = gl.getContext();
    return context.getParameter(context.ALIASED_POINT_SIZE_RANGE)[1];
  }, [gl]);

  // World size to device px at unit depth, and the clamp: again whenever
  // the canvas or its DPR changes (DesktopQuality steps the DPR)
  useLayoutEffect(() => {
    sparkleUniforms.uScale.value = (height * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    sparkleUniforms.uMaxPx.value = Math.min(MAX_CSS_PX * dpr, maxPointSize);
  }, [height, dpr, camera, maxPointSize]);

  useFrame(() => {
    sparkleUniforms.uNight.value = timeOfDay.night;
    sparkleUniforms.uMotion.value = prefersReducedMotion ? 0 : 1;
    sparkleUniforms.uFade.value = 1 - THREE.MathUtils.smoothstep(dissolve.value.x, 0, 1);
  });

  return <primitive object={points} geometry={geometry} />;
}
