import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight, Download, FileImage, Film, History, LoaderCircle, LogOut, RefreshCw, Search, ShieldCheck, Trash2, X } from 'lucide-react'
import { assetUrl, deleteHistory, getAdminSession, getHistory, listHistory, loginAdmin, logoutAdmin, releaseHistoryMedia, restoreResult } from '../lib/history.mjs'
import { exportReport } from '../lib/report'
import { FIGMA_ASSETS } from '../lib/figmaAssets'
import './HistoryAdmin.css'

const formatTime = value => new Date(value).toLocaleString('zh-CN', { hour12: false })
const formatBytes = bytes => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`
const Spinner = () => <LoaderCircle size={16} className="history-spin" aria-hidden="true" />
const Status = ({ pass, status }) => <span className={`history-status ${status === 'review' || pass == null ? 'is-review' : pass ? 'is-pass' : 'is-fail'}`}>{status === 'review' || pass == null ? '需复核' : pass ? '通过' : '不通过'}</span>

function Login({ onLogin, error, setError, onHome }) {
  const [pending, setPending] = useState(false)
  async function submit(event) {
    event.preventDefault()
    if (pending) return
    const form = new FormData(event.currentTarget)
    setPending(true); setError('')
    try { onLogin(await loginAdmin(form.get('username'), form.get('password'))) }
    catch (failure) { setError(failure.message) }
    finally { setPending(false) }
  }
  return (
    <main className="history-app history-login-page">
      <button className="history-button history-back" onClick={onHome}><ArrowLeft size={16} />返回检测</button>
      <form className="history-login" onSubmit={submit}>
        <img src={FIGMA_ASSETS.logo} alt="CapCut" className="history-logo" />
        <div className="history-login-title"><ShieldCheck size={22} /><h1>管理员登录</h1></div>
        <label htmlFor="admin-username">账号</label>
        <input id="admin-username" name="username" autoComplete="username" required maxLength={100} autoFocus />
        <label htmlFor="admin-password">密码</label>
        <input id="admin-password" name="password" type="password" autoComplete="current-password" required maxLength={256} />
        {error && <p className="history-error" role="alert">{error}</p>}
        <button className="history-button history-primary" disabled={pending} type="submit">{pending && <Spinner />}{pending ? '登录中' : '登录'}</button>
      </form>
    </main>
  )
}

function Detail({ record, onBack, onDelete, onError, ensureSession }) {
  const lifecycle = useRef(null)
  useEffect(() => {
    lifecycle.current = new AbortController()
    return () => { lifecycle.current.abort(); releaseHistoryMedia(record.id) }
  }, [record.id])
  const [selected, setSelected] = useState('first')
  const [exporting, setExporting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const result = restoreResult(record, selected)
  const frame = result.kind === 'video' || result.animated ? result.frames[selected] : result.frame
  async function report() {
    setExporting(true)
    try { await ensureSession(); await exportReport({ result, frame, signal: lifecycle.current.signal }) } catch (failure) { if (failure.name !== 'AbortError') onError(failure.status ? failure : new Error(failure.message || '报告导出失败，请重试')) }
    finally { setExporting(false) }
  }
  async function download(event) {
    event.preventDefault()
    if (downloading) return
    setDownloading(true)
    try {
      await ensureSession()
      lifecycle.current.signal.throwIfAborted()
      const anchor = document.createElement('a')
      anchor.href = assetUrl(record.id, 'original', true)
      anchor.download = result.fileName
      anchor.click()
    } catch (failure) { if (failure.name !== 'AbortError') onError(failure) }
    finally { setDownloading(false) }
  }
  return (
    <section className="history-detail">
      <div className="history-detail-heading">
        <div className="history-detail-name"><button className="history-icon" onClick={onBack} title="返回历史列表" aria-label="返回历史列表"><ArrowLeft size={20} /></button><h1 title={result.fileName}>{result.fileName}</h1><Status pass={result.overallPass} status={result.overallStatus} /></div>
        <div className="history-actions">
          <a className="history-button" href={assetUrl(record.id, 'original', true)} download onClick={download} aria-disabled={downloading}>{downloading ? <Spinner /> : <Download size={16} />}下载原文件</a>
          <button className="history-button" onClick={report} disabled={exporting}>{exporting ? <Spinner /> : <Download size={16} />}导出报告</button>
          <button className="history-icon history-danger" onClick={() => onDelete(record)} aria-label="删除记录" title="删除记录"><Trash2 size={17} /></button>
        </div>
      </div>
      <p className="history-meta">{formatTime(record.createdAt)} · {result.inspectionType === 'bottom' ? 'Bottom Banner · ' : ''}{result.kind === 'video' ? 'MP4 视频' : result.animated ? 'GIF 动图（首尾抽样）' : '图片'} · {formatBytes(record.bytes)} · 匿名提交</p>
      <div className="history-detail-grid">
        <div className="history-media-pane">
          <div className="history-media">
            {result.kind === 'video'
              ? <video src={result.videoUrl} poster={result.frames.first.src} controls autoPlay muted loop playsInline preload="metadata" onError={() => onError(new Error('原视频读取失败，请刷新或重新登录'))} aria-label="检测原视频" />
              : <img src={assetUrl(record.id, 'original')} alt="检测原图" onError={() => onError(new Error('原图读取失败，请刷新或重新登录'))} />}
          </div>
          {(result.kind === 'video' || result.animated) && <div className="history-frame-switch" role="group" aria-label="选择检测帧">
            {['first', 'last'].map(key => <button type="button" key={key} className={selected === key ? 'is-selected' : ''} onClick={() => setSelected(key)} aria-pressed={selected === key}>
              <img src={result.frames[key].src} alt="" /><span>{key === 'first' ? '首帧' : '尾帧'}</span><Status pass={result.frames[key].overallPass} status={result.frames[key].overallStatus} />
            </button>)}
          </div>}
        </div>
        <div className="history-inspection">
          <div className="history-section-heading"><h2>{result.kind === 'video' || result.animated ? `${selected === 'first' ? '首帧' : '尾帧'}检测结果` : '检测结果'}</h2><span>{frame.width} × {frame.height}</span></div>
          {frame.uiChecks.map(item => <section key={item.key} className="history-check">
            <div className="history-check-title"><h3>{item.label}</h3><Status pass={item.status} /></div>
            {item.metrics ? item.metrics.map(metric => <div key={metric.label} className="history-metric"><span>{metric.label}</span><strong>{metric.value}</strong></div>) : <div className="history-metric"><span>{item.metricLabel}</span><strong>{item.metric}</strong></div>}
            {!item.status && <p>{item.detail || item.recommendation}</p>}
          </section>)}
          <div className="history-palette">{frame.palette.map((color, index) => <span key={index} title={color.hex} style={{ backgroundColor: color.hex }} />)}</div>
          <p className="history-advice">{frame.recommendation}</p>
          <div className="history-rule-info"><span>检测规则 {record.snapshot.rules.version}</span><span>保留当次结论 · 不按新规则重算</span></div>
        </div>
      </div>
    </section>
  )
}

export default function HistoryAdmin({ onHome }) {
  const [session, setSession] = useState(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState(null)
  const [opening, setOpening] = useState(null)
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ kind: '', status: '', from: '', to: '' })
  const [page, setPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const dialogRef = useRef(null)
  const detailRequest = useRef(0)
  const handleError = failure => { if (failure.status === 401) { setSession(null); setDetail(null); setData(null) }; setError(failure.message) }

  useEffect(() => {
    const controller = new AbortController()
    getAdminSession(controller.signal).then(setSession).catch(failure => { if (failure.name !== 'AbortError' && failure.status !== 401) setError(failure.message) }).finally(() => { if (!controller.signal.aborted) setChecking(false) })
    return () => controller.abort()
  }, [])
  useEffect(() => { const timer = setTimeout(() => { setSearch(q); setPage(1) }, 250); return () => clearTimeout(timer) }, [q])
  useEffect(() => {
    if (!session) return
    const controller = new AbortController()
    setLoading(true); setError('')
    listHistory({ q: search, ...filters, page }, controller.signal).then(value => { if (!controller.signal.aborted) setData(value) }).catch(failure => { if (failure.name !== 'AbortError') handleError(failure) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [session, search, filters, page, refresh])
  useEffect(() => { if (deleteTarget) { setDeleteError(''); dialogRef.current?.showModal() } }, [deleteTarget])

  async function open(id) {
    const token = ++detailRequest.current
    setOpening(id); setError('')
    try { const record = await getHistory(id); if (token === detailRequest.current) setDetail(record) }
    catch (failure) { handleError(failure) }
    finally { if (token === detailRequest.current) setOpening(null) }
  }
  async function logout() {
    const csrfToken = session.csrfToken
    const request = ++detailRequest.current
    setSession(null); setDetail(null); setData(null); setError('')
    try { await logoutAdmin(csrfToken) }
    catch { if (request === detailRequest.current) setError('已退出当前页面；服务端注销未确认，请稍后重新登录。') }
  }
  async function remove() {
    if (deleting) return
    setDeleting(true); setDeleteError('')
    try {
      await deleteHistory(deleteTarget.id, session.csrfToken)
      setDeleteTarget(null); setDetail(null); setPage(1); setRefresh(value => value + 1)
    } catch (failure) { if (failure.status === 401) handleError(failure); else setDeleteError(failure.message) }
    finally { setDeleting(false) }
  }
  function filter(key, value) { setFilters(previous => ({ ...previous, [key]: value })); setPage(1) }
  async function ensureSession() {
    const current = await getAdminSession()
    if (current.csrfToken !== session.csrfToken) setSession(current)
  }

  if (checking) return <main className="history-app history-loading" role="status"><Spinner />正在连接历史服务</main>
  if (!session) return <Login onLogin={value => { ++detailRequest.current; setError(''); setSession(value) }} error={error} setError={setError} onHome={onHome} />
  const stats = data?.stats
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / (data?.pageSize || 20)))
  return (
    <main className="history-app">
      <nav className="history-nav">
        <div><img className="history-logo" src={FIGMA_ASSETS.logo} alt="CapCut" /><span className="history-nav-divider" /><History size={16} /><span>管理后台</span></div>
        <div><button className="history-button" onClick={onHome}><ArrowLeft size={16} />返回检测</button><button className="history-icon" onClick={logout} aria-label="退出登录" title={`退出登录（${session.username}）`}><LogOut size={18} /></button></div>
      </nav>
      <div className="history-content">
        {error && <div className="history-alert" role="alert"><span>{error}</span><button className="history-icon" onClick={() => setError('')} aria-label="关闭提示"><X size={16} /></button></div>}
        {detail ? <Detail key={detail.id} record={detail} onBack={() => setDetail(null)} onDelete={setDeleteTarget} onError={handleError} ensureSession={ensureSession} /> : <>
          <header className="history-heading"><div><h1>检测历史</h1><p>全部匿名提交 · 原文件与当次检测结果</p></div><button className="history-icon" onClick={() => setRefresh(value => value + 1)} disabled={loading} aria-label="刷新记录" title="刷新记录">{loading ? <Spinner /> : <RefreshCw size={18} />}</button></header>
          <div className="history-stats"><span>全部记录 <strong>{stats?.count ?? '—'}</strong></span><span>通过 <strong>{stats?.passed ?? '—'}</strong></span><span>不通过 <strong>{stats ? stats.count - stats.passed : '—'}</strong></span><span className="history-storage">存储 {stats ? `${formatBytes(stats.bytes)} / ${formatBytes(stats.maxBytes)}` : '—'}<small>不自动删除</small></span></div>
          <form className="history-filters" onSubmit={event => event.preventDefault()}>
            <div className="history-search"><Search size={16} /><input type="search" aria-label="搜索文件名" placeholder="搜索文件名" value={q} onChange={event => setQ(event.target.value)} /></div>
            <select aria-label="素材类型" value={filters.kind} onChange={event => filter('kind', event.target.value)}><option value="">全部类型</option><option value="image">图片</option><option value="video">视频</option></select>
            <select aria-label="检测状态" value={filters.status} onChange={event => filter('status', event.target.value)}><option value="">全部状态</option><option value="passed">通过</option><option value="failed">不通过</option></select>
            <div className="history-dates"><input type="date" aria-label="开始日期" value={filters.from} onChange={event => filter('from', event.target.value)} /><span>至</span><input type="date" aria-label="结束日期" value={filters.to} onChange={event => filter('to', event.target.value)} /></div>
            {(q || Object.values(filters).some(Boolean)) && <button type="button" className="history-icon" title="重置筛选" aria-label="重置筛选" onClick={() => { setQ(''); setFilters({ kind: '', status: '', from: '', to: '' }); setPage(1) }}><X size={16} /></button>}
          </form>
          <div className="history-table-wrap" aria-busy={loading}>
            <table className="history-table"><thead><tr><th>素材</th><th>检测状态</th><th>未通过项目</th><th>归档时间</th><th><span className="history-sr">操作</span></th></tr></thead>
              <tbody>{data?.records.map(record => <tr key={record.id}>
                <td><div className="history-file"><img src={record.thumbnailUrl} alt="" loading="lazy" /><div><button onClick={() => open(record.id)} title={record.fileName}>{record.fileName}</button><span>{record.kind === 'video' ? <Film size={12} /> : <FileImage size={12} />}{record.kind === 'video' ? '视频' : '图片'} · {formatBytes(record.bytes)}</span></div></div></td>
                <td><Status pass={record.overallPass} status={record.overallStatus} /></td><td className="history-issues">{record.issues.join('、') || '—'}</td><td className="history-time">{formatTime(record.createdAt)}</td>
                <td><button className="history-icon" onClick={() => open(record.id)} aria-label={`查看 ${record.fileName}`} title="查看记录" disabled={opening === record.id}>{opening === record.id ? <Spinner /> : <ArrowUpRight size={18} />}</button></td>
              </tr>)}</tbody>
            </table>
            {!loading && !data?.records.length && <div className="history-empty"><History size={28} /><h2>{data?.stats.count ? '没有匹配的记录' : '暂无检测记录'}</h2></div>}
            {loading && !data && <div className="history-empty" role="status"><Spinner />正在读取记录</div>}
          </div>
          <footer className="history-pagination"><span>共 {data?.total || 0} 条</span><div><button className="history-icon" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)} aria-label="上一页" title="上一页"><ChevronLeft size={18} /></button><span>{page} / {totalPages}</span><button className="history-icon" disabled={page >= totalPages || loading} onClick={() => setPage(value => value + 1)} aria-label="下一页" title="下一页"><ChevronRight size={18} /></button></div></footer>
        </>}
      </div>
      {deleteTarget && <dialog ref={dialogRef} className="history-dialog" aria-labelledby="history-delete-title" aria-describedby="history-delete-description" onCancel={event => { if (deleting) event.preventDefault(); else setDeleteTarget(null) }}>
        <h2 id="history-delete-title">永久删除这条记录？</h2><p>{deleteTarget.snapshot.fileName}</p><p id="history-delete-description">原文件、首尾帧和检测结果将一并删除，无法恢复。</p>
        {deleteError && <p className="history-error" role="alert">{deleteError}</p>}
        <div className="history-actions"><button className="history-button" onClick={() => setDeleteTarget(null)} disabled={deleting}>取消</button><button className="history-button history-destructive" onClick={remove} disabled={deleting}>{deleting && <Spinner />}{deleting ? '删除中' : '永久删除'}</button></div>
      </dialog>}
    </main>
  )
}
