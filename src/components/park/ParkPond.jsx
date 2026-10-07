import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useMobile } from "../../contexts/MobileContext";
import { createRandom } from "../../lib/lowPoly";
import { LANTERN_Y } from "../../lib/parkLayout";
import { PARK_LAYER, ParkSink, parkSolidMaterial, parkUniforms } from "../../lib/parkMaterials";
import { timeOfDay } from "../../lib/timeOfDay";

// The pond under the moon: dark water whose shader draws the moon's silver
// streak (a broken column at the moon's screen x), the pond lamp's warm one
// beside it, a rim glint and the ripples round the ducks; rim stones, lily
// pads, a water lily and two reed clumps (one park-solid mesh); and a mother
// duck with two ducklings paddling an ellipse through the streak (three
// park-solid meshes). Time of day is read per frame, never as state.

const WATER = {
  deep: new THREE.Color("#0f1a30"),
  edge: new THREE.Color("#1c2a47"),
  rim: new THREE.Color("#33415f"),
  moon: new THREE.Color("#dfe4fa"),
  lamp: new THREE.Color("#ffc074"),
  ripple: new THREE.Color("#3b4c72"),
};
const WATER_Y = 0.01;
const WATER_SEGMENTS = 48;
const WATER_RINGS = 4;

// One pond at a time: its uniforms live with its material
const waterUniforms = {
  uTime: parkUniforms.uTime,
  uLamps: parkUniforms.uLamps,
  uMoon: { value: 0 },
  uMoonX: { value: -1e4 },
  uLampX: { value: -1e4 },
  uLampOn: { value: 0 },
  uDpr: { value: 1 },
  // Its centre (Contact-local x, z) and radii
  uPond: { value: new THREE.Vector4(0, 0, 1, 1) },
  // Each duck: pond-local x, z and its ripples' phase
  uDucks: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
  uDeep: { value: WATER.deep },
  uEdge: { value: WATER.edge },
  uRim: { value: WATER.rim },
  uMoonColor: { value: WATER.moon },
  uLampColor: { value: WATER.lamp },
  uRippleColor: { value: WATER.ripple },
};

// After color_fragment (three r186): the water replaces the flat colour.
// r: the elliptical radius (0 centre, 1 rim); the streaks are columns in
// device pixels, wider toward the near rim, broken into dashes that drift.
const WATER_FRAGMENT = `
vec2 q = vPond / uPond.zw;
float r = length(q);
vec3 water = mix(uDeep, uEdge, r * r) + smoothstep(0.9, 1.0, r) * uRim;
vec2 place = uPond.xy + vPond;
float dash = step(0.35, fract(place.y * 9.0 + 0.6 * sin(place.x * 7.0 + uTime * 1.3)));
float streakW = (6.0 + 12.0 * clamp(0.5 + 0.5 * q.y, 0.0, 1.0)) * uDpr;
float moonX = (gl_FragCoord.x - uMoonX) / streakW;
water += uMoonColor * 0.9 * uMoon * exp(-moonX * moonX) * dash;
float lampX = (gl_FragCoord.x - uLampX) / (0.7 * streakW);
water += uLampColor * 0.7 * uLamps * uLampOn * exp(-lampX * lampX) * dash;
for (int i = 0; i < 3; i++) {
  float d = distance(vPond, uDucks[i].xy);
  float ring = smoothstep(0.0, 0.06, abs(fract(d * 6.0 - uTime * 0.8 + uDucks[i].z) - 0.5) - 0.44);
  water += uRippleColor * 0.6 * ring * exp(-d * 4.0);
}
diffuseColor.rgb = water;`;

const waterMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
waterMaterial.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, waterUniforms);
  shader.vertexShader = `varying vec2 vPond;\n${shader.vertexShader.replace(
    "#include <begin_vertex>",
    "$&\nvPond = transformed.xz;",
  )}`;
  shader.fragmentShader = `uniform float uTime, uLamps, uMoon, uMoonX, uLampX, uLampOn, uDpr;
uniform vec4 uPond;
uniform vec3 uDucks[3];
uniform vec3 uDeep, uEdge, uRim, uMoonColor, uLampColor, uRippleColor;
varying vec2 vPond;
${shader.fragmentShader.replace("#include <color_fragment>", `$&${WATER_FRAGMENT}`)}`;
};
// Before the dissolve patch chains the hook (it reads the key first)
waterMaterial.customProgramCacheKey = () => "park-pond";

// The water: an ellipse of rings round its centre, facing up
const buildWater = ({ rx, rz }) => {
  const position = [0, 0, 0];
  for (let k = 1; k <= WATER_RINGS; k++) {
    for (let i = 0; i < WATER_SEGMENTS; i++) {
      const a = (i / WATER_SEGMENTS) * 2 * Math.PI;
      position.push((k / WATER_RINGS) * rx * Math.cos(a), 0, (k / WATER_RINGS) * rz * Math.sin(a));
    }
  }
  const index = [];
  const at = (k, i) => (k === 0 ? 0 : 1 + (k - 1) * WATER_SEGMENTS + (i % WATER_SEGMENTS));
  for (let i = 0; i < WATER_SEGMENTS; i++) {
    index.push(0, at(1, i + 1), at(1, i));
    for (let k = 2; k <= WATER_RINGS; k++) {
      index.push(at(k - 1, i), at(k, i + 1), at(k, i), at(k - 1, i), at(k - 1, i + 1), at(k, i + 1));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
};

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const scratch = new THREE.Vector3();
const toCentre = new THREE.Vector3();
const faceNormal = new THREE.Vector3();
// A triangle wound to face away from centre (so the sink shades its outside)
const outward = (sink, a, b, c, centre, hex, opts) => {
  faceNormal.subVectors(b, a).cross(scratch.subVectors(c, a));
  toCentre.copy(a).add(b).add(c).divideScalar(3).sub(centre);
  if (faceNormal.dot(toCentre) >= 0) sink.tri(a, b, c, hex, opts);
  else sink.tri(a, c, b, hex, opts);
};

const ICOSAHEDRON = new THREE.IcosahedronGeometry(1, 0).getAttribute("position");
// A unit icosahedron's faces (the rim stones, the ducks' heads), placed by
// the sink's matrix
const icosahedron = (sink, hex, opts) => {
  for (let i = 0; i < ICOSAHEDRON.count; i += 3) {
    sink.tri(
      v(ICOSAHEDRON.getX(i), ICOSAHEDRON.getY(i), ICOSAHEDRON.getZ(i)),
      v(ICOSAHEDRON.getX(i + 1), ICOSAHEDRON.getY(i + 1), ICOSAHEDRON.getZ(i + 1)),
      v(ICOSAHEDRON.getX(i + 2), ICOSAHEDRON.getY(i + 2), ICOSAHEDRON.getZ(i + 2)),
      hex,
      opts,
    );
  }
};

// Pond solids, pond-local: [radius fraction, angle, pad radius] (angles:
// +π/2 is the near rim); the lily sits on the first pad
const STONES = { min: 0.12, max: 0.2, height: 0.5, out: 0.03, light: "#837f8c", dark: "#6b6876" };
const PADS = [[0.8, 2.45, 0.14], [0.82, 3.05, 0.11], [0.76, 4.35, 0.13], [0.8, 5.5, 0.12]];
const PAD = { color: "#2f5a3e", segments: 12, y: 0.012 };
const LILY = { petals: 6, petal: "#f2ece0", heart: new THREE.Color("#ffe9a8"), r: 0.06, y: 0.045 };
const REEDS = { at: [4.15, 4.95], blades: 7, color: "#2e4a3a", width: 0.035, height: [0.35, 0.6] };

const buildSolids = (park) => {
  const { x, z, rx, rz } = park.pond;
  const random = createRandom(11);
  const sink = new ParkSink(park);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const stone = new THREE.Color();
  const light = new THREE.Color(STONES.light);
  const dark = new THREE.Color(STONES.dark);
  const up = v(0, 1, 0);
  sink.push(matrix.makeTranslation(x, 0, z));
  // Rim stones, squashed and turned, round the water's edge
  for (let i = 0; i < park.rimStones; i++) {
    const a = ((i + 0.3 * random()) / park.rimStones) * 2 * Math.PI;
    const w = STONES.min + (STONES.max - STONES.min) * random();
    stone.lerpColors(dark, light, random());
    sink.push(
      new THREE.Matrix4().compose(
        v((rx + STONES.out) * Math.cos(a), 0.015, (rz + STONES.out) * Math.sin(a)),
        quaternion.setFromAxisAngle(up, random() * Math.PI),
        v(w / 2, (w / 2) * STONES.height, (w / 2) * (0.75 + 0.4 * random())),
      ),
    );
    icosahedron(sink, `#${stone.getHexString(THREE.SRGBColorSpace)}`);
    sink.pop();
  }
  // Lily pads: discs with a notch
  for (const [f, a, r] of PADS) {
    const c = v(f * rx * Math.cos(a), PAD.y, f * rz * Math.sin(a));
    const notch = a + 1;
    const rim = (k) => {
      const t = notch + (k / PAD.segments) * 2 * Math.PI;
      return v(c.x + r * Math.cos(t), PAD.y, c.z + r * Math.sin(t));
    };
    for (let k = 1; k < PAD.segments; k++) sink.tri(c, rim(k + 1), rim(k), PAD.color);
  }
  // A water lily on the first pad: petals round a glowing heart
  const [lf, la] = PADS[0];
  const heart = v(lf * rx * Math.cos(la), LILY.y, lf * rz * Math.sin(la));
  for (let k = 0; k < LILY.petals; k++) {
    const t = (k / LILY.petals) * 2 * Math.PI;
    const tip = v(heart.x + LILY.r * Math.cos(t), PAD.y + 0.02, heart.z + LILY.r * Math.sin(t));
    const side = (s) => v(heart.x + 0.4 * LILY.r * Math.cos(t + s), PAD.y + 0.01, heart.z + 0.4 * LILY.r * Math.sin(t + s));
    outward(sink, side(0.7), tip, side(-0.7), v(heart.x, PAD.y - 1, heart.z), LILY.petal);
    outward(sink, side(0.7), heart, tip, v(heart.x, PAD.y - 1, heart.z), LILY.petal);
    outward(sink, side(-0.7), tip, heart, v(heart.x, PAD.y - 1, heart.z), LILY.petal);
  }
  const heartOpts = { color: LILY.heart, glow: 0.5 };
  for (let k = 0; k < 3; k++) {
    const t = (k / 3) * 2 * Math.PI;
    const p = (s) => v(heart.x + 0.018 * Math.cos(t + s), LILY.y - 0.01, heart.z + 0.018 * Math.sin(t + s));
    sink.tri(p(0), p(2.1), v(heart.x, LILY.y + 0.008, heart.z), null, heartOpts);
  }
  // Reeds at the back rim, swaying at the tips
  for (const a of REEDS.at) {
    const base = v(rx * Math.cos(a), 0, rz * Math.sin(a));
    for (let k = 0; k < REEDS.blades; k++) {
      const h = REEDS.height[0] + (REEDS.height[1] - REEDS.height[0]) * random();
      const lean = (random() - 0.5) * 0.5;
      const yaw = (random() - 0.5) * 0.8;
      const bx = base.x + (random() - 0.5) * 0.25;
      const bz = base.z + (random() - 0.5) * 0.12;
      const dx = Math.cos(yaw) * REEDS.width;
      const dz = -Math.sin(yaw) * REEDS.width;
      sink.tri(
        v(bx - dx / 2, 0, bz - dz / 2),
        v(bx + dx / 2, 0, bz + dz / 2),
        v(bx + lean * h, h, bz),
        REEDS.color,
        { sway: [0, 0, 0.6 + 0.4 * random()], phase: random() * 6.28 },
      );
    }
  }
  sink.pop();
  return sink.build([x, 0, z]);
};

// The ducks, duck-local (facing +z, the water line at y 0): a squashed
// low-poly body with an up-tick tail, an icosahedron head, a flat beak and
// two eye dots. Shaded once at the pond's centre (they turn as they swim).
const MOTHER = { body: "#ece6d8", beak: "#e08b3c" };
const DUCKLING = { body: "#ecca5c", beak: "#d9803a" };
const EYE = { color: new THREE.Color("#111111") };
const DUCKLING_SCALE = 0.6;
const BODY = { half: 0.17, width: 0.08, height: 0.08, y: 0.04, around: 8, rings: 5 };
const HEAD = { r: 0.075, at: [0, 0.15, 0.12] };

const buildDuck = (park, size, { body, beak }) => {
  const sink = new ParkSink(park);
  const { x, z } = park.pond;
  sink.push(new THREE.Matrix4().makeTranslation(x, 0, z));
  sink.push(new THREE.Matrix4().makeScale(size, size, size));
  const centre = v(0, BODY.y, 0);
  const at = (j, i) => {
    const phi = (j / BODY.rings) * Math.PI;
    const theta = (i / BODY.around) * 2 * Math.PI;
    return v(
      BODY.width * Math.sin(phi) * Math.cos(theta),
      BODY.y + BODY.height * Math.sin(phi) * Math.sin(theta),
      -BODY.half * Math.cos(phi),
    );
  };
  for (let j = 0; j < BODY.rings; j++) {
    for (let i = 0; i < BODY.around; i++) {
      if (j > 0) outward(sink, at(j, i), at(j, i + 1), at(j + 1, i + 1), centre, body);
      if (j < BODY.rings - 1) outward(sink, at(j, i), at(j + 1, i + 1), at(j + 1, i), centre, body);
    }
  }
  // The tail ticks up at the back
  const tail = v(0, 0.13, -BODY.half - 0.05);
  const tailCentre = v(0, 0.06, -BODY.half + 0.02);
  const tl = v(-0.035, 0.06, -BODY.half + 0.02);
  const tr = v(0.035, 0.06, -BODY.half + 0.02);
  const tb = v(0, 0.03, -BODY.half + 0.01);
  outward(sink, tl, tr, tail, tb, body);
  outward(sink, tl, tb, tail, tailCentre.clone().setX(0.02), body);
  outward(sink, tr, tb, tail, tailCentre.clone().setX(-0.02), body);
  // The head
  sink.push(new THREE.Matrix4().compose(v(...HEAD.at), new THREE.Quaternion(), v(HEAD.r, HEAD.r, HEAD.r)));
  icosahedron(sink, body);
  sink.pop();
  // The beak: a flat wedge forward
  const [hx, hy, hz] = HEAD.at;
  const front = hz + HEAD.r * 0.85;
  const beakCentre = v(hx, hy - 0.012, front + 0.03);
  const corners = [v(-0.025, hy, front), v(0.025, hy, front), v(0.025, hy - 0.024, front), v(-0.025, hy - 0.024, front)];
  const tip = v(0, hy - 0.016, front + 0.075);
  for (let k = 0; k < 4; k++) outward(sink, corners[k], corners[(k + 1) % 4], tip, beakCentre, beak);
  // The eyes: small dark quads either side of the head
  for (const s of [-1, 1]) {
    const ex = hx + s * HEAD.r * 0.9;
    const e = 0.011;
    sink.quad(v(ex, hy + 0.01 - e, hz + 0.03 - e), v(ex, hy + 0.01 - e, hz + 0.03 + e), v(ex, hy + 0.01 + e, hz + 0.03 + e), v(ex, hy + 0.01 + e, hz + 0.03 - e), null, EYE);
  }
  sink.pop();
  sink.pop();
  return sink.build([x, 0, z]).geometry;
};

// The ducks' swim: an ellipse inside the pond, the ducklings a little of a
// loop behind their mother, each bobbing on its own phase
const SWIM = { a: 0.55, b: 0.45, period: 28, behind: [0, 0.06, 0.11], bob: 0.012, bobHz: 1.2 };
const BOB_PHASE = [0, 1.7, 3.1];
const RIPPLE_PHASE = [0, 0.33, 0.66];
const TAU = 2 * Math.PI;
const lantern = new THREE.Vector3();

const parkMesh = (material) => {
  const mesh = new THREE.Mesh(undefined, material);
  mesh.layers.set(PARK_LAYER);
  return mesh;
};

export default function ParkPond({ park }) {
  const { prefersReducedMotion } = useMobile();
  const gl = useThree((state) => state.gl);
  const group = useRef();
  // park is PARK[layout]: geometry per layout
  const water = useMemo(() => buildWater(park.pond), [park]);
  const solids = useMemo(() => buildSolids(park), [park]);
  const mother = useMemo(() => buildDuck(park, park.duckScale, MOTHER), [park]);
  const duckling = useMemo(() => buildDuck(park, DUCKLING_SCALE * park.duckScale, DUCKLING), [park]);
  useEffect(() => () => water.dispose(), [water]);
  useEffect(() => () => solids.geometry.dispose(), [solids]);
  useEffect(() => () => mother.dispose(), [mother]);
  useEffect(() => () => duckling.dispose(), [duckling]);
  const meshes = useMemo(
    () => ({
      water: parkMesh(waterMaterial),
      solids: parkMesh(parkSolidMaterial),
      ducks: SWIM.behind.map(() => parkMesh(parkSolidMaterial)),
    }),
    [],
  );

  useEffect(() => {
    const { x, z, rx, rz } = park.pond;
    waterUniforms.uPond.value.set(x, z, rx, rz);
    waterUniforms.uLampOn.value = park.pondLamp == null ? 0 : 1;
  }, [park]);

  useFrame((state) => {
    const { width } = gl.domElement;
    waterUniforms.uDpr.value = gl.getPixelRatio();
    waterUniforms.uMoon.value = timeOfDay.moon;
    waterUniforms.uMoonX.value = timeOfDay.moonAt[0] * width;
    // The pond lamp's lantern on screen (it moves with the section)
    if (park.pondLamp != null) {
      const [lx, lz] = park.lamps[park.pondLamp];
      group.current.localToWorld(lantern.set(lx, LANTERN_Y, lz)).project(state.camera);
      waterUniforms.uLampX.value = (lantern.x * 0.5 + 0.5) * width;
    }
    // The shared clock, frozen under reduced motion: the ducks rest in a
    // short row on their ellipse, the ripples and dashes hold still
    const t = parkUniforms.uTime.value;
    const { x, z, rx, rz } = park.pond;
    const a = SWIM.a * rx;
    const b = SWIM.b * rz;
    meshes.ducks.forEach((duck, i) => {
      const theta = TAU * (t / SWIM.period - SWIM.behind[i]);
      const px = a * Math.cos(theta);
      const pz = b * Math.sin(theta);
      const bob = prefersReducedMotion ? 0 : SWIM.bob * Math.sin(TAU * SWIM.bobHz * t + BOB_PHASE[i]);
      duck.position.set(x + px, WATER_Y + bob, z + pz);
      duck.rotation.y = Math.atan2(-a * Math.sin(theta), b * Math.cos(theta));
      waterUniforms.uDucks.value[i].set(px, pz, RIPPLE_PHASE[i]);
    });
  });

  const { x, z } = park.pond;
  return (
    <group ref={group}>
      <primitive object={meshes.water} geometry={water} position={[x, WATER_Y, z]} />
      <primitive object={meshes.solids} geometry={solids.geometry} position={solids.origin} />
      {meshes.ducks.map((duck, i) => (
        <primitive key={i} object={duck} geometry={i === 0 ? mother : duckling} />
      ))}
    </group>
  );
}
