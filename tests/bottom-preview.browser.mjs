import { test, expect } from '@playwright/test'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

test('public preview and report exports stay origin-clean after artwork CDN redirects', async ({ page }) => {
  const root = fileURLToPath(new URL('../public/figma-assets/', import.meta.url))
  const cdn = createServer((req, res) => {
    const file = path.resolve(root, new URL(req.url, 'http://localhost').pathname.slice(1))
    if (!file.startsWith(root)) { res.writeHead(404); res.end(); return }
    try { const bytes = readFileSync(file); res.writeHead(200, { 'Content-Type': file.endsWith('.svg') ? 'image/svg+xml' : 'image/png', 'Access-Control-Allow-Origin': '*' }); res.end(bytes) }
    catch { res.writeHead(404); res.end() }
  })
  await new Promise(resolve => cdn.listen(0, '127.0.0.1', resolve))
  try {
    await page.route('**/figma-assets/**', route => {
      const suffix = new URL(route.request().url()).pathname.split('/figma-assets/')[1]
      return route.fulfill({ status: 302, headers: { Location: `http://127.0.0.1:${cdn.address().port}/${suffix}` } })
    })
    await page.goto('/')
    const outcome = await page.evaluate(async () => {
      const { downloadBottomPreview } = await import('/src/lib/bottomPreview.js')
      const { exportReport } = await import('/src/lib/report.js')
      const { evaluateBottom } = await import('/src/lib/bottomRules.mjs')
      const canvas = document.createElement('canvas'); canvas.width = 1071; canvas.height = 180
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#621fb7'; ctx.fillRect(0, 0, 1071, 180)
      const frame = { width: 1071, height: 180, src: canvas.toDataURL(), ...evaluateBottom({ width: 1071, height: 180, bytes: 1000, ocr: null, visual: null }) }
      try { await downloadBottomPreview(frame); await exportReport({ result: frame, frame }); return 'exported' }
      catch (error) { return String(error) }
    })
    expect(outcome).toBe('exported')
  } finally { await new Promise(resolve => cdn.close(resolve)) }
})
