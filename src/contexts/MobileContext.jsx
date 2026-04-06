import { createContext, useContext, useEffect, useMemo, useState } from "react";

const REFERENCE_WIDTH = 1920;
const MOBILE_THRESHOLD = 990;

const MobileContext = createContext(null);

export const MobileProvider = ({ children }) => {
  const [scaleFactor, setScaleFactor] = useState(
    window.innerWidth / REFERENCE_WIDTH
  );
  const [isMobile, setIsMobile] = useState(
    window.innerWidth <= MOBILE_THRESHOLD
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    let timeoutId;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setScaleFactor(window.innerWidth / REFERENCE_WIDTH);
        setIsMobile(window.innerWidth <= MOBILE_THRESHOLD);
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
  if (!context) {
    // Fallback for components outside MobileProvider (e.g., drei's <Scroll html> portal)
    return {
      isMobile: window.innerWidth <= MOBILE_THRESHOLD,
      scaleFactor: window.innerWidth / REFERENCE_WIDTH,
      prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches,
    };
  }
  return context;
};
