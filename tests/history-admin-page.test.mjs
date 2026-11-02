import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

test('standalone admin requires opaque sandbox, pinned script and no framing or ambient storage', async () => {
  const { renderAdminPage } = await import('../server/admin-page.mjs')
  const script = 'document.getElementById("root").textContent="ready"'
  const page = renderAdminPage({ script, css: 'body{margin:0}', apiBase: 'https://bytedance.feishu.link/app/app_synthetic', homeUrl: 'https://bytedance.feishu.link/app/app_syntheticfront' })
  const csp = page.headers['Content-Security-Policy']
  assert.match(csp, /sandbox allow-scripts allow-forms allow-downloads/)
  assert.doesNotMatch(csp, /allow-same-origin|unsafe-eval|script-src[^;]*unsafe-inline/)
  assert.ok(csp.includes(`'sha256-${createHash('sha256').update(script).digest('base64')}'`))
  assert.match(csp, /frame-ancestors 'none'/)
  assert.equal(page.headers['Cross-Origin-Opener-Policy'], 'same-origin')
  assert.equal(page.headers['Cache-Control'], 'no-store')
  assert.match(page.html, /history-api-base/)
  assert.match(page.html, /type="module"/)
  assert.doesNotMatch(page.html, /accessToken|localStorage|sessionStorage/)
  assert.throws(() => renderAdminPage({ script, css: '', apiBase: 'https://untrusted.example', homeUrl: 'javascript:alert(1)' }))
})
