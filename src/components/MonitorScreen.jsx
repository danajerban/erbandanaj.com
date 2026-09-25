import { useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { config } from "../config";
import { prewarm } from "../lib/prewarm";
import { projectAtom } from "../store";

// Its screenshot suspends it, so it usually mounts after the Projects
// section's pre-warm (SectionGroup): it compiles its program (patched to
// dissolve with the section before that: lib/dissolve) and uploads its
// texture as it mounts, while the section is away, not on its first frame.
export const MonitorScreen = ({ ...props }) => {
  const project = useAtomValue(projectAtom);
  const projectTexture = useTexture(project.image);
  const group = useRef();
  const get = useThree((state) => state.get);

  useEffect(() => {
    const { gl, camera, scene } = get();
    prewarm(gl, group.current, camera, scene, "Monitor screen");
  }, [get]);

  return (
    <group ref={group} {...props}>
      <mesh>
        <planeGeometry args={[1.14, 0.66]} />
        <meshBasicMaterial map={projectTexture} />
      </mesh>
    </group>
  );
};

config.projects.forEach((project) => {
  useTexture.preload(project.image);
});
