import React from 'react'
import { createRoot } from 'react-dom/client'
import HistoryAdmin from './components/HistoryAdmin'
import { clearHistorySession, configureHistoryClient } from './lib/history.mjs'
import './admin-entry.css'

const element = document.getElementById('root')
const root = createRoot(element)
if (window.origin !== 'null') {
  root.render(<main className="history-app history-loading" role="alert">管理页面的安全隔离未生效，已停止登录。</main>)
} else {
  const apiBase = document.querySelector('meta[name="history-api-base"]').content
  const homeUrl = document.querySelector('meta[name="history-home-url"]').content
  configureHistoryClient({ apiBase, sessionTransport: 'bearer' })
  root.render(<HistoryAdmin onHome={() => window.location.assign(homeUrl)} />)
}

window.addEventListener('pagehide', () => { clearHistorySession(); root.unmount() })
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload() })
