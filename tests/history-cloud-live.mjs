import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { digest } from '../server/digest.mjs'
import { createStore } from '../server/create-store.mjs'
import { createApp } from '../server/app.mjs'
import { configuration } from '../server/config.mjs'

if (process.env.RUN_MIAODA_LIVE !== '1') throw new Error('Explicit RUN_MIAODA_LIVE=1 is required; this test writes synthetic cloud data')
const config = configuration()
assert.equal(config.storage, 'miaoda')
const store = await createStore(config)
const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex')
await store.saveSession(digest(token), csrf, Date.now() + 300000)
const headers = { Cookie: `banner_admin=${token}`, 'X-CSRF-Token': csrf }
const server = createApp({ store, archiveEnabled: true, localDevelopment: true }).listen(0, '127.0.0.1')
await new Promise(resolve => server.once('listening', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const ids = []
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC1lEQVR42mP8/x8AAwMCAO+j1WQAAAAASUVORK5CYII=', 'base64')
const frame = { width: 800, height: 1296, palette: [], V: [0, 0, 0], VHex: '#000000', cold: 100, chroma: 60,
  contrast: { title: 3, cardTop: 3, cardBottom: 2 }, check: { cxf: .6, cyf: .2, clutter: null },
  uiChecks: ['hue', 'chroma', 'contrast', 'comp', 'clutter'].map(key => ({ key, label: key, status: true, issue: '', recommendation: '' })), overallPass: true, recommendation: '', prompt: '' }
function submission(id) {
  const form = new FormData()
  form.append('manifest', JSON.stringify({ version: 1, id, kind: 'image', fileName: 'cloud-live-synthetic-100%.png', inspectedAt: new Date().toISOString(), buildVersion: 'synthetic-test', rules: { version: 'test', thresholds: { cardBottomContrast: 1.2 } }, result: { overallPass: true, frames: { first: frame }, recommendation: '', prompt: '' } }))
  for (const name of ['original', 'first', 'thumbnail']) form.append(name, new Blob([png], { type: 'image/png' }), `${name}.png`)
  return form
}
async function request(path, options = {}) {
  return fetch(base + path, { ...options, headers: { Origin: 'http://localhost:5190', ...options.headers } })
}
try {
  const id = randomUUID(); ids.push(id)
  const form = submission(id)
  const saved = await request('/api/history', { method: 'POST', body: form })
  assert.equal(saved.status, 201, JSON.stringify(await saved.json()))
  assert.equal((await request('/api/history', { method: 'POST', body: form })).status, 200)
  const separate = await createStore(config)
  assert.equal((await separate.get(id)).snapshot.fileName, 'cloud-live-synthetic-100%.png')
  assert.equal((await request('/api/history')).status, 401)
  const listing = await request('/api/history?q=100%25', { headers })
  assert.equal(listing.status, 200)
  assert.ok((await listing.json()).records.some(row => row.id === id))
  const original = await request(`/api/history/${id}/files/original`, { headers })
  assert.equal(original.status, 200)
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), png)
  const range = await request(`/api/history/${id}/files/original`, { headers: { ...headers, Range: 'bytes=0-7' } })
  assert.equal(range.status, 206)
  assert.equal((await range.arrayBuffer()).byteLength, 8)
  const quota = await createStore({ ...config, maxBytes: 1 })
  const detail = await store.get(id)
  const second = randomUUID(); ids.push(second)
  await assert.rejects(quota.create({ manifest: { ...detail.snapshot, id: second }, files: new Map([['original', { type: 'image/png', bytes: png }]]) }), error => error.status === 507)
  const deleted = await request(`/api/history/${id}`, { method: 'DELETE', headers })
  assert.equal(deleted.status, 204)
  assert.equal((await request(`/api/history/${id}`, { headers })).status, 404)
  assert.equal((await request('/api/history', { method: 'POST', body: submission(id) })).status, 410)
  const firstId = randomUUID(), secondId = randomUUID(); ids.push(firstId, secondId)
  const first = { ...detail.snapshot, id: firstId }, secondManifest = { ...detail.snapshot, id: secondId }
  const bytes = Buffer.byteLength(JSON.stringify(first)) + png.length
  const constrained = await createStore({ ...config, maxBytes: (await store.stats()).bytes + bytes })
  const files = new Map([['original', { type: 'image/png', bytes: png }]])
  const concurrent = await Promise.allSettled([constrained.create({ manifest: first, files }), constrained.create({ manifest: secondManifest, files })])
  assert.equal(concurrent.filter(item => item.status === 'fulfilled').length, 1)
  assert.equal(concurrent.find(item => item.status === 'rejected').reason.status, 507)
  console.log(JSON.stringify({ cloudWrite: true, independentRead: true, anonymousReadDenied: true, literalSearch: true, downloadMatches: true, range: true, quota: true, deletion: true, lateRetryDenied: true }))
} finally {
  for (const id of ids) await store.delete(id)
  await store.deleteSession(digest(token))
  await new Promise(resolve => server.close(resolve))
  store.close()
}
