const RULES = {
  version: 'banner-qc-v1',
  thresholds: { coldLo: 160, coldHi: 270, coldMin: 60, chromaMin: 45, clutterMax: 8, titleContrast: 2, cardTopContrast: 2, cardBottomContrast: 1.2, compositionMinX: .5 },
}

let clientBase
let sessionTransport = 'cookie'
let accessToken = ''
let sessionEpoch = 0
const privateAssets = new Map()
const pendingAssets = new Map()
const recordEpochs = new Map()
const staleRequest = () => new DOMException('Administrator session changed', 'AbortError')

export function approvedAdminUrl(value) {
  const url = new URL(value)
  if (!['https://bytedance.feishu.link', 'https://bytedance.aiforce.cloud'].includes(url.origin) || !/^\/app\/app_[a-z0-9]+\/admin$/.test(url.pathname) || url.search || url.hash || url.username || url.password) throw new Error('Unapproved administrator page')
  return url.href
}

export function clearHistorySession() {
  accessToken = ''
  sessionEpoch++
  for (const url of privateAssets.values()) URL.revokeObjectURL(url)
  privateAssets.clear()
  pendingAssets.clear()
  recordEpochs.clear()
}

export function configureHistoryClient({ apiBase, sessionTransport: transport = 'cookie' } = {}) {
  if (!['cookie', 'bearer'].includes(transport)) throw new Error('Unsupported administrator session transport')
  if (transport === 'bearer') {
    const url = new URL(apiBase)
    if (!['https://bytedance.feishu.link', 'https://bytedance.aiforce.cloud'].includes(url.origin) || !/^\/app\/app_[a-z0-9]+$/.test(url.pathname) || url.search || url.hash || url.username || url.password) throw new Error('Unapproved administrator API')
  } else if (apiBase && !/^\/app\/app_[a-z0-9]+$/.test(apiBase)) throw new Error('Unapproved history API')
  clearHistorySession()
  sessionTransport = transport
  clientBase = apiBase
}

export function historyApiPath(pathname, base = clientBase ?? import.meta.env?.VITE_HISTORY_API_BASE ?? '') {
  if (sessionTransport === 'bearer' && base === clientBase) return `${base}${pathname}`
  if (base && !/^\/app\/app_[a-z0-9]+$/.test(base)) throw new Error('History API must use an approved same-origin app path')
  return `${base}${pathname}`
}

function snapshotFrame(frame) {
  return {
    width: frame.width, height: frame.height,
    palette: (frame.palette || []).map(({ hex, rgb, ratio }) => ({ hex, rgb, ratio })),
    V: frame.V, VHex: frame.VHex, cold: frame.cold ?? null, chroma: frame.chroma ?? null,
    contrast: frame.contrast,
    check: { cxf: frame.check?.cxf ?? .5, cyf: frame.check?.cyf ?? .5, clutter: frame.check?.clutter ? { secPct: frame.check.clutter.secPct, secCount: frame.check.clutter.secCount, focus: frame.check.clutter.focus ?? null } : null },
    uiChecks: frame.uiChecks, overallPass: frame.overallPass, recommendation: frame.recommendation, prompt: frame.prompt,
  }
}

export function snapshotResult(result, { id = crypto.randomUUID(), inspectedAt = new Date().toISOString() } = {}) {
  const frames = result.kind === 'video' ? { first: snapshotFrame(result.frames.first), last: snapshotFrame(result.frames.last) } : { first: snapshotFrame(result.frame) }
  return {
    version: 1, id, inspectedAt, kind: result.kind, fileName: result.fileName,
    buildVersion: typeof __APP_BUILD_VERSION__ === 'undefined' ? 'development' : __APP_BUILD_VERSION__,
    rules: structuredClone(RULES),
    result: { overallPass: result.overallPass, recommendation: result.recommendation, prompt: result.prompt, frames },
  }
}

export function assetUrl(id, name, download = false) {
  if (sessionTransport === 'bearer') return privateAssets.get(`${id}/${name}`) || ''
  return historyApiPath(`/api/history/${encodeURIComponent(id)}/files/${encodeURIComponent(name)}${download ? '?download=1' : ''}`)
}

async function loadPrivateAsset(id, name, signal) {
  const key = `${id}/${name}`
  const recordEpoch = recordEpochs.get(id) || 0
  if (privateAssets.has(key)) return privateAssets.get(key)
  const previous = pendingAssets.get(key)
  if (previous && previous.recordEpoch === recordEpoch && !previous.signal?.aborted) return previous.promise
  const epoch = sessionEpoch
  const pending = (async () => {
    const bytes = await request(`/api/history/${encodeURIComponent(id)}/files/${encodeURIComponent(name)}`, { signal }, true)
    if (epoch !== sessionEpoch || recordEpoch !== (recordEpochs.get(id) || 0) || !accessToken) throw staleRequest()
    const url = URL.createObjectURL(bytes)
    privateAssets.set(key, url)
    return url
  })()
  const entry = { promise: pending, signal, recordEpoch }
  pendingAssets.set(key, entry)
  try { return await pending }
  finally { if (pendingAssets.get(key) === entry) pendingAssets.delete(key) }
}

export function releaseHistoryMedia(id) {
  recordEpochs.set(id, (recordEpochs.get(id) || 0) + 1)
  for (const name of ['original', 'first', 'last']) {
    const key = `${id}/${name}`
    if (privateAssets.has(key)) { URL.revokeObjectURL(privateAssets.get(key)); privateAssets.delete(key) }
  }
}

export function restoreResult(record, selectedFrame = 'first') {
  const { snapshot, id } = record
  const frames = Object.fromEntries(Object.entries(snapshot.result.frames).map(([key, saved]) => [key, { ...saved, src: assetUrl(id, key), failed: saved.uiChecks.filter(item => !item.status) }]))
  const activeFrame = snapshot.kind === 'video' && frames[selectedFrame] ? selectedFrame : 'first'
  const frame = frames[activeFrame]
  return {
    kind: snapshot.kind, fileName: snapshot.fileName, ...snapshot.result,
    frames, frame: frames.first, activeFrame: snapshot.kind === 'video' ? activeFrame : null,
    sourceUrl: frame.src, videoUrl: snapshot.kind === 'video' ? assetUrl(id, 'original') : null,
    checks: frame.uiChecks, palette: frame.palette,
  }
}

async function request(url, init = {}, binary = false) {
  const epoch = sessionEpoch
  const bearer = sessionTransport === 'bearer'
  const headers = new Headers(init.headers)
  if (bearer && accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  let response
  try { response = await fetch(historyApiPath(url), { cache: 'no-store', ...init, headers, credentials: bearer ? 'omit' : 'same-origin', redirect: 'error' }) }
  catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('历史服务连接失败，请确认后端已启动后重试')
  }
  let body
  try { body = response.status === 204 ? null : binary && response.ok ? await response.blob() : await response.json() } catch { throw new Error('历史服务返回异常，请确认后端已启动') }
  if (bearer && epoch !== sessionEpoch) throw staleRequest()
  if (!response.ok) {
    if (bearer && response.status === 401) clearHistorySession()
    const error = new Error(body?.error || '请求失败'); error.status = response.status; throw error
  }
  return body
}

async function raster(frame, maxEdge, quality) {
  let image = frame.img
  if (!image?.naturalWidth) {
    image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('归档帧图读取失败'))
      img.src = frame.src
    })
  }
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('归档帧图生成失败')), 'image/jpeg', quality))
}

export async function prepareArchive(file, result) {
  const manifest = snapshotResult(result)
  const first = result.kind === 'video' ? result.frames.first : result.frame
  const form = new FormData()
  form.append('manifest', JSON.stringify(manifest))
  form.append('original', file, file.name || result.fileName)
  form.append('first', await raster(first, 1600, .94), 'first.jpg')
  if (result.kind === 'video') form.append('last', await raster(result.frames.last, 1600, .94), 'last.jpg')
  form.append('thumbnail', await raster(first, 240, .78), 'thumbnail.jpg')
  return { id: manifest.id, form }
}

export const archiveInspection = prepared => request('/api/history', { method: 'POST', body: prepared.form })
export const isArchiveEnabled = async () => (await request('/api/health')).archiveEnabled === true
export const getAdminSession = signal => request('/api/admin/session', { signal })
export async function loginAdmin(username, password) {
  if (sessionTransport === 'bearer') clearHistorySession()
  const epoch = sessionEpoch
  const body = await request('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
  if (sessionTransport !== 'bearer') return body
  if (epoch !== sessionEpoch) throw staleRequest()
  if (!/^[a-f0-9]{64}$/.test(body.accessToken || '')) throw new Error('管理员会话响应无效')
  accessToken = body.accessToken
  const { accessToken: ignored, ...session } = body
  return session
}
export async function logoutAdmin(csrfToken) {
  const headers = { 'X-CSRF-Token': csrfToken }
  if (sessionTransport === 'bearer') {
    headers.Authorization = `Bearer ${accessToken}`
    clearHistorySession()
  }
  await request('/api/admin/logout', { method: 'POST', headers })
}
export function historyDateRange(from, to) {
  return { ...(from ? { from: new Date(`${from}T00:00:00.000`).toISOString() } : {}), ...(to ? { to: new Date(`${to}T23:59:59.999`).toISOString() } : {}) }
}
export async function listHistory(params, signal) {
  const data = await request(`/api/history?${new URLSearchParams(Object.entries({ ...params, from: '', to: '', ...historyDateRange(params.from, params.to) }).filter(([, value]) => value !== '' && value != null))}`, { signal })
  if (sessionTransport === 'bearer') await Promise.all(data.records.map(record => loadPrivateAsset(record.id, 'thumbnail', signal)))
  return { ...data, records: data.records.map(record => ({ ...record, thumbnailUrl: assetUrl(record.id, 'thumbnail') })) }
}
export async function getHistory(id, signal) {
  const recordEpoch = recordEpochs.get(id) || 0
  const record = await request(`/api/history/${encodeURIComponent(id)}`, { signal })
  if (sessionTransport === 'bearer' && recordEpoch !== (recordEpochs.get(id) || 0)) throw staleRequest()
  if (sessionTransport === 'bearer') await Promise.all(['original', 'first', ...(record.snapshot.kind === 'video' ? ['last'] : [])].map(name => loadPrivateAsset(id, name, signal)))
  return record
}
export async function deleteHistory(id, csrfToken) {
  await request(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'X-CSRF-Token': csrfToken } })
  releaseHistoryMedia(id)
  for (const [key, url] of privateAssets) if (key.startsWith(`${id}/`)) { URL.revokeObjectURL(url); privateAssets.delete(key) }
}
