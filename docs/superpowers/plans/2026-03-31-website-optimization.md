# Website Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix critical bugs, reduce mobile section spacing, optimize 3D performance on mobile, clean dead code, and improve accessibility across the portfolio website.

**Architecture:** Single-sweep approach grouped by file. Foundation files (constants, context) first, then consumers, then CSS, then cleanup. Each file touched exactly once.

**Tech Stack:** React 18, R3F (react-three-fiber), drei, Framer Motion, Jotai, Vite, plain CSS

**Spec:** `docs/superpowers/specs/2026-03-31-website-optimization-design.md`

---

### Task 1: Fix `constants/animation.js`

**Files:**
- Modify: `src/constants/animation.js`

- [ ] **Step 1: Remove `as const`, replace static `SECTIONS_DISTANCE` with function, remove unused `POSITIONS`**

```js
// Animation constants to avoid magic numbers throughout the codebase

export const ANIMATION_CONSTANTS = {
  // Scroll detection
  SCROLL_DELTA_THRESHOLD: 0.00001,

  // Rotation
  ROTATION_LERP_SPEED: 0.1,
  MOBILE_FORWARD_ROTATION: Math.PI / 2,
  MOBILE_BACKWARD_ROTATION: -Math.PI / 2,
  DESKTOP_BACKWARD_ROTATION: Math.PI,

  // Animation transitions
  ANIMATION_FADE_IN_DURATION: 0.5,
  ANIMATION_FADE_OUT_DURATION: 0.7,

  // Stagger delays
  SKILL_STAGGER_DELAY: 0.62,
  PROJECT_STAGGER_DELAY: 0.5,
  ANIMATION_BASE_DURATION: 1,
};

export const getSectionsDistance = (isMobile) => isMobile ? 7 : 10;
```

- [ ] **Step 2: Verify no import errors**

Run: `npm run build 2>&1 | head -20`
Expected: Build may show errors from files still importing old exports — that's expected, will be fixed in subsequent tasks.

---

### Task 2: Fix `MobileContext.jsx`

**Files:**
- Modify: `src/contexts/MobileContext.jsx`

- [ ] **Step 1: Add resize debounce and `prefersReducedMotion`**

```jsx
import { createContext, useContext, useEffect, useState } from "react";

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

  return (
    <MobileContext.Provider value={{ isMobile, scaleFactor, prefersReducedMotion }}>
      {children}
    </MobileContext.Provider>
  );
};

export const useMobile = () => {
  const context = useContext(MobileContext);
  if (!context) {
    throw new Error("useMobile must be used within MobileProvider");
  }
  return context;
};
```

---

### Task 3: Fix `App.jsx`

**Files:**
- Modify: `src/App.jsx`

Note: `useMobile()` can't be called directly in `App` because it renders `MobileProvider`. Extract a `SceneCanvas` component that lives inside the provider.

- [ ] **Step 1: Extract SceneCanvas, fix Suspense, add dpr limiting**

```jsx
import { Scroll, ScrollControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { MotionConfig } from "framer-motion";
import { Suspense } from "react";
import { SceneErrorBoundary } from "./components/ErrorBoundary";
import { Experience } from "./components/Experience";
import { Interface } from "./components/Interface";
import { LoadingScreen } from "./components/LoadingScreen";
import { Menu } from "./components/Menu";
import { config } from "./config";
import { MobileProvider, useMobile } from "./contexts/MobileContext";

function SceneCanvas() {
  const { isMobile } = useMobile();
  return (
    <Canvas
      camera={{ position: [0, 0.5, 5], fov: 42 }}
      // MOBILE_PERF: limit DPR on mobile — revert by removing the ternary
      dpr={[1, isMobile ? 1.5 : 2]}
    >
      <color attach="background" args={["#faeaea"]} />
      <fog attach="fog" args={["#faeaea", 10, 50]} />
      <ScrollControls
        pages={config.sections.length}
        damping={0.1}
        maxSpeed={0.2}
      >
        <group position-y={-1}>
          <MotionConfig
            transition={{
              duration: 0.6,
            }}
          >
            <Suspense fallback={null}>
              <Experience />
            </Suspense>
          </MotionConfig>
        </group>
        <Scroll html>
          <MotionConfig transition={{ duration: 1 }}>
            <Interface />
          </MotionConfig>
        </Scroll>
      </ScrollControls>
    </Canvas>
  );
}

function App() {
  return (
    <MobileProvider>
      <LoadingScreen />
      <SceneErrorBoundary>
        <SceneCanvas />
      </SceneErrorBoundary>
      <Menu />
    </MobileProvider>
  );
}

export default App;
```

---

### Task 4: Fix `Experience.jsx`

**Files:**
- Modify: `src/components/Experience.jsx`

Changes: Import from constants + MobileContext directly, responsive spacing, mobile perf (ContactShadows, distort sphere), stale closure fix, reduced motion for Float/MeshDistortMaterial.

- [ ] **Step 1: Update imports**

Replace:
```js
import { useMobile } from "../hooks/useMobile";
```
With:
```js
import { useMobile } from "../contexts/MobileContext";
import { getSectionsDistance } from "../constants/animation";
```

Remove the local constant:
```js
const SECTIONS_DISTANCE = 10;
```

- [ ] **Step 2: Add stale closure ref and responsive SECTIONS_DISTANCE**

Replace:
```js
export const Experience = () => {
  const { isMobile, scaleFactor } = useMobile();
  const [section, setSection] = useState(config.sections[0]);
  const sceneContainer = useRef();
  const scrollData = useScroll();
  useFrame(() => {
```

With:
```js
export const Experience = () => {
  const { isMobile, scaleFactor, prefersReducedMotion } = useMobile();
  const [section, setSection] = useState(config.sections[0]);
  const sectionRef = useRef(section);
  const sceneContainer = useRef();
  const scrollData = useScroll();
  const SECTIONS_DISTANCE = getSectionsDistance(isMobile);
  useFrame(() => {
```

- [ ] **Step 3: Fix stale closure in useFrame**

Replace:
```js
    // Only update state if section actually changed
    if (newSection !== section) {
      setSection(newSection);
    }
```

With:
```js
    // Only update state if section actually changed
    if (newSection !== sectionRef.current) {
      sectionRef.current = newSection;
      setSection(newSection);
    }
```

- [ ] **Step 4: Add mobile perf to ContactShadows**

Replace:
```jsx
      <ContactShadows opacity={0.5} scale={[30, 30]} color="#9c8e66" />
```

With:
```jsx
      {/* MOBILE_PERF: reduce shadow resolution on mobile — revert by removing ternaries */}
      <ContactShadows
        opacity={0.5}
        scale={[30, 30]}
        color="#9c8e66"
        resolution={isMobile ? 128 : 256}
        blur={isMobile ? 1.5 : 2}
      />
```

- [ ] **Step 5: Add reduced motion to Float components in Home section**

Replace:
```jsx
          <Float floatIntensity={1.5} speed={isMobile ? 1 : 2.5}>
```
With:
```jsx
          <Float floatIntensity={1.5} speed={prefersReducedMotion ? 0 : (isMobile ? 1 : 2.5)}>
```

Replace:
```jsx
            <Float floatIntensity={isMobile ? 0.2 : 0.5}>
```
With:
```jsx
            <Float floatIntensity={isMobile ? 0.2 : 0.5} speed={prefersReducedMotion ? 0 : 1}>
```

- [ ] **Step 6: Add mobile perf to distort sphere**

Replace:
```jsx
          <mesh position-y={2} position-z={-4} position-x={2}>
            <sphereGeometry args={[1, 64, 64]} />
            <MeshDistortMaterial
              opacity={0.8}
              transparent
              distort={1}
              speed={3.5}
              color="#924435"
            />
          </mesh>
```

With:
```jsx
          {/* MOBILE_PERF: reduce geometry and shader speed on mobile — revert by removing ternaries */}
          <mesh position-y={2} position-z={-4} position-x={2}>
            <sphereGeometry args={[1, isMobile ? 32 : 64, isMobile ? 32 : 64]} />
            <MeshDistortMaterial
              opacity={0.8}
              transparent
              distort={1}
              speed={prefersReducedMotion ? 0 : (isMobile ? 2 : 3.5)}
              color="#924435"
            />
          </mesh>
```

- [ ] **Step 7: Add reduced motion to Contact section Float components**

Replace:
```jsx
              <Float floatIntensity={2} rotationIntensity={1.5}>
                <Balloon scale={1.5} position-x={-0.5} color="#71a2d9" />
              </Float>
              <Float
                floatIntensity={1.5}
                rotationIntensity={2}
                position-z={0.5}
              >
                <Balloon scale={1.3} color="#d97183" />
              </Float>
              <Float speed={2} rotationIntensity={2}>
                <Balloon scale={1.6} position-x={0.4} color="yellow" />
              </Float>
```

With:
```jsx
              <Float floatIntensity={2} rotationIntensity={1.5} speed={prefersReducedMotion ? 0 : 1}>
                <Balloon scale={1.5} position-x={-0.5} color="#71a2d9" />
              </Float>
              <Float
                floatIntensity={1.5}
                rotationIntensity={2}
                position-z={0.5}
                speed={prefersReducedMotion ? 0 : 1}
              >
                <Balloon scale={1.3} color="#d97183" />
              </Float>
              <Float speed={prefersReducedMotion ? 0 : 2} rotationIntensity={2}>
                <Balloon scale={1.6} position-x={0.4} color="yellow" />
              </Float>
```

Replace:
```jsx
          <Float floatIntensity={1.8} speed={4}>
```
With:
```jsx
          <Float floatIntensity={1.8} speed={prefersReducedMotion ? 0 : 4}>
```

- [ ] **Step 8: Remove commented-out subtitle code block (lines 136-148)**

Delete this block entirely:
```jsx
            {/* <Center disableY disableZ>
              <SectionTitle
                size={isMobile ? 0 : 0.7}
                position-x={-2.2}
                position-z={-3}
                bevelEnabled
                bevelThickness={0.1}
                rotation-y={Math.PI / 9}
                letterSpacing={0.05}
              >
                {config.home.subtitle}
              </SectionTitle>
            </Center> */}
```

---

### Task 5: Fix `Interface.jsx`

**Files:**
- Modify: `src/components/Interface.jsx`

Changes: Update import path, fix touch events, use stagger constants, fix stale closure.

- [ ] **Step 1: Update imports**

Replace:
```js
import { useState } from "react";
import { config } from "../config";
import { useMobile } from "../hooks/useMobile";
```

With:
```js
import { useRef, useState } from "react";
import { config } from "../config";
import { useMobile } from "../contexts/MobileContext";
import { ANIMATION_CONSTANTS } from "../constants/animation";
```

- [ ] **Step 2: Fix stale closure for hasScrolled**

Replace:
```js
  const [hasScrolled, setHasScrolled] = useState(false);
  useFrame(() => {
    const newHasScrolled = scrollData.offset > 0;
    // Only update state if value actually changed
    if (newHasScrolled !== hasScrolled) {
      setHasScrolled(newHasScrolled);
    }
  });
```

With:
```js
  const [hasScrolled, setHasScrolled] = useState(false);
  const hasScrolledRef = useRef(false);
  useFrame(() => {
    const newHasScrolled = scrollData.offset > 0;
    if (newHasScrolled !== hasScrolledRef.current) {
      hasScrolledRef.current = newHasScrolled;
      setHasScrolled(newHasScrolled);
    }
  });
```

- [ ] **Step 3: Fix touch events on project cards — change `onMouseEnter` to `onPointerEnter`, add `onPointerLeave`**

Replace:
```jsx
              <motion.div
                onMouseEnter={() => setProject(project)}
                onFocus={() => setProject(project)}
```

With:
```jsx
              <motion.div
                onPointerEnter={() => setProject(project)}
                onPointerLeave={() => setProject(config.projects[0])}
                onFocus={() => setProject(project)}
```

- [ ] **Step 4: Use stagger delay constants**

Replace:
```js
                  delay: isMobile ? 0 : idx * 0.62,
```
With:
```js
                  delay: isMobile ? 0 : idx * ANIMATION_CONSTANTS.SKILL_STAGGER_DELAY,
```

Replace:
```js
                  delay: isMobile ? 0 : idx * 0.5,
```
With:
```js
                  delay: isMobile ? 0 : idx * ANIMATION_CONSTANTS.PROJECT_STAGGER_DELAY,
```

---

### Task 6: Fix `Avatar.jsx`

**Files:**
- Modify: `src/components/Avatar.jsx`

Changes: Update import path, fix stale closure, add reduced motion.

- [ ] **Step 1: Update import path**

Replace:
```js
import { useMobile } from "../hooks/useMobile";
```
With:
```js
import { useMobile } from "../contexts/MobileContext";
```

- [ ] **Step 2: Add `prefersReducedMotion` to destructuring**

Replace:
```js
  const { isMobile } = useMobile();
```
With:
```js
  const { isMobile, prefersReducedMotion } = useMobile();
```

- [ ] **Step 3: Add stale closure ref and reduced motion to useFrame**

Replace:
```js
  const [animation, setAnimation] = useState("Idle");
  useEffect(() => {
```
With:
```js
  const [animation, setAnimation] = useState("Idle");
  const animationRef = useRef(animation);
  useEffect(() => {
```

Replace:
```js
    // Only update state if animation actually changed
    if (animation !== targetAnimation) {
      setAnimation(targetAnimation);
    }
```

With:
```js
    // Skip walk/idle transitions when user prefers reduced motion
    if (prefersReducedMotion) {
      targetAnimation = "Idle";
    }

    if (animationRef.current !== targetAnimation) {
      animationRef.current = targetAnimation;
      setAnimation(targetAnimation);
    }
```

---

### Task 7: Fix `Star.jsx`

**Files:**
- Modify: `src/components/Star.jsx`

- [ ] **Step 1: Add delta-time rotation and reduced motion**

Replace:
```jsx
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import React, { useRef } from "react";

export function Star(props) {
  const { nodes, materials } = useGLTF("/models/Star.gltf");
  const ref = useRef();
  useFrame(() => {
    ref.current.rotation.y += 0.03;
  });
```

With:
```jsx
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import React, { useRef } from "react";
import { useMobile } from "../contexts/MobileContext";

export function Star(props) {
  const { nodes, materials } = useGLTF("/models/Star.gltf");
  const { prefersReducedMotion } = useMobile();
  const ref = useRef();
  useFrame((_, delta) => {
    if (!prefersReducedMotion) {
      ref.current.rotation.y += delta * 1.8;
    }
  });
```

---

### Task 8: Fix `Pigeon.jsx`

**Files:**
- Modify: `src/components/Pigeon.jsx`

- [ ] **Step 1: Add onClick for touch devices**

Replace:
```jsx
      onPointerEnter={() => setAnimation("Yes")}
      onPointerLeave={() => setAnimation("Flying_Idle")}
```

With:
```jsx
      onPointerEnter={() => setAnimation("Yes")}
      onPointerLeave={() => setAnimation("Flying_Idle")}
      onClick={() => setAnimation((a) => a === "Flying_Idle" ? "Yes" : "Flying_Idle")}
```

---

### Task 9: Fix `Mailbox.jsx`

**Files:**
- Modify: `src/components/Mailbox.jsx`

- [ ] **Step 1: Add onPointerDown for touch feedback**

Replace:
```jsx
      onPointerEnter={() => setMailboxHovered(true)}
      onPointerLeave={() => setMailboxHovered(false)}
      onClick={() => window.open(`mailto:${config.contact.mail}`)}
```

With:
```jsx
      onPointerEnter={() => setMailboxHovered(true)}
      onPointerLeave={() => setMailboxHovered(false)}
      onPointerDown={() => setMailboxHovered(true)}
      onClick={() => window.open(`mailto:${config.contact.mail}`)}
```

---

### Task 10: Fix `LoadingScreen.jsx`

**Files:**
- Modify: `src/components/LoadingScreen.jsx`

- [ ] **Step 1: Add ARIA attributes to progress bar**

Replace:
```jsx
          <div className="progress__container">
            <div
              className="progress__bar"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
```

With:
```jsx
          <div
            className="progress__container"
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="progress__bar"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
```

---

### Task 11: Fix `ErrorBoundary.jsx`

**Files:**
- Modify: `src/components/ErrorBoundary.jsx`

- [ ] **Step 1: Replace `process.env.NODE_ENV` with Vite's `import.meta.env.DEV`**

Replace:
```jsx
          {process.env.NODE_ENV === "development" && (
```

With:
```jsx
          {import.meta.env.DEV && (
```

- [ ] **Step 2: Remove dead `LoadingFallback` export (no longer imported anywhere after Task 3)**

Delete the entire `LoadingFallback` component and its export (lines 75-108):
```jsx
export const LoadingFallback = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      backgroundColor: "#faeaea",
    }}
  >
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          width: "50px",
          height: "50px",
          border: "5px solid #f3f3f3",
          borderTop: "5px solid #4668ee",
          borderRadius: "50%",
          animation: "spin 1s linear infinite",
          margin: "0 auto 1rem",
        }}
      />
      <p style={{ fontSize: "1rem", color: "#555" }}>Loading 3D scene...</p>
    </div>
    <style>
      {`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}
    </style>
  </div>
);
```

---

### Task 12: Fix `index.css`

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Change `.section` from `100vh` to `100dvh`**

Replace:
```css
.section {
  height: 100vh;
```
With:
```css
.section {
  height: 100dvh;
```

- [ ] **Step 2: Add `:active` states for touch feedback**

After the existing `.project:hover` block (line 158), add:

```css
.skill:active {
  transform: scale(0.98);
}

.project:active {
  transform: scale(0.98);
  background: rgba(255, 255, 255, 0.6);
}
```

- [ ] **Step 3: Merge duplicate `.menu` selectors in mobile media query**

Replace the two separate `.menu` blocks inside `@media (max-width: 990px)`:
```css
  .menu {
    flex-direction: column;
    gap: 0.5rem;
  }
```
and:
```css
  .menu {
    left: 1rem;
    right: 1rem;
  }
```

With a single merged block (place it where the first one is and delete the second):
```css
  .menu {
    flex-direction: column;
    gap: 0.5rem;
    left: 1rem;
    right: 1rem;
  }
```

---

### Task 13: Delete dead files and clean `package.json`

**Files:**
- Delete: `src/components/Laptop.jsx`
- Delete: `src/hooks/useMobile.jsx`
- Delete: `CODEBASE_AUDIT_REPORT.md`
- Delete: `IMPLEMENTATION_SUMMARY.md`
- Delete: `public/models/avatar.fbx`
- Delete: `public/animations/Idle.fbx`
- Modify: `package.json`

- [ ] **Step 1: Delete dead files**

```bash
rm src/components/Laptop.jsx
rm src/hooks/useMobile.jsx
rm CODEBASE_AUDIT_REPORT.md
rm IMPLEMENTATION_SUMMARY.md
rm "public/models/avatar.fbx"
rm "public/animations/Idle.fbx"
```

- [ ] **Step 2: Remove unused `@types/*` packages**

```bash
npm uninstall @types/three @types/react @types/react-dom
```

---

### Task 14: Build Verification

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

Expected: No errors. Warnings are acceptable.

- [ ] **Step 2: Run production build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Start dev server and verify visually**

```bash
npm run dev
```

Verify:
- Site loads without console errors
- All 4 sections scroll correctly
- On mobile viewport (DevTools responsive mode at 390px): sections feel closer together
- 3D scene renders correctly
- Hover effects work on desktop, touch works on mobile
- Loading screen shows and fades out
- Reduced motion: enable in OS settings, verify 3D animations stop
