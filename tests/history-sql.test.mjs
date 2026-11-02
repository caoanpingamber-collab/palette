import test from 'node:test'
import assert from 'node:assert/strict'
import { MiaodaRepository } from '../server/miaoda-repository.mjs'

test('runtime quota lock projects boolean rather than an unsupported void column', async () => {
  let statements
  const repository = new MiaodaRepository({ batch: async values => { statements = values; return [] } })
  await repository.reserve({ id: 'test-id', fingerprint: 'test-hash', lease: 'test-lease', bytes: 1, manifest: {}, maxBytes: 1024 })
  assert.match(statements[0], /pg_advisory_xact_lock\(20261029,5192\) IS NULL AS locked/)
})
