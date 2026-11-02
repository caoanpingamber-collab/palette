import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const assetData = (name, type) => `data:${type};base64,${readFileSync(path.join(root, 'public/figma-assets', name)).toString('base64')}`

export default defineConfig({
  plugins: [react(), {
    name: 'isolated-admin-assets', enforce: 'pre',
    load(id) {
      if (id.split('?')[0] === path.join(root, 'src/lib/figmaAssets.js')) return `export const FIGMA_ASSETS=${JSON.stringify({ logo: assetData('capcut-logo.svg', 'image/svg+xml'), bgStar: assetData('bg-star.png', 'image/png') })};`
    },
  }, {
    name: 'single-file-admin-bundle', enforce: 'post',
    generateBundle(_options, bundle) {
      const entries = Object.values(bundle)
      const chunks = entries.filter(item => item.type === 'chunk')
      if (chunks.length !== 1 || chunks[0].imports.length || chunks[0].dynamicImports.length) throw new Error('Administrator bundle must not execute external scripts')
      const css = entries.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => String(item.source)).join('\n')
      if (!css) throw new Error('Administrator styles are missing')
      const source = JSON.stringify({ script: chunks[0].code, css })
      for (const key of Object.keys(bundle)) delete bundle[key]
      this.emitFile({ type: 'asset', fileName: 'admin-bundle.json', source })
    },
  }],
  build: { outDir: '.admin-dist', emptyOutDir: true, copyPublicDir: false, cssCodeSplit: false, rollupOptions: { input: path.join(root, 'src/admin-entry.jsx'), output: { codeSplitting: false } } },
})
