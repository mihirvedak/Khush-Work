import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // The demo is previewed through a proxied hostname (*.iocompute.ai),
    // which Vite blocks unless the host is allowed explicitly.
    allowedHosts: ['.iocompute.ai', 'localhost', '127.0.0.1'],
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: ['.iocompute.ai', 'localhost', '127.0.0.1'],
  },
})
