import busboy from 'busboy'
import { fileTypeFromBuffer } from 'file-type'
import { HttpError } from './errors.mjs'
import { parseManifest } from './schema.mjs'
import { parseGIF } from 'gifuct-js'

const MAX_FILE = 4 * 1024 * 1024
const MAX_REQUEST = 9 * 1024 * 1024
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp', 'image/tiff'])
const previewTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])

export function readUpload(req) {
  if (Number(req.headers['content-length'] || 0) > MAX_REQUEST) throw new HttpError(413, '归档请求超过大小上限')
  return new Promise((resolve, reject) => {
    let parser
    // busboy emits partsLimit on reaching the count, not only when exceeding it.
    try { parser = busboy({ headers: req.headers, limits: { files: 4, fields: 1, parts: 6, fileSize: MAX_FILE, fieldSize: 128 * 1024 } }) }
    catch { reject(new HttpError(400, '需要有效的 multipart 上传')); return }
    let problem = null
    let raw = null
    let total = 0
    const files = new Map()
    const fail = message => { problem ||= new HttpError(400, message) }
    const countBody = chunk => {
      total += chunk.length
      if (total > MAX_REQUEST) {
        problem = new HttpError(413, '归档请求超过大小上限')
        req.off('data', countBody)
        req.unpipe(parser)
        parser.destroy(problem)
        req.resume()
      }
    }
    req.on('data', countBody)
    req.once('aborted', () => { parser.destroy(); reject(new HttpError(400, '上传已中断')) })
    parser.on('field', (name, value, info) => {
      if (name !== 'manifest' || raw !== null || info.valueTruncated) fail('归档说明缺失、重复或过大')
      else raw = value
    })
    parser.on('file', (name, stream) => {
      // Discarded streams can also emit errors when a multipart request is cut short.
      stream.on('error', () => fail('归档文件读取失败'))
      if (!['original', 'first', 'last', 'thumbnail'].includes(name) || files.has(name)) { fail('归档文件重复或类型错误'); stream.resume(); return }
      const chunks = []
      const file = { bytes: null, type: '' }
      files.set(name, file)
      stream.on('limit', () => { problem = new HttpError(413, '归档帧图超过 4MB 上限') })
      stream.on('data', chunk => {
        if (!problem) chunks.push(chunk)
      })
      stream.on('end', () => { if (!problem) file.bytes = Buffer.concat(chunks) })
    })
    for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit']) parser.on(event, () => fail('归档文件数量超过限制'))
    parser.on('error', () => { req.off('data', countBody); reject(problem || new HttpError(400, '上传数据不完整')) })
    parser.on('close', async () => {
      req.off('data', countBody)
      try {
        if (problem) throw problem
        let data
        try { data = JSON.parse(raw) } catch { throw new HttpError(400, '归档说明格式错误') }
        const manifest = parseManifest(data)
        const expected = manifest.kind === 'video' || manifest.animated ? ['original', 'first', 'last', 'thumbnail'] : ['original', 'first', 'thumbnail']
        if (expected.length !== files.size || expected.some(name => !files.get(name)?.bytes?.length)) throw new HttpError(400, '缺少原文件、缩略图或首尾帧')
        for (const [name, file] of files) {
          let detected
          try { detected = await fileTypeFromBuffer(file.bytes) } catch { /* Invalid binary data is rejected below. */ }
          file.type = detected?.mime || ''
          const allowed = name === 'original' ? (manifest.kind === 'video' ? new Set(['video/mp4']) : imageTypes) : previewTypes
          if (!allowed.has(file.type)) throw new HttpError(400, '原文件或帧图格式不支持归档，请使用 PNG、JPG、WebP、GIF、AVIF 或 MP4')
        }
        const originalLimit = manifest.version === 2 || manifest.kind === 'video' ? 500000 : 300000
        if (files.get('original').bytes.length > originalLimit || files.get('thumbnail').bytes.length > 128 * 1024) throw new HttpError(413, '原文件或缩略图超过归档大小上限')
        if (manifest.version === 2) {
          const original = files.get('original')
          if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(original.type) || (manifest.animated && original.type !== 'image/gif')) throw new HttpError(400, 'Bottom 动画原文件必须是 GIF')
          if (original.type === 'image/gif') {
            let parsed
            try { parsed = parseGIF(original.bytes.buffer.slice(original.bytes.byteOffset, original.bytes.byteOffset + original.bytes.byteLength)) } catch { throw new HttpError(400, 'GIF 内容无效') }
            const frames = parsed.frames.filter(frame => frame.image)
            const count = frames.length
            const { width, height } = parsed.lsd
            let pixels = 0
            if (!width || !height || width * height > 2000000 || !count || count > 300) throw new HttpError(400, 'GIF 尺寸或帧数超过安全上限')
            for (const frame of frames) {
              const box = frame.image.descriptor
              pixels += box.width * box.height
              if (!box.width || !box.height || box.left + box.width > width || box.top + box.height > height || pixels > 25000000) throw new HttpError(400, 'GIF 帧区域或解码量超过安全上限')
            }
            const first = manifest.result.frames.first
            if (count !== manifest.animationFrameCount || manifest.animated !== (count > 1) || parsed.lsd.width !== first.width || parsed.lsd.height !== first.height) throw new HttpError(400, 'GIF 帧数或尺寸与归档检测结果不一致')
          }
        }
        resolve({ manifest, files })
      } catch (error) { reject(error) }
    })
    req.pipe(parser)
  })
}
