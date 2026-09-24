import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { useMobile } from "../contexts/MobileContext";
import { prewarmSection } from "../lib/prewarm";

// Resting height of an inactive section — below the camera's view.
const DROP_Y = -5;
// Height for the hidden warm-up draw: outside the camera frustum and above the
// contact-shadow camera, so both passes issue the draw calls (culling is off
// for that frame) while every fragment clips away.
const WARM_Y = 100;
// Same tween framer-motion-3d ran before (duration 0.6, default easeInOut).
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

// A section's group: rises to y=0 while active and drops back to DROP_Y when
// not, tweened per frame. It is hidden once it has finished dropping (and is
// not active), so inactive sections never bleed through the transparent
// canvas (no occluder floor). Reduced motion snaps instead of tweening.
//
// The group is pre-warmed on the GPU right after it mounts: shaders, then
// textures (lib/prewarm), then one hidden draw for the GPU pipeline state and
// geometry buffers — spanning two frames, because the contact-shadow depth
// pass runs before this callback and only sees the group on the next frame.
// A section requested before that completes simply waits, then plays its
// normal rise-in; nothing blocks the frame.
export const SectionGroup = ({ name, active, children, ...props }) => {
  const group = useRef();
  const { prefersReducedMotion } = useMobile();
  const get = useThree((state) => state.get);
  const phase = useRef(0);
  const warmFrames = useRef(0);
  const culled = useRef([]);
  // Current tween; t = 1 means settled at `to`.
  const tween = useRef({ from: DROP_Y, to: DROP_Y, t: 1 });

  useEffect(() => {
    let live = true;
    const { gl, camera, scene } = get();
    prewarmSection(name, gl, group.current, camera, scene).then(() => {
      if (live) phase.current = COMPILED;
    });
    return () => {
      live = false;
    };
  }, [name, get]);

  useFrame((_, delta) => {
    const { current: g } = group;

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
      g.position.y = DROP_Y;
      phase.current = READY;
      // Measurement seam: one mark per section, when its pre-warm completes.
      performance.mark(`section-ready:${name}`);
    }

    const tw = tween.current;
    const isActive = active && phase.current === READY;
    const target = isActive ? 0 : DROP_Y;
    // Retarget mid-flight from wherever the group currently is.
    if (tw.to !== target) {
      tw.from = g.position.y;
      tw.to = target;
      tw.t = 0;
    }
    if (tw.t < 1) {
      tw.t = prefersReducedMotion ? 1 : Math.min(1, tw.t + delta / DURATION);
      g.position.y = tw.from + (tw.to - tw.from) * easeInOut(tw.t);
    }
    g.visible = isActive || tw.t < 1;
  });

  return (
    <group ref={group} position-y={DROP_Y} {...props}>
      {children}
    </group>
  );
};
