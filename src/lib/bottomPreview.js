const asset = name => `${import.meta.env.BASE_URL}figma-assets/bottom/${name}.png`
export const BOTTOM_LAYERS = [
  { name: 'header', y: 0, height: 607.5 }, { name: 'projects', y: 348.28244, height: 95.41985 },
  { name: 'tools', y: 443.7023, height: 370 }, { name: 'nav', y: 733.77869, height: 79.19847 },
]
export const bottomLayerUrl = (name, variant) => asset(name === 'tools' && variant === 'thumbnail' ? 'tools-thumbnail' : name)
export const bottomIconUrl = name => `${import.meta.env.BASE_URL}figma-assets/bottom/${name}.svg`
export const BOTTOM_CARDS = [{ x: 15.26718, width: 211.83206, icon: 'new', label: 'New video' }, { x: 234.73283, width: 125, icon: 'image', label: 'Edit photo' }]

const image = async src => {
  if (/\.svg$/.test(src)) {
    const response = await fetch(src, { credentials: 'omit' })
    if (!response.ok) throw new Error('预览图标读取失败')
    // A data source keeps SVG foreignObject content origin-clean for canvas export.
    src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(await response.text())}`
  }
  return new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => reject(new Error('预览素材读取失败')); img.src = src })
}

export async function downloadBottomPreview(frame, variant = 'full') {
  const canvas = document.createElement('canvas'); canvas.width = 750; canvas.height = 1626
  const ctx = canvas.getContext('2d'); ctx.scale(2, 2)
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 375, 813)
  const layers = await Promise.all(BOTTOM_LAYERS.map(layer => image(bottomLayerUrl(layer.name, variant))))
  layers.forEach((img, index) => { const layer = BOTTOM_LAYERS[index]; ctx.drawImage(img, 0, layer.y, 375, layer.height) })
  const names = ['cellular', 'wifi', 'cap', 'svip', 'standard', 'search', 'chevron', 'new', 'image']
  const icons = Object.fromEntries(await Promise.all(names.map(async name => [name, await image(bottomIconUrl(name))])))
  ctx.fillStyle = '#fff'; ctx.font = '600 16.22px "SF Pro", system-ui'; ctx.textBaseline = 'top'; ctx.textAlign = 'center'; ctx.fillText('9:41', 67.17, 17.5); ctx.textAlign = 'left'
  ctx.drawImage(icons.cellular, 275.5, 22.45); ctx.drawImage(icons.wifi, 301, 22.55); ctx.drawImage(icons.cap, 350, 26.5)
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = .954; ctx.beginPath(); ctx.roundRect(323.5, 21.8, 23.855, 12.4, 4.103); ctx.stroke()
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(325.4, 23.7, 20.038, 8.6, 2.385); ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.roundRect(15.267, 59.16, 104.6, 26.718, 22.9); ctx.fill()
  ctx.drawImage(icons.svip, 26.718, 63.93); ctx.drawImage(icons.standard, 47.114, 67.956)
  ctx.beginPath(); ctx.arc(344.466, 74.427, 15.267, 0, Math.PI * 2); ctx.fill(); ctx.drawImage(icons.search, 335.878, 65.839)
  ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = '700 13.36px "CapCut Sans Text", sans-serif'; ctx.fillText('Bilingual captions', 17.176, 180.343)
  ctx.fillStyle = '#fff'; ctx.font = '700 20.03px "CapCut Sans Display", sans-serif'; ctx.fillText('AI bilingual captions', 17.176, 201.5)
  ctx.drawImage(icons.chevron, 218, 204)
  for (const card of BOTTOM_CARDS) {
    const gradient = ctx.createLinearGradient(0, 236.702, 0, 347.389); gradient.addColorStop(0, 'rgba(190,202,255,.8)'); gradient.addColorStop(1, 'rgba(255,255,255,.75)')
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.roundRect(card.x, 236.702, card.width, 110.687, 11.45); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fill()
    ctx.drawImage(icons[card.icon], card.x + card.width / 2 - 13.3588, 266.778)
    ctx.fillStyle = '#090c14'; ctx.textAlign = 'center'; ctx.font = '500 15.267px "CapCut Sans Text", sans-serif'; ctx.fillText(card.label, card.x + card.width / 2, 297.31); ctx.textAlign = 'left'
  }
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
