// GPU pre-warm for scene content while it is still hidden: compile the shader
// programs off the main thread (KHR_parallel_shader_compile) and upload the
// textures, so a section's first visible frame does neither. What this cannot
// cover is per-draw GPU state (ANGLE/Metal builds its pipeline state objects
// at the first draw call, not at link time) and geometry buffers — sections
// handle those with one hidden draw (see SectionGroup).

import { Color, Group, Mesh, MeshDepthMaterial, PlaneGeometry, ShaderMaterial, WebGLRenderTarget } from "three";
import { HorizontalBlurShader, VerticalBlurShader } from "three-stdlib";

const pending = new Map();

const initTextures = (gl, object) => {
  object.traverse((o) => {
    const materials = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value?.isTexture && !value.isRenderTargetTexture) gl.initTexture(value);
      }
    }
  });
};

// Upper bound on a pre-warm: a GPU driver that never reports its programs
// ready must not leave the loop stopped behind the splash failsafe, or a
// section hidden forever. A failed compile is logged and treated the same —
// the content still renders, it just compiles on its first visible frame.
const WARM_TIMEOUT_MS = 10000;

// Never rejects; resolves after success, failure, or the bound.
const bounded = (work, label) => {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = window.setTimeout(() => {
      console.warn(`${label} pre-warm timed out after ${WARM_TIMEOUT_MS} ms`);
      resolve();
    }, WARM_TIMEOUT_MS);
  });
  return Promise.race([work, timeout])
    .catch((error) => console.error(`${label} pre-warm failed:`, error))
    .finally(() => window.clearTimeout(timer));
};

// `targetScene` supplies the fog and environment, so the programs compiled here
// are the ones the real render uses.
export const prewarm = (gl, object, camera, targetScene, label = "Scene") =>
  bounded(gl.compileAsync(object, camera, targetScene).then(() => initTextures(gl, object)), label);

// drei's ContactShadows draws the scene through its own depth material and
// blurs the result with two shader passes. Those programs are not in the scene
// graph, so compileAsync never sees them, and the first frame used to link
// them on the main thread (about 1.4 s on a cold phone GPU). Their GLSL is
// compiled here in parallel with the scene's instead: the blurs with the same
// shaders and the same (light-free) state, so drei's passes reuse these very
// programs; the depth pass through a stand-in that writes the same GLSL —
// drei's material is private, so three gives it programs of its own, but the
// GPU's shader cache hands back the compiled code, and the stand-in's programs
// are released once that is done. The two strings are drei 10.7.8's
// ContactShadows edits, verbatim; if they drift, the prewarm only stops
// helping. Never rejects; resolves within WARM_TIMEOUT_MS.
const SHADOW_DEPTH_UNIFORM = `uniform vec3 ucolor;
           void main() {
          `;
const SHADOW_DEPTH_COLOR = "vec4( ucolor * fragCoordZ * 2.0, ( 1.0 - fragCoordZ ) * 1.0 );";

export const prewarmContactShadows = (gl, scene, camera) => {
  const depth = new MeshDepthMaterial();
  depth.onBeforeCompile = (shader) => {
    shader.uniforms = { ...shader.uniforms, ucolor: { value: new Color() } };
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", SHADOW_DEPTH_UNIFORM)
      .replace("vec4( vec3( 1.0 - fragCoordZ ), opacity );", SHADOW_DEPTH_COLOR);
  };
  const plane = new PlaneGeometry();
  const blurs = new Group().add(
    new Mesh(plane, new ShaderMaterial(HorizontalBlurShader)),
    new Mesh(plane, new ShaderMaterial(VerticalBlurShader)),
  );
  // drei renders every pass into a render target (no tone mapping, linear
  // output), so the programs are compiled for one too
  const target = new WebGLRenderTarget(1, 1);
  const previousTarget = gl.getRenderTarget();
  // Every object drei's depth pass draws takes the stand-in for the compile:
  // compile() picks each object's program variant (skinning, morphs) from it
  const swapped = [];
  scene.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.material) return;
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    if (materials.every((m) => m.allowOverride !== false)) {
      swapped.push([o, o.material]);
      o.material = depth;
    }
  });
  gl.setRenderTarget(target);
  let work;
  try {
    work = Promise.all([gl.compileAsync(scene, camera, scene), gl.compileAsync(blurs, camera, blurs)]);
  } catch (error) {
    work = Promise.reject(error);
  } finally {
    for (const [o, material] of swapped) o.material = material;
    gl.setRenderTarget(previousTarget);
  }
  return bounded(work, "Contact shadows").finally(() => {
    depth.dispose();
    target.dispose();
  });
};

export const prewarmSection = (name, gl, object, camera, scene) => {
  const promise = prewarm(gl, object, camera, scene, `Section ${name}`);
  pending.set(name, promise);
  return promise;
};

// Resolves once every section mounted so far has finished compiling.
export const whenSectionsWarm = () => Promise.all([...pending.values()]);
