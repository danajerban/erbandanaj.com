import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { hideInitialLoader } from "../lib/initialLoader";

// Mounts inside the <Suspense> boundary, so its first frame is the first
// frame rendered with every suspended asset (GLBs + environment HDR) live —
// that, not "progress 100%", is when the splash can fade without exposing
// an unlit scene.
export const SceneReady = () => {
  const signaled = useRef(false);

  useFrame(() => {
    if (!signaled.current) {
      signaled.current = true;
      hideInitialLoader();
    }
  });

  return null;
};
