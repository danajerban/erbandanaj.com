import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { pigeonPath } from "../../lib/parkLayout";
import { PARK_LAYER, parkSolidMaterial, parkStats } from "../../lib/parkMaterials";
import { timeOfDay } from "../../lib/timeOfDay";
import { Balloon } from "../Balloon";
import { Mailbox } from "../Mailbox";
import { ParkBench } from "../ParkBench";
import { Pigeon } from "../Pigeon";

// The park's existing props, livelier: the bench with the balloons tied to
// it, the mailbox whose flag the pigeon raises, and the pigeon circling the
// park, bringing mail every third loop. Contact-local, like the other park
// parts. The GLB props stay on layer 0 (contact shadows, pointer events).

// The bench (ParkBench, unchanged) inside its group at x −2·scaleFactor
const BENCH = { x: -0.5, z: -2.5, yaw: -Math.PI / 4, scale: 0.5 };
// Where the strings are tied: the top of the bench's armrest at its front
// end, the one nearer the avatar (Park Bench.glb, raw; measured once: the
// armrest runs x −0.73..0.41 at z −1.45..−1.56, top y 1.26)
const BENCH_TIE_RAW = new THREE.Vector3(0.38, 1.26, -1.5);

// The balloons, left to right: string length L (× park.balloonString) and
// the angle each leans from upright, about z (+ to the right)
const BALLOONS = [
  { color: "#71a2d9", scale: 1.5, length: 1.55, fan: -0.28 },
  { color: "#d97183", scale: 1.3, length: 1.8, fan: 0 },
  { color: "yellow", scale: 1.6, length: 2.05, fan: 0.26 },
];
// The knot at the bottom of Balloon.glb, balloon-local at scale 1
const KNOT_Y = -0.48;
const STRING_SEGMENTS = 10;
const STRING_HALF_WIDTH = 0.006;
const STRING_COLOR = "#e9e4dc";
// How far a string bows against its balloon's swing, per unit of length and
// radian
const STRING_BOW = 0.2;
// A tap kicks a balloon into a damped spring (settles in about 2 s)
const KICK = 1.2;
const SPRING_K = 6;
const SPRING_DAMPING = 2.2;
// At night a balloon glows a little in its own colour
const BALLOON_GLOW = 0.22;

// The pigeon (Pigeon.glb at this scale, its body 0.56 above its pivot)
const PIGEON_SCALE = 0.25;
const LOOP_PERIOD = 12;
const RUN_EVERY = 3; // loops
const DASH = 2.2; // s, to the mailbox and back
const HOVER = 1.6; // s
const FLAG_HOLD = 4; // s
const BOB = 0.1;
// Roll into the turn at the loop's tightest point (the model faces +z, so a
// positive roll dips its right wing, toward the loop's inside)
const BANK = 0.25;
const TURN_LAMBDA = 6;
const FRONT = Math.PI / 2; // the loop's front point: the mail run leaves and rejoins there
const TAU = 2 * Math.PI;

const UP = new THREE.Vector3(0, 1, 0);
const scratch = new THREE.Vector3();
const camera = new THREE.Vector3();
const dir = new THREE.Vector3();
const knot = new THREE.Vector3();
const point = new THREE.Vector3();
const tangent = new THREE.Vector3();
const side = new THREE.Vector3();
const bow = new THREE.Vector3();
// A string's previous and current sample edges (left, right, left, right),
// and a quad's two triangles over them
const edges = new Float32Array(12);
const QUAD = [0, 1, 3, 0, 3, 2];

const smooth = (x) => THREE.MathUtils.smoothstep(x, 0, 1);
// Quadratic Bézier (and its derivative) through a, b, c at u, into out
const bezier = (out, a, b, c, u) => out.set(
  (1 - u) ** 2 * a[0] + 2 * u * (1 - u) * b[0] + u * u * c[0],
  (1 - u) ** 2 * a[1] + 2 * u * (1 - u) * b[1] + u * u * c[1],
  (1 - u) ** 2 * a[2] + 2 * u * (1 - u) * b[2] + u * u * c[2],
);
const bezierTangent = (out, a, b, c, u) => out.set(
  2 * (1 - u) * (b[0] - a[0]) + 2 * u * (c[0] - b[0]),
  2 * (1 - u) * (b[1] - a[1]) + 2 * u * (c[1] - b[1]),
  2 * (1 - u) * (b[2] - a[2]) + 2 * u * (c[2] - b[2]),
);
// Damps an angle the short way round
const dampAngle = (from, to, lambda, delta) => {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + diff * (1 - Math.exp(-lambda * delta));
};

// One ribbon mesh for the three strings: STRING_SEGMENTS quads each, rewritten
// every frame (no reallocation); colour fixed, no sway, no glow
const createStrings = () => {
  const count = BALLOONS.length * STRING_SEGMENTS * 6;
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  position.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", position);
  const { r, g, b } = new THREE.Color(STRING_COLOR);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([r, g, b], i * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSway", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  geometry.setAttribute("aGlow", new THREE.BufferAttribute(new Float32Array(count), 1));
  const mesh = new THREE.Mesh(geometry, parkSolidMaterial);
  mesh.layers.set(PARK_LAYER);
  // Rewritten every frame: no bounds to cull by
  mesh.frustumCulled = false;
  return mesh;
};

export default function ParkProps({ park, aspect, scaleFactor, prefersReducedMotion }) {
  const root = useRef();
  const balloons = useRef([]);
  const balloonMaterials = useRef([]);
  const pigeon = useRef();
  const flagUp = useRef(false);
  const clock = useRef(0);
  // Each balloon's spring: its angle and angular velocity
  const springs = useRef(BALLOONS.map(() => ({ angle: 0, velocity: 0 })));
  // The pigeon's flight: phase (loop, out, hover, back), time in it, the
  // loop's angle, front points passed, when the flag drops, its heading/roll
  const flight = useRef({ phase: "loop", time: 0, theta: 0, passes: 0, flagUntil: 0, yaw: 0, roll: 0 });
  const [clip, setClip] = useState("Flying_Idle");
  const clipRef = useRef("Flying_Idle");
  const playClip = (name) => {
    if (clipRef.current === name) return;
    clipRef.current = name;
    setClip(name);
  };

  // The tie point, Contact-local: through the bench's transform
  const tie = useMemo(() => {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(-2 * scaleFactor + BENCH.x, 0, BENCH.z),
      new THREE.Quaternion().setFromAxisAngle(UP, BENCH.yaw),
      new THREE.Vector3(BENCH.scale, BENCH.scale, BENCH.scale),
    );
    return BENCH_TIE_RAW.clone().applyMatrix4(matrix);
  }, [scaleFactor]);
  const path = useMemo(() => pigeonPath(park, scaleFactor, aspect), [park, scaleFactor, aspect]);
  const strings = useMemo(createStrings, []);
  useEffect(() => () => strings.geometry.dispose(), [strings]);

  const kick = (i) => (event) => {
    event.stopPropagation();
    if (prefersReducedMotion) return;
    // Away from the pointer
    balloons.current[i].getWorldPosition(scratch);
    springs.current[i].velocity += scratch.x >= event.point.x ? KICK : -KICK;
  };

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30);
    if (!prefersReducedMotion) clock.current += dt;
    const t = clock.current;

    // Balloons and their strings
    root.current.worldToLocal(camera.copy(state.camera.position)).sub(tie);
    const positions = strings.geometry.attributes.position;
    let at = 0;
    BALLOONS.forEach(({ scale, length, fan }, i) => {
      const spring = springs.current[i];
      if (!prefersReducedMotion) {
        spring.velocity += (-SPRING_K * spring.angle - SPRING_DAMPING * spring.velocity) * dt;
        spring.angle += spring.velocity * dt;
      }
      const wind = prefersReducedMotion ? 0 : 0.1 * Math.sin(0.7 * t + i) + 0.05 * Math.sin(1.9 * t + 2 * i);
      const swing = wind + spring.angle;
      const angle = fan + swing;
      const lean = prefersReducedMotion ? 0 : 0.06 * Math.sin(0.5 * t + i);
      const tug = prefersReducedMotion ? 0 : 0.03 * Math.sin(1.3 * t + i);
      const reach = length * park.balloonString + tug;
      dir.set(Math.sin(angle), Math.cos(angle) * Math.cos(lean), Math.cos(angle) * Math.sin(lean));
      const balloon = balloons.current[i];
      balloon.position.copy(tie).addScaledVector(dir, reach);
      balloon.quaternion.setFromUnitVectors(UP, dir);
      balloonMaterials.current[i].emissiveIntensity = BALLOON_GLOW * timeOfDay.night;

      // The string, relative to the tie: from it to the knot, bowing
      // against the swing, widened across the view
      knot.copy(dir).multiplyScalar(reach + KNOT_Y * scale);
      bow.set(Math.cos(angle), -Math.sin(angle), 0).multiplyScalar(-STRING_BOW * swing * knot.length());
      for (let j = 0; j <= STRING_SEGMENTS; j++) {
        const u = j / STRING_SEGMENTS;
        point.copy(knot).multiplyScalar(u).addScaledVector(bow, Math.sin(Math.PI * u));
        tangent.copy(knot).addScaledVector(bow, Math.PI * Math.cos(Math.PI * u));
        side.subVectors(camera, point).cross(tangent).normalize().multiplyScalar(STRING_HALF_WIDTH);
        // This sample's left and right edge; with the previous ones, a quad
        for (let k = 0; k < 3; k++) {
          edges[6 + k] = point.getComponent(k) - side.getComponent(k);
          edges[9 + k] = point.getComponent(k) + side.getComponent(k);
        }
        if (j > 0) {
          for (const corner of QUAD) {
            positions.array[at++] = edges[corner * 3];
            positions.array[at++] = edges[corner * 3 + 1];
            positions.array[at++] = edges[corner * 3 + 2];
          }
        }
        edges.copyWithin(0, 6, 12);
      }
    });
    positions.needsUpdate = true;

    // The pigeon
    const f = flight.current;
    const g = pigeon.current;
    if (prefersReducedMotion) {
      // Still at its rest point, its wings held (Pigeon still)
      if (f.phase !== "loop" || flagUp.current) {
        f.phase = "loop";
        flagUp.current = false;
      }
      playClip("Flying_Idle");
      g.position.set(...path.rest);
      g.rotation.set(0, 0, 0);
      return;
    }
    const { centre, rx, rz, start, control, hover } = path;
    f.time += dt;
    let roll = 0;
    let yaw = f.yaw;
    if (f.phase === "loop") {
      const before = Math.floor((f.theta - FRONT) / TAU);
      f.theta += (dt * TAU) / LOOP_PERIOD;
      if (Math.floor((f.theta - FRONT) / TAU) > before && ++f.passes % RUN_EVERY === 0) {
        f.phase = "out";
        f.time = 0;
        if (import.meta.env.DEV) parkStats.mailRuns++;
        playClip("Fast_Flying");
      }
      const s = Math.sin(f.theta);
      const c = Math.cos(f.theta);
      g.position.set(centre[0] + rx * c, centre[1], centre[2] + rz * s);
      tangent.set(-rx * s, 0, rz * c);
      yaw = Math.atan2(tangent.x, tangent.z);
      // Curvature, relative to the loop's tightest point
      const curvature = (rx * rz) / (rx * rx * s * s + rz * rz * c * c) ** 1.5;
      roll = (BANK * curvature) / Math.max(rx / (rz * rz), rz / (rx * rx));
    } else if (f.phase === "hover") {
      g.position.set(...hover);
      yaw = 0; // faces the visitor
      if (f.time >= HOVER) {
        f.phase = "back";
        f.time = 0;
        playClip("Fast_Flying");
      }
    } else {
      const out = f.phase === "out";
      const u = smooth(Math.min(f.time / DASH, 1));
      const along = out ? u : 1 - u;
      bezier(g.position, start, control, hover, along);
      bezierTangent(tangent, start, control, hover, along);
      if (!out) tangent.negate();
      yaw = Math.atan2(tangent.x, tangent.z);
      if (f.time >= DASH) {
        f.time = 0;
        if (out) {
          f.phase = "hover";
          g.position.set(...hover);
          flagUp.current = true;
          f.flagUntil = t + FLAG_HOLD;
          if (import.meta.env.DEV) parkStats.flagUps++;
          playClip("Yes");
        } else {
          // Rejoins the loop at its front point
          f.phase = "loop";
          f.theta = FRONT + TAU * Math.floor((f.theta - FRONT) / TAU + 0.5);
          playClip("Flying_Idle");
        }
      }
    }
    if (flagUp.current && t >= f.flagUntil) flagUp.current = false;
    f.yaw = dampAngle(f.yaw, yaw, TURN_LAMBDA, dt);
    f.roll = THREE.MathUtils.damp(f.roll, roll, TURN_LAMBDA, dt);
    g.position.y += BOB * Math.sin(TAU * t);
    g.rotation.set(0, f.yaw, f.roll, "YXZ");
  });

  return (
    <group ref={root}>
      <group position-x={-2 * scaleFactor}>
        <ParkBench scale={BENCH.scale} position-x={BENCH.x} position-z={BENCH.z} rotation-y={BENCH.yaw} />
      </group>
      {BALLOONS.map(({ color, scale }, i) => (
        <Balloon
          key={color}
          ref={(o) => (balloons.current[i] = o)}
          materialRef={(material) => {
            balloonMaterials.current[i] = material;
            // Its own colour, scaled by the night each frame (uniforms: no
            // new program)
            if (material) {
              material.emissive.set(color);
              material.emissiveIntensity = BALLOON_GLOW * timeOfDay.night;
            }
          }}
          scale={scale}
          color={color}
          onPointerDown={kick(i)}
        />
      ))}
      <primitive object={strings} position={tie} />
      <Mailbox
        flagUp={flagUp}
        scale={0.25}
        rotation-y={1.25 * Math.PI}
        position-x={1}
        position-y={0.25}
        position-z={0.5}
      />
      <group ref={pigeon} position={path.rest}>
        <Pigeon scale={PIGEON_SCALE} clip={clip} still={prefersReducedMotion} />
      </group>
    </group>
  );
}
