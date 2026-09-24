import { useLayoutEffect } from "react";
import { useMobile } from "../contexts/MobileContext";

// Pushes a model's material above the normal brightness range on desktop (a
// brighter star and lamp bulb, no halo): the emissive term is the material's own
// base color (base colors are frozen), at `intensity`. Emissive is a uniform,
// not a program parameter, so the pre-warmed shader is unchanged. Restored on
// unmount.
// Mutates the shared, cached GLTF material in place (each model is loaded once
// and used by a single instance today).
export const useEmissiveGlow = (material, intensity) => {
  const { isMobile } = useMobile();
  // MOBILE_PERF: no glow on mobile, which keeps the plain material — revert by removing the ternary
  const glow = isMobile ? 0 : intensity;
  useLayoutEffect(() => {
    if (!glow || !material) return;
    const prevEmissive = material.emissive.clone();
    const prevIntensity = material.emissiveIntensity;
    material.emissive.copy(material.color);
    material.emissiveIntensity = glow;
    return () => {
      material.emissive.copy(prevEmissive);
      material.emissiveIntensity = prevIntensity;
    };
  }, [material, glow]);
};
