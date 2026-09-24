import { RoundedBox } from "@react-three/drei";
import { Suspense } from "react";
import { useMobile } from "../contexts/MobileContext";
import { getSectionsDistance } from "../constants/animation";
import { Monitor } from "./Monitor";
import { MonitorScreen } from "./MonitorScreen";
import { SectionGroup } from "./SectionGroup";
import { SectionTitle } from "./SectionTitle";

export const ProjectsSection = ({ active }) => {
  const { isMobile } = useMobile();
  const sectionsDistance = getSectionsDistance(isMobile);
  return (
    <SectionGroup
      active={active}
      position-x={isMobile ? 2 * sectionsDistance : 0}
      position-z={isMobile ? -3 : 2 * sectionsDistance}
    >
      <group position-x={isMobile ? -0.25 : 1}>
        <SectionTitle
          position-x={-0.5}
          position-z={0}
          rotation-y={-Math.PI / 6}
        >
          PROJECTS
        </SectionTitle>

        <group
          position-x={0.5}
          position-z={0}
          rotation-y={-Math.PI / 6}
          scale={0.8}
        >
          <Monitor
            scale={0.02}
            position-y={1}
            rotation-y={-Math.PI / 2}
            position-z={-1}
          />
          {/* Own boundary: a screenshot texture that hasn't loaded yet
              (project switch) must not suspend the whole scene. */}
          <Suspense fallback={null}>
            <MonitorScreen
              rotation-x={-0.18}
              position-z={-0.895}
              position-y={1.74}
            />
          </Suspense>
          <RoundedBox scale-x={2} position-y={0.5} position-z={-1}>
            <meshStandardMaterial color="white" />
          </RoundedBox>
        </group>
      </group>
    </SectionGroup>
  );
};
