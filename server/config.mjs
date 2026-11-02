import { existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envFile = path.join(root, '.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

function canonicalPath(target) {
  const missing = []
  let current = target
  while (!existsSync(current)) { missing.unshift(path.basename(current)); current = path.dirname(current) }
  return path.join(realpathSync(current), ...missing)
}

export function configuration() {
  const production = process.env.NODE_ENV === 'production'
  const allowedOrigins = (process.env.HISTORY_ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)
  if (production && !allowedOrigins.length) throw new Error('Production requires HISTORY_ALLOWED_ORIGINS with the exact HTTPS site origin')
  for (const origin of allowedOrigins) {
    const url = new URL(origin)
    if (url.origin !== origin || (production && url.protocol !== 'https:')) throw new Error('HISTORY_ALLOWED_ORIGINS must contain exact site origins; production requires HTTPS')
  }
  const dir = canonicalPath(path.resolve(root, process.env.HISTORY_DATA_DIR || '.history-data'))
  const relative = path.relative(realpathSync(root), dir)
  if (relative !== '.history-data' && !relative.startsWith(`.history-data${path.sep}`) && relative !== '..' && !relative.startsWith(`..${path.sep}`)) throw new Error('私有数据目录必须为 .history-data 或项目外的 private 目录，不能放入可公开访问的项目目录')
  if (relative === '..') throw new Error('请为私有数据指定专用 private 子目录，不能直接使用项目父目录')
  const storage = process.env.HISTORY_STORAGE || 'local'
  if (!['local', 'miaoda', 'miaoda-remote'].includes(storage)) throw new Error('HISTORY_STORAGE must be local, miaoda or miaoda-remote')
  if (storage !== 'local' && production) throw new Error('Miaoda development connectors cannot be used as a production hosting backend')
  if (storage === 'miaoda-remote' && !['127.0.0.1', 'localhost'].includes(process.env.HISTORY_HOST || '127.0.0.1')) throw new Error('The HTTP development cloud proxy must bind to loopback only')
  const maxBytes = Number(process.env.HISTORY_MAX_BYTES || 1024 ** 3)
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('HISTORY_MAX_BYTES must be a positive integer')
  return {
    dir,
    storage,
    remoteUrl: process.env.HISTORY_REMOTE_URL || '',
    miaoda: { appId: process.env.HISTORY_MIAODA_APP_ID || '', env: process.env.HISTORY_MIAODA_ENV || 'dev', envFile: path.join(dir, 'miaoda-runtime', '.env.local') },
    archiveEnabled: process.env.HISTORY_ARCHIVE_ENABLED === 'true',
    maxBytes,
    port: Number(process.env.HISTORY_PORT || 5192), host: process.env.HISTORY_HOST || '127.0.0.1',
    allowedOrigins, secureCookies: production, localDevelopment: !production,
    staticDir: production ? path.join(root, 'dist') : undefined,
  }
}
