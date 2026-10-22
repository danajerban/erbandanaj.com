import { useSyncExternalStore } from "react";

// Single source for the breakpoint — scripts/check-breakpoint.mjs keeps the
// CSS `@media (max-width: …)` queries in sync with this value.
const MOBILE_THRESHOLD = 990;

// Self-updating media flags, read by every tree alike (drei's <Scroll html>
// overlay is a separate React root, so a context couldn't reach it).
// matchMedia fires on its own — no dependency on the canvas re-rendering —
// and every reader flips on the same event.
const mediaStore = (query) => {
  const mql = window.matchMedia(query);
  return {
    subscribe: (onChange) => {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    getSnapshot: () => mql.matches,
  };
};
const mobileStore = mediaStore(`(max-width: ${MOBILE_THRESHOLD}px)`);
const reducedMotionStore = mediaStore("(prefers-reduced-motion: reduce)");
// Phones and touch tablets, whatever their width: the scroll hint is the
// "Swipe up" pill instead of the mouse (index.css)
const swipePillStore = mediaStore(
  `(max-width: ${MOBILE_THRESHOLD}px), (hover: none) and (pointer: coarse)`,
);

export const useMobile = () => ({
  isMobile: useSyncExternalStore(mobileStore.subscribe, mobileStore.getSnapshot),
  prefersReducedMotion: useSyncExternalStore(
    reducedMotionStore.subscribe,
    reducedMotionStore.getSnapshot,
  ),
  swipePill: useSyncExternalStore(swipePillStore.subscribe, swipePillStore.getSnapshot),
});
