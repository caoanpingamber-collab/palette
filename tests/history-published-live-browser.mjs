import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { digest } from '../server/digest.mjs'
import { MiaodaSql } from '../server/miaoda-client.mjs'
import { MiaodaRepository } from '../server/miaoda-repository.mjs'

if (process.env.RUN_PUBLISHED_BROWSER !== '1') throw new Error('Explicit RUN_PUBLISHED_BROWSER=1 is required; uses synthetic online records only')
const appId = process.env.HISTORY_MIAODA_APP_ID
const homeUrl = process.env.HISTORY_PUBLISHED_URL
if (!/^app_[a-z0-9]+$/.test(appId || '') || !/^https:\/\/bytedance\.feishu\.link\/app\/app_[a-z0-9]+$/.test(homeUrl || '')) throw new Error('Specify the approved backend app and published frontend URL')
const apiBase = `https://bytedance.feishu.link/app/${appId}`
const repository = new MiaodaRepository(new MiaodaSql({ appId, env: 'online' }))
const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex')
const headers = { Authorization: `Bearer ${token}`, 'X-CSRF-Token': csrf, Origin: new URL(apiBase).origin }
const ids = [], prefix = `published-browser-synthetic-${randomUUID()}`
const directory = mkdtempSync(path.join(tmpdir(), 'published-browser-synthetic-'))
let browser
assert.ok(await repository.saveSession(digest(token), csrf, Date.now() + 10 * 60 * 1000))
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, acceptDownloads: true })
  const page = await context.newPage()
  if (process.env.VERIFY_PUBLISHED_SITE === '1') {
    await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
    assert.equal(await page.locator('.home-bg-star').count(), 0, 'Published decorative background must remain hidden')
    const image = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 1296
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#6149a5'; ctx.fillRect(0, 0, 800, 1296); ctx.fillStyle = '#82d5e7'; ctx.fillRect(450, 100, 200, 300)
      return canvas.toDataURL('image/png').split(',')[1]
    })
    const saved = page.waitForResponse(response => response.url() === `${apiBase}/api/history` && response.request().method() === 'POST', { timeout: 60000 })
    await page.locator('input[type=file]').setInputFiles({ name: `${prefix}.png`, mimeType: 'image/png', buffer: Buffer.from(image, 'base64') })
    const response = await saved
    assert.equal(response.status(), 201, response.status() === 201 ? '' : await response.text())
    ids.push((await response.json()).id)
    const video = path.join(directory, `${prefix}.mp4`)
    execFileSync(process.env.FFMPEG_PATH || '/opt/homebrew/bin/ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x6149a5:s=800x1296:d=2:r=12', '-vf', "drawbox=x=450:y=100:w=200:h=300:color=0x82d5e7:t=fill:enable='lt(t,1)',drawbox=x=30:y=100:w=200:h=300:color=0x82d5e7:t=fill:enable='gte(t,1)'", '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-pix_fmt', 'yuv420p', video])
    await page.goto(homeUrl, { waitUntil: 'domcontentloaded' })
    const savedVideo = page.waitForResponse(value => value.url() === `${apiBase}/api/history` && value.request().method() === 'POST', { timeout: 60000 })
    await page.locator('input[type=file]').setInputFiles(video)
    const videoResponse = await savedVideo
    assert.equal(videoResponse.status(), 201, videoResponse.status() === 201 ? '' : await videoResponse.text())
    ids.push((await videoResponse.json()).id)
    for (const id of ids) assert.equal((await repository.raw(id)).state, 'ready')
  }
  const adminResponse = await page.goto(`${apiBase}/admin`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const csp = adminResponse.headers()['content-security-policy'] || ''
  assert.match(csp, /sandbox allow-scripts allow-forms allow-downloads/)
  assert.doesNotMatch(csp, /allow-same-origin|script-src-elem/)
  assert.equal(await page.evaluate(() => window.origin), 'null')
  await page.getByRole('heading', { name: '管理员登录' }).waitFor()
  await page.getByLabel('账号', { exact: true }).fill('__synthetic_invalid_account__')
  await page.getByLabel('密码', { exact: true }).fill(randomUUID())
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('alert').waitFor()

  // The real password is never requested or reset. A temporary operator session
  // exercises the live admin UI after the production invalid-password check.
  await page.route(`${apiBase}/api/admin/login`, async route => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fulfill({ status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }, body: JSON.stringify({ username: 'synthetic-verification', csrfToken: csrf, accessToken: token }) })
  })
  await page.getByLabel('密码', { exact: true }).fill('synthetic-session-bridge-only')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('heading', { name: '检测历史', exact: true }).waitFor({ timeout: 45000 })
  assert.equal((await context.cookies()).filter(cookie => cookie.name.startsWith('banner_admin')).length, 0)
  if (ids.length) {
    await page.getByRole('searchbox', { name: '搜索文件名' }).fill(prefix)
    await page.getByRole('button', { name: `${prefix}.png`, exact: true }).click()
    const image = page.getByRole('img', { name: '检测原图' })
    await image.waitFor()
    assert.match(await image.getAttribute('src'), /^blob:/)
    const original = page.waitForEvent('download')
    await page.getByRole('link', { name: '下载原文件' }).click()
    assert.equal((await original).suggestedFilename(), `${prefix}.png`)
    const report = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出报告' }).click()
    assert.match((await report).suggestedFilename(), /banner-report/)
    await page.getByRole('button', { name: '返回历史列表' }).click()
    await page.getByRole('button', { name: `${prefix}.mp4`, exact: true }).click()
    const video = page.getByLabel('检测原视频')
    await video.waitFor()
    await page.waitForFunction(() => document.querySelector('video')?.readyState > 1)
    await page.getByRole('button', { name: /尾帧/ }).click()
    await page.getByRole('heading', { name: '尾帧检测结果' }).waitFor()
    assert.equal(await video.evaluate(element => element.paused), false)
  }
  const cookieOnly = await context.request.get(`${apiBase}/api/history`, { headers: { Cookie: `banner_admin_${appId}=${token}` } })
  assert.equal(cookieOnly.status(), 401)
  const revoked = page.waitForResponse(response => response.url() === `${apiBase}/api/admin/logout` && response.request().method() === 'POST')
  await page.getByRole('button', { name: '退出登录' }).click()
  await page.getByRole('heading', { name: '管理员登录' }).waitFor()
  assert.equal((await revoked).status(), 204)
  assert.equal((await context.request.get(`${apiBase}/api/history`, { headers })).status(), 401)
  await page.goto(homeUrl, { waitUntil: 'domcontentloaded' })
  const scriptUrl = await page.locator('script[type="module"][src]').first().evaluate(element => element.src)
  const scriptResponse = await context.request.head(scriptUrl)
  assert.equal(scriptResponse.headers()['service-worker-allowed'], undefined, 'Static application must not grant a wider service-worker scope')
  const scopeCheck = await page.evaluate(async ({ scriptUrl, scope }) => {
    try { const registration = await navigator.serviceWorker.register(scriptUrl, { scope }); await registration.unregister(); return 'unexpected-registration' }
    catch (error) { return error.name }
  }, { scriptUrl, scope: new URL(apiBase).pathname + '/' })
  assert.equal(scopeCheck, 'SecurityError')
  const popupEvent = context.waitForEvent('page')
  await page.evaluate(url => { window.__sameHostProbe = window.open(url) }, `${apiBase}/admin`)
  const popup = await popupEvent
  await popup.getByRole('heading', { name: '管理员登录' }).waitFor()
  assert.equal(await page.evaluate(() => { try { return Boolean(window.__sameHostProbe.document.querySelector('input')) } catch { return false } }), false)
  await popup.close()
  if (process.env.VERIFY_PUBLISHED_SITE === '1') {
    await page.goto(`${homeUrl}/admin`, { waitUntil: 'domcontentloaded' })
    await page.waitForURL(`${apiBase}/admin`)
    assert.equal(await page.evaluate(() => window.origin), 'null')
  }
  console.log(JSON.stringify({ sandboxApplied: true, liveInvalidPasswordRejected: true, privateAdminUiViaTemporarySession: true, existingPasswordUnchanged: true, cookieOnlyDenied: true, logoutRevoked: true, actualPlatformWorkerScopeDenied: true, liveSameHostWindowDenied: true, publishedImageAndVideoArchived: ids.length === 2, privateBlobMediaAndReports: ids.length === 2 }))
} finally {
  // Logout revokes the test session; cleanup uses another short operator session.
  const cleanup = randomBytes(32).toString('hex'), cleanupCsrf = randomBytes(32).toString('hex')
  try {
    {
      assert.ok(await repository.saveSession(digest(cleanup), cleanupCsrf, Date.now() + 120000))
      const listed = await fetch(`${apiBase}/api/history?q=${encodeURIComponent(prefix)}`, { headers: { Authorization: `Bearer ${cleanup}` }, redirect: 'error', signal: AbortSignal.timeout(45000) })
      assert.equal(listed.status, 200)
      for (const record of (await listed.json()).records) if (record.fileName.startsWith(prefix) && !ids.includes(record.id)) ids.push(record.id)
      for (const id of ids) {
        const response = await fetch(`${apiBase}/api/history/${id}`, { method: 'DELETE', headers: { Origin: new URL(apiBase).origin, Authorization: `Bearer ${cleanup}`, 'X-CSRF-Token': cleanupCsrf }, redirect: 'error', signal: AbortSignal.timeout(45000) })
        assert.equal(response.status, 204, 'Synthetic cloud record cleanup failed')
      }
    }
  } finally {
    await repository.deleteSession(digest(cleanup))
    await repository.deleteSession(digest(token))
    if (browser) await browser.close()
    rmSync(directory, { recursive: true, force: true })
  }
}
