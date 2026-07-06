import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const distDir = path.join(root, 'dist')
const outDir = path.join(root, 'dist-single')
const indexPath = path.join(distDir, 'index.html')

const mimeByExt = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
])

function readUtf8(file) {
  return fs.readFileSync(file, 'utf8')
}

function dataUri(file) {
  const ext = path.extname(file).toLowerCase()
  const mime = mimeByExt.get(ext) || 'application/octet-stream'
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`
}

let html = readUtf8(indexPath)
const scriptMatch = html.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/)
const styleMatch = html.match(/<link[^>]+href="([^"]+)"[^>]*>/)

if (!scriptMatch || !styleMatch) {
  throw new Error('Could not find built script and stylesheet in dist/index.html')
}

const scriptPath = path.join(distDir, scriptMatch[1].replace(/^\/app\/[^/]+\//, ''))
const stylePath = path.join(distDir, styleMatch[1].replace(/^\/app\/[^/]+\//, ''))

let js = readUtf8(scriptPath)
const fixed2Uri = dataUri(path.join(distDir, 'fixed2.png'))
const navUri = dataUri(path.join(distDir, 'nav.png'))
const figmaAssetsDir = path.join(distDir, 'figma-assets')
js = js
  .replace(/(["'`])(?:\/app\/[^/]+\/)?fixed2\.png\1/g, (_match, quote) => `${quote}${fixed2Uri}${quote}`)
  .replace(/(["'`])(?:\/app\/[^/]+\/)?nav\.png\1/g, (_match, quote) => `${quote}${navUri}${quote}`)

if (fs.existsSync(figmaAssetsDir)) {
  for (const fileName of fs.readdirSync(figmaAssetsDir)) {
    const uri = dataUri(path.join(figmaAssetsDir, fileName))
    const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const assetRe = new RegExp(`(["'])(?:/app/[^/]+/)?figma-assets/${escaped}\\1`, 'g')
    const dynamicAssetCallRe = new RegExp(`\\b[$A-Z_a-z][$\\w]*\\((["'\`])${escaped}\\1\\)`, 'g')
    js = js.replace(assetRe, (_match, quote) => `${quote}${uri}${quote}`)
    js = js.replace(dynamicAssetCallRe, JSON.stringify(uri))
  }
}

let css = readUtf8(stylePath)
css = css.replace(/url\((['"]?)(?:\/app\/[^/]+\/|\/)?fonts\/([^'")]+)\1\)/g, (_match, _quote, fileName) => {
  return `url(${dataUri(path.join(distDir, 'fonts', fileName))})`
})

html = html
  .replace(styleMatch[0], () => `<style>${css}</style>`)
  .replace(scriptMatch[0], () => `<script type="module">${js}</script>`)

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'index.html'), html)

const bytes = fs.statSync(path.join(outDir, 'index.html')).size
console.log(`Wrote dist-single/index.html (${(bytes / 1024 / 1024).toFixed(2)} MB)`)
