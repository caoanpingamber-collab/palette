import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'
import { HistoryStore } from '../server/store.mjs'
import { createApp } from '../server/app.mjs'
import { hashPassword } from '../server/auth.mjs'
import { renderAdminPage } from '../server/admin-page.mjs'

const dir = mkdtempSync(path.join(tmpdir(), 'banner-history-browser-'))
const store = new HistoryStore({ dir })
store.setAdmin('test-admin', await hashPassword('browser-test-password-123'))
const server = createApp({ store, archiveEnabled: true, localDevelopment: true }).listen(5195, '127.0.0.1')
const isolated = createApp({ store, archiveEnabled: true, sessionTransport: 'bearer', allowedOrigins: ['null'] })
const bundle = JSON.parse(readFileSync('.admin-dist/admin-bundle.json', 'utf8'))
const admin = renderAdminPage({ ...bundle, apiBase: 'https://bytedance.feishu.link/app/app_synthetic', homeUrl: 'https://bytedance.feishu.link/app/app_syntheticfront' })
isolated.get(['/isolated-admin', '/unsafe-admin'], (req, res) => {
  const headers = { ...admin.headers }
  if (req.path === '/unsafe-admin') delete headers['Content-Security-Policy']
  let html = admin.html
  if (req.query.inject) html = html.replace('</body>', '<script>window.__injected=1</script></body>')
  if (req.query.tamper) html = html.replace('</script>', ';window.__tampered=1;</script>')
  res.set(headers).type('html').send(html)
})
isolated.get('/sibling', (req, res) => res.type('html').send('<!doctype html><title>Synthetic sibling</title>'))
isolated.get('/sibling/worker.js', (req, res) => res.type('application/javascript').send('self.addEventListener("fetch",()=>{});'))
const isolatedServer = isolated.listen(5196, '127.0.0.1')
const vite = await createServer({ envDir: dir, server: { host: '127.0.0.1', port: 5194, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:5195', changeOrigin: false } } } })
await vite.listen()
process.once('SIGTERM', async () => { await vite.close(); await new Promise(resolve => isolatedServer.close(resolve)); server.close(() => { store.close(); rmSync(dir, { recursive: true, force: true }); process.exit(0) }); server.closeIdleConnections() })
