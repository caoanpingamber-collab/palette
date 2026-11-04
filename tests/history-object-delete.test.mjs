import test from 'node:test'
import assert from 'node:assert/strict'

const key = 'banner-history/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002/original'
const prefix = key.slice(0, -'original'.length)
const members = ['original', 'first', 'last', 'thumbnail'].map(name => prefix + name)

test('private deletion accepts only confirmed absence after a lost provider response', async () => {
  const { removeVerified } = await import('../server/private-objects.mjs')
  const remaining = new Set([key])
  await removeVerified({ remove: async paths => { for (const path of paths) remaining.delete(path); throw new Error('synthetic response lost') }, getFileMetadata: async path => remaining.has(path) ? { filePath: path } : null }, [key])
  assert.equal(remaining.size, 0)
})

test('private deletion never hides a failed removal or an unconfirmed metadata probe', async () => {
  const { removeVerified } = await import('../server/private-objects.mjs')
  const failed = new Error('synthetic removal failed')
  for (const probe of [async () => ({ filePath: key }), async () => undefined, async () => { throw new Error('synthetic probe unavailable') }]) await assert.rejects(removeVerified({ remove: async () => { throw failed }, getFileMetadata: probe }, [key]))
  let calls = 0
  await assert.rejects(removeVerified({ remove: async () => { calls++ }, getFileMetadata: async () => null }, ['unrelated/file']))
  assert.equal(calls, 0)
})

test('archive recovery deletes exactly four owned members without consulting an unscoped listing', async () => {
  const { removeArchivePrefix } = await import('../server/private-objects.mjs')
  const unrelated = key.replace('000000000001', '000000000003')
  const remaining = new Set([...members, unrelated, prefix + 'unknown'])
  const calls = []
  let listings = 0
  await removeArchivePrefix({
    list: async () => { listings++; return { attachments: [{ filePath: unrelated }], hasMore: false } },
    remove: async paths => { calls.push(paths); for (const path of paths) remaining.delete(path) },
    getFileMetadata: async path => remaining.has(path) ? { filePath: path } : null,
  }, prefix)
  assert.equal(listings, 0)
  assert.deepEqual(calls, members.map(path => [path]))
  assert.deepEqual([...remaining], [unrelated, prefix + 'unknown'])
})

test('archive cleanup rejects invalid prefixes before any storage operation', async () => {
  const { removeArchivePrefix } = await import('../server/private-objects.mjs')
  const invalid = [null, undefined, {}, '', 'banner-history/', prefix.slice(0, -1), prefix + '../', prefix + 'original',
    prefix.replace('banner-history/', ''), prefix.replace('00000000-0000', '000000000000-'),
    prefix.replace('000000000001', '00000000000G'), prefix.replace('000000000001', '00000000000A'),
    prefix.replace('000000000001', '------------'), prefix + '\n']
  let calls = 0
  const client = { remove: async () => { calls++ }, getFileMetadata: async () => { calls++; return null }, list: async () => { calls++ } }
  for (const value of invalid) await assert.rejects(removeArchivePrefix(client, value), /prefix/)
  assert.equal(calls, 0)
})

test('archive cleanup verifies each absent member after a failed remove response', async () => {
  const { removeArchivePrefix } = await import('../server/private-objects.mjs')
  const removed = [], probed = []
  await removeArchivePrefix({
    remove: async paths => { removed.push(...paths); throw new Error('missing or response lost') },
    getFileMetadata: async path => { probed.push(path); return null },
  }, prefix)
  assert.deepEqual(removed, members)
  assert.deepEqual(probed, members)
})

test('archive cleanup stops on failed removal unless exact metadata confirms null', async () => {
  const { removeArchivePrefix } = await import('../server/private-objects.mjs')
  for (const probe of [async () => ({ filePath: key }), async () => undefined, async () => false, async () => { throw new Error('probe unavailable') }]) {
    const calls = []
    await assert.rejects(removeArchivePrefix({
      remove: async paths => { calls.push(...paths); throw new Error('remove failed') },
      getFileMetadata: probe,
    }, prefix))
    assert.deepEqual(calls, [key])
  }
})

test('recovery finishes only the pre-marked deletion and preserves an unrelated ready record', async () => {
  const { removeArchivePrefix } = await import('../server/private-objects.mjs')
  const { CloudHistoryStore } = await import('../server/cloud-store.mjs')
  const [id, lease] = prefix.split('/').slice(1, 3)
  const ready = { id: '00000000-0000-0000-0000-000000000003', state: 'ready' }
  const rows = new Map([[id, { id, lease, state: 'deleting', assets: {} }], [ready.id, ready]])
  const unrelated = key.replace(id, ready.id)
  const remaining = new Set([unrelated])
  const client = {
    list: async () => ({ attachments: [{ filePath: unrelated }], hasMore: false }),
    remove: async paths => { for (const path of paths) remaining.delete(path); throw new Error('absent member') },
    getFileMetadata: async path => remaining.has(path) ? { filePath: path } : null,
  }
  const repository = {
    unfinished: async () => [rows.get(id)],
    finishDelete: async (recordId, recordLease) => { assert.equal(recordId, id); assert.equal(recordLease, lease); rows.delete(recordId) },
  }
  await new CloudHistoryStore({ repository, objects: { removePrefix: value => removeArchivePrefix(client, value) } }).recover()
  assert.deepEqual([...rows.values()], [ready])
  assert.deepEqual([...remaining], [unrelated])
})

test('recovery does not finish a deletion when object absence is unconfirmed', async () => {
  const { removeArchivePrefix } = await import('../server/private-objects.mjs')
  const { CloudHistoryStore } = await import('../server/cloud-store.mjs')
  const [id, lease] = prefix.split('/').slice(1, 3)
  let finished = 0
  const repository = { unfinished: async () => [{ id, lease, state: 'deleting' }], finishDelete: async () => { finished++ } }
  const client = { remove: async () => { throw new Error('remove failed') }, getFileMetadata: async () => ({ filePath: key }) }
  await assert.rejects(new CloudHistoryStore({ repository, objects: { removePrefix: value => removeArchivePrefix(client, value) } }).recover(), /remove failed/)
  assert.equal(finished, 0)
})
