import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";

// Adaptive DPR, desktop only (mounted after the first visible frame; mobile
// never mounts it). A frame-rate monitor with explicit thresholds and
// hysteresis walks a ladder of DPR values:
//   below STEP_DOWN_FPS for STEP_DOWN_MS  -> one step down
//   above STEP_UP_FPS   for STEP_UP_MS    -> one step up
// Every step is reversible; the measurement seam gets a mark per step.
const STEP_DOWN_FPS = 40;
const STEP_DOWN_MS = 2000;
const STEP_UP_FPS = 55;
const STEP_UP_MS = 3000;
// Frame-rate sampling window.
const WINDOW_MS = 500;
const DPR_STEP = 0.5;

// Ladder from the canvas's current DPR down to 1 (never below).
const buildLevels = (maxDpr) => {
  const levels = [];
  // MOBILE_PERF: DPR step-down (desktop only this pass; the mobile range 1–1.5
  // is untouched) — revert by returning [maxDpr]
  for (let dpr = maxDpr; dpr > 1; dpr -= DPR_STEP) levels.push(dpr);
  levels.push(1);
  return levels;
};

export default function DesktopQuality({ onDpr }) {
  const initialDpr = useThree((state) => state.viewport.initialDpr);
  const [levels] = useState(() => buildLevels(initialDpr));
  const [level, setLevel] = useState(0);
  const levelRef = useRef(0);
  const sample = useRef({ start: performance.now(), frames: 0, low: 0, high: 0 });

  useEffect(() => {
    onDpr(levels[level]);
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

  return null;
}
