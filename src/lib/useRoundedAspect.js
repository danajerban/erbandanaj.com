import { useThree } from "@react-three/fiber";

// The canvas's aspect (width / height), rounded to 0.01: what is laid out
// by it (lib/coast sceneLayoutOf, the palms, the rooms, the park) rebuilds
// only when the screen's shape really changes, and every part reads the
// same value
export const useRoundedAspect = () => useThree((state) => Math.round(state.viewport.aspect * 100) / 100);
