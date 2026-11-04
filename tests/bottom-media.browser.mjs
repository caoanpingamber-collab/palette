import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { bottomGif, transparentDisposalGif, partialFirstGif } from './bottom-fixtures.mjs'

test('Bottom local OCR reads real text with coordinates and no external requests', async ({ page }) => {
  test.setTimeout(60000)
  const external = []
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:5194') && !/^(data|blob):/.test(request.url())) external.push(request.url()) })
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const api = await import('/src/lib/bottomMedia.js')
    const canvas = document.createElement('canvas'); canvas.width = 1071; canvas.height = 180
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#621fb7'; ctx.fillRect(0, 0, 1071, 180)
    ctx.font = 'bold 48px Arial'; ctx.fillStyle = '#fff'; ctx.fillText('Create your next video', 90, 82)
    return api.recognizeBottomText(canvas)
  })
  expect(result.lines.map(item => item.text).join(' ')).toMatch(/Create your next video/i)
  expect(result.confidence).toBeGreaterThan(70)
  expect(result.lines[0].bbox.x0).toBeGreaterThan(80)
  expect(external).toEqual([])
})

test('transparent rounded banner separates two-line copy from overlapping artwork', async ({ page }) => {
  const sample = process.env.BOTTOM_OCR_SAMPLE ? `data:image/png;base64,${readFileSync(process.env.BOTTOM_OCR_SAMPLE).toString('base64')}` : null
  await page.goto('/')
  const result = await page.evaluate(async sample => {
    const { recognizeBottomText } = await import('/src/lib/bottomMedia.js')
    const { evaluateBottom } = await import('/src/lib/bottomRules.mjs')
    const canvas = document.createElement('canvas'); canvas.width = 1071; canvas.height = 180
    const ctx = canvas.getContext('2d')
    if (sample) { const img = new Image(); img.src = sample; await img.decode(); ctx.drawImage(img, 0, 0) }
    else {
      ctx.beginPath(); ctx.roundRect(0, 0, 1071, 180, 90); ctx.clip()
      ctx.fillStyle = '#621fb7'; ctx.fillRect(0, 0, 1071, 180)
      ctx.font = 'italic bold 48px Arial'; ctx.fillStyle = '#fff'
      ctx.fillText('Join the AI Video Contest and', 80, 78, 653)
      ctx.fillText('Win Prizes Now!', 80, 134)
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = ['#f9c8ec', '#22dddd', '#f2b130', '#fff'][i]
        ctx.beginPath(); ctx.ellipse(790 + i * 24, 90, 35, 80, .4 * i, 0, Math.PI * 2); ctx.fill()
      }
    }
    const ocr = await recognizeBottomText(canvas)
    const checks = evaluateBottom({ width: 1071, height: 180, bytes: 100000, ocr, visual: null }).uiChecks
    return { ocr, checks: checks.filter(row => ['copy', 'lines', 'textPosition'].includes(row.key)) }
  }, sample)
  expect(result.ocr.lines).toHaveLength(2)
  expect(result.ocr.lines[0].text).toMatch(/^Join the A[Il] Video Contest and$/)
  expect(result.ocr.lines[1].text).toBe('Win Prizes Now!')
  expect(result.ocr.confidence).toBeGreaterThan(90)
  expect(result.checks.map(row => row.status)).toEqual([true, true, true])
  expect(result.checks[0].metric).toBe('44/57')
})

test('OCR initialization survives a same-origin worker URL redirecting to the platform CDN', async ({ page }) => {
  const bootstrap = readFileSync(new URL('../public/ocr/controlled-worker.js', import.meta.url), 'utf8')
  const cdn = createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' }); res.end(bootstrap) })
  await new Promise(resolve => cdn.listen(0, '127.0.0.1', resolve))
  try {
  await page.route('**/ocr/controlled-worker.js?*', route => route.fulfill({ status: 302, headers: { Location: `http://127.0.0.1:${cdn.address().port}/bootstrap.js` } }))
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { recognizeBottomText } = await import('/src/lib/bottomMedia.js')
    const canvas = document.createElement('canvas'); canvas.width = 1071; canvas.height = 180
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#621fb7'; ctx.fillRect(0, 0, 1071, 180)
    ctx.fillStyle = '#fff'; ctx.font = 'bold 48px Arial'; ctx.fillText('Create your next video', 90, 82)
    try { const ocr = await recognizeBottomText(canvas); return { text: ocr.lines.map(line => line.text).join(' '), confidence: ocr.confidence } }
    catch (error) { return { text: '', confidence: 0, error: String(error) } }
  })
  expect(result.error).toBeUndefined()
  expect(result.text).toBe('Create your next video')
  expect(result.confidence).toBeGreaterThan(70)
  } finally { await new Promise(resolve => cdn.close(resolve)) }
})

test('GIF decoder returns distinct composited first/last images without changing playback source', async ({ page }) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bottom-gif-'))
  try {
    const file = path.join(dir, 'two-frames.gif')
    execFileSync(process.env.FFMPEG_PATH || '/opt/homebrew/bin/ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x621fb7:s=1071x180:d=1:r=2', '-vf', "drawbox=x=820:y=40:w=80:h=100:color=cyan:t=fill:enable='lt(t,0.5)',drawbox=x=960:y=40:w=80:h=100:color=cyan:t=fill:enable='gte(t,0.5)'", file])
    await page.goto('/')
    const result = await page.evaluate(async bytes => {
      const { decodeBottomGif } = await import('/src/lib/bottomMedia.js')
      const decoded = await decodeBottomGif(new Uint8Array(bytes).buffer)
      return { count: decoded.frameCount, first: [...decoded.first.getContext('2d').getImageData(850, 80, 1, 1).data], last: [...decoded.last.getContext('2d').getImageData(850, 80, 1, 1).data] }
    }, [...readFileSync(file)])
    expect(result.count).toBe(2)
    expect(result.first).not.toEqual(result.last)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('aborted OCR fails before creating worker or exposing a result', async ({ page }) => {
  await page.goto('/')
  const name = await page.evaluate(async () => {
    const { recognizeBottomText } = await import('/src/lib/bottomMedia.js')
    const abort = new AbortController(); abort.abort()
    try { await recognizeBottomText(document.createElement('canvas'), abort.signal); return 'unexpected' }
    catch (error) { return error.name }
  })
  expect(name).toBe('AbortError')
})

for (const disposal of [2, 3]) test(`GIF disposal ${disposal} restores the previous patch before compositing the final frame`, async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async bytes => {
    const { decodeBottomGif } = await import('/src/lib/bottomMedia.js')
    const decoded = await decodeBottomGif(new Uint8Array(bytes).buffer)
    return [...decoded.last.getContext('2d').getImageData(805, 25, 1, 1).data]
  }, [...bottomGif({ disposal, restore: true })])
  expect(result).toEqual([98, 31, 183, 255])
})

for (const kind of ['tooMany', 'huge']) test(`GIF ${kind} is rejected before excessive decoded allocation`, async ({ page }) => {
  await page.goto('/')
  const message = await page.evaluate(async bytes => {
    const { decodeBottomGif } = await import('/src/lib/bottomMedia.js')
    try { await decodeBottomGif(new Uint8Array(bytes).buffer); return 'unexpected' } catch (error) { return error.message }
  }, [...bottomGif({ [kind]: true })])
  expect(message).toMatch(/尺寸或帧数过大/)
})

test('misplaced copy outside the standard text zone is still recognized', async ({ page }) => {
  await page.goto('/')
  const status = await page.evaluate(async () => {
    const { recognizeBottomText } = await import('/src/lib/bottomMedia.js')
    const { evaluateBottom } = await import('/src/lib/bottomRules.mjs')
    const c = document.createElement('canvas'); c.width = 1071; c.height = 180
    const ctx = c.getContext('2d'); ctx.fillStyle = '#621fb7'; ctx.fillRect(0, 0, 1071, 180)
    ctx.fillStyle = '#fff'; ctx.font = 'bold 48px Arial'; ctx.fillText('Create your next video', 90, 130)
    ctx.font = 'bold 32px Arial'; ctx.fillText('EXTRA', 5, 45)
    const ocr = await recognizeBottomText(c)
    return evaluateBottom({ width: 1071, height: 180, bytes: 1000, ocr, visual: { x: 860, y: 90, confidence: .9 } }).uiChecks.find(row => row.key === 'textPosition').status
  })
  expect(status).not.toBe(true)
})

test('transparent disposal after an opaque first frame matches browser transparency', async ({ page }) => {
  await page.goto('/')
  const pixel = await page.evaluate(async bytes => {
    const { decodeBottomGif } = await import('/src/lib/bottomMedia.js')
    const result = await decodeBottomGif(new Uint8Array(bytes).buffer)
    return [...result.last.getContext('2d').getImageData(15, 15, 1, 1).data]
  }, [...transparentDisposalGif()])
  expect(pixel[3]).toBe(0)
})

test('an initialization failure closes the OCR worker rather than leaving it alive', async ({ page }) => {
  const workers = new Set()
  page.on('worker', worker => { workers.add(worker); worker.on('close', () => workers.delete(worker)) })
  await page.route('**/ocr/eng.traineddata.gz', route => route.fulfill({ status: 404, body: 'missing fixture model' }))
  await page.goto('/')
  await page.evaluate(async () => {
    const { recognizeBottomText } = await import('/src/lib/bottomMedia.js')
    const c = document.createElement('canvas'); c.width = 1071; c.height = 180
    try { await recognizeBottomText(c) } catch { /* Expected initialization failure. */ }
  })
  await expect.poll(() => workers.size, { timeout: 2000 }).toBe(0)
})

test('a partial first GIF frame starts on a transparent canvas', async ({ page }) => {
  await page.goto('/')
  const alpha = await page.evaluate(async bytes => {
    const { decodeBottomGif } = await import('/src/lib/bottomMedia.js')
    const result = await decodeBottomGif(new Uint8Array(bytes).buffer)
    return result.first.getContext('2d').getImageData(0, 0, 1, 1).data[3]
  }, [...partialFirstGif()])
  expect(alpha).toBe(0)
})

test('cancelling OCR during model initialization closes its owned worker', async ({ page }) => {
  const workers = new Set()
  page.on('worker', worker => { workers.add(worker); worker.on('close', () => workers.delete(worker)) })
  let requested
  const modelRequested = new Promise(resolve => { requested = resolve })
  await page.route('**/ocr/eng.traineddata.gz', async route => { requested(); await new Promise(resolve => setTimeout(resolve, 500)); await route.abort() })
  await page.goto('/')
  await page.evaluate(() => {
    window.cancelOcr = new AbortController()
    window.ocrOutcome = import('/src/lib/bottomMedia.js').then(({ recognizeBottomText }) => {
      const c = document.createElement('canvas'); c.width = 1071; c.height = 180
      return recognizeBottomText(c, window.cancelOcr.signal)
    }).then(() => 'unexpected', error => error.name)
  })
  await modelRequested
  expect(await page.evaluate(async () => { window.cancelOcr.abort(); return window.ocrOutcome })).toBe('AbortError')
  await expect.poll(() => workers.size, { timeout: 2000 }).toBe(0)
})
