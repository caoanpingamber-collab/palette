import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

function fixture() {
  const rows = new Map(), deleted = new Set(), blobs = new Map()
  const repository = {
    async reserve(record) {
      if (deleted.has(record.id)) return { deleted: true }
      if (rows.has(record.id)) return rows.get(record.id)
      const row = { ...record, state: 'pending', assets: {} }
      rows.set(row.id, row); return row
    },
    async raw(id) { return rows.get(id) },
    async finalize(id, lease, assets) {
      const row = rows.get(id)
      if (row?.state !== 'pending' || row.lease !== lease) return false
      Object.assign(row, { state: 'ready', assets }); return true
    },
    async abort(id, lease) { if (rows.get(id)?.state === 'pending' && rows.get(id)?.lease === lease) rows.delete(id) },
    async cancel(id, lease) { const row = rows.get(id); if (!row || !['pending', 'deleting'].includes(row.state) || row.lease !== lease) return null; row.state = 'deleting'; return row },
    async markDeleting(id) { const row = rows.get(id); if (!row) return null; deleted.add(id); row.state = 'deleting'; return row },
    async finishDelete(id) { rows.delete(id) },
  }
  const objects = {
    async upload(key, file) { blobs.set(key, Buffer.from(file.bytes)); return { filePath: key, bucketID: 'private' } },
    async download(meta) { return blobs.get(meta.filePath) },
    async remove(values) { for (const value of values) blobs.delete(value.filePath) },
    async removePrefix(prefix) { for (const key of blobs.keys()) if (key.startsWith(prefix)) blobs.delete(key) },
  }
  const input = { manifest: { id: randomUUID(), kind: 'image', fileName: 'test.png', result: { overallPass: true, frames: {} } }, files: new Map([['original', { bytes: Buffer.from('synthetic'), type: 'image/png' }]]) }
  return { repository, objects, rows, blobs, input }
}

test('cloud archives are idempotent and return private bytes without disk paths', async () => {
  const { CloudHistoryStore } = await import('../server/cloud-store.mjs')
  const f = fixture(), store = new CloudHistoryStore(f)
  assert.equal((await store.create(f.input)).created, true)
  assert.equal((await store.create(f.input)).created, false)
  assert.equal(f.blobs.size, 1)
  const asset = await store.asset(f.input.manifest.id, 'original')
  assert.equal(asset.path, undefined)
  assert.equal(asset.bytes.toString(), 'synthetic')
  await store.delete(f.input.manifest.id)
  assert.equal(f.blobs.size, 0)
  await assert.rejects(store.create(f.input), error => error.status === 410)
})

test('a failed object upload releases its reservation and already uploaded objects', async () => {
  const { CloudHistoryStore } = await import('../server/cloud-store.mjs')
  const f = fixture(), store = new CloudHistoryStore(f)
  f.input.files.set('first', { bytes: Buffer.from('frame'), type: 'image/png' })
  const upload = f.objects.upload
  f.objects.upload = async (key, file) => { if (key.endsWith('/first')) throw new Error('cloud unavailable'); return upload(key, file) }
  await assert.rejects(store.create(f.input), /cloud unavailable/)
  assert.equal(f.rows.get(f.input.manifest.id).state, 'deleting')
  assert.equal(f.blobs.size, 0)
})

test('uncertain finalization must not erase media from an already committed record', async () => {
  const { CloudHistoryStore } = await import('../server/cloud-store.mjs')
  const f = fixture(), store = new CloudHistoryStore(f)
  const finalize = f.repository.finalize
  f.repository.finalize = async (...args) => { await finalize(...args); throw new Error('response lost after commit') }
  assert.equal((await store.create(f.input)).created, true)
  assert.equal(f.rows.get(f.input.manifest.id).state, 'ready')
  assert.equal(f.blobs.size, 1)
})

test('quota rejection happens before uploading any objects', async () => {
  const { CloudHistoryStore } = await import('../server/cloud-store.mjs')
  const f = fixture(), store = new CloudHistoryStore(f)
  f.repository.reserve = async () => null
  await assert.rejects(store.create(f.input), error => error.status === 507)
  assert.equal(f.blobs.size, 0)
})

test('deletion remains retryable after an object-store outage', async () => {
  const { CloudHistoryStore } = await import('../server/cloud-store.mjs')
  const f = fixture(), store = new CloudHistoryStore(f)
  await store.create(f.input)
  const remove = f.objects.remove
  f.objects.remove = async () => { throw new Error('offline') }
  await assert.rejects(store.delete(f.input.manifest.id), /offline/)
  await assert.rejects(store.get(f.input.manifest.id), error => error.status === 404)
  f.objects.remove = remove
  await store.delete(f.input.manifest.id)
  assert.equal(f.blobs.size, 0)
  assert.equal(f.rows.size, 0)
})

test('recovery cleans only the expired reservation lease and leaves completed material intact', async () => {
  const { CloudHistoryStore } = await import('../server/cloud-store.mjs')
  const f = fixture(), store = new CloudHistoryStore(f)
  const lease = randomUUID(), id = randomUUID()
  f.rows.set(id, { id, lease, state: 'pending', assets: {} })
  f.blobs.set(`banner-history/${id}/${lease}/original`, Buffer.from('interrupted'))
  f.blobs.set('completed-record', Buffer.from('keep'))
  f.repository.unfinished = async () => [{ id, lease, state: 'pending' }]
  f.repository.claimExpired = async () => true
  f.objects.removePrefix = async prefix => { for (const key of f.blobs.keys()) if (key.startsWith(prefix)) f.blobs.delete(key) }
  await store.recover()
  assert.equal(f.rows.has(id), false)
  assert.equal(f.blobs.size, 1)
  assert.equal(f.blobs.get('completed-record').toString(), 'keep')
})

test('an unclaimed reservation must not be cleaned by a competing recovery worker', async () => {
  const { CloudHistoryStore } = await import('../server/cloud-store.mjs')
  const f = fixture(), store = new CloudHistoryStore(f)
  f.repository.unfinished = async () => [{ id: randomUUID(), lease: randomUUID(), state: 'pending' }]
  f.repository.claimExpired = async () => false
  f.objects.removePrefix = async () => assert.fail('Cannot clean an active lease')
  await store.recover()
})

test('an upload with a lost response is cleaned by lease prefix before releasing its reservation', async () => {
  const { CloudHistoryStore } = await import('../server/cloud-store.mjs')
  const f = fixture(), store = new CloudHistoryStore(f)
  const upload = f.objects.upload
  f.objects.upload = async (...args) => { await upload(...args); throw new Error('upload response lost') }
  await assert.rejects(store.create(f.input), /upload response lost/)
  assert.equal(f.blobs.size, 0)
  assert.equal(f.rows.get(f.input.manifest.id).state, 'deleting')
})

test('cancellation wins atomically before cleanup if finalization is still in flight', async () => {
  const { CloudHistoryStore } = await import('../server/cloud-store.mjs')
  const f = fixture(), store = new CloudHistoryStore(f)
  const finalize = f.repository.finalize
  let delayed
  f.repository.finalize = async (...args) => { delayed = () => finalize(...args); throw new Error('finalization timed out') }
  f.repository.raw = async id => {
    const row = f.rows.get(id)
    const snapshot = row ? structuredClone(row) : null
    if (delayed) { const run = delayed; delayed = null; await run() }
    return snapshot
  }
  await store.create(f.input).catch(() => {})
  const current = f.rows.get(f.input.manifest.id)
  assert.ok(current?.state !== 'ready' || f.blobs.size === 1, 'A committed record must not reference erased media')
})

test('deleting during an active upload retains ownership until the uploader can clean late objects', async () => {
  const { CloudHistoryStore } = await import('../server/cloud-store.mjs')
  const f = fixture(), store = new CloudHistoryStore(f)
  const upload = f.objects.upload
  let reached, release
  const reachedUpload = new Promise(resolve => { reached = resolve })
  const resume = new Promise(resolve => { release = resolve })
  f.objects.upload = async (...args) => { reached(); await resume; return upload(...args) }
  const saving = store.create(f.input)
  await reachedUpload
  await store.delete(f.input.manifest.id)
  release()
  await saving.catch(() => {})
  assert.equal(f.blobs.size, 0)
})
