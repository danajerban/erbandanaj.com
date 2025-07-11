import {
  Center,
  ContactShadows,
  Environment,
  Float,
  MeshDistortMaterial,
  RoundedBox,
  useScroll,
} from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { motion } from "framer-motion-3d";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { config } from "../config";
import { useMobile } from "../hooks/useMobile";
import { Avatar } from "./Avatar";
import { Balloon } from "./Balloon";
import { BookCase } from "./BookCase";
import { CouchSmall } from "./CouchSmall";
import { Lamp } from "./Lamp";
import { MacBookPro } from "./MacBookPro";
import { Mailbox } from "./Mailbox";
import { Monitor } from "./Monitor";
import { MonitorScreen } from "./MonitorScreen";
import { PalmTree } from "./PalmTree";
import { ParkBench } from "./ParkBench";
import { Pigeon } from "./Pigeon";
import { SectionTitle } from "./SectionTitle";
import { Star } from "./Star";

const SECTIONS_DISTANCE = 10;

export const Experience = () => {
  const { isMobile, scaleFactor } = useMobile();
  const [section, setSection] = useState(config.sections[0]);
  const sceneContainer = useRef();
  const scrollData = useScroll();
  useFrame(() => {
    if (isMobile) {
      sceneContainer.current.position.x =
        -scrollData.offset * SECTIONS_DISTANCE * (scrollData.pages - 1);
      sceneContainer.current.position.z = 0;
    } else {
      sceneContainer.current.position.z =
        -scrollData.offset * SECTIONS_DISTANCE * (scrollData.pages - 1);
      sceneContainer.current.position.x = 0;
    }

    setSection(
      config.sections[Math.round(scrollData.offset * (scrollData.pages - 1))]
    );
  });
  useEffect(() => {
    const handleHashChange = () => {
      const sectionIndex = config.sections.indexOf(
        window.location.hash.replace("#", "")
      );
      if (sectionIndex !== -1) {
        scrollData.el.scrollTo(
          0,
          (sectionIndex / (config.sections.length - 1)) *
            (scrollData.el.scrollHeight - scrollData.el.clientHeight)
        );
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return (
    <>
      <Environment preset="sunset" />
      <Avatar position-z={isMobile ? -5 : 0} />

      {/* SHADOWS & FLOOR */}
      <ContactShadows opacity={0.5} scale={[30, 30]} color="#9c8e66" />
      <mesh position-y={-0.001} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial color="#f5f3ee" />
      </mesh>

      <motion.group ref={sceneContainer} animate={section}>
        {/* HOME */}
        <motion.group
          position-y={-5}
          variants={{
            home: {
              y: 0,
            },
          }}
        >
          <Star position-z={isMobile ? -5 : 0} position-y={2.2} scale={0.3} />
          <Float floatIntensity={1.5} speed={isMobile ? 1 : 2.5}>
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
            <Float floatIntensity={isMobile ? 0.2 : 0.5}>
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
            {/* <Center disableY disableZ>
              <SectionTitle
                size={isMobile ? 0 : 0.7}
                position-x={-2.2}
                position-z={-3}
                bevelEnabled
                bevelThickness={0.1}
                rotation-y={Math.PI / 9}
                letterSpacing={0.05}
              >
                {config.home.subtitle}
              </SectionTitle>
            </Center> */}
          </group>
        </motion.group>
        {/* SKILLS */}
        <motion.group
          position-x={isMobile ? SECTIONS_DISTANCE : 0}
          position-z={isMobile ? -4 : SECTIONS_DISTANCE}
          position-y={-5}
          variants={{
            skills: {
              y: 0,
            },
          }}
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
          <mesh position-y={2} position-z={-4} position-x={2}>
            <sphereGeometry args={[1, 64, 64]} />
            <MeshDistortMaterial
              opacity={0.8}
              transparent
              distort={1}
              speed={3.5}
              color="#924435"
            />
          </mesh>
        </motion.group>
        {/* PROJECTS */}
        <motion.group
          position-x={isMobile ? 2 * SECTIONS_DISTANCE : 0}
          position-z={isMobile ? -3 : 2 * SECTIONS_DISTANCE}
          position-y={-5}
          variants={{
            projects: {
              y: 0,
            },
          }}
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
              <MonitorScreen
                rotation-x={-0.18}
                position-z={-0.895}
                position-y={1.74}
              />
              <RoundedBox scale-x={2} position-y={0.5} position-z={-1}>
                <meshStandardMaterial color="white" />
              </RoundedBox>
            </group>
          </group>
        </motion.group>
        {/* CONTACT */}
        <motion.group
          position-x={isMobile ? 3 * SECTIONS_DISTANCE : 0}
          position-z={isMobile ? -4 : 3 * SECTIONS_DISTANCE}
          position-y={-5}
          variants={{
            contact: {
              y: 0,
            },
          }}
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
              <Float floatIntensity={2} rotationIntensity={1.5}>
                <Balloon scale={1.5} position-x={-0.5} color="#71a2d9" />
              </Float>
              <Float
                floatIntensity={1.5}
                rotationIntensity={2}
                position-z={0.5}
              >
                <Balloon scale={1.3} color="#d97183" />
              </Float>
              <Float speed={2} rotationIntensity={2}>
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
          <Float floatIntensity={1.8} speed={4}>
            <Pigeon
              position-x={isMobile ? 0 : 2 * scaleFactor}
              position-y={isMobile ? 2.2 : 1.5}
              position-z={-0.5}
              scale={0.25}
            />
          </Float>
        </motion.group>
      </motion.group>
    </>
  );
};
