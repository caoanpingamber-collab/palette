import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createApp } from '../server/app.mjs'
import { HistoryStore } from '../server/store.mjs'
import { evaluateBottom } from '../src/lib/bottomRules.mjs'
import { snapshotResult } from '../src/lib/history.mjs'
import { bottomGif } from './bottom-fixtures.mjs'
import { GifWriter } from 'omggif'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1WQAAAAASUVORK5CYII=', 'base64')
function manifest({ animated = false, bytes = 400000, width = 1, height = 1 } = {}) {
  const first = { width, height, ...evaluateBottom({ width, height, bytes, ocr: null, visual: null }) }
  return snapshotResult({ inspectionType: 'bottom', kind: 'image', fileName: animated ? 'sample.gif' : 'sample.png', animated, animationFrameCount: animated ? 2 : 1, frame: first, frames: { first, ...(animated ? { last: structuredClone(first) } : {}) }, overallStatus: first.overallStatus, overallPass: first.overallPass, recommendation: first.recommendation, prompt: first.prompt })
}
function form(data, original, mime = 'image/png') {
  const body = new FormData(); body.append('manifest', JSON.stringify(data))
  body.append('original', new Blob([original], { type: mime }), data.fileName)
  for (const key of ['first', ...(data.animated ? ['last'] : []), 'thumbnail']) body.append(key, new Blob([png], { type: 'image/png' }), `${key}.png`)
  return body
}
async function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'bottom-upload-'))
  const store = new HistoryStore({ dir })
  const server = createApp({ store, archiveEnabled: true, allowedOrigins: ['http://localhost:5190'] }).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(async () => { server.closeIdleConnections(); await new Promise(resolve => server.close(resolve)); store.close(); rmSync(dir, { recursive: true, force: true }) })
  const request = (route, init = {}) => fetch(`http://127.0.0.1:${server.address().port}${route}`, { ...init, headers: { Origin: 'http://localhost:5190', ...init.headers } })
  return { store, request }
}

test('Bottom upload advertises v2 and accepts its 400KB image without broadening Header storage rules', async t => {
  const { store, request } = await fixture(t)
  assert.deepEqual((await (await request('/api/health')).json()).snapshotVersions, [1, 2])
  const original = Buffer.alloc(400000); png.copy(original)
  const data = manifest()
  const response = await request('/api/history', { method: 'POST', body: form(data, original) })
  assert.equal(response.status, 201)
  assert.equal(store.get(data.id).snapshot.inspectionType, 'bottom')
  assert.deepEqual(store.file(data.id, 'original').bytes, original)
  assert.equal((await request(`/api/history/${data.id}/files/original`)).status, 401)
})

test('Bottom rejects an original larger than 500000 bytes before saving any record', async t => {
  const { store, request } = await fixture(t)
  const original = Buffer.alloc(500001); png.copy(original)
  assert.equal((await request('/api/history', { method: 'POST', body: form(manifest({ bytes: 500001 }), original) })).status, 413)
  assert.equal(store.stats().count, 0)
})

test('GIF originals, two analysis frames and private bytes survive the v2 archive', async t => {
  const { store, request } = await fixture(t)
  const original = bottomGif(), data = manifest({ animated: true, width: 1071, height: 180, bytes: original.length })
  assert.equal((await request('/api/history', { method: 'POST', body: form(data, original, 'image/gif') })).status, 201)
  assert.deepEqual(store.file(data.id, 'original').bytes, original)
  assert.equal(store.get(data.id).snapshot.animationFrameCount, 2)
  assert.equal(store.asset(data.id, 'last').type, 'image/png')
})

test('GIF cannot be disguised as a static snapshot or replaced with PNG animation bytes', async t => {
  const { store, request } = await fixture(t)
  assert.equal((await request('/api/history', { method: 'POST', body: form(manifest({ width: 1071, height: 180 }), bottomGif(), 'image/gif') })).status, 400)
  assert.equal((await request('/api/history', { method: 'POST', body: form(manifest({ animated: true }), png) })).status, 400)
  assert.equal(store.stats().count, 0)
})

test('GIF patch metadata cannot exceed the declared logical canvas', async t => {
  const { store, request } = await fixture(t)
  const buffer = new Uint8Array(1000), writer = new GifWriter(buffer, 1071, 180, { palette: [0x621fb7, 0x22dddd] })
  writer.addFrame(0, 0, 1, 1, new Uint8Array([1]))
  const bytes = Buffer.from(buffer.slice(0, writer.end()))
  const separator = 13 + 6
  assert.equal(bytes[separator], 0x2c)
  bytes.writeUInt16LE(65535, separator + 5); bytes.writeUInt16LE(65535, separator + 7)
  const data = manifest({ width: 1071, height: 180, bytes: bytes.length })
  assert.equal((await request('/api/history', { method: 'POST', body: form(data, bytes, 'image/gif') })).status, 400)
  assert.equal(store.stats().count, 0)
})
