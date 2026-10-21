import * as THREE from "three";
import { BENCH } from "../../lib/parkLayout";

// The lawn's small things, baked into the garden's mesh (ParkGarden: one
// draw, the park-solid program): the second bench (Park Bench.glb's own
// triangles). Positions come from lib/parkLayout; colours are day colours,
// shaded for the night by the sink (nightShade).

const v = (x, y, z) => new THREE.Vector3(x, y, z);

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
