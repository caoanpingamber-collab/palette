import { PHONE_ASSETS, PHONE_CARDS, PHONE_COPY, phoneTint } from './phonePreview'

const asset = name => `${import.meta.env.BASE_URL}figma-assets/bottom/${name}.png`
export const BOTTOM_PHONE = { tint: [190, 202, 255] }
export const bottomLayerUrl = (name, variant) => asset(name === 'tools' && variant === 'thumbnail' ? 'tools-thumbnail' : name)

const image = async src => {
  if (/\.svg$/.test(src)) {
    const response = await fetch(src, { credentials: 'omit' })
    if (!response.ok) throw new Error('预览图标读取失败')
    // A data source keeps SVG foreignObject content origin-clean for canvas export.
    src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(await response.text())}`
  }
  return new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => reject(new Error('预览素材读取失败')); img.src = src })
}

async function drawHomePhone(ctx) {
  await Promise.all([
    document.fonts.load('700 14px "CapCut Sans Text"'),
    document.fonts.load('700 22px "CapCut Sans Display"'),
    document.fonts.load('500 16px "CapCut Sans Text"'),
  ])
  const [poster, lower, status, tools, navigation, ...icons] = await Promise.all([
    bottomLayerUrl('header'), PHONE_ASSETS.lower, PHONE_ASSETS.status, PHONE_ASSETS.tools, PHONE_ASSETS.navigation,
    ...PHONE_CARDS.map(card => card.icon),
  ].map(image))
  ctx.save(); ctx.scale(375 / 393, 375 / 393)
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 393, 852)
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 393, 637); ctx.clip()
  const fit = Math.max(393 / poster.naturalWidth, 636 / poster.naturalHeight)
  ctx.drawImage(poster, (393 - poster.naturalWidth * fit) / 2, (636 - poster.naturalHeight * fit) / 2, poster.naturalWidth * fit, poster.naturalHeight * fit)
  const blur = document.createElement('canvas'); blur.width = 786; blur.height = 1272
  const blurCtx = blur.getContext('2d'), scale = Math.max(786 / poster.naturalWidth, 1272 / poster.naturalHeight) * 1.2
  blurCtx.filter = 'blur(70px)'
  blurCtx.drawImage(poster, (786 - poster.naturalWidth * scale) / 2, (1272 - poster.naturalHeight * scale) / 2, poster.naturalWidth * scale, poster.naturalHeight * scale)
  blurCtx.filter = 'none'; blurCtx.fillStyle = 'rgba(0,0,0,.12)'; blurCtx.fillRect(0, 0, 786, 1272)
  const blurMask = blurCtx.createLinearGradient(0, 392, 0, 496)
  blurMask.addColorStop(0, 'transparent'); blurMask.addColorStop(1, '#000')
  blurCtx.globalCompositeOperation = 'destination-in'; blurCtx.fillStyle = blurMask; blurCtx.fillRect(0, 0, 786, 1272)
  ctx.drawImage(blur, 0, -5.2, 393, 636)
  const fade = ctx.createLinearGradient(0, 0, 0, 637)
  for (const [offset, color] of [[.39446, 'rgba(255,255,255,0)'], [.50937, 'rgba(255,255,255,.48)'], [.58776, 'rgba(255,255,255,.76)'], [.66176, '#fff']]) fade.addColorStop(offset, color)
  ctx.fillStyle = fade; ctx.fillRect(0, 0, 393, 637); ctx.restore()
  ctx.drawImage(lower, 0, 365, 393, 487)
  ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,.8)'
  ctx.font = '700 14px "CapCut Sans Text", sans-serif'; ctx.fillText(PHONE_COPY.subtitle, 18, 191)
  ctx.fillStyle = '#fff'; ctx.font = '700 22px "CapCut Sans Display", sans-serif'; ctx.fillText(PHONE_COPY.title, 18, 211)
  const arrowX = 22 + ctx.measureText(PHONE_COPY.title).width
  ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.beginPath(); ctx.roundRect(arrowX, 211.95, 14, 20, 4); ctx.fill()
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(arrowX + 5.4, 218.4); ctx.lineTo(arrowX + 8.3, 221.95); ctx.lineTo(arrowX + 5.4, 225.5); ctx.stroke()
  const tint = `rgba(${phoneTint(BOTTOM_PHONE.tint).join(',')},.8)`
  for (const [index, card] of PHONE_CARDS.entries()) {
    ctx.beginPath(); ctx.roundRect(card.left, 253, card.width, 112, 12); ctx.fillStyle = tint; ctx.fill()
    const gradient = ctx.createLinearGradient(0, 253, 0, 365); gradient.addColorStop(0, tint); gradient.addColorStop(1, 'rgba(255,255,255,.75)')
    ctx.fillStyle = gradient; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fill()
    ctx.drawImage(icons[index], card.left + card.width / 2 - 14, 283, 28, 28)
    ctx.fillStyle = '#090c14'; ctx.textAlign = 'center'; ctx.font = '500 16px "CapCut Sans Text", sans-serif'; ctx.fillText(card.label, card.left + card.width / 2, 315)
  }
  ctx.drawImage(status, 0, 0, 393, 393 * status.naturalHeight / status.naturalWidth)
  ctx.drawImage(tools, 0, 365, 393, 393 * tools.naturalHeight / tools.naturalWidth)
  ctx.drawImage(navigation, 0, 0, 393, 98)
  ctx.restore()
}

export async function downloadBottomPreview(frame, variant = 'full') {
  const canvas = document.createElement('canvas'); canvas.width = 750; canvas.height = 1626
  const ctx = canvas.getContext('2d'); ctx.scale(2, 2)
  await drawHomePhone(ctx)
  const original = frame.img?.naturalWidth ? frame.img : await image(frame.src)
  ctx.save()
  if (variant === 'thumbnail') {
    ctx.beginPath(); ctx.arc(337.58, 696.58, 29.58, 0, Math.PI * 2); ctx.clip()
    ctx.drawImage(original, 770, 0, 180, 180, 308, 667, 59.16, 59.16)
  } else {
    ctx.beginPath(); ctx.roundRect(7, 655.42871, 360.5, 60.58824, 40); ctx.clip()
    const fit = Math.min(360.5 / original.naturalWidth, 60.58824 / original.naturalHeight)
    const width = original.naturalWidth * fit, height = original.naturalHeight * fit
    ctx.drawImage(original, 7 + (360.5 - width) / 2, 655.42871 + (60.58824 - height) / 2, width, height)
  }
  ctx.restore()
  const cx = variant === 'thumbnail' ? 358.78 : 354.5, cy = variant === 'thumbnail' ? 675.57 : 662.25
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 8.75, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(cx - 3, cy - 3); ctx.lineTo(cx + 3, cy + 3); ctx.moveTo(cx + 3, cy - 3); ctx.lineTo(cx - 3, cy + 3); ctx.stroke()
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('预览导出失败')
  const url = URL.createObjectURL(blob), a = document.createElement('a')
  a.href = url; a.download = `bottom-banner-preview-${variant}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
