import { useScroll } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import { MathUtils } from "three";
import { config } from "../config";
import { ANIMATION_CONSTANTS } from "../constants/animation";
import { useMobile } from "../contexts/MobileContext";
import { applyDissolve, dissolveUniform, flushDissolve, measureDissolve } from "../lib/dissolve";
import { prewarmSection } from "../lib/prewarm";

// Height for the hidden warm-up draw: outside the camera frustum and above the
// contact-shadow camera, so both passes issue the draw calls (culling is off
// for that frame) while every fragment clips away.
const WARM_Y = 100;
// Once pre-warmed, a section comes out of the haze over this many seconds
// (framer-motion-3d's old rise-in: 0.6, easeInOut).
const DURATION = 0.6;
// motion's default `easeInOut` is cubicBezier(0.42, 0, 0.58, 1); solved inline
// so the scene path does not need the motion chunk.
const X1 = 0.42;
const Y1 = 0;
const X2 = 0.58;
const Y2 = 1;
const bezier = (p1, p2, t) => 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
// x(t) is monotonic, so bisect for the t at x, then evaluate y(t).
const easeInOut = (x) => {
  if (x <= 0 || x >= 1) return x;
  let lo = 0;
  let hi = 1;
  let t = x;
  for (let i = 0; i < 24; i++) {
    t = (lo + hi) / 2;
    if (bezier(X1, X2, t) < x) lo = t;
    else hi = t;
  }
  return bezier(Y1, Y2, t);
};

// Pre-warm phases: 0 mounted, 1 shaders compiled + textures uploaded, 2 warm
// draw in flight, 3 ready.
const COMPILED = 1;
const DRAWING = 2;
const READY = 3;

// A section's group. It follows the scroll, like the sea: it dissolves into
// the haze between DISSOLVE_START and DISSOLVE_END sections away from it
// (lib/dissolve), and is hidden once gone, so it never bleeds through the
// transparent canvas (no occluder floor). Stopping holds it, scrolling back
// plays it in reverse, a menu jump (which scrolls) plays it too, and reduced
// motion (no scroll damping) makes it immediate. Its parts mounted later
// dissolve with it (lib/dissolve patches them before they compile).
//
// The group is pre-warmed on the GPU right after it mounts: shaders, then
// textures (lib/prewarm), then one hidden draw for the GPU pipeline state and
// geometry buffers — spanning two frames, because the contact-shadow depth
// pass runs before this callback and only sees the group on the next frame.
// A section requested before that completes simply waits, then comes out of
// the haze over DURATION; nothing blocks the frame.
export const SectionGroup = ({ name, children, ...props }) => {
  const group = useRef();
  const { prefersReducedMotion } = useMobile();
  const get = useThree((state) => state.get);
  const scroll = useScroll();
  const phase = useRef(0);
  const warmFrames = useRef(0);
  const culled = useRef([]);
  // The section's uniform, and its fade in once pre-warmed (0 → 1)
  const dissolve = dissolveUniform(name);
  const reveal = useRef(0);
  const index = config.sections.indexOf(name);

  // Before any frame: hidden until pre-warmed, so not even the contact-shadow
  // pass (whose callback runs before this one's) draws it cold
  useLayoutEffect(() => {
    let live = true;
    const { gl, camera, scene } = get();
    group.current.visible = false;
    // Before the pre-warm, so the programs it compiles are the patched ones
    applyDissolve(group.current, dissolve, gl);
    prewarmSection(name, gl, group.current, camera, scene).then(() => {
      if (live) phase.current = COMPILED;
    });
    return () => {
      live = false;
    };
  }, [name, get, dissolve]);

  useFrame((state, delta) => {
    const { current: g } = group;
    // Parts mounted since the last compile, before this frame draws them
    flushDissolve();

    if (phase.current === COMPILED) {
      phase.current = DRAWING;
      warmFrames.current = 0;
      culled.current = [];
      g.traverse((o) => {
        if (o.isMesh || o.isSprite) {
          culled.current.push([o, o.frustumCulled]);
          o.frustumCulled = false;
        }
      });
      g.position.y = WARM_Y;
      g.visible = true;
      return;
    }
    if (phase.current === DRAWING) {
      if (++warmFrames.current < 2) return;
      for (const [o, value] of culled.current) o.frustumCulled = value;
      culled.current = [];
      g.position.y = 0;
      phase.current = READY;
      // Measurement seam: one mark per section, when its pre-warm completes.
      performance.mark(`section-ready:${name}`);
    }

    const { value } = dissolve;
    if (phase.current === READY) {
      reveal.current = prefersReducedMotion ? 1 : Math.min(1, reveal.current + delta / DURATION);
    }
    // How far the visitor has scrolled from this section, in sections
    const away = Math.abs(scroll.offset * (scroll.pages - 1) - index);
    value.x = Math.max(
      MathUtils.smoothstep(away, ANIMATION_CONSTANTS.DISSOLVE_START, ANIMATION_CONSTANTS.DISSOLVE_END),
      1 - easeInOut(reveal.current),
    );
    // Hidden once gone: by then every pixel is dropped and every shadow
    // lifted out of range, so nothing pops
    g.visible = value.x < 1;
    if (value.x > 0 && g.visible) measureDissolve(dissolve, g, state.camera);
  });

  return (
    <group ref={group} {...props}>
      {children}
    </group>
  );
};
