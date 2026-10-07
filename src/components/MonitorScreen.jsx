import { useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useAtomValue } from "jotai";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { config } from "../config";
import { OFFICE_LAYER } from "../lib/office/layout";
import { prewarm } from "../lib/prewarm";
import { projectAtom } from "../store";

// The desk monitor's screen, showing the selected project's screenshot.
// screen = layout.js monitorScreen(layout) (room frame); the mesh sits at
// `origin` (the furniture's), its plane rotated and moved into place, so it
// dissolves with the furniture. The screenshot covers the screen: a wider
// one crops its sides, a taller one its top and bottom.
//
// Its screenshot suspends it, so it usually mounts after the Projects
// section's pre-warm (SectionGroup): it compiles its program (patched to
// dissolve with the section before that: lib/dissolve) and uploads its
// texture as it mounts, while the section is away, not on its first frame.
export const MonitorScreen = ({ screen, origin }) => {
  const project = useAtomValue(projectAtom);
  const projectTexture = useTexture(project.image);
  const mesh = useRef();
  const get = useThree((state) => state.get);

  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(...screen.size);
    plane.rotateX(screen.rotationX);
    const [x, y, z] = screen.position;
    plane.translate(x - origin[0], y - origin[1], z - origin[2]);
    return plane;
  }, [screen, origin]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // Cover-fit, set once per texture (the uv transform is already in the
  // program: no recompile)
  useLayoutEffect(() => {
    const { image } = projectTexture;
    const fit = screen.size[0] / screen.size[1];
    const aspect = image.width / image.height;
    if (aspect > fit) {
      projectTexture.repeat.set(fit / aspect, 1);
      projectTexture.offset.set((1 - fit / aspect) / 2, 0);
    } else {
      projectTexture.repeat.set(1, aspect / fit);
      projectTexture.offset.set(0, (1 - aspect / fit) / 2);
    }
  }, [projectTexture, screen]);

  useLayoutEffect(() => {
    mesh.current.layers.set(OFFICE_LAYER);
  }, []);

  useEffect(() => {
    const { gl, camera, scene } = get();
    prewarm(gl, mesh.current, camera, scene, "Monitor screen");
  }, [get]);

  return (
    <mesh ref={mesh} position={origin} geometry={geometry}>
      <meshBasicMaterial map={projectTexture} />
    </mesh>
  );
};

config.projects.forEach((project) => {
  useTexture.preload(project.image);
});
