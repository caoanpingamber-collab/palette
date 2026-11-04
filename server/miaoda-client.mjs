import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { HttpClient } from '@lark-apaas/http-client'
import { FileService } from '@lark-apaas/file-service'
import { HttpError } from './errors.mjs'
import { removeArchivePrefix } from './private-objects.mjs'

export class MiaodaSql {
  constructor({ appId, env = 'dev', executable = 'lark-cli' }) {
    if (!/^app_[a-z0-9]+$/.test(appId) || !['dev', 'online'].includes(env)) throw new Error('Invalid Miaoda resource')
    this.appId = appId; this.env = env; this.executable = executable
  }
  query(sql) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, ['apps', '+db-execute', '--app-id', this.appId, '--env', this.env, '--as', 'user', '--sql', '-', '--yes', '--json'], { stdio: ['pipe', 'pipe', 'pipe'] })
      const fail = () => reject(new HttpError(503, '妙搭数据库连接失败，请检查服务端授权；未回落到本地保存'))
      const chunks = []
      let bytes = 0
      const timeout = setTimeout(() => { child.kill('SIGTERM'); fail() }, 25000)
      child.stdout.on('data', chunk => {
        bytes += chunk.length
        if (bytes > 16 * 1024 * 1024) { child.kill('SIGTERM'); fail() }
        else chunks.push(chunk)
      })
      child.stderr.resume()
      child.on('error', () => { clearTimeout(timeout); fail() })
      child.stdin.on('error', () => {})
      child.once('close', code => {
        clearTimeout(timeout)
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString())
          if (code !== 0 || !result.ok || result.data?.results?.some(item => item.sql_type === 'ERROR')) return fail()
          const statements = result.data.results
          const selected = statements.filter(item => item.sql_type === 'SELECT').at(-1)
          const returned = selected || statements.filter(item => item.data && item.data !== '[]').at(-1)
          const rows = returned ? (typeof returned.data === 'string' ? JSON.parse(returned.data) : returned.data) : []
          resolve(Array.isArray(rows) ? rows.filter(row => !('rowCount' in row)) : [])
        } catch { fail() }
      })
      child.stdin.end(sql)
    })
  }
}

export async function miaodaObjects({ appId, envFile }) {
  // Load only platform credentials, never database URLs or frontend variables.
  const { parseEnv } = await import('node:util')
  const currentFiles = () => {
    const vars = parseEnv(readFileSync(envFile, 'utf8'))
    if (vars.MIAODA_APP_ID !== appId || !vars.FORCE_AUTHN_TOKEN || !vars.FORCE_AUTHN_INNERAPI_DOMAIN) throw new Error('Miaoda private credentials are missing or belong to a different app')
    return new FileService(new HttpClient({ timeout: 20000, platform: {
      enabled: true, baseURL: vars.FORCE_AUTHN_INNERAPI_DOMAIN,
      accessKey: vars.FORCE_AUTHN_ACCESS_KEY, token: vars.FORCE_AUTHN_TOKEN,
    } }))
  }
  const bucketId = await currentFiles().getDefaultBucket(appId)
  const available = meta => meta?.bucketID === bucketId && typeof meta.filePath === 'string' && meta.filePath.startsWith('banner-history/')
  return {
    async upload(key, file) {
      const meta = await currentFiles().upload({ appId, bucketId, fileBody: file.bytes, options: { filePath: key, fileName: key.split('/').at(-1), contentType: file.type } })
      return { filePath: meta.filePath, bucketID: meta.bucketID }
    },
    async download(meta) {
      if (!available(meta)) throw new HttpError(404, '素材不存在')
      const signed = await currentFiles().createSignedUrl({ appId, bucketId, filePath: meta.filePath, expiresIn: 60 })
      const response = await fetch(signed, { signal: AbortSignal.timeout(20000), redirect: 'error' })
      if (!response.ok) throw new HttpError(503, '云端素材读取失败，请稍后重试')
      const chunks = []; let size = 0
      for await (const chunk of response.body) {
        size += chunk.length
        if (size > meta.size || size > 4 * 1024 * 1024) throw new HttpError(503, '云端素材大小不匹配')
        chunks.push(chunk)
      }
      if (size !== meta.size) throw new HttpError(503, '云端素材不完整')
      return Buffer.concat(chunks)
    },
    async remove(values) {
      if (!values.length) return
      if (values.some(meta => !available(meta))) throw new Error('Refusing to delete an unrelated object')
      await currentFiles().remove({ appId, bucketId, filePaths: values.map(meta => meta.filePath) })
    },
    async removePrefix(prefix) {
      await removeArchivePrefix({
        remove: filePaths => currentFiles().remove({ appId, bucketId, filePaths }),
        getFileMetadata: filePath => currentFiles().getFileMetadata({ appId, bucketId, filePath }),
      }, prefix)
    },
  }
}
