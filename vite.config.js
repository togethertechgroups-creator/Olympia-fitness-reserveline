import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // CRITICAL: Use relative paths for Electron
  logLevel: 'info',
  server: {
    host: true, // Listen on 0.0.0.0 to support LAN and tunnels like ngrok
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    target: ['chrome108'],
    chunkSizeWarningLimit: 4000,
    cssMinify: false,
    rollupOptions: {
      external: []
    }
  }
})
