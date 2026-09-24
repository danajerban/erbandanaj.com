import { MotionConfig } from "motion/react";
import { Interface } from "./Interface";

// Lazy seam for the HTML overlay: it is the only scene-side consumer of the
// motion library, so loading it through React.lazy keeps the motion chunk off
// the path to the first visible frame. It arrives while the 3D assets are
// still downloading.
export default function Overlay() {
  return (
    <MotionConfig transition={{ duration: 1 }} reducedMotion="user">
      <Interface />
    </MotionConfig>
  );
}
