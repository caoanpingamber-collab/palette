import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileService } from '@lark-apaas/file-service'
import { miaodaObjects } from '../server/miaoda-client.mjs'

const appId = 'app_synthetic', bucketId = 'synthetic-private'
const prefix = 'banner-history/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002/'
const members = ['original', 'first', 'last', 'thumbnail'].map(name => prefix + name)

async function fixture(t, { remove, metadata = async () => null }) {
  const directory = mkdtempSync(join(tmpdir(), 'banner-objects-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const envFile = join(directory, '.env')
  writeFileSync(envFile, `MIAODA_APP_ID=${appId}\nFORCE_AUTHN_TOKEN=synthetic-not-a-credential\nFORCE_AUTHN_INNERAPI_DOMAIN=https://example.invalid\n`)
  t.mock.method(FileService.prototype, 'getDefaultBucket', async value => { assert.equal(value, appId); return bucketId })
  let listings = 0
  t.mock.method(FileService.prototype, 'list', async () => {
    listings++
    return { attachments: [{ bucketID: bucketId, filePath: prefix.replace('000000000001', '000000000003') + 'original' }], hasMore: false }
  })
  t.mock.method(FileService.prototype, 'remove', remove)
  t.mock.method(FileService.prototype, 'getFileMetadata', metadata)
  return { objects: await miaodaObjects({ appId, envFile }), listings: () => listings }
}

test('operator cleanup uses bounded exact SDK paths and never deletes unrelated listed objects', async t => {
  const removed = [], probed = []
  const f = await fixture(t, {
    remove: async params => { removed.push(params); throw new Error('missing member') },
    metadata: async params => { probed.push(params); return null },
  })
  await f.objects.removePrefix(prefix)
  assert.equal(f.listings(), 0)
  assert.deepEqual(removed, members.map(filePath => ({ appId, bucketId, filePaths: [filePath] })))
  assert.deepEqual(probed, members.map(filePath => ({ appId, bucketId, filePath })))
})

test('operator cleanup fails closed when exact member deletion cannot be confirmed', async t => {
  const removed = []
  const f = await fixture(t, {
    remove: async params => { removed.push(params); throw new Error('remove unavailable') },
    metadata: async () => ({ bucketID: bucketId, filePath: members[0] }),
  })
  await assert.rejects(f.objects.removePrefix(prefix), /remove unavailable/)
  assert.deepEqual(removed, [{ appId, bucketId, filePaths: [members[0]] }])
  assert.equal(f.listings(), 0)
})

test('operator cleanup rejects malformed UUID prefixes without invoking the SDK', async t => {
  let calls = 0
  const f = await fixture(t, { remove: async () => { calls++ }, metadata: async () => { calls++; return null } })
  for (const value of ['banner-history/', prefix + '../', prefix.replace('00000000-0000', '000000000000-')]) {
    await assert.rejects(f.objects.removePrefix(value), /prefix/)
  }
  assert.equal(calls, 0)
  assert.equal(f.listings(), 0)
})
