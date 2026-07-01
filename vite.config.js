import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: {
    // Allow ngrok tunnel hosts so the production build can be tested on a real
    // device. Affects `vite preview` only — no effect on the deployed
    // (Cloudflare Pages) site, which serves dist/ directly.
    allowedHosts: ['.ngrok-free.app', '.ngrok.app'],
  },
  build: {
    // three.js is a known-large but correctly code-split vendor chunk; raise the
    // warning threshold so the build doesn't flag it on every run.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // The explicit react chunk is load-bearing for the React.lazy split
        // in App.jsx: react-dom is shared between the entry and the r3f
        // chunk, and without its own manual chunk Rollup merges it INTO r3f
        // — handing the entry a static import of r3f (and transitively
        // three), which drags ~330KB gzip back onto the critical path.
        manualChunks(id) {
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/')
          )
            return 'react'
          if (id.includes('node_modules/three/')) return 'three'
          if (id.includes('@react-three/')) return 'r3f'
          if (id.includes('framer-motion')) return 'framer-motion'
        },
      },
    },
  },
})
