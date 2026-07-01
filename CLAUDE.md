# erbandanaj.com — 3D Portfolio Website

## Tech Stack

- **React 18** + **Vite 7** (ES modules, JSX — no TypeScript)
- **Three.js** via `@react-three/fiber` (R3F) + `@react-three/drei`
- **Framer Motion** + `framer-motion-3d` for animations
- **Jotai** for state (single atom: `projectAtom`)
- **Plain CSS** — single file `src/index.css`, BEM-like naming, CSS custom properties

## Scripts

```bash
pnpm dev      # Vite dev server
pnpm build    # Production build
pnpm preview  # Preview production build
pnpm lint     # ESLint
```

## Architecture

### Scroll-based 4-section layout
`ScrollControls` (drei) manages navigation across: **Home → Skills → Projects → Contact**. The 3D scene moves along the **x-axis on mobile**, **z-axis on desktop**. HTML overlay (`<Scroll html>`) renders the 2D interface on top.

### Key files
| File | Purpose |
|------|---------|
| `src/App.jsx` | Root: Menu, MobileProvider, SceneErrorBoundary; `React.lazy`-loads SceneCanvas (Suspense fallback `null` — the `index.html` splash covers it) |
| `src/components/SceneCanvas.jsx` | Canvas + ScrollControls subtree — the code-split seam keeping three/r3f/drei/framer-motion out of the entry chunk; never import it statically from eager code |
| `src/config.js` | All content data (skills, projects, contact, sections) |
| `src/components/Experience.jsx` | 3D scene orchestrator — places all models per section |
| `src/components/Interface.jsx` | HTML overlay — skills list, project cards, contact |
| `src/components/Avatar.jsx` | Animated RPM avatar with idle/walking states |
| `src/contexts/MobileContext.jsx` | `isMobile`, `scaleFactor`, `prefersReducedMotion` |
| `src/constants/animation.js` | Shared animation constants |

## R3F Rules

- **Never render HTML (`<div>`, `<span>`) inside `<Canvas>`** — only Three.js components. Use drei's `<Html>` if you need DOM inside the scene.
- **Never call `setState` unconditionally inside `useFrame`** — it causes 60fps re-renders. Use a `useRef` to track the current value and only call `setState` when it actually changes (ref-mirroring pattern). Reading context values (e.g., `isMobile`) directly is safe in R3F v8, which re-captures the closure on each render.
- **Use `delta` from `useFrame((state, delta) => ...)` for animations** — never hardcode frame-rate-dependent increments.
- **All `useGLTF.preload()` / `useFBX.preload()` calls are at module level** — this is intentional for eager loading.

## CSS Conventions

- Single responsive breakpoint: `@media (max-width: 990px)`
- Colors via CSS custom properties: `--primary-color`, `--text-color`, `--text-light-color`
- Non-scroll full-height elements: use `100dvh` (not `100vh`) for the Safari address-bar fix
- **Scroll-page `.section` height must be `100lvh`, not `100dvh`** — it has to match the drei `<Scroll html>` overlay stride (`size.height` = `#root` = `lvh`). On iOS Safari `dvh < lvh` (dynamic toolbar), so `100dvh` drifts each section progressively up; desktop/headless can't reproduce it (`dvh == lvh`). See the `@supports (height: 100lvh)` rule in `src/index.css`.
- Glassmorphism via `backdrop-filter: blur(8px)` — use sparingly, expensive on mobile

## Mobile Performance

- Guard expensive 3D features with `isMobile` ternaries
- Comment pattern: `// MOBILE_PERF: [description] — revert by removing the ternary`
- Always limit `dpr` on mobile Canvas
- Reduce geometry segments, shadow resolution, and shader speed on mobile

## Content Updates

All display content (skills, projects, contact info) lives in `src/config.js`. To add a project: add an entry to `config.projects` and place the screenshot in `public/projects/`.
