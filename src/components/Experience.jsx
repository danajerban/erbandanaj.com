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

// Sun placement as a screen fraction (x from the left, y from the top), so it
// holds at every viewport size; the CSS sky's radial warmth
// (--scene-sun-x/--scene-sun-y in index.css) and the index.html splash's copy
// of this sun are centered on the same fractions — keep them together when
// moving either. The camera pitches down at the origin, so its eye-level
// horizon crosses the screen ≈37 % from the top: the sun sits a little above
// that line, low over the sea. The quad sits SUN_DEPTH units down the view
// axis: beyond the ContactShadows box (30×30 around the origin), which
// renders every mesh inside it into the floor shadow — a quad in there draws
// a dark strip on the floor.
// Mobile (both orientations): over the sea on the right, as on desktop.
const SUN_SCREEN = { desktop: [0.855, 0.278], mobile: [0.8, 0.31] };
const SUN_DEPTH = 22;
// The sun is drawn in sun units: the short side of the screen, times this
const SUN_SCALE = { desktop: 1.25, mobile: 1.375 };
// Its reach, in sun units: the halo fades out SUN_REACH from the center, the
// horizon haze SUN_BAND[0] to either side and SUN_BAND[1] above and below
// the horizon. The quad is just big enough to hold both.
const SUN_REACH = 0.55;
const SUN_BAND = [0.8, 0.05];
const SUN_QUAD = [2 * Math.max(SUN_REACH, SUN_BAND[0]), 2 * SUN_REACH];

const SUN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv * 2.0 - 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// A low red sun seen through the evening haze, built like a game-engine sun
// without the post-processing: premultiplied layers composited "over" each
// other, every one a smooth, round falloff. From the back: a warm haze band
// on the horizon line, brightest under the sun; a wide, soft halo in the
// sky's reds, a long tail like light scattered in the haze; a tight glow
// that falls off fast (the bloom a camera would add); on top, the sun's body,
// an orange-red disc with a soft edge, hottest at its middle and redder at
// its rim. Faint rays shade the halo: angular sine octaves drifting at
// different speeds on uTime (integer frequencies keep the seam at a = PI
// continuous), faded out toward the body so they never meet in a spoked
// hub. The index.html splash repeats all of it, bar the rays, as CSS
// gradients: change the two together. No tone mapping (values are sRGB), no
// fog.
const SUN_FRAGMENT = /* glsl */ `
  uniform float uTime;
  // How far the horizon lies below the sun's center, in sun units
  uniform float uHorizon;
  varying vec2 vUv;
  vec4 over(vec4 below, vec3 color, float alpha) {
    return vec4(color * alpha, alpha) + below * (1.0 - alpha);
  }
  void main() {
    // p: from the sun's center, in sun units
    vec2 p = vUv * vec2(${(SUN_QUAD[0] / 2).toFixed(3)}, ${(SUN_QUAD[1] / 2).toFixed(3)});
    float r = length(p);
    float a = atan(p.y, p.x);
    float t = uTime * 0.04;
    float rays = (0.5 * sin(a * 12.0 + t) + 0.3 * sin(a * 19.0 - t * 1.5 + 2.1)
      + 0.2 * sin(a * 31.0 + t * 2.2 + 4.3))
      * smoothstep(0.06, 0.16, r) * (1.0 - smoothstep(0.2, ${SUN_REACH.toFixed(3)}, r));

    vec2 b = vec2(p.x / ${SUN_BAND[0].toFixed(3)}, (p.y + uHorizon) / ${SUN_BAND[1].toFixed(3)});
    float band = 0.5 * pow(max(1.0 - dot(b, b), 0.0), 3.0);
    float halo = 0.5 / (1.0 + r * r / 0.0144) * (1.0 - smoothstep(0.15, ${SUN_REACH.toFixed(3)}, r))
      * (1.0 + 0.35 * rays);
    float glow = 0.85 * exp(-pow(r / 0.045, 1.6));
    float body = exp(-pow(r / 0.03, 8.0));

    vec4 sun = over(vec4(0.0), vec3(0.988, 0.631, 0.518), band);
    sun = over(sun, vec3(0.949, 0.373, 0.29), halo);
    sun = over(sun, vec3(1.0, 0.478, 0.337), glow);
    sun = over(sun, mix(vec3(1.0, 0.467, 0.325), vec3(1.0, 0.549, 0.376), exp(-r * r / 0.0004)), body);
    gl_FragColor = sun;
  }
`;

const SunsetSun = ({ isMobile, prefersReducedMotion }) => {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const viewport = useThree((state) => state.viewport);
  const mesh = useRef();
  const light = useRef();
  const variant = isMobile ? "mobile" : "desktop";
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uHorizon: { value: 0 } },
        vertexShader: SUN_VERTEX,
        fragmentShader: SUN_FRAGMENT,
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => {
    return () => material.dispose();
  }, [material]);

  // Place the quad at the screen fraction, SUN_DEPTH down the view axis (the
  // camera is pitched at the origin, so offsets run along its own right/up),
  // parallel to the screen, so the sun stays round wherever it sits, sized in
  // sun units. The key light shines from the sun's direction (a directional
  // light points from its position to the world origin). The camera never
  // moves, so this only re-runs on resize.
  useLayoutEffect(() => {
    const object = mesh.current;
    const [fx, fy] = SUN_SCREEN[variant];
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const sun = camera.position.clone().addScaledVector(forward, SUN_DEPTH);
    const { width, height } = viewport.getCurrentViewport(camera, sun, size);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const rise = (1 - fy * 2) * (height / 2);
    sun.addScaledVector(right, (fx * 2 - 1) * (width / 2)).addScaledVector(up, rise);
    const unit = ((height * Math.min(size.width, size.height)) / size.height) * SUN_SCALE[variant];
    object.scale.set(SUN_QUAD[0] * unit, SUN_QUAD[1] * unit, 1);
    // The eye-level horizon lies SUN_DEPTH * tan(pitch) above the view axis
    const horizon = (SUN_DEPTH * -forward.y) / Math.hypot(forward.x, forward.z);
    material.uniforms.uHorizon.value = (rise - horizon) / unit;
    object.parent.updateWorldMatrix(true, false);
    object.position.copy(object.parent.worldToLocal(sun.clone()));
    object.lookAt(sun.clone().sub(forward));
    light.current?.position.copy(object.parent.worldToLocal(sun.sub(camera.position).setLength(SUN_DEPTH)));
  }, [camera, variant, size, viewport, material]);

  useFrame((state) => {
    if (!prefersReducedMotion) material.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <>
      <mesh ref={mesh} material={material}>
        <planeGeometry />
      </mesh>
      {/* MOBILE_PERF: the key light is desktop only, mobile keeps env +
          hemisphere lighting — revert by removing the !isMobile guard */}
      {!isMobile && <directionalLight ref={light} color="#ffc79e" intensity={0.65} />}
    </>
  );
};

export const Experience = ({ revealed }) => {
  const { isMobile, prefersReducedMotion } = useMobile();
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
      {/* LIGHTS — on top of the environment map. A golden key from the sun's
          direction (behind, right; SunsetSun) rims the models; a faint cool
          fill from the camera side lifts the shadowed faces; a
          peach-over-terracotta hemisphere sits everything in the sunset. */}
      <SunsetSun isMobile={isMobile} prefersReducedMotion={prefersReducedMotion} />
      <hemisphereLight args={["#f6cbb6", "#b8674a", 0.35]} />
      {/* MOBILE_PERF: the fill light is desktop only, mobile keeps env +
          hemisphere lighting — revert by removing the !isMobile guard */}
      {!isMobile && <directionalLight position={[-4, 5, 8]} color="#e4ecff" intensity={0.2} />}
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
        <HomeSection active={section === "home"} revealed={revealed} />
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
