import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin /api in dev, so the browser never needs CORS or the backend URL.
    proxy: { '/api': 'http://localhost:4000' },
  },
})
