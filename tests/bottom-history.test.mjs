import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { evaluateBottom } from '../src/lib/bottomRules.mjs'
import { snapshotResult, restoreResult } from '../src/lib/history.mjs'
import { parseManifest } from '../server/schema.mjs'

function result({ animated = false, review = false } = {}) {
  const first = { width: 1071, height: 180, src: 'data:image/png;base64,omitted', palette: [], ...evaluateBottom({ width: 1071, height: 180, bytes: 400000, ocr: review ? null : { confidence: 95, lines: [{ text: 'Create your next video', confidence: 95, bbox: { x0: 90, y0: 45, x1: 600, y1: 82 } }] }, visual: { x: 860, y: 90, confidence: .9 } }) }
  return { inspectionType: 'bottom', kind: 'image', fileName: animated ? 'bottom.gif' : 'bottom.png', mediaUrl: 'blob:private', frame: first, frames: { first, ...(animated ? { last: structuredClone(first) } : {}) }, animated, animationFrameCount: animated ? 2 : 1, overallPass: first.overallPass, overallStatus: first.overallStatus, recommendation: first.recommendation, prompt: first.prompt }
}

test('Bottom uses its own v2 snapshot and preserves immutable rules/evidence', () => {
  const source = result()
  const saved = snapshotResult(source, { id: randomUUID() })
  assert.equal(saved.version, 2)
  assert.equal(saved.inspectionType, 'bottom')
  assert.equal(saved.rules.version, 'bottom-banner-qc-v1')
  assert.equal(saved.rules.thresholds.circleX, 770)
  const parsed = parseManifest(saved)
  assert.deepEqual(parsed.result.frames.first.uiChecks.map(item => item.key), source.frame.uiChecks.map(item => item.key))
  assert.equal(JSON.stringify(parsed).includes('blob:private'), false)
  assert.equal(JSON.stringify(parsed).includes('data:image'), false)
  const restored = restoreResult({ id: saved.id, snapshot: parsed })
  assert.equal(restored.inspectionType, 'bottom')
  assert.equal(restored.overallStatus, 'passed')
  assert.equal(restored.frame.evidence.ocr.lines[0].text, 'Create your next video')
})

test('Bottom GIF snapshots require first and last and restore original animated media', () => {
  const saved = snapshotResult(result({ animated: true }))
  const parsed = parseManifest(saved)
  assert.equal(parsed.animated, true)
  const restored = restoreResult({ id: saved.id, snapshot: parsed }, 'last')
  assert.equal(restored.animated, true)
  assert.equal(restored.activeFrame, 'last')
  assert.match(restored.mediaUrl, /\/files\/original$/)
  assert.throws(() => parseManifest({ ...saved, animated: false }))
  const missing = structuredClone(saved); delete missing.result.frames.last
  assert.throws(() => parseManifest(missing))
})

test('Bottom pending OCR stays review, not a definite failure or approved', () => {
  const saved = snapshotResult(result({ review: true }))
  assert.equal(saved.result.overallStatus, 'review')
  assert.equal(parseManifest(saved).result.frames.first.uiChecks.find(item => item.key === 'copy').status, null)
  const bad = structuredClone(saved); bad.result.overallPass = true
  assert.throws(() => parseManifest(bad))
})

test('Bottom rejects altered rules, duplicate rows and Header-only keys', () => {
  for (const mutate of [value => { value.rules.thresholds.maxBytes = 500001 }, value => { value.result.frames.first.uiChecks[0].key = 'hue' }, value => { value.result.frames.first.uiChecks[1] = value.result.frames.first.uiChecks[0] }]) {
    const saved = snapshotResult(result()); mutate(saved)
    assert.throws(() => parseManifest(saved))
  }
})

test('ambiguous copy layout survives archive and restore as review', () => {
  const source = result()
  const frame = { ...source.frame, ...evaluateBottom({ width: 1071, height: 180, bytes: 1000, visual: { x: 860, y: 90, confidence: .9 }, ocr: { confidence: 95, lines: [45, 110].map(y0 => ({ text: 'A'.repeat(29), confidence: 95, bbox: { x0: 90, y0, x1: 690, y1: y0 + 30 } })) } }) }
  source.frame = frame; source.frames.first = frame
  source.overallStatus = frame.overallStatus; source.overallPass = frame.overallPass
  const saved = parseManifest(snapshotResult(source))
  const restored = restoreResult({ id: saved.id, snapshot: saved })
  assert.equal(restored.frame.layout, 'ambiguous')
  assert.equal(restored.overallStatus, 'review')
})
