import { scrypt as scryptCallback, randomBytes, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { parse, serialize } from 'cookie'
import { digest } from './digest.mjs'
import { HttpError } from './errors.mjs'

const scrypt = promisify(scryptCallback)
const scryptOptions = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const same = (a, b) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw new Error('管理员密码需为 12 到 256 个字符')
  const salt = randomBytes(16).toString('hex')
  const hash = await scrypt(password, salt, 64, scryptOptions)
  return `scrypt:${salt}:${hash.toString('hex')}`
}

async function verifyPassword(password, stored) {
  const [algorithm, salt, hash] = stored.split(':')
  if (algorithm !== 'scrypt' || !salt || !hash) return false
  return same((await scrypt(password, salt, 64, scryptOptions)).toString('hex'), hash)
}

export function rateLimit({ max, windowMs }) {
  const buckets = new Map()
  return (req, res, next) => {
    const now = Date.now()
    for (const [key, bucket] of buckets) if (bucket.until <= now) buckets.delete(key)
    const key = req.ip
    let bucket = buckets.get(key)
    if (!bucket) {
      if (buckets.size >= 2048) return next(new HttpError(429, '请求过多，请稍后再试'))
      bucket = { count: 0, until: now + windowMs }; buckets.set(key, bucket)
    }
    if (++bucket.count > max) { res.set('Retry-After', String(Math.ceil((bucket.until - now) / 1000))); return next(new HttpError(429, '操作过于频繁，请稍后再试')) }
    next()
  }
}

export function createAuth(store, { secureCookies = false, sessionMs = 8 * 60 * 60 * 1000, cookieName = 'banner_admin', cookiePath = '/' } = {}) {
  const cookie = (value, maxAge) => serialize(cookieName, value, { httpOnly: true, sameSite: 'strict', secure: secureCookies, path: cookiePath, maxAge })
  const authenticate = async (req, res, next) => {
    const token = parse(req.headers.cookie || '')[cookieName]
    const session = token && /^[a-f0-9]{64}$/.test(token) ? await store.getSession(digest(token)) : null
    if (!session) return next(new HttpError(401, '请登录管理员账号'))
    req.adminSession = session
    next()
  }
  const csrf = (req, res, next) => {
    if (!same(req.get('X-CSRF-Token') || '', req.adminSession.csrf)) return next(new HttpError(403, '安全校验失败，请刷新后重试'))
    next()
  }
  const login = async (req, res) => {
    const { username, password } = req.body || {}
    if (typeof username !== 'string' || typeof password !== 'string' || username.length > 100 || password.length > 256) throw new HttpError(400, '请输入有效的管理员账号和密码')
    const admin = await store.getAdmin()
    if (!admin) throw new HttpError(503, '尚未设置管理员，请在本机运行 npm run admin:create')
    // Always hash the supplied password, including for an unknown username.
    const valid = await verifyPassword(password, admin.password_hash)
    if (!valid || !same(username, admin.username)) throw new HttpError(401, '账号或密码不正确')
    const previous = parse(req.headers.cookie || '')[cookieName]
    if (previous) await store.deleteSession(digest(previous))
    await store.pruneSessions()
    const token = randomBytes(32).toString('hex')
    const csrfToken = randomBytes(32).toString('hex')
    if (!await store.saveSession(digest(token), csrfToken, Date.now() + sessionMs, admin.password_hash)) throw new HttpError(401, '管理员密码已变更，请重新登录')
    res.set('Set-Cookie', cookie(token, Math.floor(sessionMs / 1000))).json({ username: admin.username, csrfToken })
  }
  const session = async (req, res) => res.json({ username: (await store.getAdmin()).username, csrfToken: req.adminSession.csrf })
  const logout = async (req, res) => {
    await store.deleteSession(req.adminSession.token_hash)
    res.set('Set-Cookie', cookie('', 0)).status(204).end()
  }
  return { authenticate, csrf, login, session, logout }
}
