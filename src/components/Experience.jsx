import { ContactShadows, Environment, useScroll } from "@react-three/drei";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RGBELoader } from "three-stdlib";
import { config } from "../config";
import { useMobile } from "../contexts/MobileContext";
import { getSectionsDistance } from "../constants/animation";
import { Avatar } from "./Avatar";
import { ContactSection } from "./ContactSection";
import { HomeSection } from "./HomeSection";
import { ProjectsSection } from "./ProjectsSection";
import { SkillsSection } from "./SkillsSection";

// Start the environment HDR load at module-eval, in the same batch as the
// models' useGLTF.preload() calls, so <Environment> resolves together with the
// GLBs and the splash (hidden on the first frame after Suspense resolves — see
// SceneReady/initialLoader) never reveals an unlit scene. Without this the HDR
// fetch would start late — causing a lighting pop-in. Uses drei's exact RGBELoader
// (from "three-stdlib") + the same URL as <Environment> below, so r3f's
// suspend-react cache dedupes both to a single fetch/decode. Keep "three-stdlib"
// pinned to the version drei resolves (2.36.1) — a mismatched class reference
// silently double-loads.
useLoader.preload(RGBELoader, "/hdri/venice_sunset_256.hdr");

const createSunTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;

  const context = canvas.getContext("2d");
  const center = canvas.width / 2;
  const gradient = context.createRadialGradient(
    center,
    center,
    canvas.width * 0.08,
    center,
    center,
    canvas.width * 0.5,
  );

  gradient.addColorStop(0, "rgba(198, 72, 58, 0.34)");
  gradient.addColorStop(0.36, "rgba(216, 92, 72, 0.26)");
  gradient.addColorStop(0.56, "rgba(231, 120, 88, 0.16)");
  gradient.addColorStop(0.78, "rgba(236, 148, 108, 0.08)");
  gradient.addColorStop(1, "rgba(236, 148, 108, 0)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const SunsetSun = ({ isMobile }) => {
  const sunTexture = useMemo(createSunTexture, []);
  const size = isMobile ? 3.2 : 7;
  const position = isMobile ? [1.35, 2.62, -8.5] : [5.25, 3.02, -13];

  useEffect(() => {
    return () => sunTexture.dispose();
  }, [sunTexture]);

  return (
    <sprite position={position} scale={[size, size, 1]}>
      <spriteMaterial
        map={sunTexture}
        transparent
        opacity={0.9}
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  );
};

export const Experience = () => {
  const { isMobile } = useMobile();
  const [section, setSection] = useState(config.sections[0]);
  const sectionRef = useRef(section);
  const sceneContainer = useRef();
  const scrollData = useScroll();
  const sectionsDistance = getSectionsDistance(isMobile);
  // Safe: R3F useFrame re-captures the closure on each render
  useFrame(() => {
    if (isMobile) {
      sceneContainer.current.position.x =
        -scrollData.offset * sectionsDistance * (scrollData.pages - 1);
      sceneContainer.current.position.z = 0;
    } else {
      sceneContainer.current.position.z =
        -scrollData.offset * sectionsDistance * (scrollData.pages - 1);
      sceneContainer.current.position.x = 0;
    }

    // Clamp: offset overshoots [0, 1] on iOS rubber-band scroll
    const sectionIndex = Math.min(
      config.sections.length - 1,
      Math.max(0, Math.round(scrollData.offset * (scrollData.pages - 1))),
    );
    const newSection = config.sections[sectionIndex];

    // Only update state if section actually changed
    if (newSection !== sectionRef.current) {
      sectionRef.current = newSection;
      setSection(newSection);
    }
  });

  useEffect(() => {
    const handleHashChange = () => {
      const sectionIndex = config.sections.indexOf(
        window.location.hash.replace("#", ""),
      );
      if (sectionIndex !== -1 && scrollData?.el) {
        const scrollHeight = scrollData.el.scrollHeight;
        const clientHeight = scrollData.el.clientHeight;
        const maxScroll = scrollHeight - clientHeight;

        if (maxScroll > 0) {
          scrollData.el.scrollTo(
            0,
            (sectionIndex / (config.sections.length - 1)) * maxScroll,
          );
        }
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [scrollData?.el]);

  // Scroll resync: when the canvas height changes (rotation), the browser keeps
  // the old pixel scrollTop or scroll-anchors it, so the overlay and scene land
  // between sections. Restore the section the visitor had scrolled to. Keyed on
  // R3F `size`, not window.resize: iOS fires resize when the toolbar collapses,
  // but #root (lvh) — and so `size` — does not change then.
  const size = useThree((state) => state.size);
  const sizeRef = useRef(size);
  const resyncIndexRef = useRef(0);
  useEffect(() => {
    const el = scrollData.el;
    const onScroll = () => {
      // Skip scrolls while the container no longer matches the rendered size:
      // those are the browser's own resize adjustments, not the visitor's.
      if (el.clientHeight !== Math.round(sizeRef.current.height)) return;
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 0) return;
      resyncIndexRef.current = Math.min(
        config.sections.length - 1,
        Math.max(0, Math.round((el.scrollTop / maxScroll) * (config.sections.length - 1))),
      );
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollData.el]);
  useEffect(() => {
    const prevHeight = sizeRef.current.height;
    sizeRef.current = size;
    if (prevHeight === size.height) return;
    const el = scrollData.el;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 0) return;
    // drei ignores the first scroll event after a size change, so its target
    // and damped offset are set directly as well
    const offset = resyncIndexRef.current / (config.sections.length - 1);
    el.scrollTo(0, offset * maxScroll);
    scrollData.scroll.current = offset;
    scrollData.offset = offset;
  }, [size, scrollData]);

  return (
    <>
      <Environment files="/hdri/venice_sunset_256.hdr" />
      <SunsetSun isMobile={isMobile} />
      <Avatar position-z={isMobile ? -5 : 0} />

      {/* SHADOWS */}
      {/* MOBILE_PERF: reduce shadow resolution on mobile — revert by removing ternaries */}
      <ContactShadows
        opacity={0.42}
        scale={[30, 30]}
        color="#b07a62"
        resolution={isMobile ? 128 : 256}
        blur={isMobile ? 1.5 : 2}
      />

      <group ref={sceneContainer}>
        <HomeSection active={section === "home"} />
        <SkillsSection active={section === "skills"} />
        <ProjectsSection active={section === "projects"} />
        <ContactSection active={section === "contact"} />
      </group>
    </>
  );
};
