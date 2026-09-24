import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { hideInitialLoader } from "../lib/initialLoader";
import { prewarm, whenSectionsWarm } from "../lib/prewarm";

// Mounts inside the splash-gate <Suspense> boundary, so it runs only once
// every gated asset (GLBs, environment HDR, Home title font) is live.
//
// The canvas frameloop is "never" until then. Before the first visible frame
// the whole scene is pre-warmed while the splash still covers it: shader
// programs compile off the main thread and textures upload, then two frames
// are advanced under the splash for whatever only a draw can warm (GPU
// pipeline state, the contact-shadow depth pass, geometry buffers). Only then
// does the loop start, and the first frame it renders is the one that reveals
// the scene. Every pre-warm is bounded and never rejects (lib/prewarm), so
// this always fires within that bound — well inside the splash failsafe.

export const SceneReady = ({ onWarm, onReveal }) => {
  const get = useThree((state) => state.get);
  const warm = useRef(false);
  const revealed = useRef(false);

  useEffect(() => {
    let live = true;
    const { gl, scene, camera, advance } = get();
    prewarm(gl, scene, camera, scene)
      .then(whenSectionsWarm)
      .then(() => {
        if (!live) return;
        performance.mark("scene-compiled");
        // Two frames under the splash: the gate sections' hidden warm-up draw
        // needs one for the main pass and one for the contact-shadow depth
        // pass (SectionGroup). Timestamp 0 == the clock's reset value, so
        // both frames have delta 0 and the Home rise-in still starts from
        // rest on the visible frame.
        advance(0);
        advance(0);
        performance.mark("scene-warm");
        warm.current = true;
        onWarm();
      });
    return () => {
      live = false;
    };
  }, [get, onWarm]);

  useFrame(() => {
    if (warm.current && !revealed.current) {
      revealed.current = true;
      // Measurement seam: marked here, not in hideInitialLoader, so the error
      // boundary and the failsafe never record a scene that did not render.
      performance.mark("scene-visible");
      hideInitialLoader();
      onReveal();
    }
  });

  return null;
};
