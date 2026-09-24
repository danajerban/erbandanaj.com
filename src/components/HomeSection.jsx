import { Center, Float } from "@react-three/drei";
import * as THREE from "three";
import { config } from "../config";
import { useMobile } from "../contexts/MobileContext";
import { MacBookPro } from "./MacBookPro";
import { PalmTree } from "./PalmTree";
import { SectionGroup } from "./SectionGroup";
import { SectionTitle } from "./SectionTitle";
import { Star } from "./Star";

export const HomeSection = ({ active }) => {
  const { isMobile, scaleFactor, prefersReducedMotion } = useMobile();
  return (
    <SectionGroup active={active}>
      <Star position-z={isMobile ? -5 : 0} position-y={2.2} scale={0.3} />
      <Float floatIntensity={1.5} speed={prefersReducedMotion ? 0 : (isMobile ? 1 : 2.5)}>
        <MacBookPro
          position-x={isMobile ? -0.4 : -1}
          position-y={isMobile ? 0.6 : 0.5}
          position-z={isMobile ? -2 : 0}
          scale={0.3}
          rotation-y={Math.PI / 4}
        />
      </Float>
      <PalmTree
        scale={0.018}
        rotation-y={THREE.MathUtils.degToRad(140)}
        position={isMobile ? [1, 0, -4] : [scaleFactor * 4, 0, -5]}
      />
      <group scale={isMobile ? 0.3 : 1}>
        <Float floatIntensity={isMobile ? 0.2 : 0.5} speed={prefersReducedMotion ? 0 : 1}>
          <Center disableY disableZ>
            <SectionTitle
              size={isMobile ? 0.75 : 0.7}
              position-y={isMobile ? 0.6 : 1.1}
              position-z={isMobile ? -2.5 : -3}
              bevelEnabled
              bevelThickness={isMobile ? 0.1 : 0.2}
              letterSpacing={0.05}
            >
              {config.home.title}
            </SectionTitle>
          </Center>
        </Float>
      </group>
    </SectionGroup>
  );
};
