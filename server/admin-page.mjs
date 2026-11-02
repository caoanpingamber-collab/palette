import { createHash } from 'node:crypto'

const approvedOrigins = ['https://bytedance.feishu.link', 'https://bytedance.aiforce.cloud']
const escapeAttribute = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function renderAdminPage({ script, css, apiBase, homeUrl }) {
  for (const value of [apiBase, homeUrl]) {
    const url = new URL(value)
    if (!approvedOrigins.includes(url.origin) || !/^\/app\/app_[a-z0-9]+\/?$/.test(url.pathname) || url.username || url.password || url.search || url.hash) throw new Error('Unapproved administrator destination')
  }
  if (typeof script !== 'string' || !script || typeof css !== 'string') throw new Error('Administrator bundle is missing')
  const safeScript = script.replace(/<\/script/gi, '<\\/script')
  const safeCss = css.replace(/<\/style/gi, '<\\/style')
  const hash = createHash('sha256').update(safeScript).digest('base64')
  const csp = ["default-src 'none'", "sandbox allow-scripts allow-forms allow-downloads", `script-src 'sha256-${hash}'`, "script-src-attr 'none'", "style-src 'unsafe-inline'", 'img-src data: blob:', 'media-src blob:', `connect-src ${apiBase.replace(/\/$/, '')}/api/`, "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"].join('; ')
  return {
    headers: { 'Content-Security-Policy': csp, 'Cross-Origin-Opener-Policy': 'same-origin', 'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' },
    html: `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="history-api-base" content="${escapeAttribute(apiBase)}"><meta name="history-home-url" content="${escapeAttribute(homeUrl)}"><title>检测历史管理</title><style>${safeCss}</style></head><body><div id="root"></div><script type="module">${safeScript}</script></body></html>`,
  }
}
