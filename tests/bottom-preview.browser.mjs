import { test, expect } from '@playwright/test'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

test('Bottom reuses the Header phone background and chrome, changing only the banner slot', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 })
  await page.goto('/')
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js')
    const { default: { createRoot } } = await import('/node_modules/.vite/deps/react-dom_client.js')
    const { default: Preview } = await import('/src/components/Preview.jsx')
    const { default: BottomPreview } = await import('/src/components/BottomPreview.jsx')
    const { bottomLayerUrl } = await import('/src/lib/bottomPreview.js')
    const root = document.createElement('div'); root.style.display = 'flex'; root.style.gap = '20px'
    document.body.replaceChildren(root)
    const canvas = document.createElement('canvas'); canvas.width = 1071; canvas.height = 180
    canvas.getContext('2d').fillRect(0, 0, 1071, 180)
    createRoot(root).render(React.createElement(React.Fragment, null,
      React.createElement(Preview, { src: bottomLayerUrl('header'), V: [190, 202, 255], 'data-test-header': true }),
      React.createElement(BottomPreview, { src: canvas.toDataURL(), frame: { width: 1071, height: 180 } })))
  })
  const header = page.locator('[data-test-header]'), bottom = page.locator('[data-bottom-variant="full"]')
  await expect(bottom.getByText('One main banner title', { exact: true })).toBeVisible()
  await expect(bottom.getByText('New image', { exact: true })).toBeVisible()
  await expect(bottom.getByText('Bilingual captions', { exact: true })).toHaveCount(0)
  const assets = root => root.locator('img').evaluateAll(images => images.filter(img => !img.closest('[data-bottom-slot]') && !img.closest('.bottom-banner-dismiss')).map(img => img.getAttribute('src')))
  expect(await assets(bottom)).toEqual(await assets(header))
  await expect.poll(() => page.locator('img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0))).toBe(true)
  await page.evaluate(() => document.fonts.ready)
  const a = await header.boundingBox(), b = await bottom.boundingBox()
  const top = rect => ({ x: rect.x, y: rect.y, width: 320, height: 510 })
  const reference = await page.screenshot({ clip: top(a), path: 'test-results/header-shared-background.png' })
  const actual = await page.screenshot({ clip: top(b), path: 'test-results/bottom-shared-background.png' })
  const difference = await page.evaluate(async ({ reference, actual }) => {
    const pixels = async source => {
      const image = new Image(); image.src = `data:image/png;base64,${source}`; await image.decode()
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0)
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data
    }
    const a = await pixels(reference), b = await pixels(actual)
    let changed = 0, max = 0
    for (let i = 0; i < a.length; i++) { const delta = Math.abs(a[i] - b[i]); if (delta > 2) changed++; max = Math.max(max, delta) }
    return { changed, max }
  }, { reference: reference.toString('base64'), actual: actual.toString('base64') })
  // Separate compositing layers can differ by two color levels after rasterization.
  expect(difference.changed).toBe(0)
})

test('full and circular downloads keep identical phone backgrounds and their own exact banner crops', async ({ page }) => {
  await page.goto('/')
  const images = []
  for (const variant of ['full', 'thumbnail']) {
    const downloaded = page.waitForEvent('download')
    await page.evaluate(async variant => {
      const { downloadBottomPreview } = await import('/src/lib/bottomPreview.js')
      const canvas = document.createElement('canvas'); canvas.width = 1071; canvas.height = 180
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ff00ff'; ctx.fillRect(0, 0, 1071, 180)
      ctx.fillStyle = '#00ffff'; ctx.fillRect(770, 0, 180, 180)
      await downloadBottomPreview({ src: canvas.toDataURL(), width: 1071, height: 180 }, variant)
    }, variant)
    images.push(readFileSync(await (await downloaded).path()).toString('base64'))
  }
  const result = await page.evaluate(async images => {
    const pixels = async source => {
      const image = new Image(); image.src = `data:image/png;base64,${source}`; await image.decode()
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0)
      return { width: image.width, height: image.height, data: ctx.getImageData(0, 0, image.width, image.height).data }
    }
    const [a, b] = await Promise.all(images.map(pixels))
    let changed = 0
    for (let y = 0; y < a.height; y++) {
      if (y >= 1290 && y <= 1470) continue
      for (let x = 0; x < a.width; x++) for (let c = 0; c < 4; c++) {
        const i = (y * a.width + x) * 4 + c
        if (a.data[i] !== b.data[i]) changed++
      }
    }
    const at = (img, x, y) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4))
    return { width: a.width, height: a.height, changed, full: at(a, 200, 1370), thumbnail: at(b, 675, 1393) }
  }, images)
  expect(result).toEqual({ width: 750, height: 1626, changed: 0, full: [255, 0, 255, 255], thumbnail: [0, 255, 255, 255] })
})

test('public preview and report exports stay origin-clean after artwork CDN redirects', async ({ page }) => {
  const root = fileURLToPath(new URL('../public/', import.meta.url))
  const cdn = createServer((req, res) => {
    const file = path.resolve(root, new URL(req.url, 'http://localhost').pathname.slice(1))
    if (!file.startsWith(root)) { res.writeHead(404); res.end(); return }
    try { const bytes = readFileSync(file); res.writeHead(200, { 'Content-Type': file.endsWith('.svg') ? 'image/svg+xml' : 'image/png', 'Access-Control-Allow-Origin': '*' }); res.end(bytes) }
    catch { res.writeHead(404); res.end() }
  })
  await new Promise(resolve => cdn.listen(0, '127.0.0.1', resolve))
  try {
    await page.route(/\/(?:figma-assets\/.*|fixed2\.png|nav\.png)$/, route => {
      const suffix = new URL(route.request().url()).pathname.slice(1)
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
