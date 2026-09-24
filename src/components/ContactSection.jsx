import { Float } from "@react-three/drei";
import { useMobile } from "../contexts/MobileContext";
import { getSectionsDistance } from "../constants/animation";
import { Balloon } from "./Balloon";
import { Mailbox } from "./Mailbox";
import { ParkBench } from "./ParkBench";
import { Pigeon } from "./Pigeon";
import { SectionGroup } from "./SectionGroup";
import { SectionTitle } from "./SectionTitle";

export const ContactSection = ({ active }) => {
  const { isMobile, scaleFactor, prefersReducedMotion } = useMobile();
  const sectionsDistance = getSectionsDistance(isMobile);
  return (
    <SectionGroup
      name="contact"
      active={active}
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
      <group position-x={-2 * scaleFactor}>
        <ParkBench
          scale={0.5}
          position-x={-0.5}
          position-z={-2.5}
          rotation-y={-Math.PI / 4}
        />
        <group position-y={2.2} position-z={-0.5}>
          <Float floatIntensity={2} rotationIntensity={1.5} speed={prefersReducedMotion ? 0 : 1}>
            <Balloon scale={1.5} position-x={-0.5} color="#71a2d9" />
          </Float>
          <Float
            floatIntensity={1.5}
            rotationIntensity={2}
            position-z={0.5}
            speed={prefersReducedMotion ? 0 : 1}
          >
            <Balloon scale={1.3} color="#d97183" />
          </Float>
          <Float speed={prefersReducedMotion ? 0 : 2} rotationIntensity={2}>
            <Balloon scale={1.6} position-x={0.4} color="yellow" />
          </Float>
        </group>
      </group>

      <Mailbox
        scale={0.25}
        rotation-y={1.25 * Math.PI}
        position-x={1}
        position-y={0.25}
        position-z={0.5}
      />
      <Float floatIntensity={1.8} speed={prefersReducedMotion ? 0 : 4}>
        <Pigeon
          position-x={isMobile ? 0 : 2 * scaleFactor}
          position-y={isMobile ? 2.2 : 1.5}
          position-z={-0.5}
          scale={0.25}
        />
      </Float>
    </SectionGroup>
  );
};
