import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { TriangleSink } from "./lowPoly";
import { lanterns } from "./parkLayout";
import { timeOfDay } from "./timeOfDay";

// Shared by the night park's parts (ContactSection, components/park/*): its
// render layer, its two materials, its clock, and the sink that bakes the
// night into vertex colours. Every park object is unlit: each face takes its
// shade from a fixed moon direction and the nearest lanterns (nightShade),
// so the park adds no light (a new light would recompile every standard
// material) and two programs at most.

// Render layer of every park mesh (R1 registry: 9 night sky, 10 office,
// 11 park). ContactSection enables it on the camera; the contact-shadow
// camera sees layer 0 only, so the park casts no shadow draws.
export const PARK_LAYER = 11;

// Shared uniforms: the park's clock (frozen under reduced motion) and its
// lamps (timeOfDay.lamps), written once per frame by useParkClock
export const parkUniforms = { uTime: { value: 0 }, uLamps: { value: 0 } };

// Debug counters the parts bump in DEV (ContactSection exposes them as
// window.__park.stats): the cat's blinks and the story window's switches
// (ParkHouses)
export const parkStats = { blinks: 0, storyToggles: 0 };

// Houses, café, cat, lamps, trees, beds, railing, pond solids, ducks and the
// balloon strings: one program. Vertex colours (linear, through THREE.Color)
// already hold the night; aSway (weight, phase) bends a vertex in the wind
// (a negative weight lifts it instead, slowly: the sleeping dog's breath),
// aGlow marks lamp-lit glass that dims with the lamps (windows, bulbs).
export const parkSolidMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  toneMapped: false,
  side: THREE.DoubleSide,
});
parkSolidMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = parkUniforms.uTime;
  shader.uniforms.uLamps = parkUniforms.uLamps;
  shader.vertexShader = `attribute vec2 aSway;\nattribute float aGlow;\nuniform float uTime;\nvarying float vGlow;\n${shader.vertexShader.replace(
    "#include <begin_vertex>",
    "$&\ntransformed.xz += max(aSway.x, 0.0) * 0.025 * vec2(sin(uTime * 1.3 + aSway.y), cos((uTime * 1.3 + aSway.y) * 0.7));\ntransformed.y += max(-aSway.x, 0.0) * 0.01 * sin(uTime * 1.6 + aSway.y);\nvGlow = aGlow;",
  )}`;
  shader.fragmentShader = `uniform float uLamps;\nvarying float vGlow;\n${shader.fragmentShader.replace(
    "#include <color_fragment>",
    "$&\ndiffuseColor.rgb *= mix(1.0, 0.18 + 0.82 * uLamps, vGlow);",
  )}`;
};
// Before the dissolve patch chains the hook (it reads the key first)
parkSolidMaterial.customProgramCacheKey = () => "park-solid";

// The lawn, path and sidewalk: RGBA vertex colours (alpha fades the edges),
// drawn first (renderOrder −1) so the contact shadows still land on it.
export const parkGroundMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  depthWrite: false,
  toneMapped: false,
});

// The park's one clock: call once (ContactSection)
export const useParkClock = (prefersReducedMotion) => {
  useFrame((_, delta) => {
    if (!prefersReducedMotion) parkUniforms.uTime.value += delta;
    parkUniforms.uLamps.value = timeOfDay.lamps;
  });
};

// Colours more than one part uses: the blooms (the beds and the flower
// boxes) and the stone greys (the pond's rim stones and the boulders)
export const FLOWERS = ["#e8798c", "#f3cf62", "#f2ece0", "#a88bd6", "#f19a6a"];
export const STONE_GREYS = { light: "#837f8c", dark: "#6b6876" };

// nightShade: a day colour as a face shows at night, in sRGB space. Moon
// side bright and cool (+x, up), away from it dark; then the night air, then
// the warmth of each lantern within the layout's lamp reach (LANTERN_WARMTH,
// which the ground's paving takes too).
export const LANTERN_WARMTH = { color: "#ffb46a", amount: 0.45 };
const COOL = new THREE.Color("#c9d0f0");
const NIGHT_AIR = new THREE.Color("#2a3157");
const WARM = new THREE.Color(LANTERN_WARMTH.color);
const rgb = { r: 0, g: 0, b: 0 };
const cool = { r: 0, g: 0, b: 0 };
const air = { r: 0, g: 0, b: 0 };
const warm = { r: 0, g: 0, b: 0 };
COOL.getRGB(cool, THREE.SRGBColorSpace);
NIGHT_AIR.getRGB(air, THREE.SRGBColorSpace);
WARM.getRGB(warm, THREE.SRGBColorSpace);
const scratchColor = new THREE.Color();
const lanternCache = new WeakMap();
const lanternsOf = (park) => {
  if (!lanternCache.has(park)) lanternCache.set(park, lanterns(park).map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return lanternCache.get(park);
};

// dayHex: a hex string or number; n: unit face normal; p: a point on the
// face (both Contact-local, after the sink's matrix). Returns a new Color.
export const nightShade = (dayHex, n, p, park) => {
  scratchColor.set(dayHex).getRGB(rgb, THREE.SRGBColorSpace);
  const wF = Math.max(n.z, 0);
  const wB = Math.max(-n.z, 0);
  const wR = Math.max(n.x, 0);
  const wL = Math.max(-n.x, 0);
  const wU = Math.max(n.y, 0);
  const wD = Math.max(-n.y, 0);
  const sum = wF + wB + wR + wL + wU + wD || 1;
  const factor = (0.75 * wF + 0.6 * wB + 0.85 * wR + 0.45 * wL + 0.7 * wU + 0.3 * wD) / sum;
  const toCool = (0.1 * wR + 0.15 * wU) / sum;
  let { r, g, b } = rgb;
  r *= factor;
  g *= factor;
  b *= factor;
  r += (cool.r - r) * toCool;
  g += (cool.g - g) * toCool;
  b += (cool.b - b) * toCool;
  r += (air.r - r) * 0.15;
  g += (air.g - g) * 0.15;
  b += (air.b - b) * 0.15;
  for (const lantern of lanternsOf(park)) {
    const w = Math.max(0, 1 - p.distanceTo(lantern) / park.lampR) ** 2;
    r += warm.r * LANTERN_WARMTH.amount * w;
    g += warm.g * LANTERN_WARMTH.amount * w;
    b += warm.b * LANTERN_WARMTH.amount * w;
  }
  const clamp = (v) => Math.min(Math.max(v, 0), 1);
  return new THREE.Color().setRGB(clamp(r), clamp(g), clamp(b), THREE.SRGBColorSpace);
};

// A TriangleSink (lib/lowPoly) that shades as it goes: builders pass day
// colours, the sink takes each face's normal and centre after its matrix
// stack (Contact-local) and stores nightShade's colour. Every geometry it
// builds carries position, color, aSway and aGlow, so all of them share the
// park-solid program.
const pa = new THREE.Vector3();
const pb = new THREE.Vector3();
const pc = new THREE.Vector3();
const normal = new THREE.Vector3();
const centre = new THREE.Vector3();
const edge = new THREE.Vector3();
const weightOf = (sway, i) => (Array.isArray(sway) ? sway[i] : sway);

export class ParkSink extends TriangleSink {
  constructor(park) {
    super(true);
    this.park = park;
    this.glow = [];
    this.stack = [];
  }

  // Places what follows: parent × matrix, until pop()
  push(matrix) {
    this.stack.push(this.matrix);
    this.matrix = this.matrix ? new THREE.Matrix4().multiplyMatrices(this.matrix, matrix) : matrix.clone();
  }

  pop() {
    this.matrix = this.stack.pop() ?? null;
  }

  // p: before the matrix; color: a THREE.Color
  vertex(p, color, swayWeight = 0, swayPhase = 0, glow = 0) {
    super.vertex(p, color, swayWeight, swayPhase);
    this.glow.push(glow);
  }

  // Counter-clockwise = front. opts: { color } (a ready THREE.Color, no
  // shading: lit glass, bulbs, eyes), glow (aGlow), sway (one weight or one
  // per corner), phase.
  tri(a, b, c, dayHex, opts = {}, corners = [0, 1, 2]) {
    const { glow = 0, sway = 0, phase = 0 } = opts;
    let { color } = opts;
    if (!color) {
      for (const [v, src] of [[pa, a], [pb, b], [pc, c]]) {
        v.copy(src);
        if (this.matrix) v.applyMatrix4(this.matrix);
      }
      normal.subVectors(pb, pa).cross(edge.subVectors(pc, pa)).normalize();
      centre.copy(pa).add(pb).add(pc).divideScalar(3);
      color = nightShade(dayHex, normal, centre, this.park);
    }
    this.vertex(a, color, weightOf(sway, corners[0]), phase, glow);
    this.vertex(b, color, weightOf(sway, corners[1]), phase, glow);
    this.vertex(c, color, weightOf(sway, corners[2]), phase, glow);
  }

  // a b c + a c d (sway: one weight or one per corner a, b, c, d)
  quad(a, b, c, d, dayHex, opts = {}) {
    this.tri(a, b, c, dayHex, opts, [0, 1, 2]);
    this.tri(a, c, d, dayHex, opts, [0, 2, 3]);
  }

  // A range for addUpdateRange on aGlow: mark() before adding, call the
  // result after, for [start, count] in vertices
  mark() {
    const start = this.glow.length;
    return () => [start, this.glow.length - start];
  }

  // The mesh goes at origin ([x, y, z], its content centre: the dissolve
  // melts the nearest origins first); the vertices are relative to it
  build(origin = [0, 0, 0]) {
    const geometry = super.build();
    geometry.translate(-origin[0], -origin[1], -origin[2]);
    geometry.setAttribute("aGlow", new THREE.Float32BufferAttribute(this.glow, 1));
    return { geometry, origin };
  }
}
