import * as THREE from "three";
import { TriangleSink } from "../lowPoly";
import { lampLight, lit } from "./bake";

// The office's triangle sinks: non-indexed, flat. Every point goes through
// the sink's matrix stack into the room frame first. Builders wind each
// triangle counter-clockwise seen from its visible side (the baked material
// culls back faces).

// A matrix stack: each push multiplies onto the current top
class MatrixStack {
  constructor() {
    this.items = [new THREE.Matrix4()];
  }

  get top() {
    return this.items[this.items.length - 1];
  }

  push(matrix) {
    this.items.push(this.top.clone().multiply(matrix));
  }

  pop() {
    if (this.items.length > 1) this.items.pop();
  }
}

const pa = new THREE.Vector3();
const pb = new THREE.Vector3();
const pc = new THREE.Vector3();
const ab = new THREE.Vector3();
const ac = new THREE.Vector3();
const normal = new THREE.Vector3();
const color = new THREE.Color();
const glow = new THREE.Color();

const pick = (value, i) => (Array.isArray(value) ? value[i] : value);
const select = (value, ...indices) => (Array.isArray(value) ? indices.map((i) => value[i]) : value);

// Solid surfaces (shell, furniture): the sink computes the light. Each
// vertex gets color = albedo × lit(n, ao, key) and aGlow = the corner's lamps
// on it (+ emissive), which the material scales by the lamps' level.
// lights = [{ p, color, R, w, cone?, front? }] in the room frame; key = the
// corner's KEY (bake.js).
export class OfficeSink extends TriangleSink {
  constructor(lights, key) {
    super(false);
    this.lights = lights;
    this.key = key;
    this.glow = [];
    this.stack = new MatrixStack();
  }

  push(matrix) {
    this.stack.push(matrix);
    return this;
  }

  pop() {
    this.stack.pop();
    return this;
  }

  // albedo: a linear THREE.Color or one per vertex; ao: a number or one per
  // vertex; emissive: a linear Color (× intensity) added to aGlow
  tri(a, b, c, albedo, { ao = 1, emissive } = {}) {
    const { top } = this.stack;
    pa.copy(a).applyMatrix4(top);
    pb.copy(b).applyMatrix4(top);
    pc.copy(c).applyMatrix4(top);
    normal.crossVectors(ab.subVectors(pb, pa), ac.subVectors(pc, pa));
    const length = normal.length();
    // Zero area draws nothing
    if (length < 1e-12) return this;
    normal.divideScalar(length);
    [pa, pb, pc].forEach((p, i) => {
      const base = pick(albedo, i);
      color.copy(base).multiplyScalar(lit(normal, pick(ao, i), this.key));
      glow.setRGB(0, 0, 0);
      for (const light of this.lights) lampLight(p, normal, base, light, glow);
      if (emissive) glow.add(emissive);
      this.vertex(p, color);
      this.glow.push(glow.r, glow.g, glow.b);
    });
    return this;
  }

  // Two triangles, a b c and a c d; per-vertex albedo and ao arrays hold 4
  quad(a, b, c, d, albedo, opts = {}) {
    const ao = opts.ao ?? 1;
    this.tri(a, b, c, select(albedo, 0, 1, 2), { ...opts, ao: select(ao, 0, 1, 2) });
    this.tri(a, c, d, select(albedo, 0, 2, 3), { ...opts, ao: select(ao, 0, 2, 3) });
    return this;
  }

  // Vertices so far
  mark() {
    return this.position.length / 3;
  }

  // The geometry, translated by −origin (the mesh sits at origin)
  build(origin = [0, 0, 0]) {
    const geometry = super.build();
    geometry.setAttribute("aGlow", new THREE.Float32BufferAttribute(this.glow, 3));
    geometry.translate(-origin[0], -origin[1], -origin[2]);
    return geometry;
  }
}

// Additive glow decals: colour per vertex (linear × intensity, rim black)
// and a channel the material scales by (0 lamps, 1 daylight)
export class GlowSink extends TriangleSink {
  constructor() {
    super(false);
    this.channel = [];
    this.stack = new MatrixStack();
    this.isGlowSink = true;
  }

  push(matrix) {
    this.stack.push(matrix);
    return this;
  }

  pop() {
    this.stack.pop();
    return this;
  }

  tri(a, b, c, ca, cb, cc, channel = 0) {
    const { top } = this.stack;
    this.vertex(pa.copy(a).applyMatrix4(top), ca);
    this.vertex(pb.copy(b).applyMatrix4(top), cb);
    this.vertex(pc.copy(c).applyMatrix4(top), cc);
    this.channel.push(channel, channel, channel);
    return this;
  }

  mark() {
    return this.position.length / 3;
  }

  build(origin = [0, 0, 0]) {
    const geometry = super.build();
    geometry.setAttribute("aChannel", new THREE.Float32BufferAttribute(this.channel, 1));
    geometry.translate(-origin[0], -origin[1], -origin[2]);
    return geometry;
  }
}

// Lace curtains: position and aLace = (u, h): u the distance along the
// panel, h the height above the floor, both in metres in the room frame
// (taken before any origin offset), which the lace shader draws its motif
// and sway from
export class LaceSink {
  constructor() {
    this.position = [];
    this.lace = [];
  }

  vertex(p, u, h) {
    this.position.push(p.x, p.y, p.z);
    this.lace.push(u, h);
    return this;
  }

  mark() {
    return this.position.length / 3;
  }

  build(origin = [0, 0, 0]) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.position, 3));
    geometry.setAttribute("aLace", new THREE.Float32BufferAttribute(this.lace, 2));
    geometry.translate(-origin[0], -origin[1], -origin[2]);
    geometry.computeBoundingSphere();
    return geometry;
  }
}
