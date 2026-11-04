import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { chromium, expect } from '@playwright/test'
import { digest } from '../server/digest.mjs'
import { MiaodaSql } from '../server/miaoda-client.mjs'
import { MiaodaRepository } from '../server/miaoda-repository.mjs'
import { bottomGif } from './bottom-fixtures.mjs'

if (process.env.RUN_BOTTOM_PUBLISHED !== '1') throw new Error('Explicit RUN_BOTTOM_PUBLISHED=1 is required; writes synthetic online records')
const appId = process.env.HISTORY_MIAODA_APP_ID
const homeUrl = process.env.HISTORY_PUBLISHED_URL
if (!/^app_[a-z0-9]+$/.test(appId || '') || !/^https:\/\/bytedance\.(feishu\.link|feishuapp\.com)\/app\/app_[a-z0-9]+$/.test(homeUrl || '')) throw new Error('Specify the approved backend and published frontend')
const apiBase = `https://bytedance.feishu.link/app/${appId}`
const uploadBase = `${new URL(homeUrl).origin}/app/${appId}`
const repository = new MiaodaRepository(new MiaodaSql({ appId, env: 'online' }))
const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex')
const prefix = `bottom-published-synthetic-${randomUUID()}`
const ids = new Set()
let browser
const headers = { Origin: new URL(apiBase).origin, Authorization: `Bearer ${token}`, 'X-CSRF-Token': csrf }
const api = (pathname, options = {}) => fetch(`${apiBase}${pathname}`, { ...options, headers: { ...headers, ...options.headers }, redirect: 'error', signal: AbortSignal.timeout(45000) })
assert.ok(await repository.saveSession(digest(token), csrf, Date.now() + 15 * 60 * 1000))
try {
  const health = await (await api('/api/health')).json()
  assert.ok(health.snapshotVersions?.includes(2), 'The deployed native backend must support Bottom v2')
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, acceptDownloads: true })
  context.setDefaultTimeout(45000)
  const page = await context.newPage()
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) console.log(JSON.stringify({ browser: message.type(), message: message.text().slice(0, 700) })) })
  page.on('pageerror', error => console.log(JSON.stringify({ pageError: error.message })))
  page.on('requestfailed', request => console.log(JSON.stringify({ failedResource: request.url().split('?')[0], error: request.failure()?.errorText })))
  page.on('response', response => { if (response.status() >= 400) console.log(JSON.stringify({ responseError: response.url().split('?')[0], status: response.status() })) })
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await expect(page.locator('.home-bg-star')).toHaveCount(0)
  await page.getByRole('button', { name: 'Bottom banner', exact: true }).click()
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1071; canvas.height = 180
    const ctx = canvas.getContext('2d'); ctx.beginPath(); ctx.roundRect(0, 0, 1071, 180, 90); ctx.clip()
    ctx.fillStyle = '#621fb7'; ctx.fillRect(0, 0, 1071, 180)
    ctx.fillStyle = '#fff'; ctx.font = 'italic bold 48px Arial'
    ctx.fillText('Join the AI Video Contest and', 80, 78, 653); ctx.fillText('Win Prizes Now!', 80, 134)
    ctx.fillStyle = '#22dddd'; ctx.beginPath(); ctx.arc(860, 90, 45, 0, Math.PI * 2); ctx.fill()
    return canvas.toDataURL().split(',')[1]
  })
  async function upload(file) {
    console.log(JSON.stringify({ stage: 'upload', kind: file.mimeType }))
    const saved = page.waitForResponse(response => response.url() === `${uploadBase}/api/history` && response.request().method() === 'POST', { timeout: 90000 })
    await page.locator('input[type=file]').setInputFiles(file)
    const response = await saved
    assert.equal(response.status(), 201)
    const { id } = await response.json(); ids.add(id)
    console.log(JSON.stringify({ stage: 'archived', kind: file.mimeType }))
    return id
  }
  const pngId = await upload({ name: `${prefix}.png`, mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await expect(page.getByRole('heading', { name: 'Approved', exact: true })).toBeVisible()
  await expect(page.getByText('44/57', { exact: true })).toBeVisible()
  await expect(page.getByText(/字体|字号/)).toHaveCount(0)
  const first = await repository.raw(pngId)
  assert.equal(first.manifest.version, 2)
  assert.equal(first.manifest.result.frames.first.evidence.ocr.lines.length, 2)
  assert.equal(first.manifest.result.frames.first.uiChecks.find(row => row.key === 'copy').status, true)
  await page.getByRole('button', { name: '下一张', exact: true }).click()
  await expect(page.locator('[data-bottom-variant="thumbnail"]')).toBeVisible()
  const preview = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载预览', exact: true }).click()
  assert.match((await preview).suggestedFilename(), /bottom-banner-preview-thumbnail/)
  const report = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出报告', exact: true }).click()
  assert.match((await report).suggestedFilename(), /bottom-banner-report/)
  await page.getByRole('button', { name: '关闭结果页' }).click()
  const gifId = await upload({ name: `${prefix}.gif`, mimeType: 'image/gif', buffer: bottomGif() })
  const gif = page.getByAltText('Bottom Banner 完整预览')
  const source = await gif.getAttribute('src')
  await page.getByRole('button', { name: '查看尾帧', exact: true }).click()
  assert.equal(await gif.getAttribute('src'), source)
  const before = await gif.screenshot()
  await expect.poll(async () => (await gif.screenshot()).equals(before), { intervals: [110], timeout: 3000 }).toBe(false)
  const savedGif = await repository.raw(gifId)
  assert.equal(savedGif.manifest.animated, true)
  assert.equal(savedGif.manifest.result.frames.first.uiChecks.find(row => row.key === 'composition').status, true)
  assert.equal(savedGif.manifest.result.frames.last.uiChecks.find(row => row.key === 'composition').status, false)
  assert.equal((await fetch(`${apiBase}/api/history/${gifId}/files/original`)).status, 401)
  const adminResponse = await page.goto(`${apiBase}/admin`, { waitUntil: 'domcontentloaded' })
  assert.match(adminResponse.headers()['content-security-policy'], /sandbox allow-scripts allow-forms allow-downloads/)
  assert.equal(await page.evaluate(() => window.origin), 'null')
  // Use a short operator-created test session; never read or reset the real password.
  await page.route(`${apiBase}/api/admin/login`, route => route.fulfill({ status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }, body: JSON.stringify({ username: 'synthetic-verification', csrfToken: csrf, accessToken: token }) }))
  await page.getByLabel('账号', { exact: true }).fill('synthetic-verification')
  await page.getByLabel('密码', { exact: true }).fill('synthetic-session-bridge-only')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('searchbox', { name: '搜索文件名' }).fill(prefix)
  await page.getByRole('button', { name: `${prefix}.png`, exact: true }).click()
  await expect(page.getByText('检测规则 bottom-banner-qc-v1', { exact: true })).toBeVisible()
  await expect(page.getByText('44/57', { exact: true })).toBeVisible()
  assert.match(await page.getByRole('img', { name: '检测原图' }).getAttribute('src'), /^blob:/)
  await page.getByRole('button', { name: '返回历史列表' }).click()
  await page.getByRole('button', { name: `${prefix}.gif`, exact: true }).click()
  await page.getByRole('button', { name: /尾帧/ }).click()
  await expect(page.getByRole('heading', { name: '尾帧检测结果', exact: true })).toBeVisible()
  const original = page.waitForEvent('download')
  await page.getByRole('link', { name: '下载原文件' }).click()
  assert.equal((await original).suggestedFilename(), `${prefix}.gif`)
  const revoked = page.waitForResponse(response => response.url() === `${apiBase}/api/admin/logout` && response.request().method() === 'POST')
  await page.getByRole('button', { name: '退出登录' }).click()
  assert.equal((await revoked).status(), 204)
  assert.equal((await api('/api/history')).status, 401)
  console.log(JSON.stringify({ bottomPublishedOcr: true, copy44: true, circlePreviewExport: true, reportExport: true, gifPlayback: true, independentFrameResults: true, cloudV2Readback: true, privateAdminMedia: true, originalGifDownload: true, logoutRevoked: true, passwordUnchanged: true }))
} finally {
  const cleanupToken = randomBytes(32).toString('hex'), cleanupCsrf = randomBytes(32).toString('hex')
  const cleanupHeaders = { Origin: new URL(apiBase).origin, Authorization: `Bearer ${cleanupToken}`, 'X-CSRF-Token': cleanupCsrf }
  try {
    assert.ok(await repository.saveSession(digest(cleanupToken), cleanupCsrf, Date.now() + 180000))
    const listed = await fetch(`${apiBase}/api/history?q=${encodeURIComponent(prefix)}`, { headers: cleanupHeaders, redirect: 'error', signal: AbortSignal.timeout(45000) })
    assert.equal(listed.status, 200)
    for (const record of (await listed.json()).records) if (record.fileName.startsWith(prefix)) ids.add(record.id)
    for (const id of ids) {
      const removed = await fetch(`${apiBase}/api/history/${id}`, { method: 'DELETE', headers: cleanupHeaders, redirect: 'error', signal: AbortSignal.timeout(45000) })
      assert.equal(removed.status, 204, 'Synthetic Bottom cloud cleanup failed')
    }
  } finally {
    await repository.deleteSession(digest(cleanupToken))
    await repository.deleteSession(digest(token))
    await browser?.close()
  }
}
