import { createStore } from './create-store.mjs'
import { createApp } from './app.mjs'
import { configuration } from './config.mjs'
import { createRemoteApp } from './remote-app.mjs'

const config = configuration()
let store
try { if (config.storage !== 'miaoda-remote') store = await createStore(config) }
catch (error) {
  console.error('History storage unavailable; local fallback is disabled:', error.status ? error.message : error.name)
  process.exit(1)
}
const app = config.storage === 'miaoda-remote' ? createRemoteApp(config) : createApp({ ...config, store })
const server = app.listen(config.port, config.host, () => console.log(`History API: http://${config.host}:${server.address().port} (storage: ${config.storage})`))
server.requestTimeout = 30000
server.headersTimeout = 10000
server.maxConnections = 128
server.on('error', error => { console.error('History service failed:', error.code || error.message); store?.close(); process.exitCode = 1 })
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.close(() => { store?.close(); process.exit(0) }); server.closeIdleConnections() })
