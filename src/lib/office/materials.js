import * as THREE from "three";
import { timeOfDay } from "../timeOfDay";
import { PALETTE } from "./bake";

// The office's three materials, created once per corner (the dissolve patch
// binds one section uniform per material, so the corners never share one;
// equal program keys share one GPU program). Only geometry rebuilds on a
// layout change; the materials and their programs survive it. Each sets its
// program key (the dissolve patch chains it) and wires the corner's
// uniforms in onBeforeCompile.

// Room ambient: the afterglow's warm white, then blue hour's light cool
const AFTERGLOW = new THREE.Color("#fff0e4");
const ROOM_BLUE = new THREE.Color("#d6d6e6");

const inject = (source, chunk, code) => source.replace(`#include <${chunk}>`, `$&\n${code}`);

const program = (material, key, hook) => {
  material.customProgramCacheKey = () => key;
  material.onBeforeCompile = hook;
  return material;
};

// Lace: flower rings on a 14-per-metre grid, fine vertical threads, a
// scalloped hem; the motif fades to its mean where it would alias
const LACE_FRAGMENT = `
vec2 p = vLace;
vec2 g = p * 14.;
float r = length(fract(g) - .5);
float ring = smoothstep(.36, .30, r) - smoothstep(.22, .16, r);
float thread = smoothstep(.7, 1., fract(p.x * 60.)) * .5;
float motif = max(ring, thread);
vec2 w = fwidth(g);
motif = mix(motif, .42, smoothstep(.35, .65, max(w.x, w.y)));
float hem = .06 + .03 * abs(sin(p.x * 40.));
float alpha = p.y < hem ? 0. : p.y < .13 ? .75 : .30 + .40 * motif;
diffuseColor.rgb *= uAmbient;
diffuseColor.a *= alpha;`;

export const createOfficeMaterials = () => {
  const uniforms = {
    uAmbient: { value: AFTERGLOW.clone() },
    uLamps: { value: 0 },
    uDaylight: { value: 1 },
    uTime: { value: 0 },
    uSway: { value: 0 },
  };

  // Shell and furniture: albedo × baked light × AO, times the room ambient,
  // plus the lamps' baked light times their level
  const baked = program(new THREE.MeshBasicMaterial({ vertexColors: true }), "office-baked", (shader) => {
    shader.uniforms.uAmbient = uniforms.uAmbient;
    shader.uniforms.uLamps = uniforms.uLamps;
    shader.vertexShader = `attribute vec3 aGlow;\nvarying vec3 vGlow;\n${inject(shader.vertexShader, "begin_vertex", "vGlow = aGlow;")}`;
    shader.fragmentShader = `uniform vec3 uAmbient;\nuniform float uLamps;\nvarying vec3 vGlow;\n${inject(
      shader.fragmentShader,
      "color_fragment",
      "diffuseColor.rgb = diffuseColor.rgb * uAmbient + vGlow * uLamps;",
    )}`;
  });

  // Lace curtains: see-through, both sides, the Skills panels sway a little
  const lace = program(
    new THREE.MeshBasicMaterial({
      color: PALETTE.lace,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true,
    }),
    "office-lace",
    (shader) => {
      shader.uniforms.uAmbient = uniforms.uAmbient;
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uSway = uniforms.uSway;
      shader.vertexShader = `attribute vec2 aLace;\nvarying vec2 vLace;\nuniform float uTime;\nuniform float uSway;\n${inject(
        shader.vertexShader,
        "begin_vertex",
        "vLace = aLace;\ntransformed.z += uSway * pow(max(1. - aLace.y / 2.08, 0.), 2.) * sin(uTime * .9 + aLace.x * 3.);",
      )}`;
      shader.fragmentShader = `uniform vec3 uAmbient;\nvarying vec2 vLace;\n${inject(shader.fragmentShader, "color_fragment", LACE_FRAGMENT)}`;
    },
  );

  // Glow decals: additive light, on the lamps' (0) or the daylight's (1)
  // channel; no fog, so the haze never tints added light
  const glow = program(
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
    "office-glow",
    (shader) => {
      shader.uniforms.uLamps = uniforms.uLamps;
      shader.uniforms.uDaylight = uniforms.uDaylight;
      shader.vertexShader = `attribute float aChannel;\nvarying float vChannel;\n${inject(shader.vertexShader, "begin_vertex", "vChannel = aChannel;")}`;
      shader.fragmentShader = `uniform float uLamps;\nuniform float uDaylight;\nvarying float vChannel;\n${inject(
        shader.fragmentShader,
        "opaque_fragment",
        "gl_FragColor.rgb *= mix(uLamps, uDaylight, vChannel);",
      )}`;
    },
  );

  return { baked, lace, glow, uniforms };
};

const ambient = new THREE.Color();
const EPSILON = 1e-3;

// The room's light from the time of day (keyed on its eased s, like the
// sky): ambient afterglow → blue hour from Skills to Projects, the lamps'
// level, the daylight on the floor. Writes a uniform only when it changes.
export const officeLight = ({ uniforms }) => {
  const { s, lamps } = timeOfDay;
  ambient.lerpColors(AFTERGLOW, ROOM_BLUE, THREE.MathUtils.clamp(s - 1, 0, 1));
  const { value } = uniforms.uAmbient;
  if (Math.abs(value.r - ambient.r) > EPSILON || Math.abs(value.g - ambient.g) > EPSILON || Math.abs(value.b - ambient.b) > EPSILON) {
    value.copy(ambient);
  }
  if (Math.abs(uniforms.uLamps.value - lamps) > EPSILON) uniforms.uLamps.value = lamps;
  const daylight = THREE.MathUtils.clamp(2 - s, 0, 1);
  if (Math.abs(uniforms.uDaylight.value - daylight) > EPSILON) uniforms.uDaylight.value = daylight;
};
