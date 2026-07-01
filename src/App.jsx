import { Scroll, ScrollControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { MotionConfig } from "framer-motion";
import { Suspense } from "react";
import { OverlayErrorBoundary, SceneErrorBoundary } from "./components/ErrorBoundary";
import { Experience } from "./components/Experience";
import { Interface } from "./components/Interface";
import { LoadingScreen } from "./components/LoadingScreen";
import { Menu } from "./components/Menu";
import { config } from "./config";
import { MobileProvider, useMobile } from "./contexts/MobileContext";

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

function App() {
  return (
    <MobileProvider>
      <Menu />
      <SceneErrorBoundary>
        <LoadingScreen />
        <SceneCanvas />
      </SceneErrorBoundary>
    </MobileProvider>
  );
}

export default App;
