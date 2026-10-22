import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useMobile } from "../contexts/MobileContext";
import { sceneLayoutOf } from "../lib/coast";
import { createRandom } from "../lib/lowPoly";
import { KEY } from "../lib/office/bake";
import { BACK, FRONT_Z, OFFICE_LAYER, WINDOW, place } from "../lib/office/layout";
import { createOfficeMaterials, officeLight } from "../lib/office/materials";
import { buildRoom } from "../lib/office/room";
import { GlowSink, LaceSink, OfficeSink } from "../lib/office/sink";
import { useRoundedAspect } from "../lib/useRoundedAspect";

// One corner of the office (Skills or Projects): the room shell and the
// corner's furniture, baked into at most four meshes on the office layer:
// shell (origin at the back wall, so it dissolves last), furniture (origin
// at its front edge, so it dissolves first), lace, glow decals. `build`
// adds the corner's furniture: build({ solid, glow }, ctx) in the room
// frame, lit by `lights`. Children (the title, the monitor screen) sit in
// the room frame too.

const ROOM_SEED = { skills: 24, projects: 31 };
const FURNITURE_SEED = { skills: 7, projects: 12 };

// Both corners share the camera's office layer: on while either is mounted
let layerUsers = 0;

const officeMesh = (geometry, material, z) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = z;
  mesh.layers.set(OFFICE_LAYER);
  return mesh;
};

const buildCorner = (corner, layout, isMobile, lights, build, materials) => {
  const key = KEY[corner];
  const shell = new OfficeSink(lights, key);
  const solid = new OfficeSink(lights, key);
  const glow = new GlowSink();
  const lace = new LaceSink();
  buildRoom({ solid: shell, furniture: solid, glow, lace }, corner, { isMobile, layout, random: createRandom(ROOM_SEED[corner]) });
  build({ solid, glow }, { isMobile, layout, random: createRandom(FURNITURE_SEED[corner]) });
  const meshes = [];
  // An empty sink makes no mesh (no draw)
  if (shell.mark()) meshes.push(officeMesh(shell.build([0, 0, BACK]), materials.baked, BACK));
  if (solid.mark()) meshes.push(officeMesh(solid.build([0, 0, FRONT_Z]), materials.baked, FRONT_Z));
  if (lace.mark()) meshes.push(officeMesh(lace.build([0, 0, BACK]), materials.lace, BACK));
  if (glow.mark()) meshes.push(officeMesh(glow.build([0, 0, FRONT_Z]), materials.glow, FRONT_Z));
  return meshes;
};

const shown = (object) => {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  return true;
};

export const OfficeCorner = ({ corner, lights, build, children }) => {
  const { isMobile, prefersReducedMotion } = useMobile();
  const camera = useThree((state) => state.camera);
  const aspect = useRoundedAspect();
  const layout = sceneLayoutOf(isMobile, aspect);
  const group = useRef();

  const materials = useMemo(() => {
    const created = createOfficeMaterials();
    created.uniforms.uSway.value = WINDOW[corner].sway;
    return created;
  }, [corner]);

  // Built synchronously, so the section's pre-warm compiles its programs
  const meshes = useMemo(
    () => buildCorner(corner, layout, isMobile, lights, build, materials),
    [corner, layout, isMobile, lights, build, materials],
  );

  useEffect(
    () => () => {
      for (const mesh of meshes) mesh.geometry.dispose();
    },
    [meshes],
  );

  useEffect(
    () => () => {
      materials.baked.dispose();
      materials.lace.dispose();
      materials.glow.dispose();
    },
    [materials],
  );

  // Before SectionGroup's layout effect (children run first), so before its
  // pre-warm and warm draw
  useLayoutEffect(() => {
    if (layerUsers++ === 0) camera.layers.enable(OFFICE_LAYER);
    return () => {
      if (--layerUsers === 0) camera.layers.disable(OFFICE_LAYER);
    };
  }, [camera]);

  useFrame((_, delta) => {
    officeLight(materials);
    // Reduced motion: the lace stays still
    if (!prefersReducedMotion && shown(group.current)) materials.uniforms.uTime.value += delta;
  });

  const [x, z] = place(corner, layout, aspect);
  return (
    <group ref={group} position={[x, 0, z]}>
      {meshes.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
      {children}
    </group>
  );
};
