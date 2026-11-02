import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const buildVersion = (process.env.VITE_BUILD_VERSION || new Date().toISOString()).replace(/[^a-zA-Z0-9_-]/g, '')

export default defineConfig({
  base: process.env.VITE_BASE_PATH || './',
  define: {
    __APP_BUILD_VERSION__: JSON.stringify(buildVersion),
  },
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-${buildVersion}-[hash].js`,
        chunkFileNames: `assets/[name]-${buildVersion}-[hash].js`,
        assetFileNames: `assets/[name]-${buildVersion}-[hash][extname]`,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5190,
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.history-data/**'] },
    proxy: { '/api': { target: process.env.HISTORY_API_TARGET || 'http://127.0.0.1:5192', changeOrigin: false } },
  },
})
