import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // three.js is a known-large but correctly code-split vendor chunk; raise the
    // warning threshold so the build doesn't flag it on every run.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
          'framer-motion': ['framer-motion', 'framer-motion-3d'],
        },
      },
    },
  },
})
