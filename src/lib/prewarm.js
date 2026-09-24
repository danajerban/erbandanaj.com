// GPU pre-warm for scene content while it is still hidden: compile the shader
// programs off the main thread (KHR_parallel_shader_compile) and upload the
// textures, so a section's first visible frame does neither. What this cannot
// cover is per-draw GPU state (ANGLE/Metal builds its pipeline state objects
// at the first draw call, not at link time) and geometry buffers — sections
// handle those with one hidden draw (see SectionGroup).

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

// `targetScene` supplies the fog and environment, so the programs compiled here
// are the ones the real render uses. Never rejects; resolves after success,
// failure, or the bound.
export const prewarm = (gl, object, camera, targetScene, label = "Scene") => {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = window.setTimeout(() => {
      console.warn(`${label} pre-warm timed out after ${WARM_TIMEOUT_MS} ms`);
      resolve();
    }, WARM_TIMEOUT_MS);
  });
  const compile = gl.compileAsync(object, camera, targetScene).then(() => initTextures(gl, object));
  return Promise.race([compile, timeout])
    .catch((error) => console.error(`${label} pre-warm failed:`, error))
    .finally(() => window.clearTimeout(timer));
};

export const prewarmSection = (name, gl, object, camera, scene) => {
  const promise = prewarm(gl, object, camera, scene, `Section ${name}`);
  pending.set(name, promise);
  return promise;
};

// Resolves once every section mounted so far has finished compiling.
export const whenSectionsWarm = () => Promise.all([...pending.values()]);
