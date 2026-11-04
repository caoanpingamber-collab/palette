import { BOTTOM_RULES, bottomStatus, evaluateBottom, findBottomVisual } from './bottomRules.mjs'
import { preloadBottomOcr } from './bottomOcrResources'

export { preloadBottomOcr }
const canvasOf = (width, height) => Object.assign(document.createElement('canvas'), { width, height })
const copyCanvas = source => { const canvas = canvasOf(source.width, source.height); canvas.getContext('2d').drawImage(source, 0, 0); return canvas }
const checkAbort = signal => signal?.throwIfAborted()

function abortable(promise, signal) {
  checkAbort(signal)
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || new DOMException('已取消', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

async function withOcrWorker(task, signal) {
  checkAbort(signal)
  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(() => controller.abort(new DOMException('文字识别超时，请人工复核', 'TimeoutError')), 25000)
  const token = crypto.randomUUID()
  const channel = new BroadcastChannel(`bottom-ocr-${token}`)
  let worker, bootstrapUrl, disposed = false
  try {
    const [{ createWorker }, resources] = await abortable(Promise.all([import('tesseract.js'), preloadBottomOcr()]), controller.signal)
    checkAbort(controller.signal)
    const options = JSON.stringify({ job: token, script: resources.workerUrl })
    bootstrapUrl = URL.createObjectURL(new Blob([`self.__bottomOcr=${options};\n`, resources.bootstrap], { type: 'application/javascript' }))
    const pending = createWorker('eng', 1, {
      workerPath: bootstrapUrl, corePath: resources.coreUrl, langPath: resources.languagePath,
      workerBlobURL: false, cacheMethod: 'none', logger: () => {},
      errorHandler: () => controller.abort(new Error('文字识别加载失败，请人工复核')),
    }).then(value => { if (disposed) void value.terminate(); else worker = value; return value })
    worker = await abortable(pending, controller.signal)
    await abortable(worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '0' }), controller.signal)
    return await task(worker, controller.signal)
  } finally {
    disposed = true; clearTimeout(timeout); signal?.removeEventListener('abort', abort)
    channel.postMessage('close'); channel.close()
    if (worker) await worker.terminate()
    if (bootstrapUrl) URL.revokeObjectURL(bootstrapUrl)
  }
}

function ocrSource(canvas) {
  const { width, height } = canvas
  const { data } = canvas.getContext('2d').getImageData(0, 0, width, height)
  const colors = new Map()
  let samples = 0, opaque = 0, luminance = 0
  for (let y = 0; y < height; y += 4) for (let x = 0; x < Math.min(width, BOTTOM_RULES.circle.x); x += 4) {
    samples++
    const i = (y * width + x) * 4
    if (data[i + 3] < 240) continue
    opaque++; luminance += .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]
    const key = (data[i] >> 4) * 256 + (data[i + 1] >> 4) * 16 + (data[i + 2] >> 4)
    const color = colors.get(key) || { count: 0, rgb: [data[i], data[i + 1], data[i + 2]] }
    color.count++; colors.set(key, color)
  }
  const dominant = [...colors.values()].sort((a, b) => b.count - a.count)[0]
  const matte = opaque > samples / 2 ? dominant.rgb : Array(3).fill(opaque && luminance / opaque > 128 ? 0 : 255)
  const source = canvasOf(width, height), ctx = source.getContext('2d')
  // Match the surrounding background so transparent rounded corners do not become OCR glyphs.
  ctx.fillStyle = `rgb(${matte.join(',')})`; ctx.fillRect(0, 0, width, height); ctx.drawImage(canvas, 0, 0)
  return source
}

const insideVisual = ({ bbox }) => bbox.x0 >= BOTTOM_RULES.circle.x && Math.hypot((bbox.x0 + bbox.x1) / 2 - 860, (bbox.y0 + bbox.y1) / 2 - 90) <= 90

function textLine(line, confidence, left, scale) {
  const box = bbox => ({ x0: bbox.x0 / scale + left, y0: bbox.y0 / scale, x1: bbox.x1 / scale + left, y1: bbox.y1 / scale })
  const words = (line.words || []).map(word => ({ text: word.text?.trim() || '', confidence: word.confidence ?? confidence, bbox: box(word.bbox) })).filter(word => word.text)
  if (!words.length) return { text: line.text.trim(), confidence: line.confidence ?? confidence, bbox: box(line.bbox) }
  const peers = words.filter(word => word.confidence >= BOTTOM_RULES.ocrMinConfidence && word.bbox.x0 < 739 && /[a-z0-9]/i.test(word.text))
  const heights = peers.map(word => word.bbox.y1 - word.bbox.y0).sort((a, b) => a - b)
  const medianHeight = heights[Math.floor(heights.length / 2)]
  const kept = words.filter(word => {
    if (insideVisual(word)) return false
    // Artwork can become oversized punctuation; uncertain copy words still require review.
    const ornament = word.confidence < BOTTOM_RULES.ocrMinConfidence && word.bbox.x0 >= 739 && !/[a-z0-9]/i.test(word.text)
    return !ornament || (medianHeight && word.bbox.y1 - word.bbox.y0 <= medianHeight * 1.8)
  })
  if (!kept.length) return null
  return {
    text: kept.map(word => word.text).join(' '), confidence: Math.min(...kept.map(word => word.confidence)),
    bbox: { x0: Math.min(...kept.map(word => word.bbox.x0)), y0: Math.min(...kept.map(word => word.bbox.y0)), x1: Math.max(...kept.map(word => word.bbox.x1)), y1: Math.max(...kept.map(word => word.bbox.y1)) },
  }
}

async function readText(canvas, worker, signal) {
  checkAbort(signal)
  const scale = 2
  const source = ocrSource(canvas)
  const allLines = []
  for (const { left, width } of [{ left: 0, width: 790 }, { left: 790, width: 281 }]) {
    const height = 180
    const crop = canvasOf(width * scale, height * scale)
    const ctx = crop.getContext('2d')
    ctx.drawImage(source, left, 0, width, height, 0, 0, crop.width, crop.height)
    await abortable(worker.setParameters({ tessedit_pageseg_mode: '11' }), signal)
    const { data } = await abortable(worker.recognize(crop, {}, { blocks: true, text: true }), signal)
    const lines = (data.blocks || []).flatMap(block => block.paragraphs || []).flatMap(paragraph => paragraph.lines || []).filter(line => line.text?.trim()).map(line => textLine(line, data.confidence ?? 0, left, scale)).filter(Boolean)
    allLines.push(...lines)
  }
  const lines = allLines.filter(line => !insideVisual(line))
  return { confidence: lines.length ? lines.reduce((sum, line) => sum + line.confidence, 0) / lines.length : 0, lines, allLines }
}

export async function recognizeBottomText(canvas, signal) {
  return withOcrWorker((worker, jobSignal) => readText(canvas, worker, jobSignal), signal)
}

export async function decodeBottomGif(buffer, { signal } = {}) {
  checkAbort(signal)
  if (buffer.byteLength > BOTTOM_RULES.maxBytes || buffer.byteLength < 13) throw new Error('GIF 文件大小或内容不符合要求')
  const { parseGIF, decompressFrame } = await import('gifuct-js')
  const parsed = parseGIF(buffer)
  const { width, height } = parsed.lsd
  const frames = parsed.frames.filter(frame => frame.image)
  if (!width || !height || width * height > 2000000 || !frames.length || frames.length > 300) throw new Error('GIF 尺寸或帧数过大，请压缩后重新上传')
  let pixels = 0
  for (const frame of frames) {
    const box = frame.image.descriptor
    pixels += box.width * box.height
    if (!box.width || !box.height || box.left + box.width > width || box.top + box.height > height || pixels > 25000000) throw new Error('GIF 解码量超过安全上限，请缩短动画')
  }
  const canvas = canvasOf(width, height), ctx = canvas.getContext('2d', { willReadFrequently: true })
  const patchCanvas = canvasOf(1, 1)
  let previous = null, restore = null, first = null
  const background = parsed.gct?.[parsed.lsd.backgroundColorIndex]
  const clearPatch = ({ dims, transparentIndex }) => {
    ctx.clearRect(dims.left, dims.top, dims.width, dims.height)
    if (background && transparentIndex === undefined) { ctx.fillStyle = `rgb(${background.join(',')})`; ctx.fillRect(dims.left, dims.top, dims.width, dims.height) }
  }
  for (let i = 0; i < frames.length; i++) {
    checkAbort(signal)
    if (previous?.disposalType === 2) clearPatch(previous)
    if (previous?.disposalType === 3 && restore) ctx.putImageData(restore, 0, 0)
    const current = decompressFrame(frames[i], parsed.gct, true)
    restore = current.disposalType === 3 ? ctx.getImageData(0, 0, width, height) : null
    patchCanvas.width = current.dims.width; patchCanvas.height = current.dims.height
    patchCanvas.getContext('2d').putImageData(new ImageData(current.patch, current.dims.width, current.dims.height), 0, 0)
    ctx.drawImage(patchCanvas, current.dims.left, current.dims.top)
    if (i === 0) first = copyCanvas(canvas)
    previous = current
    if (i % 8 === 7) await new Promise(resolve => setTimeout(resolve, 0))
  }
  return { first, last: copyCanvas(canvas), frameCount: frames.length }
}

async function loadImage(src, signal) {
  checkAbort(signal)
  const image = new Image()
  const ready = new Promise((resolve, reject) => { image.onload = () => resolve(image); image.onerror = () => reject(new Error('图片解码失败')); image.src = src })
  return signal ? abortable(ready, signal) : ready
}

export async function analyzeBottomFile(file, { signal } = {}) {
  checkAbort(signal)
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Bottom Banner 仅支持 PNG、JPG、WebP 或 GIF')
  if (file.size > BOTTOM_RULES.maxBytes) throw new Error('Bottom Banner 素材超过 500KB，请压缩后重新上传')
  const mediaUrl = URL.createObjectURL(file)
  try {
    let decoded
    if (file.type === 'image/gif') decoded = await decodeBottomGif(await file.arrayBuffer(), { signal })
    else {
      const img = await loadImage(mediaUrl, signal)
      if (img.naturalWidth * img.naturalHeight > 20000000) throw new Error('图片尺寸过大，请按1071×180重新导出')
      const first = canvasOf(img.naturalWidth, img.naturalHeight); first.getContext('2d').drawImage(img, 0, 0)
      decoded = { first, last: first, frameCount: 1 }
    }
    const animated = decoded.frameCount > 1
    const canvases = animated ? [decoded.first, decoded.last] : [decoded.first]
    let recognized = canvases.map(() => null)
    if (decoded.first.width === 1071 && decoded.first.height === 180) {
      try { recognized = await withOcrWorker(async (worker, jobSignal) => { const results = []; for (const canvas of canvases) results.push(await readText(canvas, worker, jobSignal)); return results }, signal) }
      catch (error) { checkAbort(signal); if (error.name !== 'TimeoutError' && error.name !== 'AbortError') console.warn('Bottom Banner 文字识别不可用，将提示人工复核') }
    }
    const results = []
    for (let i = 0; i < canvases.length; i++) {
      checkAbort(signal)
      const canvas = canvases[i], width = canvas.width, height = canvas.height
      const textBoxes = (recognized[i]?.allLines || recognized[i]?.lines || []).filter(line => line.confidence >= BOTTOM_RULES.ocrMinConfidence).map(line => line.bbox)
      const visual = width === 1071 && height === 180 ? findBottomVisual(canvas.getContext('2d').getImageData(0, 0, width, height), textBoxes) : null
      const src = canvas.toDataURL('image/png')
      results.push({ ...evaluateBottom({ width, height, bytes: file.size, ocr: recognized[i], visual }), width, height, src, img: await loadImage(src, signal), palette: [] })
    }
    const overallStatus = bottomStatus(results.flatMap(frame => frame.uiChecks))
    const first = results[0]
    return {
      inspectionType: 'bottom', kind: 'image', animated, animationFrameCount: decoded.frameCount,
      mediaUrl, sourceUrl: first.src, fileName: file.name, frame: first,
      frames: { first, ...(animated ? { last: results[1] } : {}) }, activeFrame: animated ? 'first' : null,
      overallStatus, overallPass: overallStatus === 'passed', checks: first.uiChecks, palette: [],
      recommendation: [...new Set(results.map(frame => frame.recommendation))].join(' '),
      prompt: [...new Set(results.map(frame => frame.prompt).filter(Boolean))].join(' '),
    }
  } catch (error) { URL.revokeObjectURL(mediaUrl); throw error }
}
