# Website Optimization — Design Spec

**Date:** 2026-03-31
**Scope:** Bug fixes, mobile spacing, mobile 3D performance, code cleanup, accessibility
**Approach:** Single sweep, grouped by file to minimize context switches

---

## Section 1: Critical Bug Fixes

### 1a. Suspense inside Canvas (`App.jsx`)
- Change `<Suspense fallback={<LoadingFallback />}>` to `<Suspense fallback={null}>` inside the Canvas
- `LoadingScreen` (using drei's `useProgress`) already handles loading UI — `LoadingFallback` is redundant here
- Remove the `LoadingFallback` import from App.jsx

### 1b. TypeScript in JS (`constants/animation.js`)
- Remove `as const` assertions on lines 25 and 32 — plain JS `const` declarations are sufficient

### 1c. Touch events (`Interface.jsx`)
- Change `onMouseEnter` to `onPointerEnter` on project cards — works on both mouse and touch
- Add `onPointerLeave` to reset the project atom when the pointer leaves

---

## Section 2: Mobile Section Spacing

Three values control section spacing: `SECTIONS_DISTANCE`, `pages`, `.section` height.

**Change:** Make `SECTIONS_DISTANCE` responsive only.
- `Experience.jsx`: `const SECTIONS_DISTANCE = isMobile ? 7 : 10`
- Import from `constants/animation.js` instead of redefining locally
- Update `constants/animation.js` to export `getSectionsDistance(isMobile)` instead of a static value
- No CSS or `pages` prop changes — minimal approach as requested

---

## Section 3: Mobile 3D Performance (Moderate)

All mobile performance changes will include a comment: `// MOBILE_PERF: [description] — revert by removing the ternary`

### 3a. DPR limiting (`App.jsx`)
- Add `dpr={[1, isMobile ? 1.5 : 2]}` to `<Canvas>`

### 3b. Distort sphere (`Experience.jsx`)
- Reduce segments on mobile: `args={[1, isMobile ? 32 : 64, isMobile ? 32 : 64]}`
- Reduce speed on mobile: `speed={isMobile ? 2 : 3.5}`

### 3c. ContactShadows (`Experience.jsx`)
- Reduce resolution on mobile: `resolution={isMobile ? 128 : 256}`
- Reduce blur on mobile

### 3d. Frame-rate independent rotation (`Star.jsx`)
- Use `delta` from `useFrame`: `ref.current.rotation.y += delta * 1.8` instead of `+= 0.03`
- Correctness fix for all devices, not mobile-specific

### 3e. Resize debounce (`MobileContext.jsx`)
- Wrap resize handler in ~150ms debounce to prevent re-render spam

---

## Section 4: Code Cleanup & Dead Code

### 4a. Delete dead files
- `src/components/Laptop.jsx` — imported nowhere
- `CODEBASE_AUDIT_REPORT.md` — process artifact
- `IMPLEMENTATION_SUMMARY.md` — process artifact

### 4b. Delete unused assets (~2.1 MB removed)
- `public/models/avatar.fbx` (1.2 MB) — GLB is used instead
- `public/animations/Idle.fbx` (940 KB) — replaced by Happy-Idle.fbx

### 4c. Fix constants usage
- Remove `as const` from `constants/animation.js` (covered in 1b)
- Remove local `SECTIONS_DISTANCE` in `Experience.jsx` — import from constants
- Import and use `SKILL_STAGGER_DELAY` and `PROJECT_STAGGER_DELAY` in `Interface.jsx`
- Evaluate `POSITIONS` — import in `Experience.jsx` or remove from constants if not worth it

### 4d. Complete useMobile migration
- Update imports in `Avatar.jsx`, `Experience.jsx`, `Interface.jsx` to import from `contexts/MobileContext`
- Delete `src/hooks/useMobile.jsx` shim

### 4e. Minor fixes
- `ErrorBoundary.jsx`: `process.env.NODE_ENV` → `import.meta.env.DEV`
- `index.css`: Merge duplicate `.menu` selectors in the mobile media query
- `index.css`: `.section` change `100vh` → `100dvh` (consistent with `#root`)
- `package.json`: Remove `@types/three`, `@types/react`, `@types/react-dom`

---

## Section 5: Accessibility

### 5a. Touch interactions
- `Pigeon.jsx`: Add `onClick` toggle alongside `onPointerEnter/Leave`
- `Mailbox.jsx`: Add visual feedback on `onPointerDown` for mobile (subtle scale/color)
- `index.css`: Add `:active` states on `.project` and `.skill` cards for touch feedback

### 5b. Loading screen ARIA (`LoadingScreen.jsx`)
- Add `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`

### 5c. Reduced motion for 3D
- Add `prefersReducedMotion` boolean to `MobileContext` via `window.matchMedia('(prefers-reduced-motion: reduce)')`
- When true: `Float` speed → 0, Star rotation stops, `MeshDistortMaterial` speed → 0, skip Avatar walk/idle transitions

### 5d. Fix stale closures in useFrame
- `Avatar.jsx`: Use ref to track `animation` state read inside `useFrame`
- `Experience.jsx`: Use ref to track `section` state read inside `useFrame`
- `Interface.jsx`: Use ref to track `hasScrolled` state read inside `useFrame`

---

## Files Affected (Complete List)

| File | Changes |
|------|---------|
| `src/App.jsx` | Suspense fix, dpr limit, isMobile for Canvas |
| `src/components/Experience.jsx` | Spacing, distort sphere, ContactShadows, constants import, stale closure fix |
| `src/components/Interface.jsx` | Touch events, constants import, stale closure fix |
| `src/components/Avatar.jsx` | useMobile import, stale closure fix |
| `src/components/Star.jsx` | Delta-time rotation |
| `src/components/Pigeon.jsx` | Touch interaction |
| `src/components/Mailbox.jsx` | Touch feedback |
| `src/components/LoadingScreen.jsx` | ARIA attributes |
| `src/components/ErrorBoundary.jsx` | import.meta.env.DEV |
| `src/contexts/MobileContext.jsx` | Resize debounce, prefersReducedMotion |
| `src/constants/animation.js` | Remove `as const`, export getSectionsDistance |
| `src/hooks/useMobile.jsx` | DELETE |
| `src/components/Laptop.jsx` | DELETE |
| `src/index.css` | 100dvh, merge .menu, :active states |
| `package.json` | Remove @types/* |
| `CODEBASE_AUDIT_REPORT.md` | DELETE |
| `IMPLEMENTATION_SUMMARY.md` | DELETE |
| `public/models/avatar.fbx` | DELETE |
| `public/animations/Idle.fbx` | DELETE |

## Out of Scope
- Splitting `Experience.jsx` into sub-components (separate refactor)
- Lazy loading 3D assets per section (separate feature)
- Dependency upgrades (Three.js, R3F, Framer Motion)
- Adding test infrastructure
- CI/CD setup
- Additional CSS breakpoints (tablet, ultra-wide)
