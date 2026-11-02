import test from 'node:test'
import assert from 'node:assert/strict'

test('local cloud proxy forwards only anonymous uploads and never carries administrator authority', async t => {
  const { createRemoteApp } = await import('../server/remote-app.mjs')
  const token = 'a'.repeat(64)
  const calls = []
  const app = createRemoteApp({ archiveEnabled: true, remoteUrl: 'https://bytedance.feishu.link/app/app_17h055cggnm', fetchImpl: async (url, options) => {
    calls.push({ url: String(url), options })
    return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json', 'Set-Cookie': `banner_admin_app_17h055cggnm=${token}; Path=/app/app_17h055cggnm/; HttpOnly; Secure; SameSite=Strict` } })
  } })
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const url = `http://127.0.0.1:${server.address().port}`
  const response = await fetch(url + '/api/history', { method: 'POST', headers: { Origin: 'http://127.0.0.1:5190', Cookie: `banner_admin_app_17h055cggnm=${token}`, Authorization: `Bearer ${token}` }, body: '{}' })
  assert.equal(response.status, 200)
  assert.equal(calls[0].url, 'https://bytedance.feishu.link/app/app_17h055cggnm/api/history')
  assert.equal(calls[0].options.headers.get('origin'), 'https://bytedance.feishu.link')
  assert.equal(calls[0].options.headers.get('cookie'), null)
  assert.equal(calls[0].options.headers.get('authorization'), null)
  assert.equal(response.headers.get('set-cookie'), null)
  for (const path of ['/api/admin/login', '/api/admin/logout', '/api/admin/session', '/api/history', '/api/history/00000000-0000-0000-0000-000000000000/files/original']) assert.equal((await fetch(url + path)).status, 404)
  assert.equal((await fetch(url + '/api/__platform__/http-forward')).status, 404)
  assert.equal((await fetch(url + '/api/history', { method: 'POST', headers: { Origin: 'http://127.0.0.1:61234' } })).status, 403)
  assert.equal((await fetch(url + '/api/history', { method: 'POST', headers: { Origin: 'https://untrusted.example' } })).status, 403)
  assert.equal(calls.length, 1)
})

test('paused archival rejects mixed-case bypasses without contacting the cloud', async t => {
  let calls = 0
  const { createRemoteApp } = await import('../server/remote-app.mjs')
  const server = createRemoteApp({ archiveEnabled: false, remoteUrl: 'https://bytedance.feishu.link/app/app_17h055cggnm', fetchImpl: async () => { calls++; return new Response('{}') } }).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  for (const path of ['/api/history', '/api/HISTORY', '/API/history']) assert.ok((await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: 'POST', headers: { Origin: 'http://127.0.0.1:5190' } })).status >= 400)
  assert.equal(calls, 0)
})

test('a redirecting cloud API fails closed rather than showing a misleading successful HTML response', async t => {
  const { createRemoteApp } = await import('../server/remote-app.mjs')
  const server = createRemoteApp({ archiveEnabled: true, remoteUrl: 'https://bytedance.feishu.link/app/app_17h055cggnm', fetchImpl: async () => new Response('', { status: 302, headers: { Location: 'https://example.test/login' } }) }).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/health`)).status, 503)
})
