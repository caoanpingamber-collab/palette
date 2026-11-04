import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'

const url = process.env.PROFILE_URL || 'http://127.0.0.1:5190/'
if (!/^http:\/\/127\.0\.0\.1:\d+\/$/.test(url) && !/^https:\/\/bytedance\.(feishuapp\.com|feishu\.link)\/app\/app_179khnx30sk$/.test(url)) throw new Error('Use the approved local or published site')
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  // Measure detection only: do not archive benchmark material or use an administrator session.
  await context.route('**/api/health', route => route.fulfill({ json: { archiveEnabled: false } }))
  await context.route(/\/api\/history(?:[/?]|$)/, route => route.abort())
  await context.addInitScript(() => {
    window.__profileOcr = []
    const Worker = window.Worker
    window.Worker = class extends Worker {
      constructor(...args) {
        super(...args)
        window.__profileOcr.push({ stage: 'worker-created', at: performance.now() })
        this.addEventListener('message', event => {
          if (event.data?.status === 'resolve') window.__profileOcr.push({ stage: event.data.action, at: performance.now() })
          if (event.data?.status === 'reject') window.__profileOcr.push({ stage: `failed-${event.data.action}`, error: String(event.data.data).slice(0, 500), at: performance.now() })
        })
      }
      postMessage(message, ...args) {
        if (message?.action) window.__profileOcr.push({ stage: `${message.action}-sent`, at: performance.now() })
        return super.postMessage(message, ...args)
      }
    }
  })
  const page = await context.newPage(), resources = [], pending = []
  page.on('request', request => {
    if (!request.url().includes('/ocr/')) return
    const start = Date.now()
    pending.push(request.response().then(async response => {
      if (!response) return
      if (response.status() >= 300 && response.status() < 400) return
      await Promise.race([response.finished(), new Promise(resolve => setTimeout(resolve, 5000))])
      const sizes = await request.sizes().catch(() => ({}))
      resources.push({ path: new URL(request.url()).pathname, ms: Date.now() - start, status: response.status(), bytes: sizes.responseBodySize })
    }).catch(() => {}))
  })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  for (const mode of ['Header Banner', 'Bottom banner']) {
    await page.getByRole('button', { name: mode, exact: true }).click()
    const bytes = await page.evaluate(bottom => {
      const c = document.createElement('canvas'); c.width = bottom ? 1071 : 800; c.height = bottom ? 180 : 1296
      const ctx = c.getContext('2d'); ctx.fillStyle = '#621fb7'; ctx.fillRect(0, 0, c.width, c.height)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 48px Arial'; ctx.fillText('Create your next video', 90, 82)
      ctx.fillStyle = '#22dddd'; ctx.beginPath(); ctx.arc(bottom ? 860 : 600, 90, 45, 0, Math.PI * 2); ctx.fill()
      return c.toDataURL().split(',')[1]
    }, mode === 'Bottom banner')
    for (let run = 1; run <= 2; run++) {
      const before = resources.length, start = Date.now()
      await page.evaluate(() => { window.__profileOcr = [] })
      await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-performance.png', mimeType: 'image/png', buffer: Buffer.from(bytes, 'base64') })
      await page.getByRole('button', { name: '关闭结果页' }).waitFor({ timeout: 45000 })
      const durationMs = Date.now() - start
      if (mode === 'Bottom banner') {
        await page.getByText('22/57', { exact: true }).waitFor()
        assert.equal(await page.getByRole('heading', { name: 'Approved', exact: true }).count(), 1)
      }
      const events = await page.evaluate(() => window.__profileOcr)
      await Promise.race([Promise.allSettled(pending), new Promise(resolve => setTimeout(resolve, 5000))])
      const first = events[0]?.at || 0
      console.log(JSON.stringify({ mode, run, durationMs, ocr: events.map(event => ({ stage: event.stage, ms: Math.round(event.at - first), error: event.error })), resources: resources.slice(before) }))
      await page.getByRole('button', { name: '关闭结果页' }).click()
    }
  }
} finally { await browser.close() }
