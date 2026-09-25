import { useScroll } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ANIMATION_CONSTANTS, getSectionsDistance } from "../constants/animation";
import { useMobile } from "../contexts/MobileContext";
import { SWASH, coastX } from "../lib/coast";
import { createRandom } from "../lib/lowPoly";

// The sea on Home: from the island's shore (lib/coast) to the right edge of
// the screen and out to the far distance, where its edge is the horizon the
// sun sinks behind. One draw call: a jittered low-poly grid, flat-shaded from
// screen-space derivatives like the palms, slow waves in the vertex shader,
// and in the fragment shader the shore (waves washing up the sand and back,
// foam, wet sand, shallows), the sun's glittering reflection and the haze on
// the far water. A lazy chunk mounted after the first visible frame
// (HomeSection): it compiles its shader off the main thread, then fades in.
//
// Home-local floor coordinates (y = 0 floor, +z toward the camera). The mesh
// spans a little past the shore on the land side; the shore itself is drawn
// per pixel from coastX sampled into a small texture, so the one shape in
// lib/coast drives both the palms and the water, and nothing wet passes dryX.
//
// When the visitor leaves Home the sea slides with the world and dissolves
// into the horizon haze with the rest of the section (SectionGroup), driven
// by the scroll offset (so a menu jump plays it too, and reduced motion — no
// scroll damping — makes it immediate): its own shader, not lib/dissolve's.
//
// Drawn after the other transparent objects but the dolphin (renderOrder:
// the sea 1, the dolphin 2, as it leaps over the water) and blended over
// them: the sun's quad (Experience, depth-tested, no depth write) sits
// nearer than most of the water, so drawn first the sea would cut its lower
// glow with a hard line; drawn after it the sea covers that glow cleanly,
// and the water's far edge becomes the horizon under the sun. On its own
// layer, like BeachDecor, so the contact-shadow pass does not print it on
// the floor.

const SEED = 11;
const LAYER = 2;
const FADE_SECONDS = 1.2;
// Camera: SceneCanvas (position [0, 0.5, 5], looking at the origin)
const CAMERA_Z = 5;
// Mirror of SUN_SCREEN in Experience.jsx (screen fractions, x from the left,
// y from the top) — keep them together
const SUN_SCREEN = { desktop: [0.855, 0.278], mobile: [0.8, 0.31] };
// Half-width of the sun's glow along the horizon, in short sides of the
// screen (the sun is sized by the short side), fitted to the CSS sky + sun
// quad just above the water line
const SUN_GLOW_WIDTH = { desktop: 0.4, mobile: 0.5 };

// Rows run from just past the bottom of the screen (D = distance from the
// camera along -z) to the horizon; a few more reach back under and behind
// the camera, so the near edge stays out of sight while Home slides away
// along z on desktop.
const D_NEAR = 2.2;
const D_FAR = 900;
const D_BEHIND = [-8, -2, 0.8];
// Screen fraction drawn past the shore on the land side: room for the swash
// and a rim of sand
const LAND_OVERSHOOT = 0.07;
// Columns past the right screen edge, widening outward: Home slides away
// along z (desktop) or left along x (mobile) as the visitor leaves, so the
// sea reaches as far as that slide can uncover.
const MARGIN_COLS = 5;
// The shore line (lib/coast), sampled for the fragment shader, evenly in
// 1 / distance (≈ evenly down the screen)
const COAST_SAMPLES = 1024;

// Shore waves, in the shader's screen-fraction units like lib/coast:
// seconds per wave (sets vary per wave and along the shore), the share of a
// cycle the water spends running up the sand, how far the backwash draws
// the water line seaward of coastX, and where the next wave breaks.
const WAVE_PERIOD = 7.5;
const WAVE_RISE = 0.3;
const BACKWASH = 0.004;
const BREAK_LINE = 0.035;

const glsl = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `vec3(${[16, 8, 0].map((s) => (((n >> s) & 255) / 255).toFixed(3)).join(", ")})`;
};
const f = (x) => x.toFixed(4);

// sRGB, written straight to the canvas like the sun and the CSS sky
const DEEP = "#46507c";
const MID = "#83739a";
const SKY = "#dca3a6";
const SHALLOW = "#4f9d9f";
// The sky just above the water line, away from the sun and under it
// (index.css --scene-horizon-color, warmed by the sun's glow)
const SKY_LINE = "#edc0b5";
const SUN_LINE = "#f38973";
// The sun's reds (Experience SUN_FRAGMENT): its halo for the column of
// glitter under it, its core for the hottest glints
const SUN_PATH = "#f25f4a";
const SUN_HOT = "#ff8c60";
const FOAM = "#fff4ec";
// BeachDecor's golden band as it shows on screen (it is tone-mapped): the
// dry sand the waves wash over continues it, and turns a darker tan where
// wet, with a little of the rose sky in its sheen
const SAND = "#e1c094";
const WET_SAND = "#c39a76";
const WET_SHEEN = "#e0a898";

const VERTEX = /* glsl */ `
  uniform float uTime;
  attribute float aShore;
  attribute float aPhase;
  attribute float aWave;
  varying vec3 vViewPos;
  varying vec2 vLocal;
  void main() {
    vec3 p = position;
    float D = max(${f(CAMERA_Z)} - p.z, ${f(D_NEAR)});
    // Facets grow with distance, so do the waves; flat well before the
    // horizon, and calmer in the shallows
    float amp = 0.048 * clamp(D / 4.0, 1.0, 5.0) * (1.0 - smoothstep(25.0, 90.0, D))
      * mix(0.3, 1.0, smoothstep(0.0, 1.2, aShore)) * aWave;
    float t = uTime;
    // Several wave trains rolling in toward the shore (-x) from different
    // angles, under a slow group envelope, plus a little chop per vertex
    float h = 0.42 * sin(dot(p.xz, vec2(-0.72, 0.26)) - t * 0.62)
      + 0.3 * sin(dot(p.xz, vec2(-0.45, -0.52)) - t * 0.47 + 1.7)
      + 0.2 * sin(dot(p.xz, vec2(-1.35, 0.7)) - t * 0.93 + 4.2)
      + 0.14 * sin(dot(p.xz, vec2(0.9, 1.6)) - t * 1.1 + 2.6);
    h *= 0.7 + 0.3 * sin(0.21 * p.x - 0.13 * p.z + 0.17 * t);
    h += 0.22 * sin(t * 0.8 + aPhase);
    p.y += amp * h;
    vLocal = p.xz;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uLeave;
  uniform float uHalfTan;
  uniform float uTanV;
  uniform float uAspect;
  uniform float uHorizonY;
  uniform float uGlowWidth;
  uniform float uRunup;
  uniform vec3 uSunDir;
  uniform vec3 uUp;
  uniform vec2 uSunNdc;
  uniform sampler2D uCoast;
  varying vec3 vViewPos;
  varying vec2 vLocal;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float hash1(float n) {
    return fract(sin(n * 91.345 + 3.1) * 47453.21);
  }
  // Shore line (lib/coast coastX, as a screen fraction from the left) at
  // distance D, linearly interpolated between samples
  float coastAt(float D) {
    float u = clamp((${f(1 / D_NEAR)} - 1.0 / D) / ${f(1 / D_NEAR - 1 / D_FAR)}, 0.0, 1.0) * ${f(COAST_SAMPLES - 1)};
    int i = int(floor(u));
    float a = texelFetch(uCoast, ivec2(i, 0), 0).r;
    float b = texelFetch(uCoast, ivec2(min(i + 1, ${COAST_SAMPLES - 1}), 0), 0).r;
    return mix(a, b, u - float(i));
  }
  // Swash: a quick run up the sand, a slower draw back
  float swash(float tau) {
    return tau < ${f(WAVE_RISE)}
      ? 1.0 - pow(1.0 - tau / ${f(WAVE_RISE)}, 2.0)
      : 1.0 - smoothstep(${f(WAVE_RISE)}, 1.0, tau);
  }
  // Size of wave k, as a share of the run-up, varying along the beach
  float waveSize(float k, float s) {
    return mix(0.45, 1.0, hash1(k)) * (0.85 + 0.15 * sin(s * 7.0 + k * 1.7));
  }

  void main() {
    float D = max(${f(CAMERA_Z)} - vLocal.y, ${f(D_NEAR)});
    // World units per screen width at this depth (lib/coast's frame)
    float unit = 2.0 * uHalfTan * D;
    float s = log(D);
    float t = uTime;

    vec2 ndc = vec2(vViewPos.x / (-vViewPos.z * uHalfTan), vViewPos.y / (-vViewPos.z * uTanV));
    float below = max(uHorizonY - ndc.y, 0.0);
    // Atmospheric perspective: 1 at the water line, fading toward the viewer
    float aerial = exp(-below / 0.14);
    float calm = 1.0 - aerial;
    float dx = (ndc.x - uSunNdc.x) * uAspect;
    vec3 skyLine = mix(${glsl(SKY_LINE)}, ${glsl(SUN_LINE)}, exp(-pow(dx / uGlowWidth, 2.0)));

    // e: screen fraction from the shore line, positive over the sea
    float e = vLocal.x / unit + 0.5 - coastAt(D);

    // Shore waves in sets: wave n runs up the sand by a varying share of the
    // run-up (lib/coast SWASH), arriving a little obliquely so each one
    // sweeps along the beach, then draws back. Where one wave hands over to
    // the next (a line across the beach that travels along it), everything
    // below ends one wave as it starts the next, or that line would show as
    // a step in the wet sand and the foam.
    float phi = t / ${f(WAVE_PERIOD)} - s * 0.8 + 0.12 * sin(s * 3.1 + 1.3);
    float n = floor(phi);
    float tau = fract(phi);
    float a = waveSize(n, s);
    float aPrev = waveSize(n - 1.0, s);
    float aNext = waveSize(n + 1.0, s);
    float reach = uRunup * calm;
    float r = swash(tau);
    // How far past the shore line the water runs up the sand (negative:
    // drawn back seaward of it)
    float runUp = reach * a * r - ${f(BACKWASH)} * (1.0 - r);
    float w = e + runUp;
    float aa = fwidth(e) + 1e-5;
    float water = smoothstep(-aa, aa, w);
    // Wet sand just ahead of the water's edge, and up to the highest reach of
    // this wave once it draws back, and of the last one, drying (fading)
    // until the next wave runs over it
    bool rising = tau < ${f(WAVE_RISE)};
    float wetEdge = smoothstep(-runUp - ${f(SWASH.edge)}, -runUp, e);
    float markNow = reach * a;
    float wetNow = rising ? wetEdge : max(wetEdge, smoothstep(-markNow - ${f(SWASH.edge)}, -markNow, e)
      * mix(1.0, 0.3, (tau - ${f(WAVE_RISE)}) / ${f(1 - WAVE_RISE)}));
    float markPrev = reach * aPrev;
    float wetPrev = smoothstep(-markPrev - ${f(SWASH.edge)}, -markPrev, e) * 0.3 * (1.0 - tau);
    float wet = max(wetNow, wetPrev) * calm;
    // Dry sand rim past the wet line, fading inland
    float rim = 1.0 - smoothstep(uRunup + ${f(SWASH.edge)}, uRunup + ${f(SWASH.edge)} + 0.025, -e);
    if (water <= 0.0 && rim <= 0.0) discard;

    // Flat facet normal, view space; far out the facets dissolve into a
    // smooth sheen
    vec3 N = normalize(cross(dFdx(vViewPos), dFdy(vViewPos)));
    if (dot(N, uUp) < 0.0) N = -N;
    N = normalize(mix(N, uUp, clamp(aerial * 1.6, 0.0, 1.0)));
    vec3 V = normalize(-vViewPos);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fresnel = pow(1.0 - ndv, 4.0);

    // Body: deep indigo underfoot to mauve further out, lagoon teal in the
    // shallows; grazing facets mirror the rose sky
    vec3 body = mix(${glsl(DEEP)}, ${glsl(MID)}, smoothstep(3.0, 30.0, D));
    float shallow = 1.0 - smoothstep(0.0, clamp(0.9 / unit, 0.02, 0.09), e);
    // The next wave rolls in, lifting and turning translucent as it nears the
    // water's edge, then breaks into the swash
    float incoming = smoothstep(0.45, 1.0, tau);
    float crest = ${f(BACKWASH)} + ${f(BREAK_LINE - BACKWASH)} * (1.0 - incoming);
    float nearing = smoothstep(0.45, 0.85, tau) * (1.0 - smoothstep(0.85, 1.0, tau));
    shallow = clamp(shallow + 0.42 * nearing * aNext * exp(-pow((e - crest - 0.01) / 0.012, 2.0)), 0.0, 1.0);
    body = mix(body, ${glsl(SHALLOW)}, shallow * 0.85);
    vec3 color = mix(body, ${glsl(SKY)}, clamp(fresnel * 1.15, 0.0, 1.0));
    // Facets turned toward the sunset catch a little warmth
    color += vec3(0.1, 0.05, 0.03) * clamp(dot(N, uSunDir) * 3.0, -0.6, 1.0) * calm;

    // Far water: a smooth rose a touch deeper than the sky above it, and a
    // light haze sitting right on the water line
    vec3 farWater = skyLine * vec3(0.9, 0.85, 0.9);
    color = mix(color, farWater, pow(aerial, 0.7));
    color = mix(color, skyLine, 0.55 * exp(-below / 0.01));

    // Sun reflection: a column under the sun, widening toward the viewer and
    // strongest near the horizon, lit facet by facet (the half vector picks
    // the facets tilted to mirror the sun)
    vec3 H = normalize(V + uSunDir);
    float spec = pow(max(dot(N, H), 0.0), 60.0);
    float width = 0.03 + 0.28 * below;
    float column = exp(-pow(dx / width, 2.0) - below * 1.8);
    // Broken into short horizontal glints twinkling slowly, in rows anchored
    // on the water (sized by depth, so they shrink toward the horizon) and
    // segments anchored across the screen, like the column: when the water
    // slides sideways under the sun (leaving Home on mobile), glitter tied to
    // it would sweep each row along itself into a solid horizontal band.
    // Past where they would shrink under a pixel, the column glows.
    float gy = s * 30.0;
    float row = floor(gy);
    float gx = ndc.x * uHalfTan / 0.045 + hash(vec2(row, 7.0)) * 9.0;
    float cell = floor(gx);
    float pick = hash(vec2(row, cell));
    float shape = sin(3.14159 * fract(gy)) * (1.0 - pow(abs(fract(gx) - 0.5) * 2.0, 2.0));
    float twinkle = 0.5 + 0.5 * sin(t * 1.6 + pick * 40.0);
    float dash = step(0.45, pick) * shape * twinkle * (1.0 - smoothstep(60.0, 140.0, D));
    dash = pow(dash, 1.5);
    float glitter = column * (0.25 + 0.9 * spec + 1.1 * dash);
    color = mix(color, ${glsl(SUN_PATH)}, clamp(glitter, 0.0, 0.9));
    // Hottest at the water line right under the sun: the sun's own core,
    // never whiter
    float hot = exp(-pow(dx / 0.06, 2.0)) * exp(-below * 30.0);
    color = mix(color, ${glsl(SUN_HOT)}, clamp(column * (0.5 * spec + 0.8 * dash) + 0.45 * hot, 0.0, 1.0));

    // Foam: the swash front, bright as it runs up and thinning as it draws
    // back, lace left on the wet slope, and the next wave's breaker line,
    // which merges into the front as it reaches it
    float fw = clamp(0.05 / unit, 0.0018, 0.006);
    float lace = 0.5 + 0.5 * sin(s * 53.0 + 1.7 * sin(s * 17.0 + t * 0.2));
    float rush = rising ? 1.0 : 1.0 - 0.75 * smoothstep(${f(WAVE_RISE)}, 0.75, tau) + 0.75 * smoothstep(0.85, 1.0, tau);
    float front = (1.0 - smoothstep(0.0, fw, w)) * rush * (0.75 + 0.25 * lace);
    float sheet = (rising ? 0.0 : smoothstep(${f(WAVE_RISE)}, 0.5, tau) * (1.0 - smoothstep(0.6, 1.0, tau)))
      * exp(-w / (fw * 4.0)) * lace * 0.35;
    float breaker = exp(-pow((e - crest) / (fw * 0.65), 2.0)) * nearing * aNext * (0.6 + 0.4 * lace);
    float foam = clamp(front + sheet + breaker, 0.0, 1.0) * water * calm;
    color = mix(color, ${glsl(FOAM)}, foam);

    // Sand: wet and glossy where the swash has just been, dry beyond
    vec3 sandColor = mix(${glsl(SAND)}, mix(${glsl(WET_SAND)}, ${glsl(WET_SHEEN)}, 0.3), wet);
    color = mix(sandColor, color, water);
    float alpha = mix(max(rim * rim * 0.9, wet * 0.85) * calm, 1.0, water);

    // Leaving Home: the nearest water goes first, the far water line last,
    // everything settling into the haze
    float far = exp(-below / 0.35);
    alpha *= smoothstep(0.0, 0.3, far + 0.3 - uLeave * 1.3);
    color = mix(color, skyLine, uLeave * 0.8);
    gl_FragColor = vec4(color, uOpacity * alpha);
  }
`;

// Jittered grid, indexed (the flat look comes from the derivative normals),
// each cell split along a random diagonal. aShore: signed world distance from
// the shore (x - coastX), positive over water, which calms the waves in the
// shallows; the shore line itself is drawn per pixel from the coast texture.
const buildGeometry = (isMobile, aspect, halfTan) => {
  const random = createRandom(SEED);
  // MOBILE_PERF: fewer rows and columns on mobile — revert by removing the ternary
  const rows = isMobile ? 18 : 24;
  const cols = isMobile ? 7 : 12;
  const slideZ = isMobile ? 0 : getSectionsDistance(false);
  const slideX = isMobile ? getSectionsDistance(true) + 1 : 0;

  // Near rows are taller on screen, far ones shrink toward the horizon
  const depths = [...D_BEHIND];
  for (let i = 0; i <= rows; i++) {
    const g = 1 - Math.pow(1 - i / rows, 1.5);
    depths.push(1 / (1 / D_NEAR + (1 / D_FAR - 1 / D_NEAR) * g));
  }

  // The land-side edge of each row sits left of the shore anywhere between
  // it and its neighbours, so the ragged shore never runs off the mesh
  const rowLeft = depths.map((depth, i) => {
    const from = Math.max(depths[i - 1] ?? depth, D_NEAR);
    const to = Math.max(depths[i + 1] ?? depth, D_NEAR);
    let left = Infinity;
    for (let k = 0; k <= 16; k++) {
      const d = from + ((to - from) * k) / 16;
      left = Math.min(left, coastX(CAMERA_Z - d, isMobile, aspect) * (Math.max(depth, D_NEAR) / d));
    }
    return left;
  });

  const position = [];
  const shore = [];
  const phase = [];
  const wave = [];
  const width = cols + 1 + MARGIN_COLS;
  depths.forEach((depth, i) => {
    const inner = i > 0 && i < depths.length - 1;
    const spacing = inner ? Math.min(depths[i + 1] - depth, depth - depths[i - 1]) : 0;
    const z0 = CAMERA_Z - depth;
    // Rows under and behind the camera keep the nearest row's shore line
    const zRef = CAMERA_Z - Math.max(depth, D_NEAR);
    const halfWidth = halfTan * aspect * (CAMERA_Z - zRef);
    for (let j = 0; j < width; j++) {
      const z = inner && j > 0 && j < cols ? z0 + (random() - 0.5) * 0.5 * spacing : z0;
      const coast = coastX(depth < D_NEAR ? zRef : z, isMobile, aspect);
      const left = rowLeft[i] - LAND_OVERSHOOT * 2 * halfWidth;
      // Near the bottom the arc leaves through the right edge: keep a strip
      // of water past it
      const right = Math.max(halfWidth * 1.08, coast + 0.1 * 2 * halfWidth);
      let x;
      if (j > cols) {
        const far = Math.max(halfTan * aspect * (CAMERA_Z - zRef + slideZ) * 1.1 + slideX, right * 1.5);
        x = right + (far - right) * ((j - cols) / MARGIN_COLS) ** 2;
      } else {
        const jitter = j > 0 && j < cols ? (random() - 0.5) * 0.6 : 0;
        x = left + ((j + jitter) / cols) * (right - left);
      }
      position.push(x, 0, z);
      shore.push(x - coast);
      phase.push(random() * Math.PI * 2);
      // The widening margin columns calm down: waves on facets that long
      // would stripe the water while it slides into view
      wave.push(j > cols ? (1 - (j - cols) / MARGIN_COLS) ** 3 : 1);
    }
  });

  const index = [];
  const p = (k) => new THREE.Vector3().fromArray(position, k * 3);
  const up = new THREE.Vector3();
  const tri = (a, b, c) => {
    // Wind every triangle to face up
    up.subVectors(p(b), p(a)).cross(new THREE.Vector3().subVectors(p(c), p(a)));
    index.push(...(up.y < 0 ? [a, c, b] : [a, b, c]));
  };
  for (let i = 0; i < depths.length - 1; i++) {
    for (let j = 0; j < width - 1; j++) {
      const a = i * width + j;
      const b = a + 1;
      const c = a + width;
      const d = c + 1;
      if (random() < 0.5) {
        tri(a, b, c);
        tri(b, d, c);
      } else {
        tri(a, b, d);
        tri(a, d, c);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("aShore", new THREE.Float32BufferAttribute(shore, 1));
  geometry.setAttribute("aPhase", new THREE.Float32BufferAttribute(phase, 1));
  geometry.setAttribute("aWave", new THREE.Float32BufferAttribute(wave, 1));
  geometry.setIndex(index);
  return geometry;
};

// coastX as a screen fraction from the left, evenly in 1 / distance
const buildCoast = (isMobile, aspect, halfTan) => {
  const data = new Float32Array(COAST_SAMPLES);
  for (let i = 0; i < COAST_SAMPLES; i++) {
    const u = i / (COAST_SAMPLES - 1);
    const depth = 1 / (1 / D_NEAR - (1 / D_NEAR - 1 / D_FAR) * u);
    data[i] = coastX(CAMERA_Z - depth, isMobile, aspect) / (2 * halfTan * aspect * depth) + 0.5;
  }
  const texture = new THREE.DataTexture(data, COAST_SAMPLES, 1, THREE.RedFormat, THREE.FloatType);
  texture.needsUpdate = true;
  return texture;
};

const createSea = () => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uLeave: { value: 0 },
      uHalfTan: { value: 1 },
      uTanV: { value: 1 },
      uAspect: { value: 1 },
      uHorizonY: { value: 0 },
      uGlowWidth: { value: 1 },
      uRunup: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 0, -1) },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uSunNdc: { value: new THREE.Vector2() },
      uCoast: { value: null },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.layers.set(LAYER);
  mesh.renderOrder = 1;
  // The waves move vertices past any bounding volume; it is always in view
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
};

export default function Sea() {
  const { isMobile, prefersReducedMotion } = useMobile();
  const get = useThree((state) => state.get);
  const camera = useThree((state) => state.camera);
  const aspect = useThree((state) => state.viewport.aspect);
  const mesh = useMemo(createSea, []);
  const ready = useRef(false);
  const fade = useRef(0);
  const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const geometry = useMemo(() => buildGeometry(isMobile, aspect, halfTan), [isMobile, aspect, halfTan]);
  const coast = useMemo(() => buildCoast(isMobile, aspect, halfTan), [isMobile, aspect, halfTan]);
  const scroll = useScroll();

  useLayoutEffect(() => {
    mesh.geometry = geometry;
    const { uniforms } = mesh.material;
    const variant = isMobile ? "mobile" : "desktop";
    uniforms.uCoast.value = coast;
    uniforms.uRunup.value = SWASH.runup[variant];
    // In half screen heights, like the shader's dx
    uniforms.uGlowWidth.value = SUN_GLOW_WIDTH[variant] * 2 * Math.min(1, aspect);
    uniforms.uHalfTan.value = halfTan * aspect;
    uniforms.uTanV.value = halfTan;
    uniforms.uAspect.value = aspect;
    // Sun direction in view space, from its screen placement
    const [fx, fy] = SUN_SCREEN[variant];
    uniforms.uSunNdc.value.set(fx * 2 - 1, 1 - fy * 2);
    uniforms.uSunDir.value.set((fx * 2 - 1) * halfTan * aspect, (1 - fy * 2) * halfTan, -1).normalize();
    // Eye-level horizon: a level direction straight ahead, in view space
    camera.updateMatrixWorld();
    const level = new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorldInverse);
    uniforms.uHorizonY.value = level.y / (-level.z * halfTan);
    uniforms.uUp.value.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
    return () => {
      geometry.dispose();
      coast.dispose();
    };
  }, [mesh, geometry, coast, camera, isMobile, aspect, halfTan]);

  useEffect(() => {
    // A hot update (Fast Refresh) builds a new mesh, hidden at opacity 0,
    // but keeps these refs: start over, so it fades in again once compiled
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

  // Reduced motion: no fade in (it appears at once) and the water holds still
  useFrame((state, delta) => {
    if (!ready.current) return;
    const { uniforms } = mesh.material;
    // How far the visitor has scrolled from Home toward Skills: the sea
    // dissolves into the horizon haze over the section's span, nearest water
    // first
    const leave = THREE.MathUtils.smoothstep(
      scroll.offset * (scroll.pages - 1),
      ANIMATION_CONSTANTS.DISSOLVE_START,
      ANIMATION_CONSTANTS.DISSOLVE_END,
    );
    uniforms.uLeave.value = leave;
    mesh.visible = leave < 1;
    if (fade.current < 1) {
      fade.current = prefersReducedMotion ? 1 : Math.min(1, fade.current + delta / FADE_SECONDS);
      uniforms.uOpacity.value = THREE.MathUtils.smoothstep(fade.current, 0, 1);
    }
    if (!prefersReducedMotion) uniforms.uTime.value = state.clock.elapsedTime;
  });

  return <primitive object={mesh} />;
}
