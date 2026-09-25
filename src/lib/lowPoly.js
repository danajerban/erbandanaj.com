import * as THREE from "three";

// Shared by the procedural low-poly props (PalmTree, BeachDecor).

// mulberry32 — deterministic, tiny
export const createRandom = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Non-indexed triangle sink: flat shading takes its normals from screen-space
// derivatives, so no shared normals are needed, and unshared vertices keep
// every bark band and leaflet color crisp. `sway` adds a vec2 (weight, phase)
// attribute a swaying material's vertex shader bends by. Several props can
// share one sink (one draw call): set `matrix` to place each one, and
// `swayScale` to scale its sway weights (a smaller prop sways less).
const scratch = new THREE.Vector3();

export class TriangleSink {
  constructor(withSway) {
    this.position = [];
    this.color = [];
    this.sway = withSway ? [] : null;
    this.matrix = null;
    this.swayScale = 1;
  }

  vertex(p, c, weight = 0, phase = 0) {
    const v = this.matrix ? scratch.copy(p).applyMatrix4(this.matrix) : p;
    this.position.push(v.x, v.y, v.z);
    this.color.push(c.r, c.g, c.b);
    if (this.sway) this.sway.push(weight * this.swayScale, phase);
  }

  tri(a, b, c, ca, cb, cc, weights, phase) {
    this.vertex(a, ca, weights?.[0], phase);
    this.vertex(b, cb, weights?.[1], phase);
    this.vertex(c, cc, weights?.[2], phase);
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.position, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.color, 3));
    if (this.sway) geometry.setAttribute("aSway", new THREE.Float32BufferAttribute(this.sway, 2));
    geometry.computeBoundingSphere();
    return geometry;
  }
}
