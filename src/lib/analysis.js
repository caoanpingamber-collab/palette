import { coldRatio, chromaScore, hx, rgb2hsb } from './color'

export const LIMITS = {
  imageBytes: 300 * 1000,
  videoBytes: 500 * 1000,
  coldLo: 160,
  coldHi: 270,
  coldMin: 60,
  chromaMin: 45,
  clutterMax: 8,
}

const pct = (n, digits = 1) => (n == null || Number.isNaN(n) ? '—' : `${Number(n).toFixed(digits)}%`)
const num = (n) => (n == null || Number.isNaN(n) ? '—' : String(Math.round(n)))
const ratioFromVal = (val) => {
  const m = String(val || '').match(/[\d.]+/)
  return m ? Number(m[0]) : null
}

export function colorHex(rgb) {
  return rgb ? hx(rgb[0], rgb[1], rgb[2]) : '#BFE3FF'
}

function issueText(key) {
  return {
    hue: '冷色占比不足',
    chroma: '画面太灰',
    contrast: '对比度不够',
    comp: '视觉重心不在范围内',
    clutter: '主图边缘杂乱',
  }[key] || '未通过'
}

function buildPrompt(failed, frame) {
  if (!failed.length) return ''
  const points = failed.map((item) => item.issue).join('、')
  const main = frame.palette?.[0]
  const color = main ? `主体色 ${main.hex}` : '主体色'
  return `请优化首页 Header Banner，使${color}保持冷色调并提升画面清晰度；重点修复${points}，保证标题、卡片与背景有足够对比度，主体视觉重心位于右侧安全区域，减少边缘干扰元素。`
}

function buildRecommendation(failed) {
  if (!failed.length) return '当前素材符合 Header Banner 检测标准。'
  return `修改建议：${failed.map((item) => item.recommendation).join('；')}。`
}

export function buildFrameResult({ img, src, data, check }) {
  const cold = coldRatio(data.clusters, data.total, LIMITS.coldLo, LIMITS.coldHi)
  const chroma = chromaScore(data.clusters, data.total)
  const title = check.checks.find((c) => c.key === 'title')
  const cardTop = check.checks.find((c) => c.key === 'cardtop')
  const cardBottom = check.checks.find((c) => c.key === 'cardbot')
  const comp = check.checks.find((c) => c.key === 'comp')
  const contrastPass = Boolean(title?.pass && cardTop?.pass && cardBottom?.pass)
  const clutter = check.clutter
  const clutterPass = !clutter || clutter.secPct <= LIMITS.clutterMax
  const dominant = data.palette?.[0]
  const dominantHue = dominant ? rgb2hsb(dominant.rgb[0], dominant.rgb[1], dominant.rgb[2])[0] : null

  const uiChecks = [
    {
      key: 'hue',
      label: '色相检测',
      status: cold != null && cold >= LIMITS.coldMin,
      metricLabel: '区域冷色占比',
      metric: pct(cold),
      issue: issueText('hue'),
      recommendation: `提高蓝绿冷色区域占比到 ${LIMITS.coldMin}% 以上`,
      detail: `主体色 H=${dominantHue == null ? '—' : Math.round(dominantHue)}，冷色标准为 ${LIMITS.coldLo} ≤ H ≤ ${LIMITS.coldHi}`,
    },
    {
      key: 'chroma',
      label: '灰度明度检测',
      status: chroma != null && chroma >= LIMITS.chromaMin,
      metricLabel: '色感chroma值',
      metric: num(chroma),
      issue: issueText('chroma'),
      recommendation: `提升主体色彩度，避免整体发灰发白，chroma 需不低于 ${LIMITS.chromaMin}`,
      detail: `主体色的等色彩感线 chroma=${num(chroma)}，达标线为 chroma≥${LIMITS.chromaMin}`,
    },
    {
      key: 'contrast',
      label: '对比度检测',
      status: contrastPass,
      issue: issueText('contrast'),
      recommendation: '增强文字、卡片与 banner 背景的明暗差',
      metrics: [
        { target: 'title', label: '标题vs背景', value: title?.val || '—', pass: Boolean(title?.pass), swatches: title?.sw || [] },
        { target: 'cardTop', label: '卡片上缘vs背景', value: cardTop?.val || '—', pass: Boolean(cardTop?.pass), swatches: cardTop?.sw || [] },
        { target: 'cardBottom', label: '卡片下缘vs背景', value: cardBottom?.val || '—', pass: Boolean(cardBottom?.pass), swatches: cardBottom?.sw || [] },
      ],
    },
    {
      key: 'comp',
      label: '构图检测',
      status: Boolean(comp?.pass),
      metricLabel: '视觉重心X',
      metric: `${Math.round((check.cxf || 0) * 100)}%`,
      issue: issueText('comp'),
      recommendation: '将主体信息和主要视觉元素向右侧安全区移动',
      detail: comp?.val || '视觉重心需 ≥50%',
    },
    {
      key: 'clutter',
      label: '主图边缘杂乱度',
      status: clutterPass,
      metricLabel: 'banner杂乱度',
      metric: `${clutter?.secPct ?? 0}%`,
      issue: issueText('clutter'),
      recommendation: `减少主体外显著元素，边缘杂乱度需 ≤${LIMITS.clutterMax}%`,
      detail: `主体外显著块 ${clutter?.secCount ?? 0} 个 · 占边缘 ${clutter?.secPct ?? 0}%`,
    },
  ]

  const failed = uiChecks.filter((item) => !item.status)
  const overallPass = failed.length === 0

  return {
    src,
    img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    data,
    check,
    palette: data.palette || [],
    V: check.V || [191, 227, 255],
    VHex: colorHex(check.V || [191, 227, 255]),
    cold,
    chroma,
    contrast: {
      title: ratioFromVal(title?.val),
      cardTop: ratioFromVal(cardTop?.val),
      cardBottom: ratioFromVal(cardBottom?.val),
    },
    uiChecks,
    failed,
    overallPass,
    recommendation: buildRecommendation(failed),
    prompt: buildPrompt(failed, { palette: data.palette || [] }),
  }
}

export function currentFrame(result) {
  if (!result) return null
  if (result.kind === 'video') return result.frames?.[result.activeFrame || 'first'] || null
  return result.frame || null
}

export function buildImageResult(frame, fileName) {
  return {
    kind: 'image',
    sourceUrl: frame.src,
    fileName,
    frame,
    activeFrame: null,
    overallPass: frame.overallPass,
    checks: frame.uiChecks,
    palette: frame.palette,
    recommendation: frame.recommendation,
    prompt: frame.prompt,
  }
}

export function buildVideoResult({ frames, videoUrl, fileName }) {
  const active = frames.first
  const overallPass = Boolean(frames.first?.overallPass && frames.last?.overallPass)
  const failed = [frames.first, frames.last].flatMap((frame) => frame.failed || [])
  return {
    kind: 'video',
    sourceUrl: active.src,
    videoUrl,
    fileName,
    frames,
    activeFrame: 'first',
    overallPass,
    checks: active.uiChecks,
    palette: active.palette,
    recommendation: overallPass ? active.recommendation : buildRecommendation(failed),
    prompt: overallPass ? active.prompt : buildPrompt(failed, active),
  }
}
