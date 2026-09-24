import { Scroll, ScrollControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, lazy, useCallback, useState } from "react";
import { config } from "../config";
import { useMobile } from "../contexts/MobileContext";
// Desktop only, mounted after the first visible frame: fps monitor + DPR
// ladder (see DesktopQuality). Static import: it has no heavy dependency of
// its own, and this module is already a lazy chunk.
import DesktopQuality from "./DesktopQuality";
import { OverlayErrorBoundary, SilentErrorBoundary } from "./ErrorBoundary";
import { Experience } from "./Experience";
import { SceneReady } from "./SceneReady";

// Lazy: the HTML overlay is the only consumer of the motion library on the
// scene side, so it stays off the path to the first visible frame.
const Overlay = lazy(() => import("./Overlay"));

// Loaded via React.lazy from App.jsx — this module is the seam that keeps
// three.js/r3f/drei/motion out of the entry chunk. Never import it
// statically from an eagerly-loaded module, or the code-split is undone.
function SceneCanvas() {
  const { isMobile, prefersReducedMotion } = useMobile();
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
      {/* Reduced motion: the damped scroll must not glide after input stops.
          A 0.001 s smoothing time settles within one frame (maath's damp snaps
          under its epsilon), and the speed cap comes off so a section jump
          is not stretched over seconds. */}
      <ScrollControls
        pages={config.sections.length}
        damping={prefersReducedMotion ? 0.001 : 0.1}
        maxSpeed={prefersReducedMotion ? Infinity : 0.2}
      >
        <group position-y={-1}>
          <Suspense fallback={null}>
            <Experience revealed={revealed} />
            <SceneReady onWarm={onWarm} onReveal={onReveal} />
          </Suspense>
        </group>
        {revealed && !isMobile && (
          <SilentErrorBoundary>
            <DesktopQuality onDpr={setQualityDpr} />
          </SilentErrorBoundary>
        )}
        <Scroll html>
          <OverlayErrorBoundary>
            <Suspense fallback={null}>
              <Overlay revealed={revealed} />
            </Suspense>
          </OverlayErrorBoundary>
        </Scroll>
      </ScrollControls>
    </Canvas>
  );
}

export default SceneCanvas;
