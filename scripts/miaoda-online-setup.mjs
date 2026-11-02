import { configuration } from '../server/config.mjs'
import { MiaodaSql } from '../server/miaoda-client.mjs'
import { MiaodaRepository } from '../server/miaoda-repository.mjs'

if (process.env.SETUP_MIAODA_ONLINE !== '1') throw new Error('Explicit SETUP_MIAODA_ONLINE=1 is required')
const { miaoda } = configuration()
const dev = new MiaodaRepository(new MiaodaSql({ ...miaoda, env: 'dev' }))
const online = new MiaodaRepository(new MiaodaSql({ ...miaoda, env: 'online' }))
// Production DDL is intentionally forbidden; the platform release migrates schema.
await online.stats()
const source = await dev.getAdmin(), target = await online.getAdmin()
if (!source) throw new Error('No approved administrator to migrate')
if (target && (target.username !== source.username || target.password_hash !== source.password_hash)) throw new Error('Refusing to overwrite a different online administrator')
if (!target) await online.importAdmin(source.username, source.password_hash)
console.log(JSON.stringify({ onlineSchemaReady: true, administratorReady: true, ...await online.stats() }))
