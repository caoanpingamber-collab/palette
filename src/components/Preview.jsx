import { useEffect, useRef } from 'react'
import { IC_VIDEO, IC_IMAGE } from '../lib/assets'

const assetUrl = (name) => `${import.meta.env.BASE_URL}${name}`
const figmaAssetUrl = (name) => `${import.meta.env.BASE_URL}figma-assets/${name}`

function drawBlurredBanner({ canvas, src, video, blurPx = 50, darken = 0.08 }) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  const draw = (source) => {
    ctx.save()
    ctx.filter = `blur(${blurPx}px)`
    const scale = Math.max(W / source.width, H / source.height) * 1.2
    const dw = source.width * scale
    const dh = source.height * scale
    ctx.drawImage(source, (W - dw) / 2, (H - dh) / 2, dw, dh)
    ctx.restore()
    ctx.fillStyle = `rgba(0,0,0,${darken})`
    ctx.fillRect(0, 0, W, H)
  }

  if (video) {
    const v = document.createElement('video')
    v.src = video
    v.muted = true
    v.playsInline = true
    v.loop = true
    v.autoplay = true
    v.onloadeddata = () => draw(v)
    v.play().catch(() => {})
    return
  }

  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => draw(img)
  img.src = src
}

// Faithful CapCut homepage preview. Phone is 393x852, scaled into a 320-wide frame.
export default function Preview({ src, video = null, V = [191, 227, 255] }) {
  const blurCanvasRef = useRef(null)
  const RECT = { x: 0, y: 0, w: 393, h: 637 }
  const cvar = `rgba(${V[0]},${V[1]},${V[2]},.8)`
  const cardBg = {
    backgroundImage:
      `linear-gradient(rgba(255,255,255,.6),rgba(255,255,255,.6)),linear-gradient(180deg, ${cvar} 0%, rgba(255,255,255,.75) 100%)`,
  }
  const card = (left, w, icon, label) => (
    <div style={{ position: 'absolute', top: 8, left, width: w, height: 112, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: '#090c14', ...cardBg }}>
      <img src={icon} alt="" style={{ width: 28, height: 28, display: 'block' }} />
      <span style={{ fontFamily: "'CapCut Sans Text', sans-serif", fontSize: 16, fontWeight: 500, color: '#090c14' }}>{label}</span>
    </div>
  )

  useEffect(() => {
    if (!blurCanvasRef.current) return
    const canvas = blurCanvasRef.current
    canvas.width = 393 * 2
    canvas.height = 636 * 2
    drawBlurredBanner({ canvas, src, video, blurPx: 70, darken: 0.12 })
  }, [src, video])

  return (
    <div style={{ width: 320, height: 694, flex: '0 0 auto', borderRadius: 24, overflow: 'hidden', border: '1px solid rgba(0,0,0,.10)', background: '#ffffff', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 393, height: 852, zoom: 0.8142 }}>
        {/* 顶部「出血」层：把 banner 向上延伸到屏幕顶沿之上（top:-34，被外框圆角裁掉、用户看不见）。
            作用：状态栏磨砂的 backdrop-filter 在最顶一条边采样时，上方有真实蓝色水面可取，而不是屏幕外的空白/白底，
            于是最顶边也能呈现玻璃态、且不再泛白。它整张被下面 Rectangle 的白底+真 banner 盖住，只有越过顶沿的那一条参与采样。 */}
        {video
          ? <video src={video} autoPlay loop muted playsInline aria-hidden style={{ position: 'absolute', top: -34, left: 0, width: 393, height: 636, objectFit: 'cover', objectPosition: 'top', pointerEvents: 'none' }} />
          : <img src={src} alt="" aria-hidden style={{ position: 'absolute', top: -34, left: 0, width: 393, height: 636, objectFit: 'cover', objectPosition: 'top', pointerEvents: 'none' }} />}
        {/* ===== Rectangle 容器（Figma 2021:2340）：上传图槽 + 模糊层 + 渐隐蒙版，bg 白 ===== */}
        <div data-name="Rectangle" style={{ position: 'absolute', left: RECT.x, top: RECT.y, width: RECT.w, height: RECT.h, background: '#fff', overflow: 'hidden' }}>
          {/* 上传的图片/视频（2029:190）— 实际上传区 393×636，变量(src/video)进这里 */}
          <div data-name="上传的图片/视频" style={{ position: 'absolute', left: 0, top: 0, width: 393, height: 636, overflow: 'hidden' }}>
            {video
              ? <video src={video} autoPlay loop muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              : <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
          {/* 磨砂玻璃层 — Canvas 实时模糊，不受 zoom/层级影响 */}
          <div data-name="模糊层" style={{ position: 'absolute', left: 0, top: 0, width: 393, height: 636, overflow: 'hidden', pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', top: '30%', bottom: '-11.32%', left: -23, width: 440, borderRadius: 87, overflow: 'hidden', maskImage: 'linear-gradient(180deg, transparent 0%, #000 10%)', WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 10%)' }}>
              <canvas
                ref={blurCanvasRef}
                style={{ position: 'absolute', left: 23, top: -196, width: 393, height: 636 }}
              />
            </div>
          </div>
          {/* Mask（2021:2344）— 渐隐到白 */}
          <div data-name="Mask" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0) 39.446%, rgba(255,255,255,0.48) 50.937%, rgba(255,255,255,0.76) 58.776%, rgb(255,255,255) 66.176%)' }} />
        </div>
        {/* lower section (templates + tools) — user image 固定2（透明 PNG，banner 透过它显到 637） */}
        <img src={assetUrl('fixed2.png')} alt="" style={{ position: 'absolute', top: 365, left: 0, width: 393, height: 487 }} />
        {/* title */}
        <div style={{ position: 'absolute', top: 189, left: 0, width: 393, padding: '0 18px', boxSizing: 'border-box' }}>
          <div style={{ fontFamily: "'CapCut Sans Text', sans-serif", fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,.8)', lineHeight: 1.3 }}>subtitle caption</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <b style={{ fontFamily: "'CapCut Sans Display', sans-serif", fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1.25, whiteSpace: 'nowrap' }}>One main banner title</b>
            <span style={{ width: 14, height: 20, borderRadius: 4, background: 'rgba(255,255,255,.2)', border: '.5px solid rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 14 14" width="8" height="10" fill="none" stroke="#fff" strokeWidth="2"><path d="M5 3l4 4-4 4" /></svg>
            </span>
          </div>
        </div>
        {/* cards */}
        <div style={{ position: 'absolute', top: 245, left: 0, width: 393, height: 120 }}>
          {card(16, 222, IC_VIDEO, 'New video')}
          {card(246, 131, IC_IMAGE, 'New image')}
        </div>
        {/* 顶部固定状态栏 + Standard 标签 + 搜索 */}
        <img src={figmaAssetUrl('preview-status-bar.png')} alt="" style={{ position: 'absolute', top: 0, left: 0, width: 393, height: 'auto', pointerEvents: 'none' }} />
        {/* 下方固定区：模板缩略图 + Popular tools */}
        <img src={figmaAssetUrl('preview-fixed-section.png')} alt="" style={{ position: 'absolute', top: 365, left: 0, width: 393, height: 'auto', pointerEvents: 'none' }} />
        {/* status bar / nav — user image 导航 (transparent overlay) */}
        <img src={assetUrl('nav.png')} alt="" style={{ position: 'absolute', top: 0, left: 0, width: 393, height: 98 }} />
      </div>
    </div>
  )
}
