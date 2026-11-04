export const BOTTOM_RULES = Object.freeze({
  version: 'bottom-banner-qc-v1', width: 1071, height: 180, maxBytes: 500000,
  titleOnlyMax: 57, titleMax: 28, subtitleMax: 48, maxLines: 2,
  circle: Object.freeze({ x: 770, y: 0, diameter: 180, centerX: 860, centerY: 90 }),
  ocrMinConfidence: 70,
})

export const BOTTOM_KEYS = ['dimensions', 'fileSize', 'copy', 'lines', 'textPosition', 'composition', 'thumbnail']
const clean = value => String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim()
const count = value => [...clean(value)].length
const number = value => Number.isFinite(value)
const validBox = box => box && ['x0', 'y0', 'x1', 'y1'].every(key => number(box[key])) && box.x1 > box.x0 && box.y1 > box.y0
export const bottomStatus = rows => rows.some(item => item.status === false) ? 'failed' : rows.some(item => item.status == null) ? 'review' : 'passed'

export function evaluateBottom({ width, height, bytes, ocr, visual }) {
  const rules = BOTTOM_RULES
  const textLines = (ocr?.lines || []).filter(item => clean(item.text)).slice().sort((a, b) => (a.bbox?.y0 || 0) - (b.bbox?.y0 || 0))
  const confident = textLines.length > 0 && ocr.confidence >= rules.ocrMinConfidence && textLines.every(item => validBox(item.bbox) && item.confidence >= rules.ocrMinConfidence)
  const english = textLines.every(item => !/[^\u0000-\u024f\u2000-\u206f\u20a0-\u20cf]/u.test(item.text))
  const recognized = confident && english
  const mainHeight = textLines[0] ? textLines[0].bbox?.y1 - textLines[0].bbox?.y0 : 0
  const subHeight = textLines[1] ? textLines[1].bbox?.y1 - textLines[1].bbox?.y0 : 0
  const inSubtitleZone = textLines.length === 2 && textLines[1].bbox?.y0 >= 101 && textLines[1].bbox?.y1 <= 147
  const layout = inSubtitleZone ? (mainHeight > subHeight * 1.2 ? 'titleSubtitle' : 'ambiguous') : 'titleOnly'
  const knownLayout = layout !== 'ambiguous'
  const chars = textLines.map(item => count(item.text))
  const joined = count(textLines.map(item => clean(item.text)).join(''))
  const copyPass = layout === 'titleSubtitle' ? chars[0] <= rules.titleMax && chars[1] <= rules.subtitleMax : joined <= rules.titleOnlyMax
  const reviewText = !english ? '当前字数规范以英语为例；此文字需要人工复核。' : recognized && !knownLayout ? '无法可靠区分两行主标题与主副标题，请人工确认文案样式后复核。' : '文字识别置信度不足，不能可靠判定字数、行数与位置，请人工复核。'
  const dimensions = width === rules.width && height === rules.height
  const positions = recognized && textLines.every((item, index) => {
    const box = item.bbox
    // OCR measures ink bounds, not authored text-box bounds; allow a small raster measurement margin.
    const zone = layout === 'titleSubtitle' ? (index === 0 ? [90, 39, 774, 92] : [90, 107, 738, 141]) : [80, 32, 739, 147]
    return box.x0 >= zone[0] - 6 && box.x0 <= zone[0] + 24 && box.x1 <= zone[2] + 6 && box.y0 >= zone[1] - 6 && box.y1 <= zone[3] + 6
  })
  const center = visual && number(visual.x) && number(visual.y) && visual.confidence >= .5 ? visual : null
  const distance = center ? Math.hypot(center.x - rules.circle.centerX, center.y - rules.circle.centerY) : null
  const firstBox = textLines[0]?.bbox
  const textAnchor = firstBox ? { x: firstBox.x0, y: (firstBox.y0 + firstBox.y1) / 2 } : null
  const make = (key, label, status, metricLabel, metric, detail, recommendation, anchor = null) => ({ key, label, status, metricLabel, metric, detail, recommendation, issue: label, anchor })
  const uiChecks = [
    make('dimensions', '尺寸检测', dimensions, '素材尺寸', `${width}×${height}`, '标准尺寸为 1071×180px，不拉伸或裁切原图来伪装达标。', '按 1071×180px 重新导出'),
    make('fileSize', '文件大小检测', number(bytes) && bytes > 0 && bytes <= rules.maxBytes, '文件大小', `${(bytes / 1000).toFixed(1)}KB`, 'Bottom Banner 素材大小不得超过 500KB（500000 字节）。', '将素材压缩至 500KB 以内'),
    make('copy', '文案字数检测', recognized && knownLayout ? copyPass : null, layout === 'titleSubtitle' ? '主标题 / 副标题' : '主标题字符数', recognized && knownLayout ? (layout === 'titleSubtitle' ? `${chars[0]}/28 · ${chars[1]}/48` : `${joined}/57`) : '需复核', recognized && knownLayout ? (layout === 'titleSubtitle' ? '主标题≤28字符，副标题≤48字符；空格和标点计入。' : '只有主标题时最多57字符；空格和标点计入，换行不计入。') : reviewText, '按纯主标题57字符，或主标题28/副标题48字符精简文案', textAnchor),
    make('lines', '文案行数检测', recognized ? textLines.length <= rules.maxLines : null, '总行数', recognized ? `${textLines.length}/2` : '需复核', recognized ? '纯主标题最多两行；主副标题各一行，总计两行。' : reviewText, '将文案控制在两行以内', textAnchor),
    make('textPosition', '文案位置检测', recognized && knownLayout ? positions : null, '文案样式', recognized && knownLayout ? (layout === 'titleSubtitle' ? '主标题+副标题' : '只有主标题') : '需复核', recognized && knownLayout ? (layout === 'titleSubtitle' ? '主标题起点(90,39)，副标题起点(90,107)，内容不可超出对应文案区域。' : '文案区域为(80,32)至(739,147)，内容不可越界。') : reviewText, '将文字放回规范文案区域，避免与右侧主视觉重叠', textAnchor),
    make('composition', '主视觉构图检测', center ? distance <= 90 : null, '估计重心', center ? `${Math.round(center.x)}, ${Math.round(center.y)}` : '需复核', center ? `估计主体重心距圆心 ${distance.toFixed(1)}px；核心视觉应在圆形区域内居中。圆心(860,90)，半径90px，居中程度请结合预览复核。` : '未找到可靠主体，不以默认重心代替检测；请检查右侧圆形区域的核心视觉。', '将核心视觉移到圆形缩略区内，围绕(860,90)居中', center && { x: center.x, y: center.y }),
    make('thumbnail', '缩略图裁切检测', dimensions ? true : null, '圆形裁切区域', '180×180', '裁切原图(770,0)起的180×180区域并应用圆形蒙版，右侧剩余121px；不将整张图压缩成圆形。', '使用标准尺寸素材核对圆形缩略图中的核心视觉'),
  ]
  const overallStatus = bottomStatus(uiChecks)
  const failed = uiChecks.filter(item => item.status === false)
  const review = uiChecks.filter(item => item.status == null)
  const attention = [...failed, ...review]
  const recommendation = overallStatus === 'passed' ? '当前素材符合 Bottom Banner 的尺寸、大小、文案与圆形视觉区检测标准。' : `${failed.length ? `修改建议：${failed.map(item => item.recommendation).join('；')}。` : ''}${review.length ? `需复核：${review.map(item => item.label).join('、')}。` : ''}`
  return {
    inspectionType: 'bottom', layout, uiChecks, overallStatus, overallPass: overallStatus === 'passed', failed, review,
    recommendation, prompt: attention.length ? `请优化 Bottom Banner，保持1071×180尺寸与500KB以内；${attention.map(item => item.recommendation).join('；')}。圆形主视觉区为x=770、y=0、直径180px。` : '',
    evidence: { ocr: { confidence: ocr?.confidence || 0, lines: textLines.map(({ text, bbox, confidence }) => ({ text: clean(text), bbox, confidence })) }, visual: center ? { x: center.x, y: center.y, confidence: center.confidence, distance } : null },
  }
}

export function bottomPreviewPoint({ x, y }, variant = 'full') {
  const scale = 320 / 375
  if (variant === 'thumbnail') {
    const dx = x - 860, dy = y - 90
    const distance = Math.hypot(dx, dy)
    const bound = distance > 90 ? 90 / distance : 1
    return { x: (308 + (90 + dx * bound) * 59.16 / 180) * scale, y: (667 + (90 + dy * bound) * 59.16 / 180) * scale, outside: distance > 90 }
  }
  return { x: (7 + x * 360.5 / 1071) * scale, y: (655.42871 + y * 60.5882378 / 180) * scale, outside: false }
}

export function findBottomVisual({ width, height, data }, textBoxes = []) {
  if (width !== 1071 || height !== 180 || data.length !== width * height * 4) return null
  const colors = new Map()
  const keyAt = (x, y) => { const i = (y * width + x) * 4; return `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4},${data[i + 3] > 64}` }
  for (let y = 3; y < height; y += 6) for (let x = 1002; x < width - 3; x += 6) {
    const key = keyAt(x, y); colors.set(key, (colors.get(key) || 0) + 1)
  }
  const background = [...colors].sort((a, b) => b[1] - a[1])[0]?.[0].split(',').slice(0, 3).map(value => Number(value) * 16 + 8)
  if (!background) return null
  const step = 3, left = 735, columns = Math.ceil((1050 - left) / step), rows = Math.ceil(height / step)
  const weight = new Float32Array(columns * rows), visited = new Uint8Array(weight.length)
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < columns; gx++) {
    const x = left + gx * step, y = gy * step
    if (textBoxes.some(box => validBox(box) && x >= box.x0 - 2 && x <= box.x1 + 2 && y >= box.y0 - 2 && y <= box.y1 + 2)) continue
    const i = ((gy * step) * width + left + gx * step) * 4
    const difference = Math.hypot(data[i] - background[0], data[i + 1] - background[1], data[i + 2] - background[2])
    if (data[i + 3] > 64 && difference > 45) weight[gy * columns + gx] = difference
  }
  let best = null
  for (let start = 0; start < weight.length; start++) {
    if (!weight[start] || visited[start]) continue
    const queue = [start]; visited[start] = 1
    let area = 0, mass = 0, sx = 0, sy = 0
    for (let q = 0; q < queue.length; q++) {
      const index = queue[q], gx = index % columns, gy = Math.floor(index / columns), w = weight[index]
      area++; mass += w; sx += (left + gx * step) * w; sy += gy * step * w
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = gx + ox, ny = gy + oy, next = ny * columns + nx
        if (nx >= 0 && nx < columns && ny >= 0 && ny < rows && !visited[next] && weight[next]) { visited[next] = 1; queue.push(next) }
      }
    }
    if (area >= 12 && area < weight.length * .8 && (!best || mass > best.mass)) best = { x: sx / mass, y: sy / mass, area: area * step * step, mass, confidence: .8 }
  }
  if (!best) return null
  const { mass, ...result } = best
  return result
}
