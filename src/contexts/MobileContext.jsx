import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

const REFERENCE_WIDTH = 1920;
// Single source for the breakpoint — scripts/check-breakpoint.mjs keeps the
// CSS `@media (max-width: …)` queries in sync with this value.
const MOBILE_THRESHOLD = 990;

const MobileContext = createContext(null);

// Self-updating mobile flag, shared by MobileProvider and by trees outside it
// (drei's <Scroll html> overlay is a separate React root, so context can't
// reach it). matchMedia fires on its own — no dependency on the canvas
// re-rendering — and both sides flip on the same event.
const mobileQuery = window.matchMedia(`(max-width: ${MOBILE_THRESHOLD}px)`);
const subscribeMobileQuery = (onChange) => {
  mobileQuery.addEventListener("change", onChange);
  return () => mobileQuery.removeEventListener("change", onChange);
};
const getIsMobileMedia = () => mobileQuery.matches;

export const MobileProvider = ({ children }) => {
  const [scaleFactor, setScaleFactor] = useState(
    window.innerWidth / REFERENCE_WIDTH
  );
  const isMobile = useSyncExternalStore(subscribeMobileQuery, getIsMobileMedia);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    let timeoutId;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setScaleFactor(window.innerWidth / REFERENCE_WIDTH);
      }, 150);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e) => setPrefersReducedMotion(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const value = useMemo(
    () => ({ isMobile, scaleFactor, prefersReducedMotion }),
    [isMobile, scaleFactor, prefersReducedMotion]
  );

  return (
    <MobileContext.Provider value={value}>
      {children}
    </MobileContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useMobile = () => {
  const context = useContext(MobileContext);
  const isMobileMedia = useSyncExternalStore(
    subscribeMobileQuery,
    getIsMobileMedia,
  );
  if (!context) {
    // Fallback for components outside MobileProvider (e.g., drei's <Scroll html> portal)
    return {
      isMobile: isMobileMedia,
      scaleFactor: window.innerWidth / REFERENCE_WIDTH,
      prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches,
    };
  }
  return context;
};
