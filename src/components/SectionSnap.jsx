import { useScroll } from "@react-three/drei";
import { useEffect } from "react";
import { config } from "../config";

const LAST = config.sections.length - 1;
// Share of a section a swipe must travel away from the section it started on
// to page on to the next one in its direction.
const NEXT_AT = 0.2;
// Scroll silence that counts as "at rest", momentum included.
const IDLE_MS = 120;

// Phones: after a swipe the page settles on a section, so it never rests
// between two rooms that have both faded into the haze. Touch only: wheel and
// trackpad scrolls, menu jumps, hash landings and the rotation re-anchor in
// Experience.jsx land on their own and are never moved. Event driven, no
// per-frame work; the 3D glide follows ScrollControls' damping as for any
// scroll. Mounted by SceneCanvas on phones only.
export default function SectionSnap({ reducedMotion }) {
  const { el } = useScroll();
  useEffect(() => {
    let touching = false;
    let armed = false;
    let timer = 0;
    let tries = 0;
    let startPos = 0;
    const sectionPx = () => (el.scrollHeight - el.clientHeight) / LAST;
    const settle = () => {
      timer = 0;
      if (touching || !armed) return;
      const px = sectionPx();
      if (!(px > 0)) {
        armed = false;
        return;
      }
      const pos = el.scrollTop / px;
      const from = Math.min(LAST, Math.max(0, Math.round(startPos)));
      let target = Math.round(pos);
      if (pos > startPos && pos >= from + NEXT_AT) target = Math.max(target, from + 1);
      if (pos < startPos && pos <= from - NEXT_AT) target = Math.min(target, from - 1);
      const top = Math.min(LAST, Math.max(0, target)) * px;
      // Stay armed until the page rests on the target: a fling that was still
      // coasting through a pause in scroll events is settled again.
      if (Math.abs(el.scrollTop - top) < 1 || ++tries > 3) {
        armed = false;
        return;
      }
      el.scrollTo({ top, behavior: reducedMotion ? "auto" : "smooth" });
    };
    const waitForRest = () => {
      clearTimeout(timer);
      timer = setTimeout(settle, IDLE_MS);
    };
    const onTouchStart = (event) => {
      if (event.touches.length > 1) return;
      touching = true;
      armed = false;
      clearTimeout(timer);
      const px = sectionPx();
      startPos = px > 0 ? el.scrollTop / px : 0;
    };
    const onTouchEnd = (event) => {
      if (event.touches.length) return;
      touching = false;
      armed = true;
      tries = 0;
      waitForRest();
    };
    const onScroll = () => {
      if (armed) waitForRest();
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("scroll", onScroll);
    };
  }, [el, reducedMotion]);
  return null;
}
