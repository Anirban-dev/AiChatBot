import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  envDir: '../',
  server: {
    allowedHosts: [
      '.trycloudflare.com' // Allows any subdomain from Cloudflare Tunnels
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // Put your exact local backend URL/port here
        changeOrigin: true,
        secure: false,
      }
    }
  },
})