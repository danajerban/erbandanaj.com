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
| `src/App.jsx` | Root: Canvas, ScrollControls, MobileProvider, ErrorBoundary |
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
- Use `100dvh` (not `100vh`) for full-height elements (Safari address bar fix)
- Glassmorphism via `backdrop-filter: blur(8px)` — use sparingly, expensive on mobile

## Mobile Performance

- Guard expensive 3D features with `isMobile` ternaries
- Comment pattern: `// MOBILE_PERF: [description] — revert by removing the ternary`
- Always limit `dpr` on mobile Canvas
- Reduce geometry segments, shadow resolution, and shader speed on mobile

## Content Updates

All display content (skills, projects, contact info) lives in `src/config.js`. To add a project: add an entry to `config.projects` and place the screenshot in `public/projects/`.
