import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { HistoryStore } from '../server/store.mjs'

test('a populated unowned directory is rejected before any cleanup or database creation', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'banner-unowned-'))
  const keep = path.join(dir, 'important-file.txt')
  writeFileSync(keep, 'not owned by the history service')
  try {
    assert.throws(() => new HistoryStore({ dir }), /不为空|owned/)
    assert.equal(existsSync(keep), true)
    assert.equal(existsSync(path.join(dir, 'history.sqlite')), false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('startup recovery waits for an in-progress archive commit before removing orphan files', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'banner-recovery-lock-'))
  const store = new HistoryStore({ dir })
  const id = '00000000-0000-4000-8000-000000000001'
  const assetDir = path.join(dir, 'assets', id)
  let worker
  try {
    store.db.exec('BEGIN IMMEDIATE')
    mkdirSync(assetDir)
    writeFileSync(path.join(assetDir, 'original'), 'in-progress original')
    store.db.prepare('INSERT INTO records(id,fingerprint,file_name,kind,passed,inspected_at,created_at,total_bytes,snapshot) VALUES(?,?,?,?,?,?,?,?,?)').run(id, 'hash', 'image.png', 'image', 1, '2026-10-29T00:00:00.000Z', '2026-10-29T00:00:00.000Z', 20, '{}')
    worker = new Worker(`const {parentPort,workerData}=require('node:worker_threads');import(workerData.module).then(({HistoryStore})=>{parentPort.postMessage('starting');const other=new HistoryStore({dir:workerData.dir});other.close();parentPort.postMessage('opened')}).catch(error=>{throw error})`, { eval: true, workerData: { dir, module: new URL('../server/store.mjs', import.meta.url).href } })
    const opened = new Promise((resolve, reject) => { worker.on('message', message => { if (message === 'opened') resolve(message) }); worker.once('error', reject) })
    await new Promise((resolve, reject) => { worker.on('message', message => { if (message === 'starting') resolve() }); worker.once('error', reject) })
    assert.equal(await Promise.race([opened, new Promise(resolve => setTimeout(() => resolve('waiting'), 250))]), 'waiting')
    assert.equal(existsSync(path.join(assetDir, 'original')), true)
    store.db.exec('COMMIT')
    await opened
    assert.equal(existsSync(path.join(assetDir, 'original')), true)
  } finally {
    if (store.db.isTransaction) store.db.exec('ROLLBACK')
    if (worker) await worker.terminate()
    store.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
