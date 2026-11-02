import express from 'express'
import { parse } from 'cookie'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export function cloudTarget(value) {
  const url = new URL(value)
  if (!['https://bytedance.feishu.link', 'https://bytedance.aiforce.cloud'].includes(url.origin) || !/^\/app\/app_[a-z0-9]+\/?$/.test(url.pathname) || url.search || url.hash || url.username || url.password) throw new Error('Cloud history requires an approved HTTPS Miaoda application URL')
  url.pathname = url.pathname.replace(/\/$/, '')
  return url
}

export function createRemoteApp({ remoteUrl, archiveEnabled = false, allowedOrigins, fetchImpl = fetch }) {
  const target = cloudTarget(remoteUrl)
  const origins = new Set(allowedOrigins?.length ? allowedOrigins : ['http://127.0.0.1:5190', 'http://localhost:5190'])
  const cookieName = `banner_admin_${target.pathname.split('/').at(-1)}`
  const app = express()
  app.disable('x-powered-by')
  app.use('/api', async (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    const incoming = new URL(req.originalUrl, 'http://localhost')
    if (!/^\/api\/(health|admin\/(login|logout|session)|history(\/[\da-f-]{36}(\/files\/(original|first|last|thumbnail))?)?)$/.test(incoming.pathname)) return res.status(404).json({ error: '接口不存在' })
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !origins.has(req.get('Origin'))) return res.status(403).json({ error: '不允许此来源提交请求' })
    if (!archiveEnabled && incoming.pathname === '/api/health') return res.json({ ready: true, archiveEnabled: false, storage: 'miaoda' })
    if (!archiveEnabled && req.method === 'POST' && incoming.pathname === '/api/history') return res.status(503).json({ error: '归档已暂停' })
    if (Number(req.get('Content-Length') || 0) > 9 * 1024 * 1024) return res.status(413).json({ error: '归档请求超过大小上限' })
    const headers = new Headers({ Origin: target.origin })
    for (const name of ['content-type', 'content-length', 'range', 'if-range', 'x-csrf-token']) if (req.get(name)) headers.set(name, req.get(name))
    const token = parse(req.get('Cookie') || '')[cookieName]
    if (/^[a-f0-9]{64}$/.test(token || '')) headers.set('Cookie', `${cookieName}=${token}`)
    try {
      const response = await fetchImpl(`${target.origin}${target.pathname}${incoming.pathname}${incoming.search}`, {
        method: req.method, headers, redirect: 'manual', signal: AbortSignal.timeout(45000),
        ...(!['GET', 'HEAD'].includes(req.method) ? { body: req, duplex: 'half' } : {}),
      })
      if (response.status >= 300 && response.status < 400) return res.status(503).json({ error: '云端后端发生授权重定向，请检查发布状态；未保存到本地' })
      res.status(response.status)
      for (const name of ['content-type', 'content-disposition', 'content-range', 'accept-ranges', 'content-security-policy', 'referrer-policy']) if (response.headers.has(name)) res.set(name, response.headers.get(name))
      const cookies = response.headers.getSetCookie().filter(value => value.startsWith(`${cookieName}=`)).map(value => value.replace(/;\s*Secure\b/ig, '').replace(/;\s*Domain=[^;]*/ig, '').replace(/;\s*Path=[^;]*/ig, '; Path=/'))
      if (cookies.length) res.set('Set-Cookie', cookies)
      if (!response.body || req.method === 'HEAD') return res.end()
      await pipeline(Readable.fromWeb(response.body), res)
    } catch {
      if (res.headersSent) return res.destroy()
      res.status(503).json({ error: '云端历史服务连接失败，未回落到本地保存' })
    }
  })
  return app
}
