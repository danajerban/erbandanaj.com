import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { useMobile } from "../contexts/MobileContext";
import { getSectionsDistance } from "../constants/animation";
import { PARK, parkLayoutOf } from "../lib/parkLayout";
import { PARK_LAYER, parkStats, useParkClock } from "../lib/parkMaterials";
import { MOON_AT, timeOfDay } from "../lib/timeOfDay";
import ParkGarden from "./park/ParkGarden";
import ParkGround from "./park/ParkGround";
import ParkHouses from "./park/ParkHouses";
import ParkLamps from "./park/ParkLamps";
import ParkPond from "./park/ParkPond";
import ParkProps from "./park/ParkProps";
import ParkSparkles from "./park/ParkSparkles";
import { SectionGroup } from "./SectionGroup";
import { SectionTitle } from "./SectionTitle";

// Contact: a night park in an old town. Its layout by the screen's shape
// (lib/parkLayout), the same keys as the moon's (lib/timeOfDay).
export const ContactSection = () => {
  const { isMobile, scaleFactor, prefersReducedMotion } = useMobile();
  const sectionsDistance = getSectionsDistance(isMobile);
  // Rounded, so the park rebuilds only when the aspect really changes
  const aspect = useThree((state) => Math.round(state.viewport.aspect * 100) / 100);
  const key = parkLayoutOf(isMobile, aspect);
  const park = PARK[key];
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    camera.layers.enable(PARK_LAYER);
    return () => camera.layers.disable(PARK_LAYER);
  }, [camera]);
  useParkClock(prefersReducedMotion);
  useEffect(() => {
    // Debug only (stripped from production builds): the shared time of day,
    // the layout and the parts' counters, for the headless checks
    if (import.meta.env.DEV) window.__park = { timeOfDay, MOON_AT, key, stats: parkStats };
  }, [key]);
  const parts = { park, layout: key };
  return (
    <SectionGroup
      name="contact"
      position-x={isMobile ? 3 * sectionsDistance : 0}
      position-z={isMobile ? -4 : 3 * sectionsDistance}
    >
      <SectionTitle
        position-x={isMobile ? -1.1 : -2 * scaleFactor}
        position-z={0.5}
        rotation-y={Math.PI / 6}
      >
        CONTACT
      </SectionTitle>
      <ParkGround {...parts} />
      <ParkPond {...parts} />
      <ParkHouses {...parts} />
      <ParkLamps {...parts} />
      <ParkGarden {...parts} />
      <ParkProps
        {...parts}
        scaleFactor={scaleFactor}
        isMobile={isMobile}
        prefersReducedMotion={prefersReducedMotion}
      />
      <ParkSparkles {...parts} />
    </SectionGroup>
  );
};
