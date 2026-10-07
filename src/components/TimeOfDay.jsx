import { useScroll } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import { Color, MathUtils } from "three";
import { useMobile } from "../contexts/MobileContext";
import { layoutOf } from "../lib/coast";
import { MOON_AT, timeOfDay } from "../lib/timeOfDay";
import { SilentErrorBoundary } from "./ErrorBoundary";
import { NightSky } from "./NightSky";

// One value per section rest: Home (today's values), Skills, Projects, Contact
const KEYS = {
  fog: ["#f0c6b7", "#f0b39a", "#9890b9", "#283260"],
  hemiSky: ["#f6cbb6", "#eab3ae", "#c8c0dc", "#8d9dd0"],
  hemiGround: ["#b8674a", "#9a5848", "#6a4d5c", "#5a4652"],
  hemi: [0.35, 0.4, 0.6, 0.85],
  env: [1, 0.85, 0.62, 0.3],
  keyColor: ["#ffc79e", "#ff9a78", "#b7a3dc", "#c4d0ff"],
  key: [0.65, 0.4, 0.12, 0.3],
  fillColor: ["#e4ecff", "#ece6ff", "#ffd2a1", "#ffc27a"],
  fill: [0.2, 0.2, 0.35, 0.4],
  shadowTint: ["#ffffff", "#f3dcd8", "#b3b5dc", "#98a2cf"],
  sunSet: [0, 1, 1, 1],
  sunFade: [1, 1, 0.45, 0],
  lamps: [0, 0.5, 1, 1],
  stars: [0, 0, 0.15, 1],
  moon: [0, 0, 0.25, 1],
};
const COLORS = ["fog", "hemiSky", "hemiGround", "keyColor", "fillColor", "shadowTint"];
const colors = Object.fromEntries(COLORS.map((name) => [name, KEYS[name].map((hex) => new Color(hex))]));
const at = (name, k, f) => KEYS[name][k] + (KEYS[name][k + 1] - KEYS[name][k]) * f;
const lerpColor = (out, name, k, f) => out.lerpColors(colors[name][k], colors[name][k + 1], f);
// s holds still this far either side of each rest (DISSOLVE_START's span)
const HOLD = 0.06;

// Writes the shared values and the scene's light for the eased time s
const apply = (s, scene, o) => {
  const k = Math.min(Math.floor(s), 2);
  const f = s - k;
  timeOfDay.s = s;
  timeOfDay.night = s / 3;
  timeOfDay.lamps = at("lamps", k, f);
  timeOfDay.stars = at("stars", k, f);
  timeOfDay.moon = at("moon", k, f);
  if (scene.fog) lerpColor(scene.fog.color, "fog", k, f);
  scene.environmentIntensity = at("env", k, f);
  if (o.hemi) {
    lerpColor(o.hemi.color, "hemiSky", k, f);
    lerpColor(o.hemi.groundColor, "hemiGround", k, f);
    o.hemi.intensity = at("hemi", k, f);
  }
  if (o.key) {
    lerpColor(o.key.color, "keyColor", k, f);
    o.key.intensity = at("key", k, f);
  }
  if (o.fill) {
    lerpColor(o.fill.color, "fillColor", k, f);
    o.fill.intensity = at("fill", k, f);
  }
  if (o.shadow) lerpColor(o.shadow.color, "shadowTint", k, f);
  if (o.sun) {
    const u = o.sun.material.uniforms;
    u.uSet.value = at("sunSet", k, f);
    u.uFade.value = at("sunFade", k, f);
    o.sun.visible = u.uFade.value > 0;
  }
};

export default function TimeOfDay() {
  const { isMobile } = useMobile();
  const scroll = useScroll();
  const scene = useThree((state) => state.scene);
  // Rounded as in HomeSection, so the layout key flips only on a real change
  const aspect = useThree((state) => Math.round(state.viewport.aspect * 100) / 100);
  const shape = layoutOf(isMobile, aspect);
  const layout = !isMobile && shape === "portrait" ? "tall" : shape;
  const objects = useRef({});
  const last = useRef(-1);

  useLayoutEffect(() => {
    timeOfDay.moonAt = MOON_AT[layout];
  }, [layout]);

  // The desktop key and fill lights mount and unmount with isMobile: find
  // everything again, and rewrite every value on the next frame. On unmount
  // (an error, HMR) the scene goes back to the Home values, never stranded
  // at night; on an isMobile flip the next frame rewrites them before any
  // render (priority -1)
  useLayoutEffect(() => {
    let hemi;
    scene.traverse((o) => {
      if (o.isHemisphereLight) hemi = o;
    });
    const found = {
      sun: scene.getObjectByName("sun"),
      key: scene.getObjectByName("key"),
      fill: scene.getObjectByName("fill"),
      hemi,
      shadow: scene.getObjectByName("shadows")?.children[0]?.material,
    };
    objects.current = found;
    last.current = -1;
    return () => {
      timeOfDay.t = 0;
      apply(0, scene, found);
    };
  }, [scene, isMobile]);

  useFrame(() => {
    const t = MathUtils.clamp(scroll.offset * (scroll.pages - 1), 0, 3);
    timeOfDay.t = t;
    const k = Math.min(Math.floor(t), 2);
    const s = k + MathUtils.smoothstep(t - k, HOLD, 1 - HOLD);
    if (s === last.current) return;
    last.current = s;
    apply(s, scene, objects.current);
  }, -1);

  return (
    <SilentErrorBoundary>
      <NightSky layout={layout} aspect={aspect} />
    </SilentErrorBoundary>
  );
}
