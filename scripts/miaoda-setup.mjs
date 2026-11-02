import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { configuration } from '../server/config.mjs'
import { createStore } from '../server/create-store.mjs'

const config = configuration()
if (config.storage !== 'miaoda') throw new Error('Set HISTORY_STORAGE=miaoda first')
const store = await createStore(config)
const dbPath = path.join(config.dir, 'history.sqlite')
if (existsSync(dbPath)) {
  const local = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const count = local.prepare('SELECT count(*) AS count FROM records').get().count
    if (count) throw new Error('Local archives exist: explicit archive migration is required; nothing was erased or hidden')
    const admin = local.prepare('SELECT username,password_hash FROM admin WHERE id=1').get()
    const cloud = await store.getAdmin()
    if (admin && cloud && (admin.username !== cloud.username || admin.password_hash !== cloud.password_hash)) throw new Error('Cloud administrator already differs; refusing to replace credentials')
    if (admin && !cloud) await store.repository.importAdmin(admin.username, admin.password_hash)
  } finally { local.close() }
}
console.log(JSON.stringify({ storage: store.provider, administratorReady: Boolean(await store.getAdmin()), ...await store.stats() }))
store.close()
