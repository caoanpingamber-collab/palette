import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import http from 'node:http'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1WQAAAAASUVORK5CYII=', 'base64')
const frame = (pass = true) => ({
  width: 800, height: 1296, palette: [{ hex: '#6149a5', rgb: [97, 73, 165], ratio: 100 }],
  V: [191, 227, 255], VHex: '#bfe3ff', cold: 100, chroma: 61,
  contrast: { title: 6.13, cardTop: 3.97, cardBottom: 2.95 },
  check: { cxf: pass ? .6 : .4, cyf: .2, clutter: { secPct: 0, secCount: 0, focus: null } },
  uiChecks: ['hue', 'chroma', 'contrast', 'comp', 'clutter'].map(key => ({ key, label: key, status: key !== 'comp' || pass, issue: key, recommendation: '建议', metric: '60%' })),
  overallPass: pass, recommendation: '建议', prompt: '修改建议',
})
function manifest(id = randomUUID(), overrides = {}) {
  return { version: 1, id, kind: 'image', fileName: 'banner.png', inspectedAt: '2026-10-29T00:00:00.000Z',
    rules: { version: 'banner-qc-v1', thresholds: { cardBottomContrast: 1.2 } }, buildVersion: 'test',
    result: { overallPass: true, recommendation: '建议', prompt: '', frames: { first: frame() } }, ...overrides }
}
function upload(data) {
  const form = new FormData()
  form.append('manifest', JSON.stringify(data))
  for (const key of ['original', 'first', 'thumbnail']) form.append(key, new Blob([png], { type: 'image/png' }), `${key}.png`)
  return form
}
async function fixture(t, options = {}) {
  const { createApp } = await import('../server/app.mjs')
  const { HistoryStore } = await import('../server/store.mjs')
  const { hashPassword } = await import('../server/auth.mjs')
  const dir = mkdtempSync(path.join(tmpdir(), 'banner-history-test-'))
  const store = new HistoryStore({ dir, maxBytes: options.maxBytes ?? 1024 * 1024 })
  await store.setAdmin('admin', await hashPassword('a-test-password-12345'))
  const app = createApp({ store, archiveEnabled: true, allowedOrigins: ['http://localhost:5190'], ...options })
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  const request = (pathname, init = {}) => fetch(url + pathname, { ...init, headers: { Origin: 'http://localhost:5190', ...init.headers } })
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); rmSync(dir, { recursive: true, force: true }) })
  const login = async () => {
    const response = await request('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'a-test-password-12345' }) })
    assert.equal(response.status, 200)
    const body = await response.json()
    return { Cookie: response.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': body.csrfToken }
  }
  return { store, dir, request, login, url }
}

test('anonymous creation is idempotent, but history and all assets remain private', async t => {
  const { request, login } = await fixture(t)
  const data = manifest()
  assert.equal((await request('/api/history', { method: 'POST', body: upload(data) })).status, 201)
  assert.equal((await request('/api/history', { method: 'POST', body: upload(data) })).status, 200)
  for (const endpoint of ['/api/history', `/api/history/${data.id}`, `/api/history/${data.id}/files/original`]) assert.equal((await request(endpoint)).status, 401)
  const headers = await login()
  const listing = await (await request('/api/history', { headers })).json()
  assert.equal(listing.total, 1)
  assert.equal(listing.records[0].fileName, 'banner.png')
  const asset = await request(`/api/history/${data.id}/files/original`, { headers })
  assert.equal(asset.status, 200)
  assert.match(asset.headers.get('cache-control'), /no-store/)
  assert.match(asset.headers.get('content-disposition'), /attachment/)
  assert.deepEqual(Buffer.from(await asset.arrayBuffer()), png)
  const changed = manifest(data.id, { fileName: 'different.png' })
  assert.equal((await request('/api/history', { method: 'POST', body: upload(changed) })).status, 409)
})

test('disabled archival rejects new material without writing records or assets', async t => {
  const { request, store, dir, login } = await fixture(t, { archiveEnabled: false })
  assert.equal((await (await request('/api/health')).json()).archiveEnabled, false)
  assert.equal((await request('/api/history', { method: 'POST', body: upload(manifest()) })).status, 503)
  assert.equal(store.stats().count, 0)
  assert.equal(readdirSync(path.join(dir, 'assets')).length, 0)
  const headers = await login()
  assert.equal((await request('/api/history', { headers })).status, 200)
})

test('CSRF, untrusted origins, logout and expired sessions cannot mutate or read records', async t => {
  const { request, login, store } = await fixture(t)
  const data = manifest()
  await request('/api/history', { method: 'POST', body: upload(data) })
  const headers = await login()
  assert.equal((await request(`/api/history/${data.id}`, { method: 'DELETE', headers: { Cookie: headers.Cookie } })).status, 403)
  assert.equal((await request(`/api/history/${data.id}`, { method: 'DELETE', headers: { ...headers, Origin: 'https://untrusted.example' } })).status, 403)
  assert.equal((await request('/api/history', { method: 'POST', headers: { Origin: 'https://untrusted.example' }, body: upload(manifest()) })).status, 403)
  assert.equal((await request('/api/admin/logout', { method: 'POST', headers })).status, 204)
  assert.equal((await request('/api/history', { headers })).status, 401)
  const again = await login()
  store.db.prepare('UPDATE sessions SET expires_at = 0').run()
  assert.equal((await request('/api/history', { headers: again })).status, 401)
})

test('snapshots and originals survive reopening the database and support filtering', async t => {
  const { request, login, dir, store } = await fixture(t)
  const data = manifest()
  await request('/api/history', { method: 'POST', body: upload(data) })
  const { HistoryStore } = await import('../server/store.mjs')
  const reopened = new HistoryStore({ dir })
  assert.equal(reopened.get(data.id).snapshot.rules.thresholds.cardBottomContrast, 1.2)
  assert.deepEqual(reopened.file(data.id, 'original').bytes, png)
  reopened.close()
  const headers = await login()
  assert.equal((await (await request('/api/history?q=missing', { headers })).json()).total, 0)
  assert.equal((await (await request('/api/history?status=passed&kind=image', { headers })).json()).total, 1)
  assert.equal((await (await request('/api/history?status=failed', { headers })).json()).total, 0)
  assert.equal(store.stats().count, 1)
})

test('quota and invalid uploads leave no archive and never erase older records', async t => {
  const { request, store, dir } = await fixture(t, { maxBytes: 5000 })
  const first = manifest()
  assert.equal((await request('/api/history', { method: 'POST', body: upload(first) })).status, 201)
  const big = manifest(randomUUID(), { fileName: 'big.png' })
  big.result.prompt = 'x'.repeat(3000)
  assert.equal((await request('/api/history', { method: 'POST', body: upload(big) })).status, 507)
  assert.equal(store.stats().count, 1)
  assert.equal(readdirSync(path.join(dir, 'assets')).length, 1)
  const malformed = upload(manifest())
  malformed.set('original', new Blob(['not an image'], { type: 'image/png' }), 'image.png')
  assert.equal((await request('/api/history', { method: 'POST', body: malformed })).status, 400)
  assert.equal(store.stats().count, 1)
})

test('administrator deletion removes originals, frames, record and is safely repeatable', async t => {
  const { request, login, dir, store } = await fixture(t)
  const data = manifest()
  await request('/api/history', { method: 'POST', body: upload(data) })
  const headers = await login()
  assert.equal((await request(`/api/history/${data.id}`, { method: 'DELETE', headers })).status, 204)
  assert.equal((await request(`/api/history/${data.id}`, { method: 'DELETE', headers })).status, 204)
  assert.equal(store.stats().count, 0)
  assert.equal(readdirSync(path.join(dir, 'assets')).length, 0)
  assert.equal((await request(`/api/history/${data.id}/files/original`, { headers })).status, 404)
})

test('oversized, truncated and compressed input is rejected without partial archives', async t => {
  const { request, store } = await fixture(t)
  const tooLarge = upload(manifest())
  tooLarge.set('original', new Blob([png, Buffer.alloc(300001 - png.length)], { type: 'image/png' }), 'big.png')
  assert.equal((await request('/api/history', { method: 'POST', body: tooLarge })).status, 413)
  assert.equal((await request('/api/history', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=broken' }, body: '--broken\r\nContent-Disposition: form-data; name="manifest"\r\n\r\n{}' })).status, 400)
  const compressed = await request('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }, body: gzipSync('{"username":"admin","password":"test"}') })
  assert.equal(compressed.status, 415)
  assert.equal(store.stats().count, 0)
})

test('video archives preserve independently selected first and last frame outcomes', async t => {
  const { request, login } = await fixture(t)
  const data = manifest(randomUUID(), { kind: 'video', fileName: 'clip.mp4', result: { overallPass: false, recommendation: '建议', prompt: '提示', frames: { first: frame(true), last: frame(false) } } })
  const form = upload(data)
  form.set('original', new Blob([Buffer.from('000000186674797069736f6d0000020069736f6d69736f32', 'hex')], { type: 'video/mp4' }), 'clip.mp4')
  form.append('last', new Blob([png], { type: 'image/png' }), 'last.png')
  assert.equal((await request('/api/history', { method: 'POST', body: form })).status, 201)
  const headers = await login()
  const saved = await (await request(`/api/history/${data.id}`, { headers })).json()
  assert.equal(saved.snapshot.result.frames.first.overallPass, true)
  assert.equal(saved.snapshot.result.frames.last.overallPass, false)
  const range = await request(`/api/history/${data.id}/files/original`, { headers: { ...headers, Range: 'bytes=0-7' } })
  assert.equal(range.status, 206)
  assert.equal((await range.arrayBuffer()).byteLength, 8)
})

test('pagination and literal search do not conflate wildcard filenames', async t => {
  const { request, login } = await fixture(t)
  await request('/api/history', { method: 'POST', body: upload(manifest(randomUUID(), { fileName: '100%.png' })) })
  await request('/api/history', { method: 'POST', body: upload(manifest(randomUUID(), { fileName: 'other.png' })) })
  const headers = await login()
  const first = await (await request('/api/history?pageSize=1', { headers })).json()
  const second = await (await request('/api/history?pageSize=1&page=2', { headers })).json()
  assert.equal(first.total, 2)
  assert.notEqual(first.records[0].id, second.records[0].id)
  const found = await (await request('/api/history?q=%25', { headers })).json()
  assert.equal(found.total, 1)
  assert.equal(found.records[0].fileName, '100%.png')
})

test('date ranges accept precise UTC boundaries representing the administrator local day', async t => {
  const { request, login } = await fixture(t)
  await request('/api/history', { method: 'POST', body: upload(manifest()) })
  const headers = await login()
  const response = await request('/api/history?from=2000-01-01T16%3A00%3A00.000Z&to=2099-01-01T15%3A59%3A59.999Z', { headers })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).total, 1)
})

test('in-flight upload cap prevents many anonymous requests buffering files simultaneously', async t => {
  const { url, request } = await fixture(t, { maxUploads: 1 })
  const holding = http.request(url + '/api/history', { method: 'POST', headers: { Origin: 'http://localhost:5190', 'Content-Type': 'multipart/form-data; boundary=hold' } })
  holding.on('error', () => {})
  holding.write('--hold\r\nContent-Disposition: form-data; name="manifest"\r\n\r\n')
  await new Promise(resolve => holding.once('socket', socket => socket.once('connect', () => setImmediate(resolve))))
  try {
    const response = await request('/api/history', { method: 'POST', body: upload(manifest()) })
    assert.equal(response.status, 429)
  } finally { holding.destroy() }
})

test('truncated unknown file streams return an error without crashing the history service', async t => {
  const { request } = await fixture(t)
  const response = await request('/api/history', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=broken' }, body: '--broken\r\nContent-Disposition: form-data; name="unknown"; filename="x.png"\r\nContent-Type: image/png\r\n\r\npartial-file' })
  assert.equal(response.status, 400)
  assert.equal((await request('/api/health')).status, 200)
})

test('deleted submission IDs cannot resurrect private material through a delayed retry', async t => {
  const { request, login, store } = await fixture(t)
  const data = manifest()
  await request('/api/history', { method: 'POST', body: upload(data) })
  const headers = await login()
  await request(`/api/history/${data.id}`, { method: 'DELETE', headers })
  assert.equal((await request('/api/history', { method: 'POST', body: upload(data) })).status, 410)
  assert.equal(store.stats().count, 0)
})

test('chunked request limit includes bytes discarded by the multipart parser', async t => {
  const { url, store } = await fixture(t)
  const status = await new Promise((resolve, reject) => {
    let stopped = false
    const req = http.request(url + '/api/history', { method: 'POST', headers: { Origin: 'http://localhost:5190', 'Content-Type': 'multipart/form-data; boundary=large' } }, response => {
      stopped = true
      response.resume()
      response.once('end', () => resolve(response.statusCode))
    })
    req.on('error', error => { if (!stopped) reject(error) })
    req.setTimeout(2000, () => req.destroy(new Error('The request limit did not reject the oversized stream')))
    const write = async chunk => {
      if (stopped || req.destroyed) return false
      if (!req.write(chunk)) await new Promise(done => {
        const release = () => { req.off('drain', release); req.off('close', release); done() }
        req.once('drain', release); req.once('close', release)
      })
      await new Promise(done => setImmediate(done))
      return !stopped && !req.destroyed
    }
    void (async () => {
      await write('--large\r\nContent-Disposition: form-data; name="unknown"; filename="x.png"\r\nContent-Type: image/png\r\n\r\n')
      // 576 chunks plus multipart headers crosses 9 MiB. Stop sending there so
      // a client-side EPIPE from later writes cannot hide the server's 413.
      for (let index = 0; index < 576; index++) if (!await write(Buffer.alloc(16384))) return
    })().catch(reject)
  })
  assert.equal(status, 413)
  assert.equal(store.stats().count, 0)
})
