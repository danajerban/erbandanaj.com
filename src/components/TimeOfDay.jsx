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
  // The contact shadows' opacity: the dark night lawn needs more (past 1 it
  // scales the blurred shadow's own alpha, a uniform, no new program)
  shadow: [0.42, 0.42, 0.42, 1.8],
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

// Safari's bars (iOS 26 paints them in the page's background-color) and
// Chrome Android's theme-color: the sky's top stop at each rest
const BAR = ["#e4a39d", "#b48fa6", "#2c3c76", "#0b1231"].map((hex) => parseInt(hex.slice(1), 16));
// Bar writes per section (<= 96 over a full scroll); each repaints the root once.
// Written as background-color on html and body (not inherited, so only those
// two restyle); a custom property on html would restyle the whole document
const BAR_STEPS = 32;
// In sRGB per channel, as the CSS sky blends
const mixHex = (a, b, f) => {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const x = (a >> shift) & 255;
    out |= Math.round(x + (((b >> shift) & 255) - x) * f) << shift;
  }
  return `#${out.toString(16).padStart(6, "0")}`;
};
const skyMode = (s) => (s >= 2.5 ? "night" : s >= 1.5 ? "dusk" : s >= 0.5 ? "afterglow" : "");

// Writes the DOM only where its string changed: at rest, nothing
const paint = (s, dom) => {
  const k = Math.min(Math.floor(s), 2);
  const f = s - k;
  const o = [0, 1, 2].map((i) => Math.round(MathUtils.clamp(s - i, 0, 1) * 1000) / 1000);
  const op = o.join();
  if (op !== dom.op) {
    dom.op = op;
    dom.layers.forEach((layer, i) => {
      layer.style.opacity = o[i];
      // Hidden while clear or under an opaque layer: no GPU layer to keep
      layer.style.visibility = o[i] > 0 && !(o[i + 1] >= 1) ? "visible" : "hidden";
    });
  }
  const root = document.documentElement;
  const bar = s === 0 ? "" : mixHex(BAR[k], BAR[k + 1], Math.round(f * BAR_STEPS) / BAR_STEPS);
  if (bar !== dom.bar) {
    dom.bar = bar;
    root.style.backgroundColor = bar;
    document.body.style.backgroundColor = bar;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bar || "#e4a39d");
  }
  const mode = skyMode(s);
  if (mode !== dom.mode) {
    dom.mode = mode;
    if (mode) root.dataset.sky = mode;
    else delete root.dataset.sky;
  }
};

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
  if (o.shadow) {
    lerpColor(o.shadow.color, "shadowTint", k, f);
    o.shadow.opacity = at("shadow", k, f);
  }
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
  const dom = useRef({ layers: [], op: "", bar: "", mode: "" });

  useLayoutEffect(() => {
    timeOfDay.moonAt = MOON_AT[layout];
  }, [layout]);

  // The sky after the sunset: three cross-faded layers inside #root, under
  // the canvas (#root is positioned and isolated, see index.css)
  useLayoutEffect(() => {
    const sky = document.createElement("div");
    sky.className = "sky";
    sky.setAttribute("aria-hidden", "true");
    for (const name of ["afterglow", "bluehour", "night"]) {
      const layer = document.createElement("i");
      layer.className = `sky__${name}`;
      sky.append(layer);
    }
    document.getElementById("root").append(sky);
    const state = dom.current;
    state.layers = [...sky.children];
    return () => {
      sky.remove();
      const root = document.documentElement;
      root.style.backgroundColor = "";
      document.body.style.backgroundColor = "";
      delete root.dataset.sky;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#e4a39d");
      Object.assign(state, { layers: [], op: "", bar: "", mode: "" });
    };
  }, []);

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
    paint(s, dom.current);
  }, -1);

  return (
    <SilentErrorBoundary>
      <NightSky layout={layout} aspect={aspect} />
    </SilentErrorBoundary>
  );
}
