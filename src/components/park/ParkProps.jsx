import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useMobile } from "../../contexts/MobileContext";
import { BENCH, MAILBOX_AT, benchShift } from "../../lib/parkLayout";
import { PARK_LAYER, parkSolidMaterial } from "../../lib/parkMaterials";
import { timeOfDay } from "../../lib/timeOfDay";
import { Balloon } from "../Balloon";
import { Mailbox } from "../Mailbox";
import { ParkBench } from "../ParkBench";

// The park's existing props, livelier: the bench with the balloons tied to
// it, and the mailbox whose flag lifts when the visitor points at it.
// Contact-local, like the other park parts. The GLB props stay on layer 0
// (contact shadows, pointer events).

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

export default function ParkProps({ park, layout, aspect }) {
  const { prefersReducedMotion } = useMobile();
  const root = useRef();
  const balloons = useRef([]);
  const balloonMaterials = useRef([]);
  const clock = useRef(0);
  // Each balloon's spring: its angle and angular velocity
  const springs = useRef(BALLOONS.map(() => ({ angle: 0, velocity: 0 })));
  // The bench group's x (parkLayout), and the tie point, Contact-local:
  // through the bench's transform
  const shift = benchShift(layout, aspect);
  const tie = useMemo(() => {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(shift + BENCH.x, 0, BENCH.z),
      new THREE.Quaternion().setFromAxisAngle(UP, BENCH.yaw),
      new THREE.Vector3(BENCH.scale, BENCH.scale, BENCH.scale),
    );
    return BENCH_TIE_RAW.clone().applyMatrix4(matrix);
  }, [shift]);
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
  });

  return (
    <group ref={root}>
      <group position-x={shift}>
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
        scale={0.25}
        rotation-y={1.25 * Math.PI}
        position-x={MAILBOX_AT[0]}
        position-y={0.25}
        position-z={MAILBOX_AT[1]}
      />
    </group>
  );
}
