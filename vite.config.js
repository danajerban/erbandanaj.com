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
    chunkSizeWarningLimit: 750,
    rolldownOptions: {
      output: {
        // The explicit react chunk is load-bearing for the React.lazy split
        // in App.jsx: react-dom is shared between the entry and the r3f
        // chunk, and without its own group Rolldown merges it INTO r3f
        // — handing the entry a static import of r3f (and transitively
        // three), which drags ~330KB gzip back onto the critical path.
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules\/(react|react-dom|scheduler)\//,
              priority: 4,
            },
            { name: 'three', test: /node_modules\/three\//, priority: 3 },
            { name: 'r3f', test: /@react-three\//, priority: 2 },
            // motion + its framer-motion/motion-dom internals
            { name: 'motion', test: /node_modules\/(motion|framer-motion|motion-dom|motion-utils)\//, priority: 1 },
          ],
        },
      },
    },
  },
})
