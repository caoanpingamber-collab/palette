import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { digest } from '../server/digest.mjs'
import { MiaodaSql } from '../server/miaoda-client.mjs'
import { MiaodaRepository } from '../server/miaoda-repository.mjs'

if (process.env.RUN_PUBLISHED_LIVE !== '1') throw new Error('Explicit RUN_PUBLISHED_LIVE=1 is required; writes synthetic online cloud data')
const appId = 'app_17h055cggnm', base = `https://bytedance.feishu.link/app/${appId}`
const repository = new MiaodaRepository(new MiaodaSql({ appId, env: 'online' }))
const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex')
assert.ok(await repository.saveSession(digest(token), csrf, Date.now() + 300000))
const headers = { Authorization: `Bearer ${token}`, 'X-CSRF-Token': csrf }
const id = randomUUID()
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC1lEQVR42mP8/x8AAwMCAO+j1WQAAAAASUVORK5CYII=', 'base64')
const frame = { width: 800, height: 1296, palette: [], V: [0, 0, 0], VHex: '#000000', cold: 100, chroma: 60,
  contrast: { title: 3, cardTop: 3, cardBottom: 2 }, check: { cxf: .6, cyf: .2, clutter: null },
  uiChecks: ['hue', 'chroma', 'contrast', 'comp', 'clutter'].map(key => ({ key, label: key, status: true, issue: '', recommendation: '' })), overallPass: true, recommendation: '', prompt: '' }
function submission() {
  const form = new FormData()
  form.append('manifest', JSON.stringify({ version: 1, id, kind: 'image', fileName: 'published-live-synthetic-100%.png', inspectedAt: new Date().toISOString(), buildVersion: 'synthetic-test', rules: { version: 'test', thresholds: { cardBottomContrast: 1.2 } }, result: { overallPass: true, frames: { first: frame }, recommendation: '', prompt: '' } }))
  for (const name of ['original', 'first', 'thumbnail']) form.append(name, new Blob([png], { type: 'image/png' }), `${name}.png`)
  return form
}
const form = submission()
async function request(path, options = {}) {
  return fetch(base + path, { ...options, headers: { Origin: new URL(base).origin, ...options.headers }, redirect: 'manual', signal: AbortSignal.timeout(45000) })
}
try {
  const saved = await request('/api/history', { method: 'POST', body: form })
  assert.equal(saved.status, 201, JSON.stringify(await saved.json()))
  assert.equal((await request('/api/history', { method: 'POST', body: form })).status, 200)
  assert.equal((await request('/api/history')).status, 401)
  assert.equal((await request('/api/history', { headers: { Cookie: `banner_admin_${appId}=${token}` } })).status, 401)
  assert.equal((await request(`/api/history/${id}/files/original`)).status, 401)
  const record = await repository.raw(id)
  assert.equal(record.state, 'ready')
  const listed = await request('/api/history?q=100%25', { headers })
  assert.equal(listed.status, 200, JSON.stringify(await listed.clone().json()))
  assert.ok((await listed.json()).records.some(row => row.id === id))
  const original = await request(`/api/history/${id}/files/original`, { headers })
  assert.equal(original.status, 200, 'private download failed')
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), png)
  const range = await request(`/api/history/${id}/files/original`, { headers: { ...headers, Range: 'bytes=0-7' } })
  assert.equal(range.status, 206)
  assert.equal((await range.arrayBuffer()).byteLength, 8)
  const removed = await request(`/api/history/${id}`, { method: 'DELETE', headers })
  assert.equal(removed.status, 204, removed.status === 204 ? '' : await removed.text())
  assert.equal((await request('/api/history', { method: 'POST', body: form })).status, 410)
  console.log(JSON.stringify({ publishedApi: true, cloudWrite: true, independentOnlineRead: true, anonymousReadDenied: true, privateOriginalMatches: true, range: true, deletion: true, lateRetryDenied: true }))
} finally {
  await request(`/api/history/${id}`, { method: 'DELETE', headers }).catch(() => {})
  await repository.deleteSession(digest(token))
}
