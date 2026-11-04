import { relaxedSimd, simd } from 'wasm-feature-detect'

const localUrl = path => new URL(`${import.meta.env.BASE_URL}ocr/${path}`, document.baseURI).href
let pendingResources

async function readBytes(response, limit) {
  if (!response.ok) throw new Error('文字识别资源加载失败')
  const reader = response.body.getReader(), chunks = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) { await reader.cancel(); throw new Error('文字识别资源超过大小限制') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}

async function loadResources() {
  const controller = new AbortController(), owned = []
  const timeout = setTimeout(() => controller.abort(new DOMException('文字识别资源加载超时', 'TimeoutError')), 25000)
  const load = async (name, limit) => {
    const response = await fetch(localUrl(name), { signal: controller.signal, credentials: 'omit' })
    if (/text\/html|application\/json/i.test(response.headers.get('content-type') || '')) throw new Error('文字识别资源返回异常内容')
    return readBytes(response, limit)
  }
  try {
    const core = await relaxedSimd() ? 'tesseract-core-relaxedsimd-lstm.wasm.js' : await simd() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js'
    const compressed = typeof DecompressionStream === 'function'
    const [bootstrap, runtime, engine, language] = await Promise.all([
      load('controlled-worker.js?v=7', 32 * 1024), load('worker.min.js', 512 * 1024),
      load(core + (compressed ? '.gz' : ''), 8 * 1024 * 1024), load('eng.traineddata.gz', 4 * 1024 * 1024),
    ])
    const code = compressed && engine[0] === 31 && engine[1] === 139
      ? await readBytes(new Response(new Blob([engine]).stream().pipeThrough(new DecompressionStream('gzip'))), 8 * 1024 * 1024)
      : engine
    const objectUrl = (bytes, type = 'application/javascript') => { const url = URL.createObjectURL(new Blob([bytes], { type })); owned.push(url); return url }
    // Cache immutable public assets only. Each private-image Worker still has a per-job lifetime.
    // Fragments let Tesseract append its expected filenames without changing the Blob resource.
    return { bootstrap: new TextDecoder().decode(bootstrap), workerUrl: objectUrl(runtime), coreUrl: `${objectUrl(code)}#${core}`, languagePath: `${objectUrl(language, 'application/gzip')}#` }
  } catch (error) {
    for (const url of owned) URL.revokeObjectURL(url)
    throw error
  } finally { clearTimeout(timeout); controller.abort() }
}

export function preloadBottomOcr() {
  if (!pendingResources) {
    const pending = loadResources()
    pendingResources = pending
    void pending.catch(() => { if (pendingResources === pending) pendingResources = null })
  }
  return pendingResources
}
