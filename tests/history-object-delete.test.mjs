import test from 'node:test'
import assert from 'node:assert/strict'

const key = 'banner-history/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002/original'

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
