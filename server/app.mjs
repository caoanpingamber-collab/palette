import express from 'express'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { z } from 'zod'
import { createAuth, rateLimit } from './auth.mjs'
import { readUpload } from './upload.mjs'
import { HttpError } from './errors.mjs'

const querySchema = z.object({
  q: z.string().max(255).default(''), kind: z.enum(['image', 'video']).optional(), status: z.enum(['passed', 'failed']).optional(),
  from: z.iso.datetime().optional(), to: z.iso.datetime().optional(), page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20),
})

export function createApp({ store, archiveEnabled = false, allowedOrigins = [], secureCookies = false, cookieName, cookiePath, localDevelopment = false, staticDir, uploadLimit = 60, maxUploads = 4 }) {
  const app = express()
  app.disable('x-powered-by')
  const auth = createAuth(store, { secureCookies, cookieName, cookiePath })
  let uploads = 0
  const reserveUpload = (req, res, next) => {
    if (uploads >= maxUploads) return next(new HttpError(429, '当前上传较多，请稍后重试保存'))
    uploads++
    let released = false
    const release = () => { if (!released) { uploads--; released = true } }
    res.once('finish', release)
    res.once('close', release)
    next()
  }
  app.use('/api', (req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; sandbox" })
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('Origin')
      const local = localDevelopment && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || '')
      if (!origin || (!allowedOrigins.includes(origin) && !local)) return next(new HttpError(403, '不允许此来源提交请求'))
    }
    next()
  })
  app.use('/api/admin', express.json({ limit: '4kb', inflate: false }))
  app.get('/api/health', (req, res) => res.json({ ready: true, archiveEnabled, storage: store.provider || 'local' }))
  app.post('/api/admin/login', rateLimit({ max: 10, windowMs: 15 * 60 * 1000 }), auth.login)
  app.get('/api/admin/session', auth.authenticate, auth.session)
  app.post('/api/admin/logout', auth.authenticate, auth.csrf, auth.logout)
  app.post('/api/history', (req, res, next) => archiveEnabled ? next() : next(new HttpError(503, '归档存储尚未配置，已停止本地保存')), rateLimit({ max: uploadLimit, windowMs: 60 * 60 * 1000 }), reserveUpload, async (req, res) => {
    const saved = await store.create(await readUpload(req))
    res.status(saved.created ? 201 : 200).json({ id: saved.id, saved: true })
  })
  app.use('/api/history', auth.authenticate)
  app.get('/api/history', async (req, res) => {
    const parsed = querySchema.safeParse(req.query)
    if (!parsed.success || (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to)) throw new HttpError(400, '筛选条件或日期范围无效')
    res.json(await store.list(parsed.data))
  })
  app.get('/api/history/:id', async (req, res) => res.json(await store.get(req.params.id)))
  app.get('/api/history/:id/files/:name', async (req, res, next) => {
    const asset = await store.asset(req.params.id, req.params.name)
    res.type(asset.type)
    if (req.params.name === 'original') {
      res.attachment(asset.fileName)
      if (asset.type === 'video/mp4' && req.query.download !== '1') res.set('Content-Disposition', 'inline')
    }
    if (asset.bytes) {
      res.set('Accept-Ranges', 'bytes')
      let start = 0, end = asset.bytes.length - 1
      const range = req.get('Range')
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range)
        if (!match || (!match[1] && !match[2])) return res.status(416).set('Content-Range', `bytes */${asset.bytes.length}`).end()
        start = match[1] ? Number(match[1]) : Math.max(0, asset.bytes.length - Number(match[2]))
        end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= asset.bytes.length) return res.status(416).set('Content-Range', `bytes */${asset.bytes.length}`).end()
        res.status(206).set('Content-Range', `bytes ${start}-${end}/${asset.bytes.length}`)
      }
      return res.set('Content-Length', String(end - start + 1)).send(asset.bytes.subarray(start, end + 1))
    }
    res.sendFile(asset.path, { cacheControl: false }, error => { if (error) next(error) })
  })
  app.delete('/api/history/:id', auth.csrf, async (req, res) => { await store.delete(req.params.id); res.status(204).end() })
  app.use('/api', (req, res, next) => next(new HttpError(404, '接口不存在')))
  if (staticDir && existsSync(path.join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir, { index: false }))
    app.get(['/', '/admin'], (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(staticDir, 'index.html')) })
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error)
    const status = error.status || 500
    if (status === 413) res.set('Connection', 'close')
    if (status >= 500 && !(error instanceof HttpError)) console.error('History request failed:', error.code || error.name)
    res.status(status).json({ error: error instanceof HttpError ? error.message : status === 413 ? '请求内容超过大小上限' : status === 400 ? '请求内容格式错误' : '历史服务暂时不可用，请稍后重试' })
  })
  return app
}
