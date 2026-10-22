# erbandanaj.dev — 3D Portfolio Website

## Tech Stack

- **React** + **Vite** (ES modules, JSX — no TypeScript)
- **Three.js** via `@react-three/fiber` v9 (R3F) + `@react-three/drei`
- **Motion** (`motion`) for the HTML overlay's animations
- **Jotai** for state (`src/store.js`: `projectAtom`, `sectionAtom`)
- **Plain CSS** — single file `src/index.css`, BEM-like naming, CSS custom properties

## Architecture

- `ScrollControls` (drei) manages navigation across 4 sections: **Home → Skills → Projects → Contact**. The 3D scene moves along the **x-axis on mobile**, **z-axis on desktop**. HTML overlay (`<Scroll html>`) renders the 2D interface on top.
- All display content (skills, projects, contact) lives in `src/config.js`; project screenshots go in `public/projects/`.
- `SceneCanvas.jsx` is the code-split seam keeping three/r3f/drei/motion out of the entry chunk — `React.lazy` only, **never import it statically from eager code** (Suspense fallback `null`; the `index.html` splash covers it).

## R3F Rules

- **Never call `setState` unconditionally inside `useFrame`** — it causes 60fps re-renders. Use a `useRef` to track the current value and only call `setState` when it actually changes (ref-mirroring pattern). Reading context values (e.g., `isMobile`) directly is safe in R3F v9, which re-captures the closure on each render.
- **Load models with the project's own `src/lib/useGLTF`** (meshopt, no Draco decoder), not drei's. All `useGLTF.preload()` calls are at module level — this is intentional for eager loading.

## CSS Conventions

- Main responsive breakpoint: `@media (max-width: 990px)`; `pnpm lint` fails if a CSS `max-width` breakpoint differs from `MOBILE_THRESHOLD` in `src/contexts/MobileContext.jsx`. Refinements on top of it: under 600px wide in portrait is a phone, 600px and up an upright tablet; aspect-ratio and height queries for short or squarish screens; from 2400px wide the root font scales up.
- Colors via CSS custom properties: `--primary-color`, `--text-color`, `--text-light-color`
- **Full-height units: `100lvh` only on an iPhone held upright, `100dvh` everywhere else**, and `.section` must always equal `#root` — it has to match the drei `<Scroll html>` overlay stride (`size.height` = `#root`). On an upright iPhone Safari's canvas is the large viewport, so a `dvh` section drifts each section progressively up; desktop/headless can't reproduce it (`dvh == lvh`). The gate is the one `@supports (height: 100lvh) and (-webkit-touch-callout: none)` block in `src/index.css`; the `index.html` splash repeats it for its `--canvas-vh` units.
- Glassmorphism via `backdrop-filter: blur(8px)`

## Mobile Performance

Gate expensive 3D (geometry segments, shadow resolution, `dpr`, shader speed) on `isMobile`; tag each reversible degradation with `// MOBILE_PERF: [description] — revert by removing the ternary`.

## Gotchas

- `public/_headers` CSP applies only on Cloudflare deploys — `pnpm preview` never serves it. `img-src` must keep `data:` (GLTFLoader probes WebP via a data: URI) or the 3D scene dies in prod only; verify on the `.pages.dev` deploy in a foreground tab.
- `pnpm lint` also runs `scripts/check-park-layout.mjs` (the Contact park's props against its plan); it prints only failures.
