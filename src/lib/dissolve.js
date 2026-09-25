import { Vector3 } from "three";

// The scene transition of the sections that dissolve instead of dropping
// (SectionGroup): like the sea leaving Home, a section melts into the horizon
// haze while the visitor scrolls away from it, nearest parts first, and comes
// back out of it, far parts first, on the way in.
//
// A patch on the shaders of each of its materials, driven by one uniform per
// section: x its progress (0 whole, 1 gone), y and z the view depth of its
// nearest and furthest meshes (measured only while it changes). Each mesh
// runs ahead of the section the nearer it lies, by up to half the
// transition, turns toward the haze (the fog color, the CSS horizon) and
// then goes: an opaque surface is thinned out against a fixed dither pattern
// (interleaved gradient noise), so it stays opaque and keeps writing depth,
// with nothing to sort; a transparent one fades its alpha. The fragment
// shader's part sits behind one uniform branch, so a section at rest pays
// next to nothing. Patched before the section's pre-warm, so the patched
// programs are the ones compiled and warm-drawn, never switched later. The
// patch needs only the material: if the discard ever costs phones at rest, a
// patched copy of each material can be pre-warmed alongside and swapped in
// for the transition.

const sections = new Map();

// One per section, kept by name, so a remount drives the programs already
// compiled against it: the shader uniform (value), and the patched meshes
// with the view depth of their origins
export const dissolveUniform = (name) => {
  if (!sections.has(name)) sections.set(name, { value: new Vector3(0, 0, 1), meshes: [] });
  return sections.get(name);
};

// Both shaders: the section's uniform, and the mesh's own progress
const DECLARE = "uniform vec3 uDissolve;\nvarying float vDissolve;\n";
// The mesh's own progress runs 0 → 1 while the section's runs from half its
// nearness (0 nearest, 1 furthest) to that plus a half: it turns to the haze
// over the first half of its way and thins out over the second, so only
// haze-colored pixels drop. Per mesh (the view depth of its origin), not per
// pixel: nearer surfaces going first would show a mesh's far side through its
// thinning near side.
const VERTEX = `
vDissolve=clamp(2.*uDissolve.x-clamp((-modelViewMatrix[3].z-uDissolve.y)/(uDissolve.z-uDissolve.y),0.,1.),0.,1.);`;
// Fragment, early (before the lighting): the dither
const EARLY = `
#ifdef OPAQUE
if(uDissolve.x>0.&&2.*vDissolve-1.>fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715)))))discard;
#endif`;
// Fragment, late (after the fog): the haze, and the alpha of a transparent
// surface
const LATE = `
if(uDissolve.x>0.){
#ifdef USE_FOG
gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,.9*min(2.*vDissolve,1.));
#endif
#ifndef OPAQUE
gl_FragColor.a*=min(2.-2.*vDissolve,1.);
#endif
}`;
const inject = (source, chunk, code) => source.replace(`#include <${chunk}>`, `$&${code}`);

const patched = new WeakSet();

// Chains the material's own hook (the palms' sway, the titles' sand, drei's
// distort material) and extends its program key, read before the hook is
// replaced (the default key is the hook's source). A hot update of this
// module wraps a patched material again: the code goes in once, and the
// outermost wrapper binds its uniform.
const patch = (material, uniform) => {
  if (patched.has(material)) return;
  patched.add(material);
  const compile = material.onBeforeCompile;
  const key = `${material.customProgramCacheKey()}|dissolve`;
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.uDissolve = uniform;
    if (shader.vertexShader.includes("uDissolve")) return;
    shader.vertexShader = DECLARE + inject(shader.vertexShader, "project_vertex", VERTEX);
    shader.fragmentShader = DECLARE + inject(inject(shader.fragmentShader, "alphahash_fragment", EARLY), "fog_fragment", LATE);
  };
  material.customProgramCacheKey = () => key;
};

// The contact shadows are drawn with their own depth material, out of the
// patch's reach. Their camera looks up from the floor and prints a surface
// fainter the higher it is, nothing past its far plane: for that pass only,
// a dissolving mesh rises by its own progress (as in the shader) times that
// distance, so its shadow fades with it. ContactShadows' `far` in
// Experience.jsx (drei's default, 10) — keep them together.
const SHADOW_FAR = 10;

// Patches a section's meshes on the default layer (the island's own shader
// parts sit on layers 1–5 and keep their own fades)
export const applyDissolve = (group, uniform) => {
  uniform.meshes = [];
  group.traverse((o) => {
    if (!o.isMesh || !o.layers.isEnabled(0)) return;
    const mesh = { o, depth: 0 };
    uniform.meshes.push(mesh);
    const lift = (sign) => (renderer, scene, camera) => {
      const { x, y, z } = uniform.value;
      if (camera.isOrthographicCamera) o.matrixWorld.elements[13] += sign * SHADOW_FAR * Math.min(Math.max(2 * x - (mesh.depth - y) / (z - y), 0), 1);
    };
    o.onBeforeRender = lift(1);
    o.onAfterRender = lift(-1);
    for (const material of [o.material].flat()) patch(material, uniform);
  });
};

const origin = new Vector3();

// Each frame while the section is partly dissolved: the view depth of its
// meshes' origins, as the shader measures them, as it moves
export const measureDissolve = (uniform, group, camera) => {
  const { value, meshes } = uniform;
  group.updateWorldMatrix(true, true);
  value.y = Infinity;
  value.z = -Infinity;
  for (const mesh of meshes) {
    mesh.depth = -origin.setFromMatrixPosition(mesh.o.matrixWorld).applyMatrix4(camera.matrixWorldInverse).z;
    value.y = Math.min(value.y, mesh.depth);
    value.z = Math.max(value.z, mesh.depth + 0.01);
  }
};
