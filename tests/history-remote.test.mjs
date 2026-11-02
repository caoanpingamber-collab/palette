import test from 'node:test'
import assert from 'node:assert/strict'

test('local cloud proxy scopes cookies, origin and paths without persisting materials', async t => {
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
  const response = await fetch(url + '/api/admin/login', { method: 'POST', headers: { Origin: 'http://127.0.0.1:5190', Cookie: `other_secret=never-forward; banner_admin_app_17h055cggnm=${token}` }, body: '{}' })
  assert.equal(response.status, 200)
  assert.equal(calls[0].url, 'https://bytedance.feishu.link/app/app_17h055cggnm/api/admin/login')
  assert.equal(calls[0].options.headers.get('origin'), 'https://bytedance.feishu.link')
  assert.equal(calls[0].options.headers.get('cookie'), `banner_admin_app_17h055cggnm=${token}`)
  assert.doesNotMatch(response.headers.get('set-cookie'), /; Secure/i)
  assert.match(response.headers.get('set-cookie'), /Path=\/(?:;|$)/)
  assert.equal((await fetch(url + '/api/admin/logout', { method: 'POST', headers: { Origin: 'https://untrusted.example' } })).status, 403)
  assert.equal((await fetch(url + '/api/__platform__/http-forward')).status, 404)
  assert.equal((await fetch(url + '/api/admin/logout', { method: 'POST', headers: { Origin: 'http://127.0.0.1:61234' } })).status, 403)
  assert.equal(calls.length, 1)
  await fetch(url + '/api/admin/logout', { method: 'POST', headers: { Origin: 'http://127.0.0.1:5190', 'X-CSRF-Token': 'csrf-for-this-session' } })
  assert.equal(calls[1].options.headers.get('x-csrf-token'), 'csrf-for-this-session')
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
