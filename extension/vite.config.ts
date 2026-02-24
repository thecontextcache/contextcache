import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },

  build: {
    // Chrome extension service workers must be a single file
    rollupOptions: {
      input: {
        // CRXJS auto-discovers content scripts and background from the manifest.
        // The popup is referenced via action.default_popup above.
      },
    },
    // Avoid chunk splitting for content scripts (MV3 restriction)
    chunkSizeWarningLimit: 1000,
  },

  // Vite dev server isn't used directly — CRXJS handles HMR via a proxy
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
})
