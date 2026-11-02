import test from 'node:test'
import assert from 'node:assert/strict'

test('isolated client omits cookies, retains bearer only in memory and revokes private media on logout', async t => {
  const client = await import('../src/lib/history.mjs')
  const originalFetch = globalThis.fetch
  const originalRevoke = URL.revokeObjectURL
  const calls = [], revoked = []
  const token = 'b'.repeat(64)
  const row = { id: 'synthetic', fileName: 'synthetic.png', snapshot: { kind: 'image' } }
  URL.revokeObjectURL = url => { revoked.push(url); originalRevoke(url) }
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    if (url.includes('/files/')) return new Response(new Blob(['synthetic-bytes'], { type: 'image/png' }))
    if (url.endsWith('/api/admin/login')) return Response.json({ username: 'admin', csrfToken: 'synthetic-csrf', accessToken: token })
    if (url.endsWith('/api/admin/logout')) return new Response(null, { status: 204 })
    if (url.includes('/api/history?')) return Response.json({ records: [row], total: 1 })
    return Response.json(row)
  }
  t.after(() => { globalThis.fetch = originalFetch; URL.revokeObjectURL = originalRevoke; client.configureHistoryClient() })
  client.configureHistoryClient({ apiBase: 'https://bytedance.feishu.link/app/app_synthetic', sessionTransport: 'bearer' })
  const session = await client.loginAdmin('admin', 'synthetic-password')
  assert.equal(session.accessToken, undefined)
  const listed = await client.listHistory({ page: 1 })
  assert.match(listed.records[0].thumbnailUrl, /^blob:/)
  await client.getHistory('synthetic')
  const privateUrl = client.assetUrl('synthetic', 'original')
  assert.match(privateUrl, /^blob:/)
  assert.ok(calls.every(({ options }) => options.credentials === 'omit'))
  assert.ok(calls.every(({ options }) => options.redirect === 'error'))
  assert.equal(new Headers(calls[0].options.headers).get('Authorization'), null)
  assert.ok(calls.slice(1).every(({ options }) => new Headers(options.headers).get('Authorization') === `Bearer ${token}`))
  await client.logoutAdmin(session.csrfToken)
  assert.ok(revoked.includes(privateUrl))
  assert.equal(client.assetUrl('synthetic', 'original'), '')
  await client.getAdminSession()
  assert.equal(new Headers(calls.at(-1).options.headers).get('Authorization'), null)
})

test('only an approved online administrator page can replace the existing admin route', async () => {
  const { approvedAdminUrl } = await import('../src/lib/history.mjs')
  assert.equal(approvedAdminUrl('https://bytedance.feishu.link/app/app_synthetic/admin'), 'https://bytedance.feishu.link/app/app_synthetic/admin')
  for (const url of ['javascript:alert(1)', 'https://untrusted.example/admin', 'https://bytedance.feishu.link/app/app_synthetic/admin?next=elsewhere', 'https://bytedance.feishu.link/app/app_synthetic/other']) assert.throws(() => approvedAdminUrl(url))
})

test('a late login response cannot restore a cleared in-memory session', async t => {
  const client = await import('../src/lib/history.mjs')
  const original = globalThis.fetch
  let resolve
  globalThis.fetch = () => new Promise(done => { resolve = done })
  t.after(() => { globalThis.fetch = original; client.configureHistoryClient() })
  client.configureHistoryClient({ apiBase: 'https://bytedance.feishu.link/app/app_synthetic', sessionTransport: 'bearer' })
  const login = client.loginAdmin('admin', 'synthetic-password')
  client.clearHistorySession()
  resolve(Response.json({ username: 'admin', csrfToken: 'test', accessToken: 'c'.repeat(64) }))
  await assert.rejects(login, error => error.name === 'AbortError')
})

for (const pending of [false, true]) test(`logout drops local authority immediately when server revocation ${pending ? 'hangs' : 'fails'}`, async t => {
  const client = await import('../src/lib/history.mjs')
  const original = globalThis.fetch
  let finish, sessionHeaders
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/login')) return Response.json({ username: 'admin', csrfToken: 'test', accessToken: 'd'.repeat(64) })
    if (url.endsWith('/logout')) return pending ? new Promise(resolve => { finish = resolve }) : Promise.reject(new TypeError('synthetic offline'))
    sessionHeaders = new Headers(options.headers)
    return Response.json({ username: 'admin', csrfToken: 'test' })
  }
  t.after(() => { globalThis.fetch = original; client.configureHistoryClient() })
  client.configureHistoryClient({ apiBase: 'https://bytedance.feishu.link/app/app_synthetic', sessionTransport: 'bearer' })
  await client.loginAdmin('admin', 'synthetic-password')
  const logout = client.logoutAdmin('test').catch(() => {})
  try { await client.getAdminSession(); assert.equal(sessionHeaders.get('Authorization'), null) }
  finally { finish?.(new Response(null, { status: 204 })); await logout }
})

test('late private media cannot reappear after its record is released', async t => {
  const client = await import('../src/lib/history.mjs')
  const original = globalThis.fetch
  const finish = []
  globalThis.fetch = async url => {
    if (url.endsWith('/login')) return Response.json({ username: 'admin', csrfToken: 'test', accessToken: 'e'.repeat(64) })
    if (url.includes('/files/')) return new Promise(resolve => { finish.push(resolve) })
    return Response.json({ id: 'released', snapshot: { kind: 'image' } })
  }
  t.after(() => { globalThis.fetch = original; client.configureHistoryClient() })
  client.configureHistoryClient({ apiBase: 'https://bytedance.feishu.link/app/app_synthetic', sessionTransport: 'bearer' })
  await client.loginAdmin('admin', 'synthetic-password')
  const loading = client.getHistory('released')
  await new Promise(resolve => setTimeout(resolve, 0))
  client.releaseHistoryMedia('released')
  const rejected = assert.rejects(loading, error => error.name === 'AbortError')
  for (const resolve of finish) resolve(new Response(new Blob(['synthetic'], { type: 'image/png' })))
  await rejected
  assert.equal(client.assetUrl('released', 'original'), '')
})

test('released records also fence metadata responses that arrived before asset loading', async t => {
  const client = await import('../src/lib/history.mjs')
  const original = globalThis.fetch
  let finish
  globalThis.fetch = async url => {
    if (url.endsWith('/login')) return Response.json({ username: 'admin', csrfToken: 'test', accessToken: 'f'.repeat(64) })
    if (url.includes('/files/')) return new Response(new Blob(['synthetic'], { type: 'image/png' }))
    return new Promise(resolve => { finish = resolve })
  }
  t.after(() => { globalThis.fetch = original; client.configureHistoryClient() })
  client.configureHistoryClient({ apiBase: 'https://bytedance.feishu.link/app/app_synthetic', sessionTransport: 'bearer' })
  await client.loginAdmin('admin', 'synthetic-password')
  const loading = client.getHistory('late-metadata')
  client.releaseHistoryMedia('late-metadata')
  const rejected = assert.rejects(loading, error => error.name === 'AbortError')
  finish(Response.json({ id: 'late-metadata', snapshot: { kind: 'image' } }))
  await rejected
})

test('isolated client rejects unapproved destinations and never caches media from an expired session', async t => {
  const client = await import('../src/lib/history.mjs')
  assert.throws(() => client.configureHistoryClient({ apiBase: 'https://untrusted.example', sessionTransport: 'bearer' }))
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push(options)
    return url.endsWith('/login') ? Response.json({ username: 'admin', csrfToken: 'synthetic', accessToken: 'a'.repeat(64) }) : Response.json({ error: 'expired' }, { status: 401 })
  }
  t.after(() => { globalThis.fetch = originalFetch; client.configureHistoryClient() })
  client.configureHistoryClient({ apiBase: 'https://bytedance.feishu.link/app/app_synthetic', sessionTransport: 'bearer' })
  await client.loginAdmin('admin', 'synthetic-password')
  await assert.rejects(client.getAdminSession(), error => error.status === 401)
  await assert.rejects(client.getAdminSession())
  assert.equal(new Headers(calls.at(-1).headers).get('Authorization'), null)
})
