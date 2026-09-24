import { useFrame } from "@react-three/fiber";
import { easeInOut } from "motion";
import { useRef } from "react";
import { useMobile } from "../contexts/MobileContext";

// Resting height of an inactive section — below the camera's view.
const DROP_Y = -5;
// Same tween framer-motion-3d ran before (duration 0.6, default easeInOut).
const DURATION = 0.6;

// A section's group: rises to y=0 while active and drops back to DROP_Y when
// not, tweened per frame. It is hidden once it has finished dropping (and is
// not active), so inactive sections never bleed through the transparent
// canvas (no occluder floor). Reduced motion snaps instead of tweening.
export const SectionGroup = ({ active, children, ...props }) => {
  const group = useRef();
  const { prefersReducedMotion } = useMobile();
  // Current tween; t = 1 means settled at `to`.
  const tween = useRef({ from: DROP_Y, to: DROP_Y, t: 1 });

  useFrame((_, delta) => {
    const { current: g } = group;
    const tw = tween.current;
    const target = active ? 0 : DROP_Y;
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
    g.visible = active || tw.t < 1;
  });

  return (
    <group ref={group} position-y={DROP_Y} {...props}>
      {children}
    </group>
  );
};
