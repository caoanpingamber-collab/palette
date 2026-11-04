import test from 'node:test'
import assert from 'node:assert/strict'

const api = await import('../src/lib/bottomRules.mjs').catch(() => ({}))
const line = (text, y0 = 40, height = 42) => ({ text, confidence: 96, bbox: { x0: 90, y0, x1: 690, y1: y0 + height } })
const good = (overrides = {}) => ({ width: 1071, height: 180, bytes: 500000, ocr: { confidence: 96, lines: [line('Enter the AI Video Contest')] }, visual: { x: 860, y: 90, confidence: .9 }, ...overrides })
const row = (result, key) => result.uiChecks.find(item => item.key === key)

test('Bottom exposes independent rules without Header or typography checks', () => {
  assert.equal(typeof api.evaluateBottom, 'function', 'Bottom rule evaluator is not implemented')
  const result = api.evaluateBottom(good())
  assert.equal(result.overallStatus, 'passed')
  assert.deepEqual(result.uiChecks.map(item => item.key), ['dimensions', 'fileSize', 'copy', 'lines', 'textPosition', 'composition', 'thumbnail'])
  assert.equal(result.uiChecks.some(item => /字体|字号|chroma|冷色|卡片/.test(JSON.stringify(item))), false)
  assert.deepEqual(api.BOTTOM_RULES.circle, { x: 770, y: 0, diameter: 180, centerX: 860, centerY: 90 })
})

test('dimensions and decimal byte boundary are exact', () => {
  assert.equal(row(api.evaluateBottom(good()), 'fileSize').status, true)
  assert.equal(row(api.evaluateBottom(good({ bytes: 500001 })), 'fileSize').status, false)
  assert.equal(row(api.evaluateBottom(good({ width: 1072 })), 'dimensions').status, false)
  assert.equal(row(api.evaluateBottom(good({ height: 181 })), 'dimensions').status, false)
})

test('title-only English limit is 57 including spaces and punctuation, with at most two lines', () => {
  const check = text => api.evaluateBottom(good({ ocr: { confidence: 95, lines: [line(text)] } }))
  assert.equal(row(check('A'.repeat(57)), 'copy').status, true)
  assert.equal(row(check('A'.repeat(58)), 'copy').status, false)
  const two = api.evaluateBottom(good({ ocr: { confidence: 96, lines: [line('A'.repeat(29)), line('B'.repeat(28), 97)] } }))
  assert.equal(two.layout, 'titleOnly')
  assert.equal(row(two, 'copy').status, true)
  assert.equal(row(two, 'lines').status, true)
  const three = api.evaluateBottom(good({ ocr: { confidence: 96, lines: [line('one'), line('two', 87), line('three', 129)] } }))
  assert.equal(row(three, 'lines').status, false)
})

test('ambiguous title/subtitle evidence cannot pass under the more permissive interpretation', () => {
  const result = api.evaluateBottom(good({ ocr: { confidence: 95, lines: [line('A'.repeat(29), 45, 30), line('B'.repeat(28), 110, 30)] } }))
  assert.equal(row(result, 'copy').status, null)
  assert.equal(result.overallStatus, 'review')
})

test('title and subtitle English limits are independent at 28 and 48 characters', () => {
  const check = (main, sub) => api.evaluateBottom(good({ ocr: { confidence: 95, lines: [line(main), line(sub, 110, 26)] } }))
  const valid = check('A'.repeat(28), 'B'.repeat(48))
  assert.equal(valid.layout, 'titleSubtitle')
  assert.equal(row(valid, 'copy').status, true)
  assert.equal(row(check('A'.repeat(29), 'B'.repeat(48)), 'copy').status, false)
  assert.equal(row(check('A'.repeat(28), 'B'.repeat(49)), 'copy').status, false)
})

test('uncertain or unsupported OCR never fabricates a pass or a missing-text failure', () => {
  for (const ocr of [null, { confidence: 0, lines: [] }, { confidence: 30, lines: [line('hello')] }, { confidence: 95, lines: [line('中文示例')] }]) {
    const result = api.evaluateBottom(good({ ocr }))
    assert.equal(row(result, 'copy').status, null)
    assert.equal(result.overallStatus, 'review')
    assert.equal(result.overallPass, false)
  }
})

test('text outside its authored zone fails without imposing font detection', () => {
  const text = line('A good title')
  text.bbox = { x0: 5, y0: 4, x1: 660, y1: 170 }
  assert.equal(row(api.evaluateBottom(good({ ocr: { confidence: 95, lines: [text] } })), 'textPosition').status, false)
})

test('subject location uses the actual circle and missing visual evidence needs review', () => {
  assert.equal(row(api.evaluateBottom(good({ visual: { x: 950, y: 90, confidence: .9 } })), 'composition').status, true)
  assert.equal(row(api.evaluateBottom(good({ visual: { x: 951, y: 90, confidence: .9 } })), 'composition').status, false)
  assert.equal(row(api.evaluateBottom(good({ visual: null })), 'composition').status, null)
})

test('saliency excludes left-side copy and does not substitute a fake center on uniform material', () => {
  const width = 1071, height = 180
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    data.set([98, 31, 183, 255], i)
    if (x > 80 && x < 680 && y > 40 && y < 70) data.set([255, 255, 255, 255], i)
    if ((x - 860) ** 2 + (y - 90) ** 2 < 50 ** 2) data.set([20, 230, 220, 255], i)
  }
  const visual = api.findBottomVisual({ width, height, data })
  assert.ok(visual)
  assert.ok(Math.abs(visual.x - 860) < 5)
  assert.ok(Math.abs(visual.y - 90) < 5)
  data.fill(0)
  assert.equal(api.findBottomVisual({ width, height, data }), null)
})

test('markers map banner coordinates into the full and exact circular Figma slots', () => {
  const full = api.bottomPreviewPoint({ x: 860, y: 90 }, 'full')
  assert.ok(Math.abs(full.x - (7 + 860 * 360.5 / 1071) * 320 / 375) < .01)
  const crop = api.bottomPreviewPoint({ x: 860, y: 90 }, 'thumbnail')
  assert.ok(Math.abs(crop.x - (308 + 59.16 / 2) * 320 / 375) < .01)
  assert.ok(Math.abs(crop.y - (667 + 59.16 / 2) * 320 / 375) < .01)
  assert.equal(api.bottomPreviewPoint({ x: 700, y: 90 }, 'thumbnail').outside, true)
})

test('OCR text boxes are excluded before searching the right-side subject', () => {
  const width = 1071, height = 180, data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(x >= 735 && x < 774 && y >= 45 && y < 85 ? [255, 255, 255, 255] : [98, 31, 183, 255], (y * width + x) * 4)
  assert.equal(api.findBottomVisual({ width, height, data }, [{ x0: 730, y0: 40, x1: 780, y1: 90 }]), null)
})
