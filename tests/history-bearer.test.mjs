import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createApp } from '../server/app.mjs'
import { HistoryStore } from '../server/store.mjs'
import { hashPassword } from '../server/auth.mjs'

async function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'banner-bearer-test-'))
  const store = new HistoryStore({ dir })
  store.setAdmin('admin', await hashPassword('synthetic-bearer-password-123'))
  const server = createApp({ store, sessionTransport: 'bearer', allowedOrigins: ['https://approved.example', 'null'] }).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); rmSync(dir, { recursive: true, force: true }) })
  const request = (url, options = {}) => fetch(`http://127.0.0.1:${server.address().port}${url}`, { ...options, headers: { Origin: 'null', ...options.headers } })
  const login = async () => request('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'synthetic-bearer-password-123' }) })
  return { store, request, login }
}

test('bearer login never creates ambient cookies and cookies cannot authorize private reads', async t => {
  const { request, login } = await fixture(t)
  const response = await login()
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('set-cookie'), null)
  const body = await response.json()
  assert.match(body.accessToken, /^[a-f0-9]{64}$/)
  assert.equal((await request('/api/history', { headers: { Cookie: `banner_admin=${body.accessToken}` } })).status, 401)
  assert.equal((await request('/api/history', { headers: { Cookie: `banner_admin=${body.accessToken}`, Authorization: 'Bearer invalid' } })).status, 401)
  assert.equal((await request('/api/admin/session', { headers: { Authorization: `Bearer ${body.accessToken}` } })).status, 200)
  assert.equal((await request('/api/history', { headers: { Authorization: `Bearer ${body.accessToken}` } })).status, 200)
  const session = await (await request('/api/admin/session', { headers: { Authorization: `Bearer ${body.accessToken}` } })).json()
  assert.equal(session.accessToken, undefined)
})

test('sandbox CORS permits explicit authorization without ever allowing credentialed requests', async t => {
  const { request } = await fixture(t)
  const response = await request('/api/admin/login', { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type,x-csrf-token' } })
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  assert.equal(response.headers.get('access-control-allow-credentials'), null)
  assert.match(response.headers.get('access-control-allow-headers'), /Authorization/i)
  assert.equal((await request('/api/history')).status, 401)
  assert.equal((await request('/api/admin/login', { method: 'OPTIONS', headers: { Origin: 'https://untrusted.example' } })).status, 403)
})

test('bearer sessions still enforce CSRF, logout and expiry without cookie fallback', async t => {
  const { request, login, store } = await fixture(t)
  const body = await (await login()).json()
  const headers = { Authorization: `Bearer ${body.accessToken}`, 'X-CSRF-Token': body.csrfToken }
  assert.equal((await request('/api/admin/logout', { method: 'POST', headers: { Authorization: headers.Authorization } })).status, 403)
  const response = await request('/api/admin/logout', { method: 'POST', headers })
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('set-cookie'), null)
  assert.equal((await request('/api/history', { headers })).status, 401)
  const next = await (await login()).json()
  store.db.prepare('UPDATE sessions SET expires_at=0').run()
  assert.equal((await request('/api/history', { headers: { Authorization: `Bearer ${next.accessToken}` } })).status, 401)
})
