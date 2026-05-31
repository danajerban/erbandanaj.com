# [Erban Danaj | Software Engineer](https://www.erbandanaj.com)

An interactive 3D portfolio — a scroll-driven world built with React and Three.js
that walks through my work across four scenes: **Home → Skills → Projects →
Contact**. The 3D environment moves as you scroll, with an animated avatar and a
glassmorphism UI layered on top of the WebGL canvas.

### 🌐 Live at [erbandanaj.com](https://erbandanaj.com)

## ✨ Features

- **Scroll-based 4-section journey** powered by drei's `ScrollControls` — the scene
  travels along the x-axis on mobile and the z-axis on desktop.
- **Animated Ready Player Me avatar** with idle and walking states.
- **Glassmorphism HTML overlay** rendered on top of the 3D scene.
- **Mobile-tuned performance** — reduced `dpr`, geometry, and shadow resolution,
  plus full `prefers-reduced-motion` support.
- **Zero third-party requests** — self-hosted fonts, HDRI lighting, and Draco
  decoder; Draco-compressed models and WebP textures for fast loads.

## 🛠 Tech Stack

- **React 18** + **Vite** (ES modules, JSX — no TypeScript)
- **Three.js** via **@react-three/fiber** (R3F) + **@react-three/drei**
- **Framer Motion** + `framer-motion-3d` for animation
- **Jotai** for state
- Plain CSS with custom properties (single stylesheet)
- Deployed on **Cloudflare Pages**

## 🚀 Getting Started

Requires Node 18+ and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev      # start the dev server
pnpm build    # production build → dist/
pnpm preview  # preview the production build
pnpm lint     # run ESLint
```

## 📁 Project Structure

| Path | Purpose |
|------|---------|
| `src/App.jsx` | Root: Canvas, ScrollControls, providers, error boundary |
| `src/config.js` | All display content — skills, projects, contact |
| `src/components/Experience.jsx` | 3D scene orchestrator (models per section) |
| `src/components/Interface.jsx` | HTML overlay — skills, project cards, contact |
| `src/components/Avatar.jsx` | Animated avatar with idle/walking states |
| `public/` | Self-hosted models, textures, fonts, HDRI, Draco decoder |

To update content, edit **`src/config.js`** and drop new screenshots into
`public/projects/`.

## 📫 Connect

- LinkedIn: [@erban-danaj](https://www.linkedin.com/in/erban-danaj/)
- GitHub: [@danajerban](https://github.com/danajerban)
- Email: danajerban@gmail.com

## 📄 License

[MIT](LICENSE) — feel free to fork and build your own 3D portfolio. If you do, a
⭐ is always appreciated; it helps others discover the project.

---

Built with ❤️ and probably too much coffee by Erban Danaj
