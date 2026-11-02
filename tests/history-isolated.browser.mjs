import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const base = 'https://bytedance.feishu.link/app/app_synthetic'
async function routeApi(context) {
  await context.route(`${base}/**`, async route => {
    const request = route.request()
    const response = await context.request.fetch(request.url().replace(base, 'http://127.0.0.1:5196'), { method: request.method(), headers: await request.allHeaders(), data: request.postDataBuffer() || undefined, maxRedirects: 0 })
    await route.fulfill({ response })
  })
}
async function login(page) {
  await page.getByLabel('账号', { exact: true }).fill('test-admin')
  await page.getByLabel('密码', { exact: true }).fill('browser-test-password-123')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '检测历史', exact: true })).toBeVisible()
}

test('opaque administrator uses real bearer login, private blobs and untainted report downloads', async ({ page, context }) => {
  await routeApi(context)
  await page.goto('/')
  const saved = page.waitForResponse(response => response.url().endsWith('/api/history') && response.request().method() === 'POST')
  await page.locator('input[type=file]').setInputFiles({ name: 'isolated-admin-image.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1WQAAAAASUVORK5CYII=', 'base64') })
  expect((await saved).status()).toBe(201)
  await page.goto('http://127.0.0.1:5196/isolated-admin')
  expect(await page.evaluate(() => window.origin)).toBe('null')
  expect(await page.locator('body').evaluate(element => getComputedStyle(element).margin)).toBe('0px')
  expect(await page.evaluate(() => { try { localStorage.getItem('test'); return false } catch { return true } })).toBe(true)
  await login(page)
  expect((await context.cookies()).filter(cookie => cookie.name.startsWith('banner_admin'))).toHaveLength(0)
  await page.getByRole('searchbox', { name: '搜索文件名' }).fill('isolated-admin-image')
  await page.getByRole('button', { name: 'isolated-admin-image.png', exact: true }).click()
  const image = page.getByRole('img', { name: '检测原图' })
  await expect(image).toBeVisible()
  expect(await image.getAttribute('src')).toMatch(/^blob:/)
  const original = page.waitForEvent('download')
  await page.getByRole('link', { name: '下载原文件' }).click()
  expect((await original).suggestedFilename()).toBe('isolated-admin-image.png')
  const report = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出报告' }).click()
  expect((await report).suggestedFilename()).toMatch(/banner-report/)
  await page.reload()
  await expect(page.getByRole('heading', { name: '管理员登录' })).toBeVisible()
  await login(page)
  await page.getByRole('searchbox', { name: '搜索文件名' }).fill('isolated-admin-image')
  await page.getByRole('button', { name: 'isolated-admin-image.png', exact: true }).click()
  await page.getByRole('button', { name: '删除记录', exact: true }).click()
  await page.getByRole('button', { name: '永久删除', exact: true }).click()
  await expect(page.getByRole('heading', { name: '检测历史', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '退出登录' }).click()
  await expect(page.getByRole('heading', { name: '管理员登录' })).toBeVisible()
  expect((await page.request.get('http://127.0.0.1:5196/api/history')).status()).toBe(401)
})

test('opaque administrator keeps original video playing while changing analysis frames', async ({ page, context }) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'isolated-video-'))
  try {
    const file = path.join(dir, 'isolated-video.mp4')
    execFileSync(process.env.FFMPEG_PATH || '/opt/homebrew/bin/ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x6149a5:s=800x1296:d=2:r=12', '-vf', "drawbox=x=450:y=100:w=200:h=300:color=0x82d5e7:t=fill:enable='lt(t,1)',drawbox=x=30:y=100:w=200:h=300:color=0x82d5e7:t=fill:enable='gte(t,1)'", '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-pix_fmt', 'yuv420p', file])
    await routeApi(context)
    await page.goto('/')
    const saved = page.waitForResponse(response => response.url().endsWith('/api/history') && response.request().method() === 'POST')
    await page.locator('input[type=file]').setInputFiles(file)
    expect((await saved).status()).toBe(201)
    await page.goto('http://127.0.0.1:5196/isolated-admin')
    await login(page)
    await page.getByRole('searchbox', { name: '搜索文件名' }).fill('isolated-video')
    await page.getByRole('button', { name: 'isolated-video.mp4', exact: true }).click()
    const video = page.getByLabel('检测原视频')
    await expect.poll(() => video.evaluate(element => element.readyState)).toBeGreaterThan(1)
    const before = await video.evaluate(element => element.currentTime)
    await page.getByRole('button', { name: /尾帧/ }).click()
    await expect(page.getByRole('heading', { name: '尾帧检测结果', exact: true })).toBeVisible()
    expect(await video.evaluate(element => element.paused)).toBe(false)
    await expect.poll(() => video.evaluate(element => element.currentTime)).not.toBe(before)
    await page.getByRole('button', { name: '删除记录', exact: true }).click()
    await page.getByRole('button', { name: '永久删除', exact: true }).click()
    await expect(page.getByRole('heading', { name: '检测历史', exact: true })).toBeVisible()
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('administrator login refuses redirects without forwarding a password to a sibling path', async ({ page, context }) => {
  await routeApi(context)
  let siblingRequests = 0
  await context.route(`${base}/api/admin/login`, route => route.fulfill({ status: 307, headers: { Location: 'https://bytedance.feishu.link/app/app_sibling/capture', 'Access-Control-Allow-Origin': '*' } }))
  await context.route('**/app/app_sibling/capture', route => { siblingRequests++; return route.fulfill({ status: 200, body: '{}' }) })
  await page.goto('http://127.0.0.1:5196/isolated-admin')
  await page.getByLabel('账号', { exact: true }).fill('test-admin')
  await page.getByLabel('密码', { exact: true }).fill('browser-test-password-123')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(siblingRequests).toBe(0)
})

test('same-host sibling cannot inspect the admin window or register an overlapping service worker', async ({ page, context }) => {
  await routeApi(context)
  await page.goto('http://127.0.0.1:5196/sibling')
  const popupEvent = context.waitForEvent('page')
  await page.evaluate(() => { window.adminWindow = window.open('/isolated-admin') })
  const popup = await popupEvent
  await expect(popup.getByRole('heading', { name: '管理员登录' })).toBeVisible()
  expect(await page.evaluate(() => { try { return Boolean(window.adminWindow.document.querySelector('input')) } catch { return false } })).toBe(false)
  expect(await page.evaluate(() => navigator.serviceWorker.register('/sibling/worker.js', { scope: '/' }).then(() => 'unexpected-success').catch(error => error.name))).toBe('SecurityError')
  await popup.close()
})

test('missing sandbox fails closed and CSP blocks injected or modified administrator scripts', async ({ page, context }) => {
  await routeApi(context)
  await page.goto('http://127.0.0.1:5196/unsafe-admin')
  await expect(page.getByRole('alert')).toContainText('安全隔离未生效')
  await expect(page.locator('input[type=password]')).toHaveCount(0)
  await page.goto('http://127.0.0.1:5196/isolated-admin?inject=1')
  await expect(page.getByRole('heading', { name: '管理员登录' })).toBeVisible()
  expect(await page.evaluate(() => window.__injected)).toBeUndefined()
  await page.goto('http://127.0.0.1:5196/isolated-admin?tamper=1')
  await expect(page.locator('input[type=password]')).toHaveCount(0)
  expect(await page.evaluate(() => window.__tampered)).toBeUndefined()
})

test('failed logout immediately hides private interface', async ({ page, context }) => {
  await routeApi(context)
  await page.goto('http://127.0.0.1:5196/isolated-admin')
  await login(page)
  await context.route(`${base}/api/admin/logout`, route => route.abort('failed'))
  await page.getByRole('button', { name: '退出登录' }).click()
  await expect(page.getByRole('heading', { name: '管理员登录' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '检测历史', exact: true })).toHaveCount(0)
})

test('cancelled report export cannot download after its administrator view closes', async ({ page }) => {
  await page.goto('/')
  let downloads = 0
  page.on('download', () => { downloads++ })
  const result = await page.evaluate(async () => {
    const { exportReport } = await import('/src/lib/report.js')
    const controller = new AbortController()
    let resume
    Object.defineProperty(document.fonts, 'ready', { configurable: true, value: new Promise(resolve => { resume = resolve }) })
    const rendering = exportReport({ result: { overallPass: true }, frame: { uiChecks: [] }, signal: controller.signal }).then(() => 'unexpected-download').catch(error => error.name)
    controller.abort(); resume()
    return rendering
  })
  expect(result).toBe('AbortError')
  expect(downloads).toBe(0)
})
