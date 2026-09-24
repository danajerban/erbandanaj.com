import { ContactShadows, useScroll } from "@react-three/drei";
import { useSetAtom } from "jotai";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RGBELoader } from "three-stdlib";
import { config } from "../config";
import { useMobile } from "../contexts/MobileContext";
import { getSectionsDistance } from "../constants/animation";
import { sectionAtom } from "../store";
import { Avatar } from "./Avatar";
import { SilentErrorBoundary } from "./ErrorBoundary";
import { HomeSection } from "./HomeSection";

// Skills, Projects and Contact are lazy chunks: their module-level
// useGLTF.preload() calls (and so their asset downloads) start only when the
// chunk is loaded, which Experience does after the first visible frame — or
// at once for the section the URL hash asks for, which then joins the splash
// gate. Each mounts inside its own Suspense boundary and pre-warms itself on
// the GPU while hidden (SectionGroup).
const BACKGROUND_SECTIONS = [
  { name: "skills", Section: lazy(() => import("./SkillsSection").then((m) => ({ default: m.SkillsSection }))) },
  { name: "projects", Section: lazy(() => import("./ProjectsSection").then((m) => ({ default: m.ProjectsSection }))) },
  { name: "contact", Section: lazy(() => import("./ContactSection").then((m) => ({ default: m.ContactSection }))) },
];

const HDR_URL = "/hdri/venice_sunset_256.hdr";
// Start the environment HDR load at module-eval, in the same batch as the
// models' useGLTF.preload() calls, so <EnvironmentMap> resolves together with
// the GLBs and the splash (hidden on the first frame after the gate resolves
// and pre-warms — see SceneReady/initialLoader) never reveals an unlit scene.
useLoader.preload(RGBELoader, HDR_URL);

// Equirectangular HDR as the scene's environment — the same thing drei's
// <Environment files> does for an .hdr, without its EXR/gain-map loaders on
// the scene path. RGBELoader comes from "three-stdlib" at the version drei
// resolves (2.36.1); r3f's loader cache keys on the class, so keep it pinned.
const EnvironmentMap = () => {
  const texture = useLoader(RGBELoader, HDR_URL);
  const scene = useThree((state) => state.scene);
  useLayoutEffect(() => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.LinearSRGBColorSpace;
    const previous = scene.environment;
    scene.environment = texture;
    return () => {
      scene.environment = previous;
    };
  }, [scene, texture]);
  return null;
};

// The section the URL named at load, if it is not Home: it joins the splash
// gate instead of loading in the background, so the visitor lands on it ready.
const gateSection = (() => {
  const hash = window.location.hash.slice(1);
  return hash !== config.sections[0] && config.sections.includes(hash) ? hash : null;
})();

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

export const Experience = ({ revealed }) => {
  const { isMobile } = useMobile();
  const [section, setSection] = useState(config.sections[0]);
  const sectionRef = useRef(section);
  const setSectionIndex = useSetAtom(sectionAtom);
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
      setSectionIndex(sectionIndex);
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
      <EnvironmentMap />
      <SunsetSun isMobile={isMobile} />
      {/* LIGHTS — on top of the environment map. A warm key from the sunset
          sprite's direction (behind, right) rims the models; a faint cool
          fill from the camera side lifts the shadowed faces. */}
      {/* MOBILE_PERF: scene lights are desktop only, mobile keeps env-only
          lighting — revert by removing the ternary */}
      {!isMobile && (
        <>
          <directionalLight position={[5.25, 3, -13]} color="#ffd2b0" intensity={0.55} />
          <directionalLight position={[-4, 5, 8]} color="#e4ecff" intensity={0.22} />
        </>
      )}
      <Avatar position-z={isMobile ? -5 : 0} />

      {/* SHADOWS — softer, higher-resolution contact shadows on desktop */}
      {/* MOBILE_PERF: reduce shadow resolution and blur on mobile — revert by removing ternaries */}
      <ContactShadows
        opacity={0.42}
        scale={[30, 30]}
        color="#b07a62"
        resolution={isMobile ? 128 : 512}
        blur={isMobile ? 1.5 : 2.8}
      />

      <group ref={sceneContainer}>
        <HomeSection active={section === "home"} />
        {BACKGROUND_SECTIONS.map(({ name, Section }) => (
          <SilentErrorBoundary key={name}>
            {name === gateSection ? (
              <Section active={section === name} />
            ) : (
              revealed && (
                <Suspense fallback={null}>
                  <Section active={section === name} />
                </Suspense>
              )
            )}
          </SilentErrorBoundary>
        ))}
      </group>
    </>
  );
};
