import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, writeFileSync, readFileSync, renameSync, rmSync, readdirSync, existsSync, chmodSync } from 'node:fs'
import path from 'node:path'
import { HttpError } from './errors.mjs'
import { digest } from './digest.mjs'

export { digest }
const idPattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

export class HistoryStore {
  constructor({ dir, maxBytes = 1024 ** 3 }) {
    this.dir = path.resolve(dir)
    this.maxBytes = maxBytes
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('HISTORY_MAX_BYTES must be a positive integer')
    mkdirSync(this.dir, { recursive: true, mode: 0o700 })
    const ownershipPath = path.join(this.dir, '.banner-history-owner')
    const ownership = 'banner-inspection-history:v1\n'
    if (existsSync(ownershipPath)) {
      if (readFileSync(ownershipPath, 'utf8') !== ownership) throw new Error('数据目录不属于此历史服务（not owned）')
    } else {
      if (readdirSync(this.dir).length) throw new Error('数据目录不为空且不属于此历史服务（not owned），请使用专用空目录')
      writeFileSync(ownershipPath, ownership, { flag: 'wx', mode: 0o600 })
    }
    for (const folder of ['assets', 'staging']) mkdirSync(path.join(this.dir, folder), { recursive: true, mode: 0o700 })
    const dbPath = path.join(this.dir, 'history.sqlite')
    if (!existsSync(dbPath)) writeFileSync(dbPath, '', { mode: 0o600 })
    chmodSync(dbPath, 0o600)
    this.db = new DatabaseSync(dbPath)
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, file_name TEXT NOT NULL, kind TEXT NOT NULL, passed INTEGER NOT NULL, inspected_at TEXT NOT NULL, created_at TEXT NOT NULL, total_bytes INTEGER NOT NULL, snapshot TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'ready');
      CREATE INDEX IF NOT EXISTS records_time ON records(created_at DESC);
      CREATE TABLE IF NOT EXISTS assets (record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE, name TEXT NOT NULL, media_type TEXT NOT NULL, size INTEGER NOT NULL, PRIMARY KEY(record_id,name));
      CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY CHECK(id=1), username TEXT NOT NULL, password_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS deleted_records (id TEXT PRIMARY KEY, deleted_at TEXT NOT NULL);
    `)
    this.recover()
  }

  recover() {
    // Account setup can open this database while the service commits an archive.
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const row of this.db.prepare("SELECT id FROM records WHERE state='deleting'").all()) this.delete(row.id, { withinTransaction: true })
      for (const folder of ['staging', 'assets']) {
        for (const name of readdirSync(path.join(this.dir, folder))) {
          if (idPattern.test(name) && (folder === 'staging' || !this.db.prepare('SELECT id FROM records WHERE id=?').get(name))) rmSync(path.join(this.dir, folder, name), { recursive: true, force: true })
        }
      }
      this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  setAdmin(username, passwordHash) {
    this.db.prepare('INSERT INTO admin(id,username,password_hash) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,password_hash=excluded.password_hash').run(username, passwordHash)
    this.db.prepare('DELETE FROM sessions').run()
  }

  getAdmin() { return this.db.prepare('SELECT * FROM admin WHERE id=1').get() }
  getSession(hash) { return this.db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?').get(hash, Date.now()) }
  deleteSession(hash) { this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash) }
  pruneSessions() { this.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now()) }
  saveSession(hash, csrf, expiresAt, expectedHash) {
    if (expectedHash !== undefined) return this.db.prepare('INSERT INTO sessions SELECT ?,?,? FROM admin WHERE id=1 AND password_hash=?').run(hash, csrf, expiresAt, expectedHash).changes === 1
    return this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash, csrf, expiresAt).changes === 1
  }

  stats() {
    const row = this.db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(total_bytes),0) AS bytes, COALESCE(SUM(passed),0) AS passed FROM records').get()
    return { ...row, maxBytes: this.maxBytes }
  }

  create({ manifest, files }) {
    const json = JSON.stringify(manifest)
    const fingerprint = digest(json + [...files].sort(([a], [b]) => a.localeCompare(b)).map(([name, file]) => name + digest(file.bytes)).join(''))
    const totalBytes = Buffer.byteLength(json) + [...files.values()].reduce((sum, file) => sum + file.bytes.length, 0)
    const staged = path.join(this.dir, 'staging', manifest.id)
    const destination = path.join(this.dir, 'assets', manifest.id)
    let moved = false
    this.db.exec('BEGIN IMMEDIATE')
    try {
      if (this.db.prepare('SELECT id FROM deleted_records WHERE id=?').get(manifest.id)) throw new HttpError(410, '此提交已被管理员删除，不能通过重试恢复')
      const existing = this.db.prepare('SELECT fingerprint,state FROM records WHERE id=?').get(manifest.id)
      if (existing) {
        if (existing.fingerprint !== fingerprint || existing.state !== 'ready') throw new HttpError(409, '此提交编号已被使用，请重新检测')
        this.db.exec('COMMIT')
        return { created: false, id: manifest.id }
      }
      if (this.stats().bytes + totalBytes > this.maxBytes) throw new HttpError(507, '历史存储已满，请联系管理员释放空间；本次检测仍可正常查看和导出')
      mkdirSync(staged, { mode: 0o700 })
      for (const [name, file] of files) writeFileSync(path.join(staged, name), file.bytes, { mode: 0o600, flag: 'wx' })
      this.db.prepare('INSERT INTO records(id,fingerprint,file_name,kind,passed,inspected_at,created_at,total_bytes,snapshot) VALUES(?,?,?,?,?,?,?,?,?)').run(manifest.id, fingerprint, manifest.fileName, manifest.kind, Number(manifest.result.overallPass), manifest.inspectedAt, new Date().toISOString(), totalBytes, json)
      for (const [name, file] of files) this.db.prepare('INSERT INTO assets VALUES(?,?,?,?)').run(manifest.id, name, file.type, file.bytes.length)
      renameSync(staged, destination)
      moved = true
      this.db.exec('COMMIT')
      return { created: true, id: manifest.id }
    } catch (error) {
      this.db.exec('ROLLBACK')
      rmSync(staged, { recursive: true, force: true })
      if (moved) rmSync(destination, { recursive: true, force: true })
      throw error
    }
  }

  list({ q = '', kind, status, from, to, page = 1, pageSize = 20 } = {}) {
    const where = ["state='ready'"]
    const params = []
    if (q) { where.push("file_name LIKE ? ESCAPE '\\'"); params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`) }
    if (kind) { where.push('kind=?'); params.push(kind) }
    if (status) { where.push('passed=?'); params.push(status === 'passed' ? 1 : 0) }
    if (from) { where.push('created_at>=?'); params.push(from) }
    if (to) { where.push('created_at<=?'); params.push(to) }
    const clause = where.join(' AND ')
    const total = this.db.prepare(`SELECT COUNT(*) AS total FROM records WHERE ${clause}`).get(...params).total
    const rows = this.db.prepare(`SELECT * FROM records WHERE ${clause} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize)
    const records = rows.map(row => {
      const snapshot = JSON.parse(row.snapshot)
      const issues = [...new Set(Object.values(snapshot.result.frames).flatMap(frame => frame.uiChecks.filter(check => !check.status).map(check => check.issue)))]
      return { id: row.id, fileName: row.file_name, kind: row.kind, overallPass: Boolean(row.passed), inspectedAt: row.inspected_at, createdAt: row.created_at, bytes: row.total_bytes, issues, thumbnailUrl: `/api/history/${row.id}/files/thumbnail` }
    })
    return { records, total, page, pageSize, stats: this.stats() }
  }

  get(id) {
    const row = this.db.prepare("SELECT * FROM records WHERE id=? AND state='ready'").get(id)
    if (!row) throw new HttpError(404, '记录不存在或已删除')
    return { id, createdAt: row.created_at, bytes: row.total_bytes, snapshot: JSON.parse(row.snapshot) }
  }

  asset(id, name) {
    const record = this.get(id)
    const asset = this.db.prepare('SELECT * FROM assets WHERE record_id=? AND name=?').get(id, name)
    if (!asset) throw new HttpError(404, '素材不存在')
    return { path: path.join(this.dir, 'assets', id, name), type: asset.media_type, size: asset.size, fileName: record.snapshot.fileName }
  }

  file(id, name) {
    const asset = this.asset(id, name)
    return { ...asset, bytes: readFileSync(asset.path) }
  }

  delete(id, { withinTransaction = false } = {}) {
    const row = this.db.prepare('SELECT id FROM records WHERE id=?').get(id)
    if (!row) return
    if (!withinTransaction) this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('INSERT OR IGNORE INTO deleted_records VALUES(?,?)').run(id, new Date().toISOString())
      this.db.prepare("UPDATE records SET state='deleting' WHERE id=?").run(id)
      if (!withinTransaction) this.db.exec('COMMIT')
    } catch (error) { if (!withinTransaction) this.db.exec('ROLLBACK'); throw error }
    rmSync(path.join(this.dir, 'assets', id), { recursive: true, force: true })
    this.db.prepare('DELETE FROM records WHERE id=?').run(id)
  }

  close() { this.db.close() }
}
