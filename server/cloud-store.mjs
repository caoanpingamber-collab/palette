import { randomUUID } from 'node:crypto'
import { digest } from './digest.mjs'
import { HttpError } from './errors.mjs'

export class CloudHistoryStore {
  provider = 'miaoda'
  constructor({ repository, objects, maxBytes = 1024 ** 3 }) {
    this.repository = repository
    this.objects = objects
    this.maxBytes = maxBytes
  }

  async create({ manifest, files }) {
    await this.recover()
    const snapshot = JSON.stringify(manifest)
    if (snapshot.includes('\\u0000')) throw new HttpError(400, '归档文本包含不支持的空字符')
    const fingerprint = digest(snapshot + [...files].sort(([a], [b]) => a.localeCompare(b)).map(([name, file]) => name + digest(file.bytes)).join(''))
    const lease = randomUUID()
    const bytes = Buffer.byteLength(snapshot) + [...files.values()].reduce((sum, file) => sum + file.bytes.length, 0)
    const row = await this.repository.reserve({ id: manifest.id, fingerprint, lease, bytes, manifest, maxBytes: this.maxBytes })
    if (row?.deleted) throw new HttpError(410, '此提交已被管理员删除，不能通过重试恢复')
    if (row?.limited) throw new HttpError(429, '云端本小时归档次数已达上限，检测与导出仍可使用')
    if (!row) throw new HttpError(507, '云端归档容量已满，本次检测仍可正常查看和导出')
    if (row.fingerprint !== fingerprint) throw new HttpError(409, '此提交编号已被使用，请重新检测')
    if (row.state === 'ready') return { id: manifest.id, created: false }
    if (row.state !== 'pending' || row.lease !== lease) throw new HttpError(409, '此提交正在保存，请稍后重试')
    const assets = {}
    try {
      for (const [name, file] of files) {
        const meta = await this.objects.upload(`banner-history/${manifest.id}/${lease}/${name}`, file)
        assets[name] = { ...meta, type: file.type, size: file.bytes.length }
      }
      if (!await this.repository.finalize(manifest.id, lease, assets)) throw new HttpError(410, '此提交在保存过程中已被删除')
      return { id: manifest.id, created: true }
    } catch (error) {
      // Fence a still-running finalization before removing any object.
      const cancelled = await this.repository.cancel(manifest.id, lease)
      if (cancelled) {
        await this.objects.removePrefix(`banner-history/${manifest.id}/${lease}/`)
        if (Object.keys(assets).length === files.size) await this.repository.finishDelete(manifest.id, lease)
      } else {
        const current = await this.repository.raw(manifest.id)
        if (current?.state === 'ready' && current.fingerprint === fingerprint) return { id: manifest.id, created: true }
      }
      throw error
    }
  }

  async get(id) {
    const row = await this.repository.raw(id)
    if (!row || row.state !== 'ready') throw new HttpError(404, '记录不存在或已删除')
    return { id, createdAt: row.createdAt, bytes: row.bytes, snapshot: row.manifest }
  }

  async asset(id, name) {
    const row = await this.repository.raw(id)
    if (!row || row.state !== 'ready') throw new HttpError(404, '记录不存在或已删除')
    const asset = row.assets[name]
    if (!asset) throw new HttpError(404, '素材不存在')
    return { bytes: await this.objects.download(asset), type: asset.type, size: asset.size, fileName: row.manifest.fileName }
  }
  file(id, name) { return this.asset(id, name) }

  async delete(id) {
    const row = await this.repository.markDeleting(id)
    if (!row) return
    await this.objects.remove(Object.values(row.assets))
    // A pending writer can still finish an object upload after this response.
    if (!Object.keys(row.assets).length) return
    await this.repository.finishDelete(id, row.lease)
  }

  async recover() {
    if (!this.repository.unfinished || Date.now() - (this.lastRecovery || 0) < 300000) return
    this.lastRecovery = Date.now()
    for (const row of await this.repository.unfinished()) {
      if (row.state === 'deleting' || await this.repository.claimExpired(row.id, row.lease)) {
        await this.objects.removePrefix(`banner-history/${row.id}/${row.lease}/`)
        await this.repository.finishDelete(row.id, row.lease)
      }
    }
  }

  async stats() { return { ...await this.repository.stats(), maxBytes: this.maxBytes } }
  async list(params) {
    const { rows, total } = await this.repository.list(params)
    return {
      records: rows.map(row => ({
        id: row.id, fileName: row.manifest.fileName, kind: row.manifest.kind,
        overallPass: row.manifest.result.overallPass, inspectedAt: row.manifest.inspectedAt,
        createdAt: row.createdAt, bytes: row.bytes,
        issues: [...new Set(Object.values(row.manifest.result.frames).flatMap(frame => frame.uiChecks.filter(check => !check.status).map(check => check.issue)))],
        thumbnailUrl: `/api/history/${row.id}/files/thumbnail`,
      })), total, page: params.page, pageSize: params.pageSize, stats: await this.stats(),
    }
  }

  getAdmin() { return this.repository.getAdmin() }
  setAdmin(username, hash) { return this.repository.setAdmin(username, hash) }
  getSession(hash) { return this.repository.getSession(hash) }
  saveSession(hash, csrf, expires, expectedHash) { return this.repository.saveSession(hash, csrf, expires, expectedHash) }
  deleteSession(hash) { return this.repository.deleteSession(hash) }
  pruneSessions() { return this.repository.pruneSessions() }
  close() {}
}
