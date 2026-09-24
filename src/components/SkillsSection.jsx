import { MeshDistortMaterial } from "@react-three/drei";
import { useMobile } from "../contexts/MobileContext";
import { getSectionsDistance } from "../constants/animation";
import { BookCase } from "./BookCase";
import { CouchSmall } from "./CouchSmall";
import { Lamp } from "./Lamp";
import { SectionGroup } from "./SectionGroup";
import { SectionTitle } from "./SectionTitle";

export const SkillsSection = ({ active }) => {
  const { isMobile, prefersReducedMotion } = useMobile();
  const sectionsDistance = getSectionsDistance(isMobile);
  return (
    <SectionGroup
      active={active}
      position-x={isMobile ? sectionsDistance : 0}
      position-z={isMobile ? -4 : sectionsDistance}
    >
      <group position-x={isMobile ? 0 : -2}>
        <SectionTitle position-z={1.5} rotation-y={Math.PI / 6}>
          SKILLS
        </SectionTitle>
        <BookCase position-z={-2} />
        <CouchSmall
          scale={0.4}
          position-z={0}
          position-x={-0.2}
          rotation-y={Math.PI / 3}
        />
        <Lamp
          position-z={0.6}
          position-x={-0.4}
          position-y={-0.8}
          rotation-y={-Math.PI}
        />
      </group>
      {/* MOBILE_PERF: reduce geometry and shader speed on mobile — revert by removing ternaries */}
      <mesh
        position-y={isMobile ? 2.35 : 2}
        position-z={isMobile ? -5.4 : -4}
        position-x={isMobile ? 2.45 : 2}
      >
        <sphereGeometry args={[1, isMobile ? 32 : 64, isMobile ? 32 : 64]} />
        <MeshDistortMaterial
          opacity={isMobile ? 0.34 : 0.5}
          transparent
          distort={isMobile ? 0.28 : 0.45}
          speed={prefersReducedMotion ? 0 : (isMobile ? 0.8 : 1.4)}
          color="#d95a41"
        />
      </mesh>
    </SectionGroup>
  );
};
