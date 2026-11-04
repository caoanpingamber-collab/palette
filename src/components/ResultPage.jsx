import { useEffect, useRef, useState } from 'react'
import Preview from './Preview'
import { PreviewPage2Frame } from './PreviewPage2'
import { PreviewPage3Frame } from './PreviewPage3'
import { currentFrame } from '../lib/analysis'
import { FIGMA_ASSETS } from '../lib/figmaAssets'
import { gsap, useGSAP } from '../lib/gsap'
import BottomPreview from './BottomPreview'
import { bottomPreviewPoint } from '../lib/bottomRules.mjs'

const PREVIEW_SIZE = { width: 320, height: 694 }
const LAST_PREVIEW_INDEX = 2
const PREVIEW_ZOOM = 0.8142
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const previewPoint = (x, y) => ({ x: Math.round(x * PREVIEW_ZOOM), y: Math.round(y * PREVIEW_ZOOM) })
const MARKER_TARGETS = {
  hue: { ...previewPoint(34, 144), side: 'left', label: '冷色占比不足' },
  chroma: { ...previewPoint(78, 170), side: 'left', label: '画面太灰' },
  'contrast-title': { ...previewPoint(374, 218), side: 'right', label: '标题对比度不够' },
  'contrast-cardTop': { ...previewPoint(374, 258), side: 'right', label: '卡片上缘对比度不够' },
  'contrast-cardBottom': { ...previewPoint(374, 360), side: 'right', label: '卡片下缘对比度不够' },
}

function CloseIcon() {
  return <img src={FIGMA_ASSETS.close} alt="" className="size-6" />
}

function ArrowIcon({ dir = 'right' }) {
  return <img src={FIGMA_ASSETS.arrowRight} alt="" className={`size-10 ${dir === 'left' ? 'rotate-180' : ''}`} />
}

function Logo() {
  return <img src={FIGMA_ASSETS.logo} alt="CapCut" className="h-6 w-[94.617px]" />
}

function StatusPill({ pass }) {
  const review = pass == null
  return (
    <span
      className={`inline-flex h-[18px] items-center rounded-[5px] px-1 text-[11px] font-medium ${
        review ? 'bg-[#c28a151f] text-[#986c0d]' : pass ? 'bg-[#00ae701f] text-[#00ae70]' : 'bg-[#ff61631f] text-[#ff3436]'
      }`}
    >
      {review ? '需复核' : pass ? '通过' : '不通过'}
    </span>
  )
}

function MetricLine({ label, value }) {
  return (
    <div className="flex items-center justify-end gap-2 whitespace-nowrap text-right">
      <span className="shrink-0 font-['PingFang_SC'] text-[12px] font-light text-[#111827]">{label}</span>
      <strong className="shrink-0 font-['Floane'] text-[14px] leading-5 tracking-[1px] text-black">{value}</strong>
    </div>
  )
}

function Swatch({ rgb, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="size-4 rounded-[4px] border border-black/10"
        style={{ background: rgb ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : '#d9d9d9' }}
      />
      {label}
    </span>
  )
}

function FailureDetail({ item, palette, frame }) {
  if (item.status) return null

  if (item.key === 'hue') {
    const total = palette.reduce((sum, color) => sum + color.ratio, 0) || 1
    return (
      <div className="mt-2 rounded-[12px] bg-black/[.04] p-3">
        <div className="mb-2 flex h-[22px] overflow-hidden rounded-[8px]">
          {(palette.length ? palette : [{ hex: '#d9d9d9', ratio: 100 }]).slice(0, 4).map((color) => (
            <span key={color.hex} style={{ width: `${Math.max(8, (color.ratio / total) * 100)}%`, background: color.hex }} />
          ))}
        </div>
        <p className="text-[12px] leading-5 text-black/70">{item.detail}</p>
      </div>
    )
  }

  if (item.key === 'chroma') {
    return (
      <div className="mt-2 rounded-[12px] bg-black/[.04] p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[12px]">
          <span className="size-4 rounded-[4px] border border-black/10" style={{ background: palette[0]?.hex || '#d9d9d9' }} />
          主体色
        </div>
        <p className="text-[12px] leading-5 text-black/70">{item.detail}</p>
      </div>
    )
  }

  if (item.key === 'contrast') {
    return (
      <div className="mt-2 flex flex-col gap-2">
        {item.metrics?.filter((m) => !m.pass).map((metric) => (
          <div key={metric.label} className="rounded-[12px] bg-black/[.04] p-3">
            <div className="mb-2 flex flex-wrap gap-3 text-[12px] text-black/70">
              {metric.swatches?.map(([label, rgb]) => <Swatch key={label} rgb={rgb} label={label} />)}
            </div>
            <p className="text-[12px] leading-5 text-black/70">
              {metric.label} = {metric.value}，不符合当前检测标准
            </p>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="mt-2 rounded-[12px] bg-black/[.04] p-3">
      <p className="text-[12px] leading-5 text-black/70">{item.detail || item.recommendation}</p>
      {item.key === 'clutter' && (
        <p className="mt-1 text-[12px] leading-5 text-black/45">阈值 ≤8%，请减少 banner 上的边缘干扰元素。</p>
      )}
      {item.key === 'comp' && (
        <p className="mt-1 text-[12px] leading-5 text-black/45">建议把主体或关键视觉信息放回右侧安全区域。</p>
      )}
      {frame?.width && <span className="sr-only">{frame.width}</span>}
    </div>
  )
}

function ResultRows({ frame, compact = false }) {
  const rows = frame?.uiChecks || []
  return (
    <div className="px-5">
      {rows.map((item, index) => (
        <div key={item.key} className={`result-content-animate ${index > 0 ? 'border-t border-black/[.08]' : ''} py-3`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-[104px] items-center gap-2">
              <span className="whitespace-nowrap text-[12px] leading-5 text-[#111827]/50">{item.label}</span>
              <StatusPill pass={item.status} />
            </div>
            <div className="min-w-0 flex-1">
              {item.metrics ? (
                <div className="flex flex-col gap-2">
                  {item.metrics.map((metric) => (
                    <MetricLine key={metric.label} label={metric.label} value={metric.value} />
                  ))}
                </div>
              ) : (
                <MetricLine label={item.metricLabel} value={item.metric} />
              )}
            </div>
          </div>
          {!compact && <FailureDetail item={item} palette={frame.palette || []} frame={frame} />}
        </div>
      ))}
    </div>
  )
}

function FrameSwitcher({ result, onSwitchFrame }) {
  if (result.kind !== 'video' && !result.animated) return null
  return (
    <div className="result-content-animate flex items-start gap-2 px-5 py-3">
      {['first', 'last'].map((key) => {
        const frame = result.frames[key]
        const active = result.activeFrame === key
        return (
          <button
            type="button"
            key={key}
            onClick={(event) => {
              gsap.fromTo(event.currentTarget, { scale: 0.92 }, { scale: 1, duration: 0.24, ease: 'back.out(2)', overwrite: 'auto' })
              onSwitchFrame(key)
            }}
            className={`relative size-8 overflow-hidden rounded-[8px] bg-[#d9d9d9] outline-none transition-[box-shadow,filter,transform] duration-200 hover:scale-105 hover:brightness-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-black/20 ${active ? 'ring-1 ring-black ring-offset-2' : ''}`}
            aria-label={key === 'first' ? '查看首帧' : '查看尾帧'}
          >
            <img src={frame.src} alt="" className="size-full object-cover" />
          </button>
        )
      })}
    </div>
  )
}

function buildIssueMarkers(frame, variant) {
  if (frame?.inspectionType === 'bottom') return (frame.failed || []).filter(item => item.anchor).map(item => {
    const point = bottomPreviewPoint(item.anchor, variant)
    return { id: item.key, ...point, side: point.x > 160 ? 'left' : 'right', label: item.label.replace('检测', '不符合规范') }
  })
  const markers = []
  const pushMarker = (id, marker) => {
    if (!marker) return
    markers.push({ id, ...marker })
  }
  const metricTarget = (metric) => {
    if (metric.target) return metric.target
    if (metric.label?.includes('下缘')) return 'cardBottom'
    if (metric.label?.includes('上缘')) return 'cardTop'
    return 'title'
  }

  frame.failed.forEach((item) => {
    if (item.key === 'contrast') {
      const failedMetrics = (item.metrics || []).filter((metric) => !metric.pass)
      if (!failedMetrics.length) {
        pushMarker('contrast-title', MARKER_TARGETS['contrast-title'])
        return
      }
      failedMetrics.forEach((metric) => {
        const target = metricTarget(metric)
        pushMarker(`contrast-${target}`, MARKER_TARGETS[`contrast-${target}`])
      })
      return
    }

    if (item.key === 'comp') {
      const x = clamp((frame.check?.cxf ?? 0.5) * 393, 16, 377)
      const y = clamp((frame.check?.cyf ?? 0.28) * 636, 76, 312)
      pushMarker('comp', { ...previewPoint(x, y), side: x < 196 ? 'left' : 'right', label: item.issue })
      return
    }

    if (item.key === 'clutter') {
      const focus = frame.check?.clutter?.focus
      const x = clamp(focus?.x ?? 350, 18, 375)
      const y = clamp(focus?.y ?? 230, 58, 292)
      pushMarker('clutter', { ...previewPoint(x, y), side: x > 320 ? 'right' : 'left', label: item.issue })
      return
    }

    pushMarker(item.key, MARKER_TARGETS[item.key] || { ...previewPoint(36, 150), side: 'left', label: item.issue })
  })

  return markers
}

function IssueMarkers({ frame, overallPass, variant }) {
  if (overallPass || !frame?.failed?.length) return null
  const markers = buildIssueMarkers(frame, variant)
  return (
    <div className="pointer-events-none absolute inset-0">
      {markers.map((marker, index) => {
        const labelSideClass = marker.side === 'left' ? 'right-[24px]' : 'left-[24px]'
        const numberNode = (
          <span className="grid size-5 place-items-center rounded-full bg-white font-['Floane'] text-[13px] font-bold text-[#ff3436]">
            {index + 1}
          </span>
        )
        const labelNode = (
          <span className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-white px-2 py-px text-[12px] font-medium leading-5 text-[#ff3436] shadow-sm ${labelSideClass}`}>
            {marker.label}
          </span>
        )

        return (
          <div
            key={marker.id}
            className="absolute z-20"
            style={{ left: marker.x, top: marker.y, transform: 'translate(-50%, -50%)' }}
          >
            <div className="issue-marker relative will-change-transform">
              {numberNode}
              {labelNode}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function ResultPage({
  result,
  onClose,
  onSwitchFrame,
  onDownloadBanner,
  onDownloadPreview,
  onExportReport,
  onCopyConfig,
  onNeedsConfirmation,
}) {
  const rootRef = useRef(null)
  const previewViewportRef = useRef(null)
  const previewContentRef = useRef(null)
  const [previewScale, setPreviewScale] = useState(1)
  const [previewIndex, setPreviewIndex] = useState(0)
  const frame = currentFrame(result)
  const isBottom = result.inspectionType === 'bottom'
  const previewVariant = previewIndex === 0 ? 'full' : 'thumbnail'
  const lastPreviewIndex = isBottom ? 1 : LAST_PREVIEW_INDEX
  const isPassed = Boolean(result?.overallPass)
  const title = isPassed ? 'Approved' : result.overallStatus === 'review' ? 'Needs Review' : 'Not Passed'
  const description = isPassed
    ? isBottom ? '底部banner已通过尺寸、文件大小、文案字数、行数、位置及圆形视觉区检测' : '头部banner已通过冷色相册检测、chroma色感检测、WCAG对比度检测、画面构图重心检测'
    : result.recommendation

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduceMotion) {
        gsap.set('.result-animate', { autoAlpha: 1, clearProps: 'transform' })
        return
      }

      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('.result-backdrop', { autoAlpha: 0, duration: 0.24 })
        .from('.result-close', { scale: 0.82, autoAlpha: 0, duration: 0.24, ease: 'back.out(1.8)' }, '-=0.08')
        .from('.phone-stage', { y: 28, scale: 0.965, autoAlpha: 0, duration: 0.46 }, '-=0.1')
        .fromTo(
          '.result-footer-button',
          { y: 14, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 0.3, stagger: 0.05, clearProps: 'transform,opacity,visibility' },
          '-=0.18',
        )
        .from('.result-panel', { x: 96, autoAlpha: 0, duration: 0.46 }, '-=0.42')
        .from('.result-content-animate', { y: 10, autoAlpha: 0, duration: 0.28, stagger: 0.035 }, '-=0.18')
        .from('.issue-marker', { scale: 0.82, autoAlpha: 0, duration: 0.28, stagger: 0.06, ease: 'back.out(1.7)' }, '-=0.04')

      gsap.to('.result-bg-star', {
        x: (index) => (index === 0 ? -10 : 16),
        y: (index) => (index === 0 ? 14 : -10),
        rotation: (index) => (index === 0 ? -19 : -24),
        duration: 8,
        ease: 'linear',
        repeat: -1,
        yoyo: true,
        stagger: 0.35,
      })
    },
    { scope: rootRef, dependencies: [result?.kind, result?.overallPass], revertOnUpdate: true },
  )

  useEffect(() => {
    const viewport = previewViewportRef.current
    if (!viewport) return undefined

    const updatePreviewScale = () => {
      const rect = viewport.getBoundingClientRect()
      const style = window.getComputedStyle(viewport)
      const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
      const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
      const widthForArrowsAndMarkers = 176
      const usableWidth = Math.max(180, rect.width - horizontalPadding - widthForArrowsAndMarkers)
      const usableHeight = Math.max(260, rect.height - verticalPadding)
      const nextScale = Math.min(1, usableWidth / PREVIEW_SIZE.width, usableHeight / PREVIEW_SIZE.height)
      setPreviewScale(Number(nextScale.toFixed(4)))
    }

    updatePreviewScale()
    const resizeObserver = new ResizeObserver(updatePreviewScale)
    resizeObserver.observe(viewport)
    window.addEventListener('resize', updatePreviewScale)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updatePreviewScale)
    }
  }, [])

  useEffect(() => {
    if (!previewContentRef.current) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      gsap.set(previewContentRef.current, { autoAlpha: 1, x: 0 })
      return
    }
    gsap.fromTo(
      previewContentRef.current,
      { x: previewIndex === 0 ? -24 : 24, autoAlpha: 0 },
      { x: 0, autoAlpha: 1, duration: 0.34, ease: 'power3.out', overwrite: 'auto' },
    )
  }, [previewIndex])

  const hasPreviousPreview = previewIndex > 0
  const hasNextPreview = previewIndex < lastPreviewIndex
  const arrowButtonClass = (enabled) =>
    `grid size-10 place-items-center rounded-full outline-none transition-[background-color,opacity,transform] duration-200 focus-visible:ring-2 focus-visible:ring-black/15 ${
      enabled ? 'opacity-100 hover:scale-105 hover:bg-white/70 active:scale-95' : 'cursor-default opacity-20'
    }`

  const showPreviousPreview = () => {
    if (!hasPreviousPreview) {
      onNeedsConfirmation?.('已经是第一个预览')
      return
    }
    setPreviewIndex((current) => Math.max(0, current - 1))
  }

  const showNextPreview = () => {
    if (!hasNextPreview) {
      onNeedsConfirmation?.('已经是最后一个预览')
      return
    }
    setPreviewIndex((current) => Math.min(lastPreviewIndex, current + 1))
  }

  return (
    <main ref={rootRef} className={`${isBottom ? 'bottom-result ' : ''}relative min-h-screen overflow-hidden bg-[#f1f1f1] text-[#111827]`}>
      <img
        src={FIGMA_ASSETS.bgStar}
        alt=""
        className="result-bg-star pointer-events-none absolute right-[-190px] top-[-189px] size-[519px] rotate-[-22.44deg] object-cover opacity-30 will-change-transform"
      />
      <img
        src={FIGMA_ASSETS.bgStar}
        alt=""
        className="result-bg-star pointer-events-none absolute bottom-[-229px] left-[-348px] size-[519px] rotate-[-20.42deg] object-cover opacity-30 will-change-transform"
      />

      <nav className="absolute left-0 right-0 top-0 flex h-[60px] items-center px-6">
        <Logo />
      </nav>

      <section className="result-backdrop absolute inset-y-0 left-0 right-[360px] overflow-hidden bg-[rgba(241,241,241,.4)] backdrop-blur-[20px]">
        <button
          type="button"
          onClick={onClose}
          className="result-close absolute left-[30px] top-[30px] z-20 grid size-[44px] place-items-center rounded-full bg-[#f9f9f9] text-black shadow-[0_8px_30px_rgba(0,0,0,.08)] outline-none transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-white active:translate-y-0 active:scale-95 focus-visible:ring-2 focus-visible:ring-black/15"
          aria-label="关闭结果页"
        >
          <CloseIcon />
        </button>

        <div ref={previewViewportRef} className="flex h-full min-h-0 items-center justify-between px-5 pb-[82px] pt-[76px]">
          <button
            className={arrowButtonClass(hasPreviousPreview)}
            type="button"
            aria-label="上一张"
            aria-disabled={!hasPreviousPreview}
            onClick={showPreviousPreview}
          >
            <ArrowIcon dir="left" />
          </button>
          <div
            className="phone-stage relative shrink-0 will-change-transform"
            style={{
              width: PREVIEW_SIZE.width * previewScale,
              height: PREVIEW_SIZE.height * previewScale,
            }}
          >
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{
                width: PREVIEW_SIZE.width,
                height: PREVIEW_SIZE.height,
                transform: `scale(${previewScale})`,
              }}
            >
              <div ref={previewContentRef} className="h-full w-full">
                {isBottom ? (
                  <>
                    <BottomPreview src={result.mediaUrl || frame?.src} variant={previewVariant} frame={frame} />
                    <IssueMarkers frame={frame} overallPass={isPassed} variant={previewVariant} />
                  </>
                ) : previewIndex === 0 ? (
                  <>
                    <Preview src={frame?.src} video={result.kind === 'video' ? result.videoUrl : null} V={frame?.V} />
                    <IssueMarkers frame={frame} overallPass={isPassed} />
                  </>
                ) : previewIndex === 1 ? (
                  <PreviewPage2Frame V={frame?.V} />
                ) : (
                  <PreviewPage3Frame V={frame?.V} />
                )}
              </div>
            </div>
          </div>
          <button
            className={arrowButtonClass(hasNextPreview)}
            type="button"
            aria-label="下一张"
            aria-disabled={!hasNextPreview}
            onClick={showNextPreview}
          >
            <ArrowIcon />
          </button>
        </div>

        <div className="absolute bottom-[20px] left-1/2 flex -translate-x-1/2 items-center gap-3">
          <button type="button" onClick={onDownloadBanner} className="result-footer-button h-10 rounded-full bg-black/[.04] px-4 text-[14px] outline-none transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-white/80 active:translate-y-0 active:scale-95 focus-visible:ring-2 focus-visible:ring-black/15">
            下载banner
          </button>
          <button type="button" onClick={() => onDownloadPreview(isBottom ? previewVariant : undefined)} className="result-footer-button h-10 rounded-full bg-black/[.04] px-4 text-[14px] outline-none transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-white/80 active:translate-y-0 active:scale-95 focus-visible:ring-2 focus-visible:ring-black/15">
            下载预览
          </button>
        </div>
      </section>

      <aside className="result-panel absolute bottom-0 right-0 top-0 flex w-[360px] flex-col overflow-hidden bg-white will-change-transform">
        <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-black/[.08] px-5">
          <span className="font-['PingFang_SC'] text-[14px] font-light">banner类型</span>
          <button
            type="button"
            className="flex h-8 items-center gap-1 rounded-full bg-black/[.04] pl-4 pr-3 font-['PingFang_SC'] text-[12px] outline-none transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-black/[.07] active:translate-y-0 active:scale-95 focus-visible:ring-2 focus-visible:ring-black/15"
            onClick={() => onNeedsConfirmation?.('banner 类型下拉选项 Figma 未标注，等待你确认')}
          >
            {isBottom ? 'Bottom banner' : '功能宣推'}
            <img src={FIGMA_ASSETS.chevronRight} alt="" className="size-[10px] rotate-90" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={`${isPassed ? 'px-5 py-5' : 'flex flex-col gap-2 p-5'}`}>
            <h1 className="result-content-animate font-['Floane'] text-[20px] font-bold italic tracking-[1px] text-black">{title}</h1>
            {!isPassed && (
              <>
                <p className="result-content-animate text-[12px] leading-5 text-black/70">{description}</p>
                <div className="result-content-animate relative rounded-[12px] bg-black/[.04] p-3 pr-8">
                  <div className="mb-2 text-[12px] leading-5 text-black/40">Prompt</div>
                  <p className="max-h-[60px] overflow-y-auto text-[12px] leading-5 text-black">{result.prompt}</p>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(result.prompt || '')}
                    className="absolute right-3 top-3 rounded-[6px] p-1 outline-none transition-[background-color,transform] duration-200 hover:scale-110 hover:bg-black/[.06] active:scale-95 focus-visible:ring-2 focus-visible:ring-black/15"
                    aria-label="复制 Prompt"
                  >
                    <img src={FIGMA_ASSETS.copy} alt="" className="size-4 opacity-45" />
                  </button>
                </div>
              </>
            )}
          </div>

          <FrameSwitcher result={result} onSwitchFrame={onSwitchFrame} />
          <ResultRows frame={frame} compact={isPassed} />
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-black/[.04] bg-white p-5">
          <button
            type="button"
            onClick={onExportReport}
            className="h-10 rounded-full border border-black/[.12] px-[14px] text-[14px] outline-none transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-black/20 hover:bg-black/[.04] active:translate-y-0 active:scale-95 focus-visible:ring-2 focus-visible:ring-black/15"
          >
            导出报告
          </button>
          {isPassed || isBottom ? (
            <button type="button" onClick={onExportReport} className="h-10 rounded-full bg-black px-[14px] text-[14px] text-white outline-none transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-black/85 active:translate-y-0 active:scale-95 focus-visible:ring-2 focus-visible:ring-black/20">
              导出检测报告
            </button>
          ) : (
            <button type="button" onClick={onCopyConfig} className="h-10 rounded-full bg-black px-[14px] text-[14px] text-white outline-none transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-black/85 active:translate-y-0 active:scale-95 focus-visible:ring-2 focus-visible:ring-black/20">
              复制配置色
            </button>
          )}
        </div>
      </aside>
    </main>
  )
}
