import { Scroll, ScrollControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, lazy, useCallback, useState } from "react";
import { config } from "../config";
import { useMobile } from "../contexts/MobileContext";
import { OverlayErrorBoundary, SilentErrorBoundary } from "./ErrorBoundary";
import { Experience } from "./Experience";
import { SceneReady } from "./SceneReady";

// Lazy: the HTML overlay is the only consumer of the motion library on the
// scene side, so it stays off the path to the first visible frame.
const Overlay = lazy(() => import("./Overlay"));
// Lazy, desktop only, mounted after the first visible frame: the performance
// monitor and the postprocessing library (see DesktopQuality).
const DesktopQuality = lazy(() => import("./DesktopQuality"));

// Loaded via React.lazy from App.jsx — this module is the seam that keeps
// three.js/r3f/drei/motion out of the entry chunk. Never import it
// statically from an eagerly-loaded module, or the code-split is undone.
function SceneCanvas() {
  const { isMobile } = useMobile();
  // The loop stays off until the Home gate is loaded and pre-warmed on the
  // GPU (SceneReady), so the first frame rendered is the first one shown.
  const [frameloop, setFrameloop] = useState("never");
  const [revealed, setRevealed] = useState(false);
  // DPR chosen by the adaptive-quality monitor; null = the canvas's own range.
  // Held here because <Canvas> re-applies its dpr/frameloop props on every
  // render, which would undo a value set on the store directly.
  const [qualityDpr, setQualityDpr] = useState(null);
  const onWarm = useCallback(() => setFrameloop("always"), []);
  const onReveal = useCallback(() => setRevealed(true), []);
  return (
    <Canvas
      camera={{ position: [0, 0.5, 5], fov: 42 }}
      frameloop={frameloop}
      // MOBILE_PERF: limit DPR on mobile — revert by removing the ternary
      dpr={!isMobile && qualityDpr != null ? qualityDpr : [1, isMobile ? 1.5 : 2]}
      gl={{ alpha: true }}
    >
      <fog attach="fog" args={["#efc5b8", 10, 50]} />
      <ScrollControls
        pages={config.sections.length}
        damping={0.1}
        maxSpeed={0.2}
      >
        <group position-y={-1}>
          <Suspense fallback={null}>
            <Experience revealed={revealed} />
            <SceneReady onWarm={onWarm} onReveal={onReveal} />
          </Suspense>
        </group>
        {revealed && !isMobile && (
          <SilentErrorBoundary>
            <Suspense fallback={null}>
              <DesktopQuality onDpr={setQualityDpr} />
            </Suspense>
          </SilentErrorBoundary>
        )}
        <Scroll html>
          <OverlayErrorBoundary>
            <Suspense fallback={null}>
              <Overlay />
            </Suspense>
          </OverlayErrorBoundary>
        </Scroll>
      </ScrollControls>
    </Canvas>
  );
}

export default SceneCanvas;
