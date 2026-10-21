import * as THREE from "three";
import { createRandom } from "../../lib/lowPoly";
import { BENCH } from "../../lib/parkLayout";

// The lawn's small things, baked into the garden's mesh (ParkGarden: one
// draw, the park-solid program): the second bench (Park Bench.glb's own
// triangles) and a sleeping dog. Positions come from lib/parkLayout; colours
// are day colours, shaded for the night by the sink (nightShade).

const v = (x, y, z) => new THREE.Vector3(x, y, z);

// Unit balls as triangle lists: an icosahedron (the dog's chest, paws,
// snout and nose) and its detail-1 subdivision (its body and head)
const ICO_0 = new THREE.IcosahedronGeometry(1, 0).getAttribute("position").array;
const ICO_1 = new THREE.IcosahedronGeometry(1, 1).getAttribute("position").array;

// An ellipsoid of radii r = [x, y, z] at c from a unit ball's triangles; the
// corners shared by position jitter together (keeps it closed); sway(p): a
// corner's aSway weight (negative: the dog's breath), phase its aSway phase
const ball = (sink, ico, c, r, hex, { jitter = 0, random, sway, phase = 0 } = {}) => {
  const pushed = new Map();
  const corner = (i) => {
    const key = `${ico[i].toFixed(3)},${ico[i + 1].toFixed(3)},${ico[i + 2].toFixed(3)}`;
    if (!pushed.has(key)) pushed.set(key, 1 + (jitter ? (random() * 2 - 1) * jitter : 0));
    const k = pushed.get(key);
    return v(c.x + ico[i] * r[0] * k, c.y + ico[i + 1] * r[1] * k, c.z + ico[i + 2] * r[2] * k);
  };
  for (let i = 0; i < ico.length; i += 9) {
    const corners = [corner(i), corner(i + 3), corner(i + 6)];
    sink.tri(...corners, hex, { sway: sway ? corners.map(sway) : 0, phase });
  }
};

// The second bench: Park Bench.glb's meshes (geometry, day colour) placed
// at [x, z, yaw] at the first bench's scale
export const bench = (sink, parts, [x, z, yaw]) => {
  sink.push(new THREE.Matrix4().compose(v(x, 0, z), new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), yaw), v(BENCH.scale, BENCH.scale, BENCH.scale)));
  const [a, b, c] = [v(0, 0, 0), v(0, 0, 0), v(0, 0, 0)];
  for (const [geometry, color] of parts) {
    const position = geometry.getAttribute("position");
    const index = geometry.index;
    const count = index ? index.count : position.count;
    const at = (i) => (index ? index.getX(i) : i);
    for (let i = 0; i < count; i += 3) {
      a.fromBufferAttribute(position, at(i));
      b.fromBufferAttribute(position, at(i + 1));
      c.fromBufferAttribute(position, at(i + 2));
      sink.tri(a, b, c, color);
    }
  }
  sink.pop();
};

// The sleeping dog: a little ginger dog curled up, head on its paws, its
// tail round its nose; dog-local units, nose toward +x. Its back rises and
// falls (negative aSway weights: the park-solid shader's breath), frozen
// under reduced motion with the park's clock.
const DOG = {
  scale: 1.15,
  coat: "#d0915a",
  cream: "#f0dcc0",
  ear: "#b06f3e",
  nose: "#2a2220",
  breath: [0.04, 0.24], // y over which the weight rises 0 → 1
  // The tail: [x, y, z, radius] from the rump round the front
  tail: [[-0.25, 0.11, 0.0, 0.05], [-0.22, 0.09, 0.11, 0.055], [-0.12, 0.07, 0.19, 0.05], [0.0, 0.06, 0.22, 0.042], [0.1, 0.055, 0.2, 0.032]],
};
export const dog = (sink, [x, z, yaw]) => {
  sink.push(new THREE.Matrix4().compose(v(x, 0, z), new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), yaw), v(DOG.scale, DOG.scale, DOG.scale)));
  const random = createRandom(5);
  const [lo, hi] = DOG.breath;
  const breathe = (k) => (p) => -k * THREE.MathUtils.clamp((p.y - lo) / (hi - lo), 0, 1);
  const soft = { jitter: 0.06, random };
  // Body and haunch, then the cream chest
  ball(sink, ICO_1, v(-0.02, 0.1, 0), [0.23, 0.1, 0.16], DOG.coat, { ...soft, sway: breathe(1) });
  ball(sink, ICO_1, v(-0.12, 0.12, -0.05), [0.13, 0.11, 0.12], DOG.coat, { ...soft, sway: breathe(1) });
  ball(sink, ICO_0, v(0.12, 0.07, 0.07), [0.1, 0.06, 0.09], DOG.cream, { sway: breathe(0.6) });
  // Front paws, the head resting on them, the snout and nose
  ball(sink, ICO_0, v(0.25, 0.025, 0.04), [0.06, 0.025, 0.035], DOG.cream);
  ball(sink, ICO_0, v(0.26, 0.025, 0.12), [0.06, 0.025, 0.035], DOG.cream);
  ball(sink, ICO_1, v(0.2, 0.1, 0.1), [0.095, 0.075, 0.085], DOG.coat, { ...soft, sway: breathe(0.4) });
  ball(sink, ICO_0, v(0.29, 0.075, 0.14), [0.06, 0.04, 0.045], DOG.cream);
  ball(sink, ICO_0, v(0.345, 0.085, 0.16), [0.017, 0.015, 0.015], DOG.nose);
  // Pointed ears, and a closed eye on the visible side
  sink.tri(v(0.15, 0.16, 0.05), v(0.2, 0.17, 0.08), v(0.15, 0.24, 0.06), DOG.ear);
  sink.tri(v(0.19, 0.16, 0.14), v(0.24, 0.15, 0.17), v(0.2, 0.23, 0.16), DOG.ear);
  sink.quad(v(0.24, 0.125, 0.18), v(0.28, 0.12, 0.17), v(0.28, 0.128, 0.171), v(0.24, 0.133, 0.181), null, { color: new THREE.Color(DOG.nose) });
  // The bushy tail round the front, thinning to a cream tip
  tube(sink, DOG.tail, DOG.coat, DOG.cream);
  sink.pop();
};

// A tube through points [x, y, z, r] (five sides), closed by a point past
// the last; its last segment and tip take tipHex
const tube = (sink, points, hex, tipHex) => {
  const sides = 5;
  const up = v(0, 1, 0);
  const rings = points.map(([x, y, z, r], i) => {
    const [a, b] = [points[Math.max(i - 1, 0)], points[Math.min(i + 1, points.length - 1)]];
    const t = v(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    const n = new THREE.Vector3().crossVectors(up, t).normalize();
    const m = new THREE.Vector3().crossVectors(t, n);
    return Array.from({ length: sides }, (_, k) => {
      const angle = (k / sides) * 2 * Math.PI;
      return v(x, y, z).addScaledVector(n, r * Math.cos(angle)).addScaledVector(m, r * Math.sin(angle));
    });
  });
  for (let i = 1; i < rings.length; i++) {
    const segmentHex = i === rings.length - 1 ? tipHex : hex;
    for (let k = 0; k < sides; k++) {
      const j = (k + 1) % sides;
      sink.quad(rings[i - 1][k], rings[i - 1][j], rings[i][j], rings[i][k], segmentHex);
    }
  }
  const [lx, ly, lz] = points[points.length - 1];
  const [px, py, pz] = points[points.length - 2];
  const tip = v(lx + (lx - px) * 0.6, ly + (ly - py) * 0.6, lz + (lz - pz) * 0.6);
  const last = rings[rings.length - 1];
  for (let k = 0; k < sides; k++) sink.tri(last[k], last[(k + 1) % sides], tip, tipHex);
};
