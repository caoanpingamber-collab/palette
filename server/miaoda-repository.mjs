// Encode values rather than interpolating SQL string literals or identifiers.
export const sqlText = value => `convert_from(decode('${Buffer.from(String(value)).toString('hex')}','hex'),'UTF8')`
const json = value => `${sqlText(JSON.stringify(value))}::jsonb`
// DataPaas cannot decode PostgreSQL void columns; project a supported scalar.
const lock = 'SELECT pg_advisory_xact_lock(20261029,5192) IS NULL AS locked;'
const parse = value => typeof value === 'string' ? JSON.parse(value) : value
const record = row => row ? {
  id: row.id, fingerprint: row.fingerprint, state: row.state, lease: row.lease,
  bytes: Number(row.total_bytes), createdAt: new Date(row.created_at).toISOString(),
  manifest: parse(row.snapshot), assets: parse(row.assets),
} : null

export class MiaodaRepository {
  constructor(sql) { this.sql = sql }
  batch(statements) {
    if (this.sql.batch) return this.sql.batch(statements)
    // CLI returns explicit statement results; runtime SDK uses its own transaction API.
    return this.sql.query(`BEGIN; ${statements.slice(0, -1).join(';')}; COMMIT; ${statements.at(-1)};`)
  }

  async initialize() {
    await this.sql.query(`
      CREATE TABLE IF NOT EXISTS banner_history_records (
        id text PRIMARY KEY, fingerprint text NOT NULL, lease text NOT NULL,
        state text NOT NULL CHECK(state IN ('pending','ready','deleting')),
        total_bytes bigint NOT NULL CHECK(total_bytes>0), created_at timestamptz NOT NULL DEFAULT now(),
        snapshot jsonb NOT NULL, assets jsonb NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE INDEX IF NOT EXISTS banner_history_time ON banner_history_records(created_at DESC,id DESC);
      CREATE TABLE IF NOT EXISTS banner_history_deleted (id text PRIMARY KEY, deleted_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS banner_history_admin (id integer PRIMARY KEY CHECK(id=1), username text NOT NULL, password_hash text NOT NULL);
      CREATE TABLE IF NOT EXISTS banner_history_sessions (token_hash text PRIMARY KEY, csrf text NOT NULL, expires_at bigint NOT NULL);
      CREATE TABLE IF NOT EXISTS banner_history_upload_budget (period bigint PRIMARY KEY, used integer NOT NULL);
    `)
  }

  async reserve(input) {
    const { id, fingerprint, lease, bytes, manifest, maxBytes } = input
    const period = Math.floor(Date.now() / 3600000)
    const rows = await this.batch([lock, `INSERT INTO banner_history_upload_budget(period,used)
      SELECT ${period},1 WHERE NOT EXISTS(SELECT 1 FROM banner_history_records WHERE id=${sqlText(id)})
        AND NOT EXISTS(SELECT 1 FROM banner_history_deleted WHERE id=${sqlText(id)})
      ON CONFLICT(period) DO UPDATE SET used=banner_history_upload_budget.used+1`,
      `INSERT INTO banner_history_records(id,fingerprint,lease,state,total_bytes,snapshot)
      SELECT ${sqlText(id)},${sqlText(fingerprint)},${sqlText(lease)},'pending',${bytes},${json(manifest)}
      WHERE NOT EXISTS(SELECT 1 FROM banner_history_deleted WHERE id=${sqlText(id)})
        AND NOT EXISTS(SELECT 1 FROM banner_history_records WHERE id=${sqlText(id)})
        AND COALESCE((SELECT used FROM banner_history_upload_budget WHERE period=${period}),0)<=60
        AND (SELECT COALESCE(SUM(total_bytes),0) FROM banner_history_records)+${bytes}<=${maxBytes}`,
      `SELECT r.*, EXISTS(SELECT 1 FROM banner_history_deleted WHERE id=${sqlText(id)}) AS deleted,
        COALESCE((SELECT used FROM banner_history_upload_budget WHERE period=${period}),0)>60 AS limited
      FROM (SELECT 1) AS one LEFT JOIN banner_history_records r ON r.id=${sqlText(id)}`])
    if (rows[0]?.deleted === true || rows[0]?.deleted === 't') return { deleted: true }
    if (!rows[0]?.id && (rows[0]?.limited === true || rows[0]?.limited === 't')) return { limited: true }
    return rows[0]?.id ? record(rows[0]) : null
  }
  async raw(id) { return record((await this.sql.query(`SELECT * FROM banner_history_records WHERE id=${sqlText(id)};`))[0]) }
  async finalize(id, lease, assets) {
    return (await this.batch([`UPDATE banner_history_records SET state='ready',assets=${json(assets)} WHERE id=${sqlText(id)} AND lease=${sqlText(lease)} AND state='pending'`, `SELECT id FROM banner_history_records WHERE id=${sqlText(id)} AND lease=${sqlText(lease)} AND state='ready'`])).length === 1
  }
  abort(id, lease) { return this.sql.query(`DELETE FROM banner_history_records WHERE id=${sqlText(id)} AND lease=${sqlText(lease)} AND state='pending';`) }
  async cancel(id, lease) {
    const rows = await this.batch([`UPDATE banner_history_records SET state='deleting',snapshot='{}'::jsonb WHERE id=${sqlText(id)} AND lease=${sqlText(lease)} AND state='pending'`, `SELECT * FROM banner_history_records WHERE id=${sqlText(id)} AND lease=${sqlText(lease)} AND state='deleting'`])
    return record(rows[0])
  }
  async markDeleting(id) {
    const rows = await this.batch([lock,
      `INSERT INTO banner_history_deleted(id) SELECT id FROM banner_history_records WHERE id=${sqlText(id)} ON CONFLICT DO NOTHING`,
      `UPDATE banner_history_records SET state='deleting',snapshot='{}'::jsonb WHERE id=${sqlText(id)}`,
      `SELECT * FROM banner_history_records WHERE id=${sqlText(id)}`])
    return record(rows[0])
  }
  finishDelete(id, lease) { return this.sql.query(`DELETE FROM banner_history_records WHERE id=${sqlText(id)} AND lease=${sqlText(lease)} AND state='deleting';`) }
  async unfinished() {
    return (await this.sql.query("SELECT * FROM banner_history_records WHERE (state='deleting' AND (assets<>'{}'::jsonb OR created_at<now()-interval '15 minutes')) OR (state='pending' AND created_at<now()-interval '15 minutes') ORDER BY created_at LIMIT 20;")).map(record)
  }
  async claimExpired(id, lease) {
    return (await this.batch([`UPDATE banner_history_records SET state='deleting' WHERE id=${sqlText(id)} AND lease=${sqlText(lease)} AND state='pending' AND created_at<now()-interval '15 minutes'`, `SELECT id FROM banner_history_records WHERE id=${sqlText(id)} AND lease=${sqlText(lease)} AND state='deleting'`])).length === 1
  }
  async stats() {
    const row = (await this.sql.query("SELECT count(*) FILTER(WHERE state='ready') AS count, COALESCE(sum(total_bytes),0) AS bytes, count(*) FILTER(WHERE state='ready' AND snapshot->'result'->>'overallPass'='true') AS passed FROM banner_history_records;"))[0]
    return { count: Number(row.count), bytes: Number(row.bytes), passed: Number(row.passed) }
  }
  async list({ q = '', kind, status, from, to, page = 1, pageSize = 20 }) {
    const where = ["state='ready'"]
    if (q) where.push(`strpos(lower(snapshot->>'fileName'),lower(${sqlText(q)}))>0`)
    if (kind) where.push(`snapshot->>'kind'=${sqlText(kind)}`)
    if (status) where.push(`snapshot->'result'->>'overallPass'=${sqlText(String(status === 'passed'))}`)
    if (from) where.push(`created_at>=${sqlText(from)}::timestamptz`)
    if (to) where.push(`created_at<=${sqlText(to)}::timestamptz`)
    const clause = where.join(' AND ')
    const total = Number((await this.sql.query(`SELECT count(*) AS total FROM banner_history_records WHERE ${clause};`))[0].total)
    const rows = await this.sql.query(`SELECT * FROM banner_history_records WHERE ${clause} ORDER BY created_at DESC,id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize};`)
    return { rows: rows.map(record), total }
  }

  async getAdmin() { return (await this.sql.query('SELECT username,password_hash FROM banner_history_admin WHERE id=1;'))[0] }
  setAdmin(username, hash) {
    return this.batch([lock, `INSERT INTO banner_history_admin VALUES(1,${sqlText(username)},${sqlText(hash)}) ON CONFLICT(id) DO UPDATE SET username=excluded.username,password_hash=excluded.password_hash`, 'DELETE FROM banner_history_sessions', 'SELECT 1'])
  }
  async importAdmin(username, hash) {
    await this.sql.query(`INSERT INTO banner_history_admin VALUES(1,${sqlText(username)},${sqlText(hash)}) ON CONFLICT(id) DO NOTHING;`)
  }
  async getSession(hash) { return (await this.sql.query(`SELECT * FROM banner_history_sessions WHERE token_hash=${sqlText(hash)} AND expires_at>${Date.now()};`))[0] }
  async saveSession(hash, csrf, expires, expectedHash) {
    const check = expectedHash === undefined ? 'TRUE' : `password_hash=${sqlText(expectedHash)}`
    return (await this.batch([lock, `INSERT INTO banner_history_sessions SELECT ${sqlText(hash)},${sqlText(csrf)},${expires} FROM banner_history_admin WHERE id=1 AND ${check}`, `SELECT token_hash FROM banner_history_sessions WHERE token_hash=${sqlText(hash)}`])).length === 1
  }
  deleteSession(hash) { return this.sql.query(`DELETE FROM banner_history_sessions WHERE token_hash=${sqlText(hash)};`) }
  pruneSessions() { return this.sql.query(`DELETE FROM banner_history_sessions WHERE expires_at<=${Date.now()};`) }
}
