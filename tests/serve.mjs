import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'
import { HistoryStore } from '../server/store.mjs'
import { createApp } from '../server/app.mjs'
import { hashPassword } from '../server/auth.mjs'

const dir = mkdtempSync(path.join(tmpdir(), 'banner-history-browser-'))
const store = new HistoryStore({ dir })
store.setAdmin('test-admin', await hashPassword('browser-test-password-123'))
const server = createApp({ store, archiveEnabled: true, localDevelopment: true }).listen(5195, '127.0.0.1')
const vite = await createServer({ server: { host: '127.0.0.1', port: 5194, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:5195', changeOrigin: false } } } })
await vite.listen()
process.once('SIGTERM', async () => { await vite.close(); server.close(() => { store.close(); rmSync(dir, { recursive: true, force: true }); process.exit(0) }); server.closeIdleConnections() })
