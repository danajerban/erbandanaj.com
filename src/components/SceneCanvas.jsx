import { Scroll, ScrollControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { MotionConfig } from "framer-motion";
import { Suspense } from "react";
import { config } from "../config";
import { useMobile } from "../contexts/MobileContext";
import { OverlayErrorBoundary } from "./ErrorBoundary";
import { Experience } from "./Experience";
import { Interface } from "./Interface";
import { SceneReady } from "./SceneReady";

// Loaded via React.lazy from App.jsx — this module is the seam that keeps
// three.js/r3f/drei/framer-motion out of the entry chunk. Never import it
// statically from an eagerly-loaded module, or the code-split is undone.
function SceneCanvas() {
  const { isMobile } = useMobile();
  return (
    <Canvas
      camera={{ position: [0, 0.5, 5], fov: 42 }}
      // MOBILE_PERF: limit DPR on mobile — revert by removing the ternary
      dpr={[1, isMobile ? 1.5 : 2]}
      gl={{ alpha: true }}
    >
      <fog attach="fog" args={["#efc5b8", 10, 50]} />
      <ScrollControls
        pages={config.sections.length}
        damping={0.1}
        maxSpeed={0.2}
      >
        <group position-y={-1}>
          <MotionConfig
            transition={{
              duration: 0.6,
            }}
          >
            <Suspense fallback={null}>
              <Experience />
              <SceneReady />
            </Suspense>
          </MotionConfig>
        </group>
        <Scroll html>
          <MotionConfig transition={{ duration: 1 }} reducedMotion="user">
            <OverlayErrorBoundary>
              <Interface />
            </OverlayErrorBoundary>
          </MotionConfig>
        </Scroll>
      </ScrollControls>
    </Canvas>
  );
}

export default SceneCanvas;
