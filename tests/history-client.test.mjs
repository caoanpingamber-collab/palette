import test from 'node:test'
test('published history API paths stay scoped to the approved same-origin backend', async () => {
  const { historyApiPath } = await import('../src/lib/history.mjs')
  assert.equal(historyApiPath('/api/history', '/app/app_17h055cggnm'), '/app/app_17h055cggnm/api/history')
  assert.equal(historyApiPath('/api/history', ''), '/api/history')
  assert.throws(() => historyApiPath('/api/history', 'https://untrusted.example'), /same-origin/)
})
import assert from 'node:assert/strict'

const check = pass => ({ key: 'comp', label: '构图检测', status: pass, issue: '视觉重心不在范围内', metric: '40%', recommendation: '移到右侧' })
const frame = (pass, src) => ({
  src, img: { nodeType: 1, unsafe: true }, data: { clusters: new Uint8Array(200) },
  width: 800, height: 1296, palette: [{ hex: '#6149a5', rgb: [97, 73, 165], ratio: 100 }],
  V: [191, 227, 255], VHex: '#bfe3ff', cold: 100, chroma: 61,
  contrast: { title: 6, cardTop: 3, cardBottom: 1.3 }, check: { cxf: pass ? .6 : .4, cyf: .2, clutter: { secPct: 1, secCount: 1, focus: { x: 30, y: 90 } } },
  uiChecks: [check(pass)], failed: pass ? [] : [check(false)], overallPass: pass, recommendation: '建议', prompt: '提示',
})

test('snapshot excludes browser objects, URLs and pixel buffers while preserving both video outcomes', async () => {
  const { snapshotResult } = await import('../src/lib/history.mjs')
  const result = { kind: 'video', fileName: 'clip.mp4', videoUrl: 'blob:private-video', sourceUrl: 'data:image/png;base64,first', overallPass: false, recommendation: '建议', prompt: '提示', frames: { first: frame(true, 'data:image/png;base64,first'), last: frame(false, 'data:image/png;base64,last') } }
  const snapshot = snapshotResult(result, { id: '00000000-0000-4000-8000-000000000001', inspectedAt: '2026-10-29T00:00:00.000Z' })
  const json = JSON.stringify(snapshot)
  assert.doesNotMatch(json, /blob:|base64|nodeType|clusters|unsafe/)
  assert.equal(snapshot.result.frames.first.overallPass, true)
  assert.equal(snapshot.result.frames.last.overallPass, false)
  assert.equal(snapshot.rules.thresholds.cardBottomContrast, 1.2)
  assert.equal(snapshot.result.frames.last.check.clutter.focus.y, 90)
})

test('history restore uses saved metrics, private media URLs and keeps frame selection separate from video', async () => {
  const { snapshotResult, restoreResult } = await import('../src/lib/history.mjs')
  const snapshot = snapshotResult({ kind: 'video', fileName: 'clip.mp4', overallPass: false, recommendation: 'old advice', prompt: '', frames: { first: frame(true, 'data:old-first'), last: frame(false, 'data:old-last') } }, { id: '00000000-0000-4000-8000-000000000001' })
  snapshot.result.frames.last.contrast.cardBottom = 1.39
  const restored = restoreResult({ id: snapshot.id, snapshot }, 'last')
  assert.equal(restored.activeFrame, 'last')
  assert.equal(restored.sourceUrl, '/api/history/00000000-0000-4000-8000-000000000001/files/last')
  assert.equal(restored.videoUrl, '/api/history/00000000-0000-4000-8000-000000000001/files/original')
  assert.equal(restored.frames.last.contrast.cardBottom, 1.39)
  assert.equal(restored.frames.first.failed.length, 0)
  assert.equal(restored.frames.last.failed[0].key, 'comp')
  assert.equal(restored.recommendation, 'old advice')
})

test('date filters use local midnight rather than incorrectly treating the selected date as UTC', async () => {
  const { historyDateRange } = await import('../src/lib/history.mjs')
  const previous = process.env.TZ
  process.env.TZ = 'Asia/Shanghai'
  try {
    assert.deepEqual(historyDateRange('2026-10-29', '2026-10-29'), { from: '2026-10-28T16:00:00.000Z', to: '2026-10-29T15:59:59.999Z' })
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous }
})
