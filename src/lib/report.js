import { FIGMA_ASSETS } from './figmaAssets'

const DPR = 2

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function pill(ctx, x, y, text, pass) {
  ctx.save()
  ctx.fillStyle = pass == null ? 'rgba(194,138,21,.12)' : pass ? 'rgba(0,174,112,.12)' : 'rgba(255,97,99,.12)'
  rounded(ctx, x, y, pass == null ? 41 : pass ? 30 : 41, 18, 5)
  ctx.fill()
  ctx.fillStyle = pass == null ? '#986c0d' : pass ? '#00ae70' : '#ff3436'
  ctx.font = '500 11px "PingFang SC", sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + 4, y + 9)
  ctx.restore()
}

function text(ctx, value, x, y, opts = {}) {
  ctx.save()
  ctx.fillStyle = opts.color || '#111827'
  ctx.font = opts.font || '12px "PingFang SC", sans-serif'
  ctx.textBaseline = opts.baseline || 'top'
  ctx.globalAlpha = opts.alpha == null ? 1 : opts.alpha
  ctx.fillText(value, x, y)
  ctx.restore()
}

function wrapText(ctx, value, x, y, maxWidth, lineHeight, maxLines = Infinity) {
  const chars = String(value || '').split('')
  let line = ''
  let lines = 0
  for (let i = 0; i < chars.length; i += 1) {
    const next = line + chars[i]
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight)
      line = chars[i]
      lines += 1
      if (lines >= maxLines) return y + lines * lineHeight
    } else {
      line = next
    }
  }
  if (line && lines < maxLines) {
    ctx.fillText(line, x, y + lines * lineHeight)
    lines += 1
  }
  return y + lines * lineHeight
}

function loadAsset(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function drawLogo(ctx, x, y) {
  try {
    const logo = await loadAsset(FIGMA_ASSETS.logo)
    ctx.drawImage(logo, x, y, 94.617, 24)
    return
  } catch {
    // Fall back to a simple text mark if the exported Figma asset cannot load.
  }
  ctx.save()
  ctx.fillStyle = '#111827'
  rounded(ctx, x, y, 24, 24, 7)
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2
  rounded(ctx, x + 7, y + 7, 10, 10, 3)
  ctx.stroke()
  ctx.fillStyle = '#111827'
  ctx.font = '600 16px "CapCut Sans Display", sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText('CapCut', x + 32, y + 12)
  ctx.restore()
}

async function drawDecor(ctx, h) {
  try {
    const star = await loadAsset(FIGMA_ASSETS.bgStar)
    ctx.save()
    ctx.globalAlpha = .3
    ctx.translate(320, -50)
    ctx.rotate(-0.3916)
    ctx.drawImage(star, 0, 0, 519, 519)
    ctx.restore()
    ctx.save()
    ctx.globalAlpha = .3
    ctx.translate(-260, h - 230)
    ctx.rotate(-0.3564)
    ctx.drawImage(star, 0, 0, 519, 519)
    ctx.restore()
    return
  } catch {
    // Fall back to CSS-like gradients if the exported Figma background is unavailable.
  }
  const g1 = ctx.createLinearGradient(80, 0, 420, 360)
  g1.addColorStop(0, '#baf0ff')
  g1.addColorStop(.5, '#6ea8ff')
  g1.addColorStop(1, '#4d63ff')
  ctx.save()
  ctx.globalAlpha = .22
  ctx.translate(320, -50)
  ctx.rotate(-0.38)
  ctx.fillStyle = g1
  rounded(ctx, 0, 0, 520, 520, 150)
  ctx.fill()
  ctx.restore()

  const g2 = ctx.createLinearGradient(-160, h - 120, 240, h + 280)
  g2.addColorStop(0, '#baf0ff')
  g2.addColorStop(.5, '#90d5ff')
  g2.addColorStop(1, '#6a7cff')
  ctx.save()
  ctx.globalAlpha = .18
  ctx.translate(-260, h - 230)
  ctx.rotate(-0.35)
  ctx.fillStyle = g2
  rounded(ctx, 0, 0, 520, 520, 150)
  ctx.fill()
  ctx.restore()
}

function drawReportRows(ctx, frame, startY, includeDetails) {
  let y = startY
  for (const item of frame.uiChecks) {
    text(ctx, item.label, 44, y + 2, { color: '#111827', alpha: .5 })
    pill(ctx, 124, y + 1, item.status ? '通过' : '不通过', item.status)

    if (item.metrics) {
      let yy = y
      for (const metric of item.metrics) {
        text(ctx, metric.label, 172, yy + 2, { color: '#111827' })
        text(ctx, metric.value, 304, yy, { color: '#000', font: '700 14px "Floane", "CapCut Sans Display", serif' })
        yy += 28
      }
      y += Math.max(60, item.metrics.length * 28 + 16)
    } else {
      text(ctx, item.metricLabel, 232, y + 2, { color: '#111827' })
      text(ctx, item.metric, 312, y, { color: '#000', font: '700 14px "Floane", "CapCut Sans Display", serif' })
      y += 60
    }

    if (includeDetails && !item.status) {
      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,.04)'
      rounded(ctx, 44, y - 18, 296, 74, 12)
      ctx.fill()
      ctx.fillStyle = '#111827'
      ctx.globalAlpha = .68
      ctx.font = '12px "PingFang SC", sans-serif'
      wrapText(ctx, item.detail || item.recommendation, 56, y - 6, 260, 20, 3)
      ctx.restore()
      y += 82
    }

    ctx.save()
    ctx.strokeStyle = 'rgba(0,0,0,.08)'
    ctx.beginPath()
    ctx.moveTo(44, y - 1)
    ctx.lineTo(340, y - 1)
    ctx.stroke()
    ctx.restore()
  }
  return y
}

export async function exportReport({ result, frame, signal }) {
  if (result.inspectionType === 'bottom') return exportBottomReport({ result, frame, signal })
  signal?.throwIfAborted()
  if (document.fonts?.ready) await document.fonts.ready
  signal?.throwIfAborted()

  const passed = Boolean(result.overallPass)
  const W = 408
  const H = passed ? 552 : 1178
  const canvas = document.createElement('canvas')
  canvas.width = W * DPR
  canvas.height = H * DPR
  const ctx = canvas.getContext('2d')
  ctx.scale(DPR, DPR)

  ctx.fillStyle = '#f1f1f1'
  ctx.fillRect(0, 0, W, H)
  await drawDecor(ctx, H)
  await drawLogo(ctx, 157, 18)

  const cardH = H - 84
  ctx.fillStyle = '#fff'
  ctx.fillRect(24, 60, 360, cardH)

  ctx.save()
  ctx.translate(44, 80)
  ctx.transform(1, 0, -0.12, 0.98, 0, 0)
  ctx.fillStyle = '#000'
  ctx.font = '700 20px "Floane", "CapCut Sans Display", serif'
  ctx.fillText(passed ? 'Approved' : 'Not Passed', 0, 0)
  ctx.restore()

  ctx.fillStyle = '#111827'
  ctx.globalAlpha = .5
  ctx.font = '12px "PingFang SC", sans-serif'
  const desc = passed
    ? '头部banner已通过冷色相册检测、chroma色感检测、WCAG对比度检测、画面构图重心检测'
    : result.recommendation
  wrapText(ctx, desc, 44, 112, 320, 20, passed ? 2 : 4)
  ctx.globalAlpha = 1

  let y = passed ? 164 : 214
  if (!passed && result.prompt) {
    ctx.fillStyle = 'rgba(0,0,0,.04)'
    rounded(ctx, 44, 144, 296, 58, 12)
    ctx.fill()
    text(ctx, 'Prompt', 56, 154, { alpha: .45 })
    ctx.fillStyle = '#111827'
    ctx.font = '12px "PingFang SC", sans-serif'
    wrapText(ctx, result.prompt, 56, 174, 260, 18, 2)
  }

  y = drawReportRows(ctx, frame, y, !passed)

  if (!passed && frame.palette?.length) {
    const barX = 44
    const barY = Math.min(H - 96, y + 12)
    const total = frame.palette.slice(0, 4).reduce((sum, color) => sum + color.ratio, 0) || 1
    let x = barX
    for (const color of frame.palette.slice(0, 4)) {
      const w = Math.max(18, 296 * color.ratio / total)
      ctx.fillStyle = color.hex
      ctx.fillRect(x, barY, w, 18)
      x += w
    }
    text(ctx, `卡片变量色 V = ${frame.VHex}`, 44, barY + 30, { color: '#111827', alpha: .55 })
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .92))
  signal?.throwIfAborted()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = passed ? 'banner-report-approved.jpg' : 'banner-report-not-passed.jpg'
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function reportLines(ctx, value, width) {
  const lines = []; let line = ''
  for (const char of String(value || '')) {
    if (line && ctx.measureText(line + char).width > width && !/^[，。；：！？、,.!?;:]$/.test(char)) { lines.push(line); line = char }
    else line += char
  }
  if (line) lines.push(line)
  return lines
}

async function exportBottomReport({ result, frame, signal }) {
  signal?.throwIfAborted()
  if (document.fonts?.ready) await document.fonts.ready
  signal?.throwIfAborted()
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')
  ctx.font = '12px "PingFang SC", sans-serif'
  const blocks = frame.uiChecks.map(item => ({ item, lines: reportLines(ctx, item.detail || item.recommendation, 296) }))
  const advice = reportLines(ctx, result.recommendation, 320)
  const startY = 154 + advice.length * 20
  const H = startY + blocks.reduce((sum, block) => sum + 70 + block.lines.length * 18, 0) + 54
  canvas.width = 408 * DPR; canvas.height = H * DPR; ctx.scale(DPR, DPR)
  ctx.fillStyle = '#f1f1f1'; ctx.fillRect(0, 0, 408, H)
  await drawLogo(ctx, 157, 18)
  signal?.throwIfAborted()
  ctx.fillStyle = '#fff'; ctx.fillRect(24, 60, 360, H - 84)
  const title = result.overallStatus === 'passed' ? 'Approved' : result.overallStatus === 'review' ? 'Needs Review' : 'Not Passed'
  text(ctx, title, 44, 80, { color: '#000', font: 'italic 700 20px "Floane", serif' })
  text(ctx, `Bottom Banner · ${result.animated ? `${result.activeFrame === 'last' ? '尾帧' : '首帧'}（首尾抽样）` : '静态素材'} · 规则 bottom-banner-qc-v1`, 44, 111, { alpha: .5, font: '11px "PingFang SC", sans-serif' })
  advice.forEach((line, index) => text(ctx, line, 44, 136 + index * 20, { alpha: .7 }))
  let y = startY
  for (const { item, lines } of blocks) {
    text(ctx, item.label, 44, y, { alpha: .5 })
    pill(ctx, 162, y - 1, item.status == null ? '需复核' : item.status ? '通过' : '不通过', item.status)
    text(ctx, item.metricLabel, 44, y + 27, { alpha: .65 })
    ctx.save(); ctx.textAlign = 'right'; text(ctx, item.metric, 340, y + 26, { color: '#000', font: '700 14px "Floane", serif' }); ctx.restore()
    lines.forEach((line, index) => text(ctx, line, 44, y + 52 + index * 18, { alpha: .6, font: '11px "PingFang SC", sans-serif' }))
    y += 70 + lines.length * 18
    ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.beginPath(); ctx.moveTo(44, y - 9); ctx.lineTo(340, y - 9); ctx.stroke()
  }
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .92))
  signal?.throwIfAborted()
  if (!blob) throw new Error('报告导出失败')
  const url = URL.createObjectURL(blob), anchor = document.createElement('a')
  anchor.href = url; anchor.download = `bottom-banner-report-${result.overallStatus}.jpg`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
