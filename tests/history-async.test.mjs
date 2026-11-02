import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomBytes, createHash } from 'node:crypto'
import { HistoryStore } from '../server/store.mjs'
import { createApp } from '../server/app.mjs'
import { hashPassword } from '../server/auth.mjs'

test('async providers preserve admin login, private listing and logout', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'history-async-'))
  const local = new HistoryStore({ dir })
  local.setAdmin('admin', await hashPassword('test-async-password-123'))
  const provider = new Proxy(local, { get(target, key) {
    if (key === 'db') throw new Error('Async providers do not expose SQLite')
    const value = target[key]
    return typeof value === 'function' ? async (...args) => value.apply(target, args) : value
  } })
  const server = createApp({ store: provider, allowedOrigins: ['http://localhost:5190'] }).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(async () => { await new Promise(resolve => server.close(resolve)); local.close(); rmSync(dir, { recursive: true, force: true }) })
  const url = `http://127.0.0.1:${server.address().port}`
  const response = await fetch(url + '/api/admin/login', { method: 'POST', headers: { Origin: 'http://localhost:5190', 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'test-async-password-123' }) })
  assert.equal(response.status, 200)
  const body = await response.json()
  const headers = { Cookie: response.headers.get('set-cookie').split(';')[0], Origin: 'http://localhost:5190', 'X-CSRF-Token': body.csrfToken }
  const listing = await fetch(url + '/api/history', { headers })
  assert.equal(listing.status, 200)
  assert.equal((await listing.json()).total, 0)
  assert.equal((await fetch(url + '/api/admin/logout', { method: 'POST', headers })).status, 204)
  assert.equal((await fetch(url + '/api/history', { headers })).status, 401)
})

test('cloud buffer assets support private range playback without a disk file', async t => {
  const token = randomBytes(32).toString('hex')
  const hash = createHash('sha256').update(token).digest('hex')
  const store = {
    async getSession(value) { return value === hash ? { csrf: 'csrf', token_hash: hash } : null },
    async asset() { return { bytes: Buffer.from('0123456789'), size: 10, type: 'video/mp4', fileName: 'test.mp4' } },
  }
  const server = createApp({ store }).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}/api/history/id/files/original`
  assert.equal((await fetch(url)).status, 401)
  const headers = { Cookie: `banner_admin=${token}`, Range: 'bytes=2-5' }
  const response = await fetch(url, { headers })
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('content-range'), 'bytes 2-5/10')
  assert.match(response.headers.get('cache-control'), /no-store/)
  assert.equal(await response.text(), '2345')
  assert.equal((await fetch(url, { headers: { ...headers, Range: 'bytes=20-' } })).status, 416)
})

test('an old password cannot issue a session after a concurrent password reset', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'history-reset-race-'))
  const store = new HistoryStore({ dir })
  store.setAdmin('admin', await hashPassword('old-password-test-123'))
  const replacement = await hashPassword('new-password-test-123')
  const save = store.saveSession.bind(store)
  store.saveSession = (...args) => { store.setAdmin('admin', replacement); return save(...args) }
  const server = createApp({ store, localDevelopment: true }).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); rmSync(dir, { recursive: true, force: true }) })
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/login`, { method: 'POST', headers: { Origin: 'http://localhost:5190', 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'old-password-test-123' }) })
  assert.equal(response.status, 401)
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0)
})
