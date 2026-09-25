import { useScroll } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, MathUtils } from "three";
import { ANIMATION_CONSTANTS } from "../constants/animation";

// Recolors the bottom edge strip in index.html, whose color Safari (iOS 26)
// gives its bottom bar, to what the scene shows at that edge: Home's sand,
// which dissolves into the page's floor color as the visitor scrolls away
// from Home, over the same span as the sections' dissolve. The top strip
// keeps its own color, the sky's, the same in every section. Before the
// reveal both keep the splash's colors.

// Home's sand at the bottom edge, measured on an iPhone 15 Pro
const SAND = new Color("#e1c097");
// --scene-floor-color: the other sections show the page's floor there
const FLOOR = new Color("#f1cabb");

export const EdgeTint = ({ revealed }) => {
  const scroll = useScroll();
  const strip = useMemo(() => document.querySelector(".edge-tint--bottom"), []);
  const color = useMemo(() => new Color(), []);
  const shown = useRef("");

  useFrame(() => {
    if (!revealed || !strip) return;
    const away = scroll.offset * (scroll.pages - 1);
    const t = MathUtils.smoothstep(away, ANIMATION_CONSTANTS.DISSOLVE_START, ANIMATION_CONSTANTS.DISSOLVE_END);
    const hex = color.lerpColors(SAND, FLOOR, t).getHexString();
    // Only on a change: a style write per frame would restyle the page
    if (hex === shown.current) return;
    shown.current = hex;
    strip.style.backgroundColor = `#${hex}`;
  });

  return null;
};
