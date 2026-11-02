import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

async function archiveFile(page, files, status = 201) {
  const saved = page.waitForResponse(response => response.url().endsWith('/api/history') && response.request().method() === 'POST', { timeout: 15000 })
  await page.locator('input[type=file]').setInputFiles(files)
  expect((await saved).status()).toBe(status)
}

async function login(page) {
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: '管理员登录' })).toBeVisible()
  await page.getByLabel('账号', { exact: true }).fill('test-admin')
  await page.getByLabel('密码', { exact: true }).fill('browser-test-password-123')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '检测历史', exact: true })).toBeVisible()
}

test('anonymous upload archives an image and administrator can filter, export and delete it', async ({ page }) => {
  await page.goto('/')
  const source = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 1296
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#6149a5'; ctx.fillRect(0, 0, 800, 1296)
    ctx.fillStyle = '#82d5e7'; ctx.fillRect(450, 100, 200, 300)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await archiveFile(page, { name: 'e2e-banner.png', mimeType: 'image/png', buffer: Buffer.from(source, 'base64') })
  await login(page)
  await page.getByRole('searchbox', { name: '搜索文件名' }).fill('e2e-banner')
  await page.getByRole('button', { name: 'e2e-banner.png', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'e2e-banner.png', exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: '检测原图' })).toBeVisible()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('link', { name: '下载原文件' }).click()
  expect((await downloadEvent).suggestedFilename()).toBe('e2e-banner.png')
  const reportEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出报告' }).click()
  expect((await reportEvent).suggestedFilename()).toMatch(/banner-report/)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'e2e-banner.png', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/history-detail-mobile.png', fullPage: true })
  await page.getByRole('button', { name: '删除记录', exact: true }).click()
  await page.getByRole('button', { name: '永久删除', exact: true }).click()
  await expect(page.getByRole('heading', { name: '检测历史', exact: true })).toBeVisible()
  await expect(page.getByText('暂无检测记录', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '退出登录' }).click()
  await expect(page.getByRole('heading', { name: '管理员登录' })).toBeVisible()
  expect((await page.request.get('/api/history')).status()).toBe(401)
})

test('a failed background archive adds no UI and leaves detection usable', async ({ page }) => {
  let count = 0
  await page.route('**/api/history', async route => {
    if (route.request().method() === 'POST' && count++ === 0) await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"测试服务暂时不可用"}' })
    else await route.continue()
  })
  await page.goto('/')
  await archiveFile(page, { name: 'retry.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1WQAAAAASUVORK5CYII=', 'base64') }, 503)
  await expect(page.getByRole('button', { name: '下载banner', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '重试保存' })).toHaveCount(0)
  await expect(page.getByText(/未保存：/)).toHaveCount(0)
  expect(count).toBe(1)
})

test('saved video keeps playing while selecting its own first and last analysis frames', async ({ page }) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'banner-video-fixture-'))
  try {
    const file = path.join(dir, 'e2e-motion.mp4')
    execFileSync(process.env.FFMPEG_PATH || '/opt/homebrew/bin/ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x6149a5:s=800x1296:d=2:r=12', '-vf', "drawbox=x=450:y=100:w=200:h=300:color=0x82d5e7:t=fill:enable='lt(t,1)',drawbox=x=30:y=100:w=200:h=300:color=0x82d5e7:t=fill:enable='gte(t,1)'", '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file])
    await page.goto('/')
    await archiveFile(page, file)
    await login(page)
    await page.getByRole('button', { name: 'e2e-motion.mp4', exact: true }).click()
    const video = page.getByLabel('检测原视频')
    await expect.poll(() => video.evaluate(element => element.readyState)).toBeGreaterThan(1)
    await expect(page.getByRole('heading', { name: '首帧检测结果', exact: true })).toBeVisible()
    const previousTime = await video.evaluate(element => element.currentTime)
    await page.getByRole('button', { name: /尾帧/ }).click()
    await expect(page.getByRole('heading', { name: '尾帧检测结果', exact: true })).toBeVisible()
    expect(await video.evaluate(element => element.paused)).toBe(false)
    await expect.poll(() => video.evaluate(element => element.currentTime)).not.toBe(previousTime)
    const records = await (await page.request.get('/api/history?q=e2e-motion')).json()
    const record = await (await page.request.get(`/api/history/${records.records[0].id}`)).json()
    expect(record.snapshot.result.frames.first.check.cxf).toBeGreaterThan(.5)
    expect(record.snapshot.result.frames.last.check.cxf).toBeLessThan(.5)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.screenshot({ path: 'test-results/history-video-desktop.png', fullPage: true })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

for (const action of ['下载原文件', '导出报告']) test(`expired session shows login before ${action}`, async ({ page }) => {
  const name = action === '下载原文件' ? 'expired-download.png' : 'expired-report.png'
  await page.goto('/')
  await archiveFile(page, { name, mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1WQAAAAASUVORK5CYII=', 'base64') })
  await login(page)
  await page.getByRole('button', { name, exact: true }).click()
  await page.context().clearCookies()
  await page.getByRole(action === '下载原文件' ? 'link' : 'button', { name: action }).click()
  await expect(page.getByRole('heading', { name: '管理员登录' })).toBeVisible()
})

test('original pages stay free of archive UI while background storage remains available', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '检测历史', exact: true })).toHaveCount(0)
  await expect(page.getByText(/检测完成后，原文件与结果将保存至历史记录/)).toHaveCount(0)
  const saved = page.waitForResponse(response => response.url().endsWith('/api/history') && response.request().method() === 'POST')
  await page.locator('input[type=file]').setInputFiles({ name: 'quiet-archive.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1WQAAAAASUVORK5CYII=', 'base64') })
  expect((await saved).status()).toBe(201)
  await expect(page.getByRole('button', { name: '下载banner', exact: true })).toBeVisible()
  await expect(page.getByText('已保存到检测历史', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '重试保存', exact: true })).toHaveCount(0)
  await login(page)
  await expect(page.getByRole('button', { name: 'quiet-archive.png', exact: true })).toBeVisible()
})

test('unconfigured archive storage does not send original materials or change detection UI', async ({ page }) => {
  let uploads = 0
  await page.route('**/api/health', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ready":true,"archiveEnabled":false}' }))
  await page.route('**/api/history', async route => { if (route.request().method() === 'POST') uploads++; await route.continue() })
  await page.goto('/')
  const checked = page.waitForResponse(response => response.url().endsWith('/api/health'))
  await page.locator('input[type=file]').setInputFiles({ name: 'cloud-disabled.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1WQAAAAASUVORK5CYII=', 'base64') })
  await checked
  await expect(page.getByRole('button', { name: '下载banner', exact: true })).toBeVisible()
  await login(page)
  const records = await (await page.request.get('/api/history?q=cloud-disabled')).json()
  expect(records.total).toBe(0)
  expect(uploads).toBe(0)
})
