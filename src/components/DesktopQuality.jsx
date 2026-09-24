import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";

// Adaptive quality, desktop only (this module is a lazy chunk mounted after the
// first visible frame; mobile never loads it). A frame-rate monitor with
// explicit thresholds and hysteresis walks a ladder of quality levels:
//   below STEP_DOWN_FPS for STEP_DOWN_MS  -> one level down
//   above STEP_UP_FPS   for STEP_UP_MS    -> one level up
// Every level is reversible; the measurement seam gets a mark per step.
const STEP_DOWN_FPS = 40;
const STEP_DOWN_MS = 2000;
const STEP_UP_FPS = 55;
const STEP_UP_MS = 3000;
// Frame-rate sampling window.
const WINDOW_MS = 500;
const DPR_STEP = 0.5;

// Bloom is wired but not yet shown: the effect composer would tone-map the
// sunset-sun sprite, which is frozen until Phase 3 adds its layer mask and
// the owner signs off the look. Kept as runtime data so the postprocessing
// library stays in this chunk and its cost is measured now.
const BLOOM = { ready: false };

// Ladder from the canvas's current DPR down to 1 (never below), then bloom off
// (a rung only once bloom is shown — a step that changes nothing is not a step).
const buildLevels = (maxDpr) => {
  const levels = [];
  // MOBILE_PERF: DPR step-down (desktop only this pass; the mobile range 1–1.5
  // is untouched) — revert by returning [{ dpr: maxDpr, bloom: true }]
  for (let dpr = maxDpr; dpr > 1; dpr -= DPR_STEP) levels.push({ dpr, bloom: true });
  levels.push({ dpr: 1, bloom: true });
  // MOBILE_PERF: bloom off as the last resort — revert by removing this level
  if (BLOOM.ready) levels.push({ dpr: 1, bloom: false });
  return levels;
};

export default function DesktopQuality({ onDpr }) {
  const initialDpr = useThree((state) => state.viewport.initialDpr);
  const [levels] = useState(() => buildLevels(initialDpr));
  const [level, setLevel] = useState(0);
  const levelRef = useRef(0);
  const sample = useRef({ start: performance.now(), frames: 0, low: 0, high: 0 });

  useEffect(() => {
    onDpr(levels[level].dpr);
  }, [levels, level, onDpr]);
  // Restore the canvas's own DPR when this unmounts (viewport crossed to mobile).
  useEffect(() => () => onDpr(null), [onDpr]);

  useFrame(() => {
    const s = sample.current;
    s.frames += 1;
    const now = performance.now();
    const elapsed = now - s.start;
    if (elapsed < WINDOW_MS) return;
    const fps = (s.frames * 1000) / elapsed;
    s.start = now;
    s.frames = 0;
    // A window far longer than it should be spans a stall or a hidden tab (no
    // frames run while hidden): it says nothing about the frame rate, so it
    // never counts toward a step.
    if (elapsed > 2 * WINDOW_MS) {
      s.low = 0;
      s.high = 0;
      return;
    }
    if (fps < STEP_DOWN_FPS) {
      s.low += elapsed;
      s.high = 0;
      if (s.low >= STEP_DOWN_MS && levelRef.current < levels.length - 1) {
        s.low = 0;
        levelRef.current += 1;
        setLevel(levelRef.current);
        performance.mark("quality-step-down");
      }
    } else if (fps > STEP_UP_FPS) {
      s.high += elapsed;
      s.low = 0;
      if (s.high >= STEP_UP_MS && levelRef.current > 0) {
        s.high = 0;
        levelRef.current -= 1;
        setLevel(levelRef.current);
        performance.mark("quality-step-up");
      }
    } else {
      s.low = 0;
      s.high = 0;
    }
  });

  if (!(levels[level].bloom && BLOOM.ready)) return null;
  return (
    <EffectComposer>
      <Bloom luminanceThreshold={1} mipmapBlur />
    </EffectComposer>
  );
}
